import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqlMock } from './sql-mock'

const mocks = vi.hoisted(() => ({ neon: vi.fn(), after: vi.fn() }))
vi.mock('@neondatabase/serverless', () => ({ neon: mocks.neon }))
vi.mock('next/server', () => ({ after: mocks.after }))

import {
	isMissingColumnOrTable,
	OWNER_MIGRATION,
	type OwnerStamp,
	recordOwner,
	resetOwnerStampWarnings,
} from '@/lib/db/owner-stamps'

const sql = createSqlMock()
const PAT = { email: 'pat@x.com', userId: 'user_1' }
const dbError = (code: string) =>
	Object.assign(new Error(`db error ${code}`), { code })

/** Runs what recordOwner handed to `after()`. */
async function runAfter() {
	expect(mocks.after).toHaveBeenCalledTimes(1)
	await mocks.after.mock.calls[0][0]()
}

beforeEach(() => {
	sql.reset()
	mocks.neon.mockReturnValue(sql.sql)
	vi.stubEnv('DATABASE_URL', 'postgres://test')
	// In a request, `after` schedules the stamp for after the response.
	mocks.after.mockImplementation(() => {})
	resetOwnerStampWarnings()
	vi.spyOn(console, 'warn').mockImplementation(() => {})
	vi.spyOn(console, 'error').mockImplementation(() => {})
	sql.respond(() => [{ stamped: 1, conflicts: 0 }])
})

