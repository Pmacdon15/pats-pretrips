import { mcpResourceUrl, publicOrigin } from '@/mcp/http'
import { MCP_SCOPES } from '@/mcp/oauth-config'

export { configuredIssuer } from '@/mcp/oauth-config'

/*
 * OAuth discovery documents for MCP clients. The authorization server is
 * Kinde (the issuer in `configuredIssuer`); PreTrips is the protected
 * resource. Same shape as Budget and Clock Out, which use Clerk instead.
 */

export const METADATA_CORS_HEADERS: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': '*',
	'Access-Control-Max-Age': '86400',
}

/** CORS preflight for the discovery documents, which browser-based clients fetch too. */
export function metadataPreflight() {
	return new Response(null, { status: 204, headers: METADATA_CORS_HEADERS })
}

/**
 * Protected Resource Metadata (RFC 9728) for the MCP endpoint. `resource` is
 * the exact URL clients connect to, `authorization_servers` is Kinde and
 * `scopes_supported` is what a client should ask for.
 */
export function protectedResourceMetadata(req: Request, issuer: string) {
	const origin = publicOrigin(req)
	return {
		resource: mcpResourceUrl(req),
		authorization_servers: [issuer],
		scopes_supported: [...MCP_SCOPES],
		bearer_methods_supported: ['header'],
		resource_name: "Pat's PreTrips",
		resource_documentation: origin,
		logo_uri: `${origin}/icon.svg`,
	}
}

export function notConfigured() {
	return Response.json(
		{ error: "Sign-in isn't configured for this deployment." },
		{ status: 503, headers: METADATA_CORS_HEADERS },
	)
}

/**
 * One of Kinde's discovery documents, served from this origin for clients
 * that look for the authorization server on the MCP server's own domain
 * (the 2025-03-26 MCP spec did). Its `issuer` stays Kinde's.
 */
export async function issuerDiscoveryDocument(
	issuer: string,
	document: 'oauth-authorization-server' | 'openid-configuration',
) {
	try {
		const res = await fetch(`${issuer}/.well-known/${document}`, {
			signal: AbortSignal.timeout(10_000),
			headers: { accept: 'application/json' },
		})
		if (!res.ok) throw new Error(`Kinde answered ${res.status}`)
		return Response.json(await res.json(), {
			headers: {
				...METADATA_CORS_HEADERS,
				'Cache-Control': 'max-age=3600',
			},
		})
	} catch (error) {
		console.error(`Couldn't fetch Kinde's ${document} document`, error)
		return Response.json(
			{ error: "The sign-in server didn't answer. Try again shortly." },
			{ status: 502, headers: METADATA_CORS_HEADERS },
		)
	}
}
