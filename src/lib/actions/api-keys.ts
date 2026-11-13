'use server'

import {
	createApiKeyDAL,
	listApiKeysDAL,
	revokeApiKeyDAL,
} from '../DAL/api-keys'

export async function listApiKeys() {
	const result = await listApiKeysDAL()
	return result.match(
		(value) => ({ value }),
		(err) => ({ errorMessage: err.reason }),
	)
}

export async function createApiKey(data: { name: string }) {
	const result = await createApiKeyDAL(data)
	return result.match(
		(value) => ({ value }),
		(err) => ({ errorMessage: err.reason }),
	)
}

export async function revokeApiKey(id: number) {
	const result = await revokeApiKeyDAL(id)
	return result.match(
		(value) => ({ value }),
		(err) => ({ errorMessage: err.reason }),
	)
}