describe('recordOwner', () => {
	it('stamps after the response, not during the write', async () => {
		await recordOwner(PAT, { table: 'trip', tripId: 4 })
		// Nothing has run yet: the driver's action returns first.
		expect(sql.calls).toHaveLength(0)
		await runAfter()
		const [query] = sql.queries()
		expect(query.text).toContain(
			'UPDATE PTTrips SET clerk_user_id = ? WHERE tripId = ? AND driverEmail = ? AND clerk_user_id IS NULL',
		)
		expect(query.values).toEqual([
			4,
			'pat@x.com',
			'user_1',
			4,
			'pat@x.com',
			'user_1',
		])
		expect(console.warn).not.toHaveBeenCalled()
		expect(console.error).not.toHaveBeenCalled()
	})

	it('stamps now, awaited, where `after` is not allowed', async () => {
		mocks.after.mockImplementation(() => {
			throw new Error('`after` was called outside a request scope')
		})
		await recordOwner(PAT, { table: 'email_settings' })
		expect(sql.queries()).toHaveLength(1)
	})

	it('skips without a user ID or anything to stamp', async () => {
		await recordOwner({ email: 'pat@x.com' }, { table: 'email_settings' })
		await recordOwner(
			{ email: 'pat@x.com', userId: null },
			{ table: 'email_settings' },
		)
		await recordOwner(
			{ email: 'pat@x.com', userId: '' },
			{ table: 'email_settings' },
		)
		await recordOwner(PAT)
		expect(mocks.after).not.toHaveBeenCalled()
		expect(sql.calls).toHaveLength(0)
	})

	it('stamps several rows from one write', async () => {
		await recordOwner(
			PAT,
			{ table: 'trip', tripId: 4 },
			{ table: 'trip_signature', tripId: 4 },
		)
		await runAfter()
		expect(sql.queries().map((q) => q.text)).toEqual([
			expect.stringContaining('UPDATE PTTrips SET'),
			expect.stringContaining('UPDATE pt_trip_signatures SET'),
		])
	})

	const cases: [OwnerStamp, string, unknown[]][] = [
		[
			{ table: 'trip', tripId: 4 },
			'UPDATE PTTrips SET clerk_user_id = ? WHERE tripId = ? AND driverEmail = ? AND clerk_user_id IS NULL',
			[4, 'pat@x.com'],
		],
		[
			{ table: 'trip_signature', tripId: 4 },
			'UPDATE pt_trip_signatures SET clerk_user_id = ? WHERE trip_id = ? AND driver_email = ? AND clerk_user_id IS NULL',
			[4, 'pat@x.com'],
		],
		[
			{ table: 'driver_signature' },
			'UPDATE pt_driver_signatures SET clerk_user_id = ? WHERE driver_email = ? AND clerk_user_id IS NULL',
			['pat@x.com'],
		],
		[
			{ table: 'email_settings' },
			'UPDATE pt_email_settings SET clerk_user_id = ? WHERE driver_email = ? AND clerk_user_id IS NULL',
			['pat@x.com'],
		],
		[
			{ table: 'repair', repairId: 9 },
			'UPDATE pt_defect_repairs SET clerk_user_id = ? WHERE id = ? AND driver_email = ? AND clerk_user_id IS NULL',
			[9, 'pat@x.com'],
		],
		[
			{ table: 'email_send', sendId: '12' },
			'UPDATE pt_email_sends SET clerk_user_id = ? WHERE id = ? AND driver_email = ? AND clerk_user_id IS NULL',
			['12', 'pat@x.com'],
		],
	]

	it.each(
		cases,
	)('fills only an empty clerk_user_id, on the driver’s own row (%j)', async (stamp, update, key) => {
		await recordOwner(PAT, stamp)
		await runAfter()
		const [query] = sql.queries()
		expect(query.text).toContain(update)
		// The row as it was, then the update, then the different-ID count.
		expect(query.values).toEqual([...key, 'user_1', ...key, 'user_1'])
		expect(query.text).toContain(
			'WHERE clerk_user_id IS DISTINCT FROM ? AND clerk_user_id IS NOT NULL',
		)
	})

	it.each(
		cases,
	)('leaves a row owned by a different Clerk user and warns (%j)', async (stamp) => {
		sql.respond(() => [{ stamped: 0, conflicts: 1 }])
		await recordOwner(PAT, stamp)
		await runAfter()
		expect(console.warn).toHaveBeenCalledTimes(1)
		expect(vi.mocked(console.warn).mock.calls[0][0]).toContain(
			'already belongs to a different Clerk user than user_1',
		)
		// The email is never logged.
		expect(vi.mocked(console.warn).mock.calls[0][0]).not.toContain(
			'pat@x.com',
		)
	})

	it('names the row in the warning', async () => {
		sql.respond(() => [{ stamped: 0, conflicts: 1 }])
		await recordOwner(PAT, { table: 'repair', repairId: 9 })
		await runAfter()
		expect(vi.mocked(console.warn).mock.calls[0][0]).toContain(
			'pt_defect_repairs repair 9',
		)
	})

	it('is quiet when the row is already the driver’s, or is gone', async () => {
		sql.respond(() => [{ stamped: 0, conflicts: 0 }])
		await recordOwner(PAT, { table: 'trip', tripId: 4 })
		await runAfter()
		mocks.after.mockClear()
		sql.respond(() => [])
		await recordOwner(PAT, { table: 'trip', tripId: 5 })
		await runAfter()
		expect(console.warn).not.toHaveBeenCalled()
		expect(console.error).not.toHaveBeenCalled()
	})

	it.each([
		'42703',
		'42P01',
	])('logs a missing column or table (%s) once, naming the migration', async (code) => {
		sql.respond(() => dbError(code))
		for (const stamp of cases.map(([s]) => s)) {
			mocks.after.mockClear()
			await expect(recordOwner(PAT, stamp)).resolves.toBeUndefined()
			await expect(runAfter()).resolves.toBeUndefined()
		}
		expect(console.error).toHaveBeenCalledTimes(1)
		expect(vi.mocked(console.error).mock.calls[0][0]).toContain(
			`Run ${OWNER_MIGRATION}.`,
		)
		expect(OWNER_MIGRATION).toBe('src/lib/sql/2026-11-18-clerk-user-id.sql')
	})

	it('logs any other error every time, and never throws', async () => {
		sql.respond(() => dbError('08006'))
		await recordOwner(PAT, { table: 'trip', tripId: 4 })
		await runAfter()
		mocks.after.mockClear()
		await recordOwner(PAT, { table: 'driver_signature' })
		await runAfter()
		expect(console.error).toHaveBeenCalledTimes(2)
		expect(vi.mocked(console.error).mock.calls[0][0]).toContain(
			'could not record the Clerk user on PTTrips trip 4',
		)
	})

	it('never throws when stamping now either', async () => {
		mocks.after.mockImplementation(() => {
			throw new Error('outside a request')
		})
		sql.respond(() => new Error('fetch failed'))
		await expect(
			recordOwner(PAT, { table: 'email_send', sendId: '3' }),
		).resolves.toBeUndefined()
		expect(console.error).toHaveBeenCalledTimes(1)
	})
})

describe('isMissingColumnOrTable', () => {
	it('knows the missing column and missing table codes only', () => {
		expect(isMissingColumnOrTable(dbError('42703'))).toBe(true)
		expect(isMissingColumnOrTable(dbError('42P01'))).toBe(true)
		expect(isMissingColumnOrTable(dbError('23505'))).toBe(false)
		expect(isMissingColumnOrTable(new Error('x'))).toBe(false)
		expect(isMissingColumnOrTable(null)).toBe(false)
		expect(isMissingColumnOrTable('42703')).toBe(false)
	})
})
