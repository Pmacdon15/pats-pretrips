import type { AuthInfo } from '@modelcontextprotocol/server'
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from 'jose'
import { hashApiKey, looksLikeApiKey } from '@/lib/api-keys'
import { touchApiKeyDb } from '@/lib/db/api-keys'
import { configuredIssuer } from '@/mcp/oauth-config'

/*
 * Who is calling the MCP server. Two ways in:
 *
 * - OAuth (the normal way): the AI app sends the driver to sign in to
 *   PreTrips with Kinde, and Kinde issues it an access token (a JWT). It's
 *   checked against Kinde's signing keys and issuer here.
 * - A personal API key (`ppt_...`), for apps that can't do OAuth. Its hash is
 *   looked up; revoked keys don't work.
 *
 * Either way the result carries the driver's email in `extra.email`, which is
 * the only place tools take the driver from. Trips belong to an email, as
 * they do in the web app.
 */

/** Kinde's signing keys, fetched once per issuer and cached by jose. */
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function keySet(issuer: string) {
	let set = keySets.get(issuer)
	if (!set) {
		set = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`))
		keySets.set(issuer, set)
	}
	return set
}

/**
 * The audiences a token must name, from `MCP_TOKEN_AUDIENCE` (comma or space
 * separated), e.g. the audience of the API registered for the connector in
 * Kinde. Unset means the audience isn't checked: any token this Kinde
 * business issued for the driver is accepted.
 */
export function tokenAudiences(raw = process.env.MCP_TOKEN_AUDIENCE) {
	const list = (raw ?? '')
		.split(/[\s,]+/)
		.map((value) => value.trim())
		.filter(Boolean)
	return list.length > 0 ? list : undefined
}

/** Whether a bearer token could be a JWT. Anything else is refused without a network call. */
export function looksLikeJwt(token: string) {
	return (
		token.length <= 8192 &&
		/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
	)
}

const emailOf = (value: unknown) =>
	typeof value === 'string' && value.includes('@') ? value : undefined

/**
 * The signed-in driver's email. Kinde puts it in the access token when the
 * token is set up to include it; otherwise it's asked for with the token
 * from Kinde's user profile endpoint.
 */
async function driverEmail(
	issuer: string,
	token: string,
	payload: JWTPayload,
): Promise<string | undefined> {
	const fromToken = emailOf(payload.email)
	if (fromToken) return fromToken
	const res = await fetch(`${issuer}/oauth2/v2/user_profile`, {
		headers: {
			authorization: `Bearer ${token}`,
			accept: 'application/json',
		},
		signal: AbortSignal.timeout(10_000),
	})
	if (!res.ok) {
		console.warn(`MCP: Kinde's user profile answered ${res.status}`)
		return undefined
	}
	const profile = (await res.json()) as Record<string, unknown>
	return emailOf(profile.email) ?? emailOf(profile.preferred_email)
}

async function verifyOAuthToken(token: string): Promise<AuthInfo | undefined> {
	const issuer = configuredIssuer()
	if (!issuer) {
		console.error('MCP: no OAuth issuer configured (KINDE_ISSUER_URL)')
		return undefined
	}
	let payload: JWTPayload
	try {
		;({ payload } = await jwtVerify(token, keySet(issuer), {
			issuer,
			audience: tokenAudiences(),
		}))
	} catch (error) {
		console.warn(
			`MCP: refused an access token (${error instanceof Error ? error.message : 'verification failed'})`,
		)
		return undefined
	}
	const email = await driverEmail(issuer, token, payload)
	if (!email) {
		console.warn('MCP: an access token without an email was refused')
		return undefined
	}
	const clientId =
		typeof payload.azp === 'string'
			? payload.azp
			: typeof payload.client_id === 'string'
				? payload.client_id
				: 'oauth'
	return {
		token,
		clientId,
		scopes: typeof payload.scp === 'string' ? payload.scp.split(' ') : [],
		expiresAt: payload.exp,
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

	if (!looksLikeJwt(token)) {
		console.warn("MCP: refused a bearer token that isn't a JWT or API key")
		return undefined
	}
	return verifyOAuthToken(token)
}
