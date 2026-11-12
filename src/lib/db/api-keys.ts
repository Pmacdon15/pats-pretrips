import { neon } from '@neondatabase/serverless'
import type { ApiKey } from '../api-keys'

/*
 * The pt_api_keys table (src/lib/sql/2026-11-12-ai-connector.sql). Every
 * query is scoped to the driver's email, except the lookup by hash, which is
 * how a key finds its driver.
 */

type ApiKeyRow = {
	id: number
	name: string
	key_prefix: string
	created_at: Date | string
	last_used_at: Date | string | null
}

const iso = (value: Date | string) => new Date(value).toISOString()

function toApiKey(row: ApiKeyRow): ApiKey {
	return {
		id: row.id,
		name: row.name,
		prefix: row.key_prefix,
		createdAt: iso(row.created_at),
		lastUsedAt: row.last_used_at ? iso(row.last_used_at) : null,
	}
}

export async function createApiKeyDb(
	driverEmail: string,
	name: string,
	keyHash: string,
	prefix: string,
): Promise<ApiKey> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const [row] = await sql`
		INSERT INTO pt_api_keys (driver_email, name, key_hash, key_prefix)
		VALUES (${driverEmail}, ${name}, ${keyHash}, ${prefix})
		RETURNING id, name, key_prefix, created_at, last_used_at
	`
	return toApiKey(row as ApiKeyRow)
}

export async function listApiKeysDb(driverEmail: string): Promise<ApiKey[]> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const rows = await sql`
		SELECT id, name, key_prefix, created_at, last_used_at
		FROM pt_api_keys
		WHERE driver_email = ${driverEmail} AND revoked_at IS NULL
		ORDER BY created_at DESC
	`
	return (rows as ApiKeyRow[]).map(toApiKey)
}

/** Revokes one of the driver's keys. Returns whether a key was revoked. */
export async function revokeApiKeyDb(
	driverEmail: string,
	id: number,
): Promise<boolean> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const rows = await sql`
		UPDATE pt_api_keys SET revoked_at = NOW()
		WHERE id = ${id} AND driver_email = ${driverEmail} AND revoked_at IS NULL
		RETURNING id
	`
	return rows.length > 0
}

/**
 * The driver a live key belongs to, by the key's hash, noting when it was
 * used. Revoked or unknown keys answer null.
 */
export async function touchApiKeyDb(
	keyHash: string,
): Promise<{ id: number; driverEmail: string; name: string } | null> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const [row] = await sql`
		UPDATE pt_api_keys SET last_used_at = NOW()
		WHERE key_hash = ${keyHash} AND revoked_at IS NULL
		RETURNING id, driver_email, name
	`
	if (!row) return null
	return { id: row.id, driverEmail: row.driver_email, name: row.name }
}
