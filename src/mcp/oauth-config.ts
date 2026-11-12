/*
 * The OAuth settings MCP clients are told about, kept free of server-only
 * imports so the Connect AI page can show them too.
 */

/**
 * The scopes an MCP client should ask Kinde for. PreTrips only needs to know
 * who signed in (trips belong to the driver's email), plus `offline_access`
 * so the client gets a refresh token and stays linked. Google account linking
 * (Gemini) needs that refresh token; Claude and Muse use it too.
 */
export const MCP_SCOPES = [
	'openid',
	'profile',
	'email',
	'offline_access',
] as const

/**
 * The OAuth issuer AI apps sign in with: `MCP_OAUTH_ISSUER` when the MCP
 * connection in Kinde has its own issuer URL, otherwise the app's own Kinde
 * domain (`KINDE_ISSUER_URL`). Never with a trailing slash, since tokens'
 * `iss` claim doesn't have one.
 */
export function configuredIssuer(
	env: Record<string, string | undefined> = process.env,
) {
	const raw = env.MCP_OAUTH_ISSUER?.trim() || env.KINDE_ISSUER_URL?.trim()
	return raw ? raw.replace(/\/+$/, '') : null
}
