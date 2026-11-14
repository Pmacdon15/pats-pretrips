import { clerkClient } from '@clerk/nextjs/server'
import type { AuthInfo } from '@modelcontextprotocol/server'
import { hashApiKey, looksLikeApiKey } from '@/lib/api-keys'
import { touchApiKeyDb } from '@/lib/db/api-keys'

/*
 * Who is calling the MCP server. Two ways in:
 *
 * - OAuth (the normal way): the AI app registers itself with Clerk (dynamic
 *   client registration), sends the driver to sign in to PreTrips, and Clerk
 *   issues it an access token. Clerk's Backend API checks the token.
 * - A personal API key (`ppt_...`), for apps that can't do OAuth. Its hash is
 *   looked up; revoked keys don't work.
 *
 * Either way the result carries the driver's email in `extra.email`, which is
 * the only place tools take the driver from. Trips belong to an email, as
 * they do in the web app.
 */

/**
 * The scopes an OAuth access token must carry. Tools take the driver from
 * their Clerk primary email, so the driver must have agreed to share their
 * email with the app holding the token. `email` is one of the scopes every
 * client is told to ask for (`MCP_SCOPES`, in the 401 challenge and the
 * protected resource metadata). `profile` is advertised too but isn't
 * required: PreTrips never reads it.
 */
export const REQUIRED_OAUTH_SCOPES = ['email'] as const

/** The required scopes that a token's granted scopes don't include. */
export function missingScopes(granted: readonly string[]) {
	return REQUIRED_OAUTH_SCOPES.filter((scope) => !granted.includes(scope))
}

/**
 * The audiences a token must name, from `MCP_TOKEN_AUDIENCE` (comma or space
 * separated). Unset means the audience isn't checked: any OAuth token this
 * Clerk instance issued for the driver is accepted, whichever app it was
 * issued to. Clerk only puts an `aud` claim in access tokens once audience
 * claims are on (adding an MCP server under Agents → MCP servers in the
 * Clerk dashboard turns them on), so it can't be enforced by default without
 * refusing every token issued before that. See docs/mcp-ai-guide.md.
 */
export function tokenAudiences(raw = process.env.MCP_TOKEN_AUDIENCE) {
	const list = (raw ?? '')
		.split(/[\s,]+/)
		.map((value) => value.trim())
		.filter(Boolean)
	return list.length > 0 ? list : undefined
}

let warnedAudienceUnchecked = false

/**
 * Says once per server instance, in production, that the audience isn't
 * checked, with the `aud` Clerk put in the token so the owner can see what
 * `MCP_TOKEN_AUDIENCE` should be (or that audience claims are still off).
 */
function warnAudienceUnchecked(aud: readonly string[] | undefined) {
	if (warnedAudienceUnchecked || process.env.VERCEL_ENV !== 'production') {
		return
	}
	warnedAudienceUnchecked = true
	console.warn(
		`MCP: MCP_TOKEN_AUDIENCE is unset, so the audience of OAuth access tokens is NOT checked and a token Clerk issued to any app is accepted (this token's aud: ${aud?.length ? JSON.stringify(aud) : 'none'}). See docs/mcp-ai-guide.md.`,
	)
}

/**
 * Whether a bearer token could be a Clerk OAuth access token: opaque
 * (`oat_...`) or a JWT. Anything else is refused without a network call.
 */
export function looksLikeOAuthToken(token: string) {
	return (
		token.length <= 8192 &&
		(/^oat_[A-Za-z0-9_-]+$/.test(token) ||
			/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
	)
}

async function verifyOAuthToken(token: string): Promise<AuthInfo | undefined> {
	const client = await clerkClient()
	let accessToken: Awaited<
		ReturnType<typeof client.idPOAuthAccessToken.verify>
	>
	const audience = tokenAudiences()
	try {
		accessToken = await client.idPOAuthAccessToken.verify(token, {
			audience,
		})
	} catch (error) {
		console.warn(
			`MCP: refused an access token (${error instanceof Error ? error.message : 'verification failed'})`,
		)
		return undefined
	}
	if (accessToken.revoked || accessToken.expired) {
		console.warn('MCP: refused a revoked or expired access token')
		return undefined
	}
	const missing = missingScopes(accessToken.scopes)
	if (missing.length > 0) {
		console.warn(
			`MCP: refused an access token for client ${accessToken.clientId} without the ${missing.join(', ')} scope (it has: ${accessToken.scopes.join(' ') || 'none'})`,
		)
		return undefined
	}
	if (!audience) warnAudienceUnchecked(accessToken.aud)
	const user = await client.users.getUser(accessToken.subject)
	const email = user.primaryEmailAddress?.emailAddress
	if (!email) {
		console.warn('MCP: the signed-in user has no email address')
		return undefined
	}
	return {
		token,
		clientId: accessToken.clientId,
		scopes: accessToken.scopes,
		expiresAt: accessToken.expiration ?? undefined,
		extra: { email, via: 'oauth' },
	}
}

export async function verifyMcpToken(
	_req: Request,
	token: string | undefined,
): Promise<AuthInfo | undefined> {
	if (!token) return undefined

	if (looksLikeApiKey(token)) {
		const key = await touchApiKeyDb(hashApiKey(token))
		if (!key) return undefined
		return {
			token,
			clientId: `api-key:${key.id}`,
			scopes: [],
			extra: { email: key.driverEmail, client: key.name, via: 'api_key' },
		}
	}

	if (!looksLikeOAuthToken(token)) {
		console.warn(
			"MCP: refused a bearer token that isn't an OAuth token or API key",
		)
		return undefined
	}
	return verifyOAuthToken(token)
}
