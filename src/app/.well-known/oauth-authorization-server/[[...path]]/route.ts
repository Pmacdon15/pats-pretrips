import {
	configuredIssuer,
	issuerDiscoveryDocument,
	metadataPreflight,
	notConfigured,
} from '@/mcp/oauth-metadata'

/*
 * Clerk's oauth-authorization-server document, mirrored on this domain for older MCP
 * clients that look for the authorization server next to the MCP server
 * (at the root or with /api/mcp appended). Current clients find Clerk
 * through the protected resource metadata instead.
 */
export async function GET() {
	const issuer = configuredIssuer()
	if (!issuer) return notConfigured()
	return issuerDiscoveryDocument(issuer, 'oauth-authorization-server')
}

export const OPTIONS = metadataPreflight
