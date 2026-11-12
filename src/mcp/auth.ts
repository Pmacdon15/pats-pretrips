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
 * The audiences a token must name, from `MCP_TOKEN_AUDIENCE` (comma or space
 * separated). Unset means the audience isn't checked: any OAuth token this
 * Clerk instance issued for the driver is accepted.
 */
export function tokenAudiences(raw = process.env.MCP_TOKEN_AUDIENCE) {
	const list = (raw ?? '')
		.split(/[\s,]+/)
		.map((value) => value.trim())
		.filter(Boolean)
	return list.length > 0 ? list : undefined
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
	try {
		accessToken = await client.idPOAuthAccessToken.verify(token, {
			audience: tokenAudiences(),
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
