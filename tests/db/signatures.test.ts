import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqlMock } from './sql-mock'

const mocks = vi.hoisted(() => ({ neon: vi.fn() }))
vi.mock('@neondatabase/serverless', () => ({ neon: mocks.neon }))

import {
	deleteSavedSignatureDb,
	getAiSigningAllowedDb,
	getSavedSignatureDateDb,
	getSavedSignatureDb,
	getTripSignatureDb,
	saveSignatureDb,
	setAiSigningDb,
	signTripDb,
} from '@/lib/db/signatures'

const sql = createSqlMock()
const PNG = { bytes: Buffer.from('hi'), type: 'image/png' }
const WHEN = '2026-11-15T10:00:00.000Z'

beforeEach(() => {
	sql.reset()
	mocks.neon.mockReturnValue(sql.sql)
	vi.stubEnv('DATABASE_URL', 'postgres://test')
})

describe('getSavedSignatureDb', () => {
	it("reads the driver's saved signature", async () => {
		sql.respond(() => [
			{ data: 'aG\nk=', type: 'image/png', updated_at: new Date(WHEN) },
		])
		await expect(getSavedSignatureDb('pat@x.com')).resolves.toEqual({
			bytes: Buffer.from('hi'),
			type: 'image/png',
			updatedAt: WHEN,
		})
		const [query] = sql.queries()
		expect(query.text).toContain('FROM pt_driver_signatures')
		expect(query.values).toEqual(['pat@x.com'])
	})

	it('is undefined without one, and defaults the type to PNG', async () => {
		await expect(getSavedSignatureDb('pat@x.com')).resolves.toBeUndefined()
		sql.respond(() => [{ data: 'aGk=', type: null, updated_at: WHEN }])
		await expect(getSavedSignatureDb('pat@x.com')).resolves.toMatchObject({
			type: 'image/png',
		})
	})
})

describe('getSavedSignatureDateDb', () => {
	it('says when the signature was saved, or null', async () => {
		await expect(getSavedSignatureDateDb('pat@x.com')).resolves.toBeNull()
		sql.respond(() => [{ updated_at: WHEN }])
		await expect(getSavedSignatureDateDb('pat@x.com')).resolves.toBe(WHEN)
	})
})

describe('saveSignatureDb', () => {
	it('saves or replaces the signature', async () => {
		sql.respond(() => [{ updated_at: WHEN }])
		await expect(saveSignatureDb('pat@x.com', PNG)).resolves.toBe(WHEN)
		const [query] = sql.queries()
		expect(query.text).toContain('INSERT INTO pt_driver_signatures')
		expect(query.text).toContain('ON CONFLICT (driver_email) DO UPDATE')
		expect(query.values).toEqual(['pat@x.com', '6869', 'image/png'])
	})
})

describe('deleteSavedSignatureDb', () => {
	it('says whether there was one to delete', async () => {
		await expect(deleteSavedSignatureDb('pat@x.com')).resolves.toBe(false)
		sql.respond(() => [{ driver_email: 'pat@x.com' }])
		await expect(deleteSavedSignatureDb('pat@x.com')).resolves.toBe(true)
		expect(sql.queries()[0].text).toContain(
			'DELETE FROM pt_driver_signatures',
		)
	})
})

describe('getAiSigningAllowedDb', () => {
	it('is on only when the saved signature has it turned on', async () => {
		await expect(getAiSigningAllowedDb('pat@x.com')).resolves.toBe(false)
		sql.respond(() => [{ allow_ai_signing: false }])
		await expect(getAiSigningAllowedDb('pat@x.com')).resolves.toBe(false)
		sql.respond(() => [{ allow_ai_signing: true }])
		await expect(getAiSigningAllowedDb('pat@x.com')).resolves.toBe(true)
		const [query] = sql.queries()
		expect(query.text).toContain(
			'SELECT allow_ai_signing FROM pt_driver_signatures',
		)
		expect(query.values).toEqual(['pat@x.com'])
	})

	it('throws a missing column, for the caller to treat as off', async () => {
		const missing = Object.assign(new Error('no column'), { code: '42703' })
		sql.respond(() => missing)
		await expect(getAiSigningAllowedDb('pat@x.com')).rejects.toBe(missing)
	})
})

describe('setAiSigningDb', () => {
	it("changes the setting on the driver's saved signature", async () => {
		sql.respond(() => [{ allow_ai_signing: true, updated_at: WHEN }])
		await expect(setAiSigningDb('pat@x.com', true)).resolves.toEqual({
			allowAiSigning: true,
			updatedAt: WHEN,
		})
		const [query] = sql.queries()
		expect(query.text).toContain(
			'UPDATE pt_driver_signatures SET allow_ai_signing = ?',
		)
		expect(query.text).toContain('WHERE driver_email = ?')
		// The signature's date (the image's cache key) is left alone.
		expect(query.text).not.toContain('updated_at =')
		expect(query.values).toEqual([true, 'pat@x.com'])
	})

	it('is undefined without a saved signature', async () => {
		await expect(
			setAiSigningDb('pat@x.com', false),
		).resolves.toBeUndefined()
		sql.respond(() => [{ allow_ai_signing: false, updated_at: WHEN }])
		await expect(setAiSigningDb('pat@x.com', false)).resolves.toEqual({
			allowAiSigning: false,
			updatedAt: WHEN,
		})
	})
})

describe('getTripSignatureDb', () => {
	it("reads the signature on one of the driver's trips", async () => {
		await expect(
			getTripSignatureDb(3, 'pat@x.com'),
		).resolves.toBeUndefined()
		sql.respond(() => [{ data: 'aGk=', type: 'image/png' }])
		await expect(getTripSignatureDb(3, 'pat@x.com')).resolves.toEqual(PNG)
		expect(sql.queries()[0].values).toEqual([3, 'pat@x.com'])
	})
})

describe('signTripDb', () => {
	it('signs an unsigned trip from the last 24 hours', async () => {
		const row = { tripid: 3, signed_at: WHEN }
		sql.respond(() => [row])
		await expect(signTripDb(3, 'pat@x.com', PNG, 'web')).resolves.toBe(row)
		const [query] = sql.queries()
		expect(query.text).toContain('signed_at IS NULL')
		expect(query.text).toContain("INTERVAL '24 hours'")
		expect(query.text).toContain('INSERT INTO pt_trip_signatures')
		expect(query.values).toEqual([
			3,
			'pat@x.com',
			'6869',
			'image/png',
			'web',
		])
	})

	it("is undefined when the trip can't be signed", async () => {
		await expect(
			signTripDb(3, 'pat@x.com', PNG, 'web'),
		).resolves.toBeUndefined()
	})
})
