import { z } from 'zod'
import { recordEvents } from '@/lib/db/audit-events'
import {
	createOrgTrailerDb,
	createTrailerDb,
	deleteOrgTrailerDb,
	deleteTrailerDb,
	listOrgTrailersOrNone,
	listTrailersOrNone,
	type Trailer,
	trailerChangedFields,
	updateOrgTrailerDb,
	updateTrailerDb,
} from '@/lib/db/trailers'
import {
	formatLimit,
	PLATE_MAX,
	TRAILER_NAME_MAX,
	TRAILERS_MAX,
} from '@/lib/trip-limits'
import {
	inOrg,
	isToolResult,
	type McpSpace,
	organizationId,
	resolveSpace,
	spaceOwner,
	spaceView,
} from './spaces'
import type { McpCaller, ToolResult } from './tools'

/*
 * Saved trailers, for AI apps: list, add, change and delete them. Like the
 * vehicle tools, each works in the driver's personal space or, with
 * organization_id, in one of their organizations (src/mcp/spaces.ts): any
 * member lists its trailers, only its admins change them. A trip copies a
 * trailer's plate when it's started (start_trip's trailer_plate_a/b), so
 * changing or deleting a trailer never touches a saved trip.
 */

const source = (caller: McpCaller) => (caller.client || 'ai').slice(0, 60)

const trailerId = z
	.number()
	.int()
	.positive()
	.describe('The trailer’s id, from list_trailers')
const plate = z.string().trim().min(1).max(PLATE_MAX)

/** A trailer as the assistant sees it. */
export function trailerView(t: Trailer) {
	return { trailer_id: t.id, name: t.name || null, plate: t.plate }
}

/** A trailer as a person reads it: its name and plate, or just the plate. */
export const trailerLabel = (t: Pick<Trailer, 'name' | 'plate'>) =>
	t.name ? `${t.name} · ${t.plate}` : t.plate

/** The space's trailers: the driver's own, or the organization's. */
export const spaceTrailers = (caller: McpCaller, space: McpSpace) =>
	space.kind === 'org'
		? listOrgTrailersOrNone(space.orgId)
		: listTrailersOrNone(caller.email)

const touched = (space: McpSpace) =>
	space.kind === 'org' ? { orgId: space.orgId } : {}

const notFound = (id: number, space: McpSpace): ToolResult => ({
	summary: `Trailer ${id} wasn't found in ${spaceOwner(space)} trailers. Use list_trailers${space.kind === 'org' ? ' with the same organization_id' : ''} to find the trailer's id.`,
	data: { status: 'not_found' },
	isError: true,
})

export const listTrailersInputSchema = z.object({
	organization_id: organizationId,
})

export async function listTrailers(
	caller: McpCaller,
	args: z.input<typeof listTrailersInputSchema> = {},
): Promise<ToolResult> {
	const input = listTrailersInputSchema.parse(args)
	const space = await resolveSpace(caller, input.organization_id, {
		what: 'trailers',
	})
	if (isToolResult(space)) return space
	const trailers = await spaceTrailers(caller, space)
	const readOnly = space.kind === 'org' && !space.isAdmin
	return {
		summary: trailers.length
			? `${trailers.length} saved trailer${trailers.length === 1 ? '' : 's'} in ${spaceOwner(space)} trailers: ${trailers.map(trailerLabel).join('; ')}. Pass a plate as start_trip's trailer_plate_a or trailer_plate_b.${readOnly ? ` Only ${space.name}'s admins can change them.` : ''}`
			: `${space.kind === 'org' ? `${space.name} has` : 'The driver has'} no saved trailers.${readOnly ? '' : ' Add one with add_trailer when they ask.'}`,
		data: { ...spaceView(space), trailers: trailers.map(trailerView) },
	}
}

export const addTrailerInputSchema = z.object({
	organization_id: organizationId,
	name: z
		.string()
		.trim()
		.min(1)
		.max(TRAILER_NAME_MAX)
		.optional()
		.describe('What the driver calls it, e.g. "53\' dry van"'),
	plate: plate.describe('The trailer’s plate, e.g. "TRL 123"'),
})

