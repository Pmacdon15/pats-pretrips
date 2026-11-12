// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
	apiKeyNameSchema,
	generateApiKey,
	hashApiKey,
	keyPrefix,
	looksLikeApiKey,
} from '@/lib/api-keys'

describe('API keys', () => {
	it('makes recognisable random keys', () => {
		const key = generateApiKey()
		expect(key).toMatch(/^ppt_/)
		expect(looksLikeApiKey(key)).toBe(true)
		expect(generateApiKey()).not.toBe(key)
		expect(looksLikeApiKey('ppt_short')).toBe(false)
		expect(keyPrefix(key)).toBe(key.slice(0, 10))
	})

	it('hashes with SHA-256', () => {
		expect(hashApiKey('abc')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
		)
	})

	it('needs a short name', () => {
		expect(apiKeyNameSchema.safeParse({ name: '  ' }).success).toBe(false)
		expect(apiKeyNameSchema.parse({ name: ' Muse ' })).toEqual({
			name: 'Muse',
		})
	})
})
