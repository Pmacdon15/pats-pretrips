import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trip } from '../helpers/fixtures'
import { createSqlMock } from './sql-mock'

const mocks = vi.hoisted(() => ({ neon: vi.fn(), after: vi.fn() }))
vi.mock('@neondatabase/serverless', () => ({ neon: mocks.neon }))
vi.mock('next/server', () => ({ after: mocks.after }))

import {
	AUDIT_ACTIONS,
	AUDIT_MIGRATION,
	DETAIL_LIST_MAX,
	DETAIL_TEXT_MAX,
	DETAILS_MAX,
	detailsJson,
	recordEvents,
	resetAuditWarnings,
	tripUpdateEvent,
} from '@/lib/db/audit-events'
import type { TripBefore } from '@/lib/db/trips'

const sql = createSqlMock()
const PAT = { email: 'pat@x.com', userId: 'user_1' }
const dbError = (code: string) =>
	Object.assign(new Error(`db error ${code}`), { code })

/** Runs what recordEvents handed to `after()`. */
async function runAfter() {
	expect(mocks.after).toHaveBeenCalledTimes(1)
	await mocks.after.mock.calls[0][0]()
}

beforeEach(() => {
	sql.reset()
	mocks.neon.mockReturnValue(sql.sql)
	vi.stubEnv('DATABASE_URL', 'postgres://test')
	mocks.after.mockImplementation(() => {})
	resetAuditWarnings()
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('recordEvents', () => {
	it('inserts after the response, not during the write', async () => {
		await recordEvents(PAT, {
			action: 'trip.signed',
			source: 'web',
			tripId: 4,
			details: { signature: 'drawn' },
		})
		// Nothing has run yet: the driver's action returns first.
		expect(sql.calls).toHaveLength(0)
		await runAfter()
		const [query] = sql.queries()
		expect(query.text).toBe(
			'INSERT INTO pt_audit_events (driver_email, clerk_user_id, action, source, trip_id, repair_id, details) VALUES ( ?, ?, ?, ?, ?::int, ?::int, ?::jsonb )',
		)
		expect(query.values).toEqual([
			'pat@x.com',
			'user_1',
			'trip.signed',
			'web',
			4,
			null,
			'{"signature":"drawn"}',
		])
		expect(console.error).not.toHaveBeenCalled()
	})

	it('inserts now, awaited, where `after` is not allowed', async () => {
		mocks.after.mockImplementation(() => {
			throw new Error('`after` was called outside a request scope')
		})
		await recordEvents(PAT, { action: 'signature.saved', source: 'web' })
		expect(sql.queries()).toHaveLength(1)
		// No user ID, trip, repair or details: all NULL.
		expect(sql.queries()[0].values).toEqual([
			'pat@x.com',
			'user_1',
			'signature.saved',
			'web',
			null,
			null,
			null,
		])
	})

	it('records the driver without a Clerk user ID', async () => {
		await recordEvents(
			{ email: 'pat@x.com' },
			{ action: 'signature.deleted', source: 'web' },
		)
		await runAfter()
		expect(sql.queries()[0].values.slice(0, 2)).toEqual(['pat@x.com', null])
	})

	it('records several events from one write, in one `after`', async () => {
		await recordEvents(
			PAT,
			{ action: 'trip.created', source: 'Claude', tripId: 4 },
			null,
			{ action: 'repair.deleted', source: 'AI: Claude', repairId: 9 },
			undefined,
		)
		await runAfter()
		expect(sql.queries().map((q) => q.values.slice(2, 6))).toEqual([
			['trip.created', 'Claude', 4, null],
			['repair.deleted', 'AI: Claude', null, 9],
		])
	})

	it('does nothing without an event', async () => {
		await recordEvents(PAT)
		await recordEvents(PAT, null, undefined)
		expect(mocks.after).not.toHaveBeenCalled()
		expect(sql.calls).toHaveLength(0)
	})

	it('keeps the source to the column’s 60 characters', async () => {
		await recordEvents(PAT, {
			action: 'trip.created',
			source: 'a'.repeat(80),
		})
		await runAfter()
		expect(sql.queries()[0].values[3]).toBe('a'.repeat(60))
	})

	it.each([
		'42P01',
		'42703',
	])('logs a missing table (%s) once, naming the migration, and never throws', async (code) => {
		sql.respond(() => dbError(code))
		for (let i = 0; i < 3; i++) {
			mocks.after.mockClear()
			await expect(
				recordEvents(PAT, { action: 'trip.created', source: 'web' }),
			).resolves.toBeUndefined()
			await expect(runAfter()).resolves.toBeUndefined()
		}
		expect(console.error).toHaveBeenCalledTimes(1)
		expect(vi.mocked(console.error).mock.calls[0][0]).toContain(
			`Run ${AUDIT_MIGRATION}.`,
		)
		expect(AUDIT_MIGRATION).toBe('src/lib/sql/2026-11-19-audit-events.sql')
	})

	it('logs any other error every time, scrubbed, and never throws', async () => {
		sql.respond(() => dbError('08006'))
		await recordEvents(PAT, { action: 'email.sent', source: 'web' })
		await runAfter()
		mocks.after.mockClear()
		await recordEvents(PAT, { action: 'email.sent', source: 'web' })
		await runAfter()
		expect(console.error).toHaveBeenCalledTimes(2)
		const [message, detail] = vi.mocked(console.error).mock.calls[0]
		expect(message).toBe('Audit: could not record email.sent:')
		// errorForLog's string, not the error object.
		expect(typeof detail).toBe('string')
		expect(detail).toContain('[08006]')
		expect(
			JSON.stringify(vi.mocked(console.error).mock.calls),
		).not.toContain('pat@x.com')
	})

	it('names every action the migration lists', () => {
		expect(AUDIT_ACTIONS).toEqual([
			'trip.created',
			'trip.updated',
			'trip.defects_added',
			'trip.remarks_added',
			'trip.signed',
			'repair.recorded',
			'repair.deleted',
			'signature.saved',
			'signature.deleted',
			'signature.ai_signing_changed',
			'email.settings_saved',
			'email.sent',
			'vehicle.created',
			'vehicle.updated',
			'vehicle.deleted',
			'carrier.created',
			'carrier.updated',
			'carrier.deleted',
			'trailer.created',
			'trailer.updated',
			'trailer.deleted',
		])
		for (const action of AUDIT_ACTIONS) {
			expect(action.length).toBeLessThanOrEqual(40)
		}
	})
})

describe('detailsJson', () => {
	it('is null without details', () => {
		expect(detailsJson(null)).toBeNull()
		expect(detailsJson(undefined)).toBeNull()
	})

	it('keeps small details as they are', () => {
		const details = {
			changed: ['odometer'],
			from: { odometer: 1 },
			to: { odometer: 2 },
			signed: true,
			note: null,
		}
		expect(JSON.parse(detailsJson(details) as string)).toEqual(details)
	})

	it('cuts long strings and lists, and deep nesting', () => {
		const json = detailsJson({
			text: 'x'.repeat(DETAIL_TEXT_MAX + 50),
			list: Array.from({ length: DETAIL_LIST_MAX + 5 }, (_, i) => i),
			deep: { a: { b: { c: 'too deep' } } },
		}) as string
		const parsed = JSON.parse(json)
		expect(parsed.text).toHaveLength(DETAIL_TEXT_MAX)
		expect(parsed.list).toHaveLength(DETAIL_LIST_MAX)
		expect(parsed.deep).toEqual({ a: { b: '[nested]' } })
	})

	it('keeps at most DETAIL_LIST_MAX keys', () => {
		const many = Object.fromEntries(
			Array.from({ length: DETAIL_LIST_MAX + 10 }, (_, i) => [
				`k${i}`,
				i,
			]),
		)
		const parsed = JSON.parse(detailsJson(many) as string)
		expect(Object.keys(parsed)).toHaveLength(DETAIL_LIST_MAX)
	})

	it('stores only a note when still too large', () => {
		const big = {
			a: Array.from({ length: DETAIL_LIST_MAX }, () =>
				'y'.repeat(DETAIL_TEXT_MAX),
			),
		}
		const json = detailsJson(big) as string
		expect(json.length).toBeLessThanOrEqual(DETAILS_MAX)
		expect(JSON.parse(json)).toEqual({
			truncated: true,
			size: expect.any(Number),
		})
	})
})

describe('tripUpdateEvent', () => {
	const before: TripBefore = {
		carrier: 'Acme',
		carrieraddress: '1 Main St',
		inspectionaddress: 'Yard',
		make: 'Volvo',
		model: 'VNL',
		odometer: 1000,
		truckplate: 'ABC 1',
		trailerplatea: undefined,
		trailerplateb: undefined,
	}
	const saved = (changes: Record<string, unknown> = {}) =>
		trip({ ...before, tripid: 4, ...changes })

	it('names the core fields that changed, with old and new values', () => {
		expect(
			tripUpdateEvent(
				before,
				saved({
					odometer: 1200,
					truckplate: 'ABC 2',
					trailerplatea: 'T1',
				}),
				{ defects: ['Tires'], remarks: 'brakes soft' },
				'Claude',
			),
		).toEqual({
			action: 'trip.updated',
			source: 'Claude',
			tripId: 4,
			details: {
				changed: ['odometer', 'truckPlate', 'trailerPlateA'],
				from: {
					odometer: 1000,
					truckPlate: 'ABC 1',
					trailerPlateA: null,
				},
				to: {
					odometer: 1200,
					truckPlate: 'ABC 2',
					trailerPlateA: 'T1',
				},
				defects_added: ['Tires'],
				remarks_added_length: 11,
			},
		})
	})

	it('is defects_added when only defects (and remarks) were added', () => {
		expect(
			tripUpdateEvent(
				before,
				saved(),
				{ defects: ['Tires', 'Lights'], remarks: 'flat' },
				'web',
			),
		).toEqual({
			action: 'trip.defects_added',
			source: 'web',
			tripId: 4,
			details: {
				defects_added: ['Tires', 'Lights'],
				remarks_added_length: 4,
			},
		})
	})

	it('is remarks_added when only remarks were added, by length only', () => {
		const event = tripUpdateEvent(
			before,
			saved(),
			{ defects: [], remarks: 'a private note' },
			'web',
		)
		expect(event).toEqual({
			action: 'trip.remarks_added',
			source: 'web',
			tripId: 4,
			details: { remarks_added_length: 14 },
		})
		expect(JSON.stringify(event)).not.toContain('private')
	})

	it('is null when nothing actually changed', () => {
		expect(tripUpdateEvent(before, saved(), {}, 'web')).toBeNull()
		expect(
			tripUpdateEvent(before, saved(), { remarks: null }, 'web'),
		).toBeNull()
	})

	it('has no trip id when the row came back without one', () => {
		expect(
			tripUpdateEvent(
				before,
				saved({ tripid: undefined }),
				{ remarks: 'abc' },
				'web',
			)?.tripId,
		).toBeNull()
	})
})
