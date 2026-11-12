import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'

/*
 * Personal API keys, for AI apps that can't sign in to the MCP server with
 * OAuth. Only a SHA-256 hash of a key is stored; the key itself is shown once.
 */

/** Every key starts with this, so it's recognisable and never mistaken for an OAuth token. */
export const API_KEY_PREFIX = 'ppt_'

export type ApiKey = {
	id: number
	name: string
	/** The key's first characters, e.g. "ppt_a1B2c3", to tell keys apart. */
	prefix: string
	createdAt: string
	lastUsedAt: string | null
}

export const apiKeyNameSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Name the key, like the app it's for")
		.max(60, 'That name is too long'),
})

/** A new random key: the prefix plus 32 random bytes, base64url. */
export function generateApiKey() {
	return `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`
}

export function hashApiKey(key: string) {
	return createHash('sha256').update(key).digest('hex')
}

/** Whether a bearer token has the shape of one of our keys. */
export function looksLikeApiKey(token: string) {
	return /^ppt_[A-Za-z0-9_-]{43}$/.test(token)
}

/** The part of a key that's safe to show again later. */
export function keyPrefix(key: string) {
	return key.slice(0, API_KEY_PREFIX.length + 6)
}
