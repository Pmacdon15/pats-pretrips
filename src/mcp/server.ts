import type { AuthInfo, McpServer } from '@modelcontextprotocol/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { MCP_INSTRUCTIONS } from '@/mcp/instructions'
import { portable } from '@/mcp/portable-schema'
import {
	getTrip,
	getTripDefaults,
	getTripDefaultsInputSchema,
	getTripInputSchema,
	listDefectCategories,
	listDefectCategoriesInputSchema,
	listTrips,
	listTripsInputSchema,
	type McpCaller,
	startTrip,
	startTripInputSchema,
	type ToolResult,
	updateTrip,
	updateTripInputSchema,
} from '@/mcp/tools'

/*
 * The PreTrips MCP server: its name, instructions and tools. Standard MCP
 * only, with nothing specific to one AI app, so Claude, Muse, Gemini or any
 * other MCP client can use it. Same layout as Budget's and Clock Out's.
 */

export const SERVER_INFO = { name: 'pats-pretrips', version: '1.0.0' }

export const SERVER_OPTIONS = {
	serverInfo: SERVER_INFO,
	instructions: MCP_INSTRUCTIONS,
	// The tool list never changes while a client is connected. Saying so keeps
	// clients from holding a `subscriptions/listen` stream open on a
	// serverless function until it times out.
	capabilities: { tools: { listChanged: false } },
}

/** The verified caller from the request's auth, or null when there isn't one. */
export function callerFrom(
	authInfo: AuthInfo | undefined,
	clientName?: string | null,
): McpCaller | null {
	const email = authInfo?.extra?.email
	if (typeof email !== 'string' || !email) return null
	const fromAuth = authInfo?.extra?.client
	return {
		email,
		client:
			clientName ||
			(typeof fromAuth === 'string' ? fromAuth : null) ||
			null,
	}
}

const text = (value: string) => ({ type: 'text' as const, text: value })

/** A tool's result as MCP content: the sentence first, then the data as JSON. */
function respond(result: ToolResult) {
	return {
		content: [
			text(result.summary),
			text(JSON.stringify(result.data, null, 2)),
		],
		structuredContent: result.data,
		...(result.isError ? { isError: true } : {}),
	}
}

/** The cache tags the web app's trip lists and trip pages read under. */
function tagsFor(result: ToolResult) {
	const trip = result.data.trip as { trip_id?: number } | undefined
	return [
		'current-trips',
		'past-trips',
		...(trip?.trip_id ? [`trip-${trip.trip_id}`] : []),
	]
}

/**
 * Runs a tool for the verified caller; bad input becomes a readable tool
 * error. A tool that writes also clears the cached trip lists, so a trip an
 * assistant started shows up in the web app straight away.
 */
export async function run(
	server: McpServer,
	authInfo: AuthInfo | undefined,
	tool: (caller: McpCaller) => ToolResult | Promise<ToolResult>,
	{ readOnly = false }: { readOnly?: boolean } = {},
) {
	const caller = callerFrom(
		authInfo,
		server.server.getClientVersion()?.name ?? null,
	)
	if (!caller) {
		return respond({
			summary:
				"Not signed in to Pat's PreTrips. Reconnect the connector and sign in.",
			data: {},
			isError: true,
		})
	}
	try {
		const result = await tool(caller)
		if (!readOnly && !result.isError) {
			for (const tag of tagsFor(result)) revalidateTag(tag, { expire: 0 })
		}
		return respond(result)
	} catch (error) {
		if (error instanceof z.ZodError) {
			return respond({
				summary: `Invalid input: ${error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}`,
				data: {},
				isError: true,
			})
		}
		console.error(error)
		return respond({
			summary:
				"Something went wrong in Pat's PreTrips. Try again shortly.",
			data: {},
			isError: true,
		})
	}
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: false }

export function registerPreTripTools(server: McpServer) {
	server.registerTool(
		'list_defect_categories',
		{
			title: 'List defect categories',
			description:
				'The defect categories PreTrips uses (Tires, Lights, Air Brake System, ...). Use these names in start_trip and update_trip.',
			inputSchema: portable(listDefectCategoriesInputSchema),
			annotations: READ_ONLY,
		},
		(_args, ctx) =>
			run(server, ctx.http?.authInfo, () => listDefectCategories(), {
				readOnly: true,
			}),
	)

	server.registerTool(
		'get_trip_defaults',
		{
			title: 'Get suggestions for a new trip',
			description:
				"What to suggest for a new pre-trip: the carrier, carrier address and inspection address from the driver's last trip and, given the truck plate read from a photo, that truck's make, model, trailer plates and last odometer. Call it before start_trip, then confirm everything with the driver.",
			inputSchema: portable(getTripDefaultsInputSchema),
			annotations: READ_ONLY,
		},
		(args, ctx) =>
			run(
				server,
				ctx.http?.authInfo,
				(caller) => getTripDefaults(caller, args),
				{ readOnly: true },
			),
	)

	server.registerTool(
		'start_trip',
		{
			title: 'Start a pre-trip',
			description:
				"Starts (saves) a pre-trip inspection report. Read the odometer and plates from the driver's photos, fill the rest from get_trip_defaults, and show the driver the whole trip first: only call this once they confirm it, including where they're inspecting and whether they found defects. The answer warns when the odometer is lower than the truck's last reading.",
			inputSchema: portable(startTripInputSchema),
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		(args, ctx) =>
			run(server, ctx.http?.authInfo, (caller) =>
				startTrip(caller, args),
			),
	)

	server.registerTool(
		'update_trip',
		{
			title: 'Update a trip',
			description:
				'Changes one of the driver\'s trips from the last 24 hours: pass trip_id and only the fields that change (e.g. odometer or truck_plate from a new photo). add_defects and add_remarks add on-route defects; nothing is ever removed. Only use it when the driver asks or agrees. Trips older than 24 hours answer status "too_old".',
			inputSchema: portable(updateTripInputSchema),
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		(args, ctx) =>
			run(server, ctx.http?.authInfo, (caller) =>
				updateTrip(caller, args),
			),
	)

	server.registerTool(
		'list_trips',
		{
			title: 'List trips',
			description:
				'The driver\'s trips, newest first, 10 per page: "current" (the last 24 hours, which can still be updated) or "past". Use it to find a trip_id.',
			inputSchema: portable(listTripsInputSchema),
			annotations: READ_ONLY,
		},
		(args, ctx) =>
			run(
				server,
				ctx.http?.authInfo,
				(caller) => listTrips(caller, args),
				{
					readOnly: true,
				},
			),
	)

	server.registerTool(
		'get_trip',
		{
			title: 'Get a trip',
			description:
				"One of the driver's trips by trip_id, with its defects, remarks and whether it can still be updated.",
			inputSchema: portable(getTripInputSchema),
			annotations: READ_ONLY,
		},
		(args, ctx) =>
			run(server, ctx.http?.authInfo, (caller) => getTrip(caller, args), {
				readOnly: true,
			}),
	)
}
