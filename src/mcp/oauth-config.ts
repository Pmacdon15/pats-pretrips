/*
 * The OAuth settings MCP clients are told about, kept free of server-only
 * imports so the Connect AI page can show them too.
 */

/**
 * The scopes an MCP client should ask Clerk for. PreTrips only needs to know
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
 * The Clerk Frontend API a publishable key belongs to, e.g.
 * `pk_live_Y2xlcmsucGF0c3ByZXRyaXBzLmNhJA` → `clerk.patspretrips.ca`. The key
 * is `pk_<env>_` plus the base64 of the host and a `$`.
 */
export function frontendApiFromPublishableKey(key: string | undefined) {
	const match = key?.trim().match(/^pk_(?:test|live)_([A-Za-z0-9+/=_-]+)$/)
	if (!match) return null
	const decoded = Buffer.from(match[1], 'base64').toString('utf8')
	return decoded.endsWith('$') && decoded.length > 1
		? decoded.slice(0, -1)
		: null
}

/**
 * The OAuth issuer AI apps sign in with: `MCP_OAUTH_ISSUER` if set, otherwise
 * the Clerk instance's Frontend API, from `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
 * Never with a trailing slash, since tokens' `iss` claim doesn't have one.
 */
export function configuredIssuer(
	env: Record<string, string | undefined> = process.env,
) {
	const override = env.MCP_OAUTH_ISSUER?.trim()
	if (override) return override.replace(/\/+$/, '')
	const host = frontendApiFromPublishableKey(
		env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	)
	return host ? `https://${host}` : null
}
