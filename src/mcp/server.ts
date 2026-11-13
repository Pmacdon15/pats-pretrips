import type { AuthInfo, McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { expireDriverTrips } from '@/lib/cache/revalidate'
import { MCP_INSTRUCTIONS } from '@/mcp/instructions'
import { portable } from '@/mcp/portable-schema'
import {
	listDefects,
	listDefectsInputSchema,
	markDefectRepaired,
	markDefectRepairedInputSchema,
	undoDefectRepair,
	undoDefectRepairInputSchema,
} from '@/mcp/repair-tools'
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
import {
	MCP_APP_MIME_TYPE,
	TRIPS_CARD_HTML,
	TRIPS_CARD_TOOL_META,
	TRIPS_CARD_URI,
} from '@/mcp/trips-card'

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
	capabilities: {
		tools: { listChanged: false },
		resources: { listChanged: false },
	},
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
			expireDriverTrips(caller.email)
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
	// The card AI apps with MCP Apps show for list_trips, get_trip and
	// list_defects.
	server.registerResource(
		'trips_card',
		TRIPS_CARD_URI,
		{
			title: 'Trips card',
			description:
				"Shows the driver's trips, defects and repairs as cards in the chat.",
			mimeType: MCP_APP_MIME_TYPE,
			_meta: { ui: { prefersBorder: true } },
		},
		(uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: MCP_APP_MIME_TYPE,
					text: TRIPS_CARD_HTML,
					_meta: { ui: { prefersBorder: true } },
				},
			],
		}),
	)

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
			_meta: TRIPS_CARD_TOOL_META,
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
				"One of the driver's trips by trip_id, with its defects (each open or repaired), remarks and whether it can still be updated.",
			inputSchema: portable(getTripInputSchema),
			annotations: READ_ONLY,
			_meta: TRIPS_CARD_TOOL_META,
		},
		(args, ctx) =>
			run(server, ctx.http?.authInfo, (caller) => getTrip(caller, args), {
				readOnly: true,
			}),
	)

	server.registerTool(
		'list_defects',
		{
			title: 'List defects and repairs',
			description:
				"The driver's defect record: every defect reported on a pre-trip that is still open, and every repaired one with who fixed it, when, the invoice number and links to the invoice and signature. Filter by status or truck_plate.",
			inputSchema: portable(listDefectsInputSchema),
			annotations: READ_ONLY,
			_meta: TRIPS_CARD_TOOL_META,
		},
		(args, ctx) =>
			run(
				server,
				ctx.http?.authInfo,
				(caller) => listDefects(caller, args),
				{ readOnly: true },
			),
	)

	server.registerTool(
		'mark_defect_repaired',
		{
			title: 'Mark a defect repaired',
			description:
				"Records that a defect on one of the driver's trips was fixed, e.g. by a mechanic: who repaired it (the mechanic, the shop, or both: at least one), the invoice number, the repair date and notes, plus the invoice (PDF or photo, base64, compressed before saving, up to about 3 MB) and an image of the mechanic's signature. Works on trips of any age. The trip keeps its defects; this adds the repair beside them. Confirm the details with the driver first.",
			inputSchema: portable(markDefectRepairedInputSchema),
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		(args, ctx) =>
			run(server, ctx.http?.authInfo, (caller) =>
				markDefectRepaired(caller, args),
			),
	)

	server.registerTool(
		'undo_defect_repair',
		{
			title: 'Undo a defect repair',
			description:
				'Removes a repair recorded by mistake, with its invoice and signature, so the defect shows as open again. Only when the driver asks.',
			inputSchema: portable(undoDefectRepairInputSchema),
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		(args, ctx) =>
			run(server, ctx.http?.authInfo, (caller) =>
				undoDefectRepair(caller, args),
			),
	)
}
