import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqlMock } from './sql-mock'

const mocks = vi.hoisted(() => ({ neon: vi.fn() }))
vi.mock('@neondatabase/serverless', () => ({ neon: mocks.neon }))

import {
	confirmEmailSendDb,
	recentEmailSendsDb,
	releaseEmailSendDb,
	reserveEmailSendDb,
} from '@/lib/db/email-sends'

const sql = createSqlMock()

beforeEach(() => {
	sql.reset()
	mocks.neon.mockReturnValue(sql.sql)
	vi.stubEnv('DATABASE_URL', 'postgres://test')
})

const send = { tripId: 12, recipients: 3, kind: 'manual' as const }

describe('email send log queries', () => {
	it('reserves a send under a per-driver lock, within both limits', async () => {
		sql.respond((call) =>
			call.text.startsWith('INSERT') ? [{ id: 41 }] : [{}],
		)
		await expect(reserveEmailSendDb('pat@x.com', send)).resolves.toBe('41')

		expect(sql.transaction).toHaveBeenCalledTimes(1)
		const [lock, insert] = sql.calls
		expect(lock.text).toContain('pg_advisory_xact_lock')
		expect(lock.values).toEqual(['pt_email_sends:pat@x.com'])
		expect(insert.text).toContain('INSERT INTO pt_email_sends')
		expect(insert.text).toContain('RETURNING id')
		// Driver, trip, count, kind; the windows; then each limit check.
		expect(insert.values).toEqual([
			'pat@x.com',
			12,
			3,
			'manual',
			600,
			'pat@x.com',
			86400,
			3,
			60,
			3,
			25,
		])
	})

	it('adds nothing when the driver is over a limit', async () => {
		await expect(reserveEmailSendDb('pat@x.com', send)).resolves.toBeNull()
	})

	it('throws database errors, such as a missing table', async () => {
		const missing = Object.assign(new Error('no table'), { code: '42P01' })
		sql.respond((call) => (call.text.startsWith('INSERT') ? missing : []))
		await expect(reserveEmailSendDb('pat@x.com', send)).rejects.toBe(
			missing,
		)
	})

	it("lists the driver's sends from the last day", async () => {
		sql.respond(() => [
			{ age_seconds: '120.5', recipient_count: 5 },
			{ age_seconds: '3600', recipient_count: 1 },
		])
		await expect(recentEmailSendsDb('pat@x.com')).resolves.toEqual([
			{ ageSeconds: 120.5, recipients: 5 },
			{ ageSeconds: 3600, recipients: 1 },
		])
		expect(sql.calls[0].values).toEqual(['pat@x.com', 86400])
	})

	it('marks a send as sent, with the SES message id', async () => {
		await confirmEmailSendDb('41', 'msg-1')
		expect(sql.calls[0].text).toContain("SET status = 'sent'")
		expect(sql.calls[0].values).toEqual(['msg-1', '41'])
	})

	it('releases only a send still reserved', async () => {
		await releaseEmailSendDb('41')
		expect(sql.calls[0].text).toContain(
			"DELETE FROM pt_email_sends WHERE id = ? AND status = 'reserved'",
		)
		expect(sql.calls[0].values).toEqual(['41'])
	})
})
