import { clerkClient } from '@clerk/nextjs/server'
import { z } from 'zod'
import { errorForLog } from '@/lib/log'
import { ORG_ADMIN_ROLE } from '@/lib/space-roles'
import type { McpCaller, ToolResult } from './tools'

/*
 * Spaces for AI apps (docs/organizations.md). An OAuth access token carries
 * the user but no active organization, so a tool that reads or changes saved
 * vehicles or trailers names the space itself: no `organization_id` is the
 * driver's personal space, an `organization_id` is one of the organizations
 * they belong to. Membership and role are always read from Clerk for the
 * verified caller, never taken from the arguments: any member reads an
 * organization's fleet, only its admins (org:admin) change it, the same rule
 * the web app's DALs apply with getSpace().
 */

/** Most organizations read for one driver; Clerk's page size limit. */
const MEMBERSHIPS_MAX = 100

/** One of the driver's organizations, as Clerk has it. */
export type CallerOrg = {
	id: string
	name: string
	slug: string | null
	role: string
	isAdmin: boolean
}

/** The space a tool works in, once checked against Clerk. */
export type McpSpace =
	| { kind: 'personal' }
	| { kind: 'org'; orgId: string; name: string; isAdmin: boolean }

/** The organizations the caller belongs to, from Clerk. */
export async function listCallerOrgs(caller: McpCaller): Promise<CallerOrg[]> {
	if (!caller.userId) return []
	const client = await clerkClient()
	const { data } = await client.users.getOrganizationMembershipList({
		userId: caller.userId,
		limit: MEMBERSHIPS_MAX,
	})
	return data.map((m) => ({
		id: m.organization.id,
		name: m.organization.name,
		slug: m.organization.slug || null,
		role: m.role,
		isAdmin: m.role === ORG_ADMIN_ROLE,
	}))
}

/** The optional argument every space-aware tool takes. */
export const organizationId = z
	.string()
	.trim()
	.min(1)
	.max(64)
	.optional()
	.describe(
		"An organization's id (org_...) from list_organizations, to use its shared fleet. Leave it out for the driver's own (personal) vehicles and trailers.",
	)

/**
 * The space a tool works in: personal without an organization id, else the
 * organization when the caller belongs to it (and, to `write`, is one of its
 * admins). A ToolResult error when they don't, or Clerk can't be read.
 */
export async function resolveSpace(
	caller: McpCaller,
	orgId: string | undefined,
	{
		write = false,
		what = 'vehicles',
	}: { write?: boolean; what?: string } = {},
): Promise<McpSpace | ToolResult> {
	if (!orgId) return { kind: 'personal' }
	let orgs: CallerOrg[]
	try {
		orgs = await listCallerOrgs(caller)
	} catch (error) {
		console.error(
			'MCP: could not read the driver’s organizations:',
			errorForLog(error),
		)
		return {
			summary:
				"Couldn't check the driver's organizations right now, so nothing was read or changed. Try again shortly.",
			data: { status: 'organizations_unavailable' },
			isError: true,
		}
	}
	const org = orgs.find((o) => o.id === orgId)
	if (!org) {
		return {
			summary: `The driver isn't a member of organization ${orgId}. Use list_organizations to find their organizations' ids.`,
			data: { status: 'not_a_member' },
			isError: true,
		}
	}
	if (write && !org.isAdmin) {
		return {
			summary: `Only an admin of ${org.name} can change its ${what}; the driver is a ${org.role.replace(/^org:/, '')} there. Nothing was changed.`,
			data: { status: 'not_org_admin', organization_id: org.id },
			isError: true,
		}
	}
	return { kind: 'org', orgId: org.id, name: org.name, isAdmin: org.isAdmin }
}

/** Whether resolveSpace answered with an error instead of a space. */
export function isToolResult(
	value: McpSpace | ToolResult,
): value is ToolResult {
	return 'summary' in value
}

/** How a space reads in a sentence: "the driver's" or "Acme Freight's". */
export const spaceOwner = (space: McpSpace) =>
	space.kind === 'org' ? `${space.name}'s` : "the driver's"

/** The space, as the tools' data shows it. */
export const spaceView = (space: McpSpace) =>
	space.kind === 'org'
		? {
				space: 'organization',
				organization_id: space.orgId,
				organization_name: space.name,
				is_admin: space.isAdmin,
			}
		: { space: 'personal' }

/** Audit details: the organization, when the change was in one. */
export const inOrg = (space: McpSpace) =>
	space.kind === 'org' ? { org_id: space.orgId } : {}

export const listOrganizationsInputSchema = z.object({})

/** The driver's organizations, with whether they can change each one's fleet. */
export async function listOrganizations(
	caller: McpCaller,
): Promise<ToolResult> {
	const orgs = await listCallerOrgs(caller)
	const view = orgs.map((o) => ({
		organization_id: o.id,
		name: o.name,
		slug: o.slug,
		role: o.role,
		is_admin: o.isAdmin,
	}))
	const admin = orgs.filter((o) => o.isAdmin)
	return {
		summary: orgs.length
			? `The driver belongs to ${orgs.length} organization${orgs.length === 1 ? '' : 's'}: ${orgs.map((o) => `${o.name} (${o.isAdmin ? 'admin' : 'member'})`).join('; ')}. Pass an organization_id to the vehicle and trailer tools to use its fleet${admin.length ? '; only organizations where they are admin can be changed' : ' (they can read it, but only admins change it)'}. Without one, the tools use the driver's personal vehicles and trailers.`
			: "The driver doesn't belong to any organization: the vehicle and trailer tools use their personal ones.",
		data: { organizations: view },
	}
}
