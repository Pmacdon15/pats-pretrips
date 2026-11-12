import { errAsync, okAsync } from 'neverthrow'
import { getDriverEmail } from '@/lib/auth'
import {
	apiKeyNameSchema,
	generateApiKey,
	hashApiKey,
	keyPrefix,
} from '../api-keys'
import { createApiKeyDb, listApiKeysDb, revokeApiKeyDb } from '../db/api-keys'

/*
 * Personal API keys for the AI connector, for the signed-in driver only.
 */

const signedInEmail = getDriverEmail

export async function getApiKeysDAL() {
	const email = await signedInEmail()
	if (!email) throw new Error('Must be logged in')
	return listApiKeysDb(email)
}

/** Creates a key and returns it once, in full. Only its hash is stored. */
export async function createApiKeyDAL(data: { name: string }) {
	const email = await signedInEmail()
	if (!email) return errAsync({ reason: 'Must be logged in' } as const)

	const parsed = apiKeyNameSchema.safeParse(data)
	if (!parsed.success) {
		return errAsync({
			reason: parsed.error.issues
				.map((issue) => issue.message)
				.join(', '),
		} as const)
	}
	const key = generateApiKey()
	try {
		const apiKey = await createApiKeyDb(
			email,
			parsed.data.name,
			hashApiKey(key),
			keyPrefix(key),
		)
		return okAsync({ apiKey, key })
	} catch (e) {
		console.error('Db error creating API key: ', e)
		return errAsync({
			reason: 'Could not create the key. Please try again.',
		} as const)
	}
}

export async function revokeApiKeyDAL(id: number) {
	const email = await signedInEmail()
	if (!email) return errAsync({ reason: 'Must be logged in' } as const)
	try {
		const revoked = await revokeApiKeyDb(email, id)
		if (!revoked)
			return errAsync({ reason: 'That key was not found' } as const)
		return okAsync({ id })
	} catch (e) {
		console.error('Db error revoking API key: ', e)
		return errAsync({
			reason: 'Could not revoke the key. Please try again.',
		} as const)
	}
}