export async function addTrailer(
	caller: McpCaller,
	args: z.input<typeof addTrailerInputSchema>,
): Promise<ToolResult> {
	const input = addTrailerInputSchema.parse(args)
	const space = await resolveSpace(caller, input.organization_id, {
		write: true,
		what: 'trailers',
	})
	if (isToolResult(space)) return space
	const fields = { name: input.name, plate: input.plate }
	const saved =
		space.kind === 'org'
			? await createOrgTrailerDb(space.orgId, caller, fields)
			: await createTrailerDb(caller, fields)
	if (saved === 'too_many') {
		return {
			summary: `${space.kind === 'org' ? space.name : 'The driver'} already has ${formatLimit(TRAILERS_MAX)} saved trailers, the most allowed, so nothing was saved. Delete one first (delete_trailer).`,
			data: { status: 'too_many', max_trailers: TRAILERS_MAX },
			isError: true,
		}
	}
	await recordEvents(caller, {
		action: 'trailer.created',
		source: source(caller),
		details: { trailer_id: saved.id, ...inOrg(space) },
	})
	return {
		summary: `Saved trailer ${saved.id} in ${spaceOwner(space)} trailers: ${trailerLabel(saved)}.`,
		data: { ...spaceView(space), trailer: trailerView(saved) },
		...touched(space),
	}
}

export const updateTrailerInputSchema = z.object({
	organization_id: organizationId,
	trailer_id: trailerId,
	name: z
		.string()
		.trim()
		.max(TRAILER_NAME_MAX)
		.optional()
		.describe('A new name; "" removes it'),
	plate: plate.optional().describe('A new plate'),
})

export async function updateTrailer(
	caller: McpCaller,
	args: z.input<typeof updateTrailerInputSchema>,
): Promise<ToolResult> {
	const input = updateTrailerInputSchema.parse(args)
	if (input.name === undefined && input.plate === undefined) {
		return {
			summary: 'Nothing to change: pass a name or a plate.',
			data: { status: 'no_changes' },
			isError: true,
		}
	}
	const space = await resolveSpace(caller, input.organization_id, {
		write: true,
		what: 'trailers',
	})
	if (isToolResult(space)) return space
	// The update saves both fields, so start from the trailer as it is.
	const current = (await spaceTrailers(caller, space)).find(
		(t) => t.id === input.trailer_id,
	)
	if (!current) return notFound(input.trailer_id, space)
	const fields = {
		name: input.name ?? current.name,
		plate: input.plate ?? current.plate,
	}
	const updated =
		space.kind === 'org'
			? await updateOrgTrailerDb(input.trailer_id, space.orgId, fields)
			: await updateTrailerDb(input.trailer_id, caller.email, fields)
	if (!updated) return notFound(input.trailer_id, space)
	await recordEvents(caller, {
		action: 'trailer.updated',
		source: source(caller),
		details: {
			trailer_id: input.trailer_id,
			changed: trailerChangedFields(updated),
			...inOrg(space),
		},
	})
	return {
		summary: `Updated trailer ${input.trailer_id}: ${trailerLabel(updated.trailer)}. Trips already saved keep the plates they were started with.`,
		data: { ...spaceView(space), trailer: trailerView(updated.trailer) },
		...touched(space),
	}
}

export const deleteTrailerInputSchema = z.object({
	organization_id: organizationId,
	trailer_id: trailerId,
})

export async function deleteTrailer(
	caller: McpCaller,
	args: z.input<typeof deleteTrailerInputSchema>,
): Promise<ToolResult> {
	const input = deleteTrailerInputSchema.parse(args)
	const space = await resolveSpace(caller, input.organization_id, {
		write: true,
		what: 'trailers',
	})
	if (isToolResult(space)) return space
	const deleted =
		space.kind === 'org'
			? await deleteOrgTrailerDb(input.trailer_id, space.orgId)
			: await deleteTrailerDb(input.trailer_id, caller.email)
	if (!deleted) return notFound(input.trailer_id, space)
	await recordEvents(caller, {
		action: 'trailer.deleted',
		source: source(caller),
		details: { trailer_id: input.trailer_id, ...inOrg(space) },
	})
	return {
		summary: `Deleted trailer ${input.trailer_id} (${trailerLabel(deleted)}) from ${spaceOwner(space)} trailers. Trips already saved with it are unchanged.`,
		data: {
			...spaceView(space),
			status: 'deleted',
			trailer: trailerView(deleted),
		},
		...touched(space),
	}
}
