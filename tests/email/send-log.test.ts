import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	reserveEmailSendDb: vi.fn(),
	recentEmailSendsDb: vi.fn(),
	confirmEmailSendDb: vi.fn(),
	releaseEmailSendDb: vi.fn(),
}))
vi.mock('@/lib/db/email-sends', () => mocks)

import {
	confirmEmailSend,
	releaseEmailSend,
	reserveEmailSend,
	secondsUntilAllowed,
	sendLimitMessage,
	waitText,
} from '@/lib/email/send-log'

const send = { tripId: 12, recipients: 5, kind: 'manual' as const }
const HOUR = 3600

beforeEach(() => {
	mocks.reserveEmailSendDb.mockResolvedValue('41')
	mocks.recentEmailSendsDb.mockResolvedValue([])
	mocks.confirmEmailSendDb.mockResolvedValue(undefined)
	mocks.releaseEmailSendDb.mockResolvedValue(undefined)
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('secondsUntilAllowed', () => {
	it('is 0 with room to spare', () => {
		expect(secondsUntilAllowed([], 5)).toBe(0)
		expect(
			secondsUntilAllowed([{ ageSeconds: 100, recipients: 5 }], 5),
		).toBe(0)
	})

	it('waits for the oldest sends to leave the 10-minute window', () => {
		// 25 in the last 10 minutes: the oldest (5 minutes ago) frees 5.
		const sends = [300, 200, 100, 50, 10].map((ageSeconds) => ({
			ageSeconds,
			recipients: 5,
		}))
		expect(secondsUntilAllowed(sends, 5)).toBe(300)
		// One address only needs the oldest to go too.
		expect(secondsUntilAllowed(sends, 1)).toBe(300)
	})

	it('waits for the oldest sends to leave the 24-hour window', () => {
		// 60 over the day, all older than 10 minutes. Sending 5 needs the two
		// oldest (3 + 2) to fall out: the second is 20 hours old.
		const sends = [
			{ ageSeconds: 22 * HOUR, recipients: 3 },
			{ ageSeconds: 20 * HOUR, recipients: 2 },
			...Array.from({ length: 11 }, (_, i) => ({
				ageSeconds: (i + 1) * HOUR,
				recipients: 5,
			})),
		]
		expect(secondsUntilAllowed(sends, 5)).toBe(4 * HOUR)
		expect(secondsUntilAllowed(sends, 3)).toBe(2 * HOUR)
	})

	it('takes the longer of the two waits', () => {
		const sends = [
			{ ageSeconds: 23 * HOUR, recipients: 35 },
			...[500, 400, 300, 200, 100].map((ageSeconds) => ({
				ageSeconds,
				recipients: 5,
			})),
		]
		expect(secondsUntilAllowed(sends, 5)).toBe(HOUR)
	})
})

describe('the message for a driver over the limit', () => {
	it('says how long to wait, rounded up', () => {
		expect(waitText(0)).toBe('1 minute')
		expect(waitText(61)).toBe('2 minutes')
		expect(waitText(59 * 60)).toBe('59 minutes')
		expect(waitText(3600)).toBe('1 hour')
		expect(waitText(3601)).toBe('2 hours')
	})

	it('names the limits and when to try again', () => {
		expect(sendLimitMessage(300)).toBe(
			'You’ve reached the limit for emailing pre-trips (60 addresses a day, 25 in 10 minutes; each address counts). You can send this one in about 5 minutes.',
		)
		expect(sendLimitMessage(null)).toMatch(/Please try again later\.$/)
	})
})

describe('reserveEmailSend', () => {
	it('reserves a send within the limits', async () => {
		await expect(reserveEmailSend('pat@x.com', send)).resolves.toEqual({
			ok: true,
			id: '41',
		})
		expect(mocks.reserveEmailSendDb).toHaveBeenCalledWith('pat@x.com', send)
		expect(mocks.recentEmailSendsDb).not.toHaveBeenCalled()
	})

	it('refuses a send over a limit, saying when to try again', async () => {
		mocks.reserveEmailSendDb.mockResolvedValue(null)
		mocks.recentEmailSendsDb.mockResolvedValue(
			[300, 200, 100, 50, 10].map((ageSeconds) => ({
				ageSeconds,
				recipients: 5,
			})),
		)
		await expect(reserveEmailSend('pat@x.com', send)).resolves.toEqual({
			ok: false,
			retryInSeconds: 300,
		})
		expect(mocks.recentEmailSendsDb).toHaveBeenCalledWith('pat@x.com')
	})

	it("still refuses when it can't work out the wait", async () => {
		mocks.reserveEmailSendDb.mockResolvedValue(null)
		mocks.recentEmailSendsDb.mockRejectedValue(new Error('db'))
		await expect(reserveEmailSend('pat@x.com', send)).resolves.toEqual({
			ok: false,
			retryInSeconds: null,
		})
		expect(console.error).toHaveBeenCalledTimes(1)
	})

	it('sends anyway, unlogged, when the database errors', async () => {
		mocks.reserveEmailSendDb.mockRejectedValue(new Error('db down'))
		await expect(reserveEmailSend('pat@x.com', send)).resolves.toEqual({
			ok: true,
			id: null,
		})
		await reserveEmailSend('pat@x.com', send)
		// Unexpected errors are logged every time.
		expect(console.error).toHaveBeenCalledTimes(2)
		expect(vi.mocked(console.error).mock.calls[0][0]).toMatch(
			/sending anyway/,
		)
	})

	it('sends anyway before the migration, saying so once per server', async () => {
		vi.resetModules()
		const fresh = await import('@/lib/email/send-log')
		mocks.reserveEmailSendDb.mockRejectedValue(
			Object.assign(new Error('relation does not exist'), {
				code: '42P01',
			}),
		)
		for (let i = 0; i < 3; i++) {
			await expect(
				fresh.reserveEmailSend('pat@x.com', send),
			).resolves.toEqual({ ok: true, id: null })
		}
		expect(console.error).toHaveBeenCalledTimes(1)
		expect(vi.mocked(console.error).mock.calls[0][0]).toMatch(
			/pt_email_sends table is missing.*2026-11-16-email-sends\.sql/,
		)
	})

	it('treats a thrown non-object like any other error', async () => {
		mocks.reserveEmailSendDb.mockRejectedValue('boom')
		await expect(reserveEmailSend('pat@x.com', send)).resolves.toEqual({
			ok: true,
			id: null,
		})
		mocks.reserveEmailSendDb.mockRejectedValue(null)
		await reserveEmailSend('pat@x.com', send)
		expect(console.error).toHaveBeenCalledTimes(2)
	})
})

describe('confirmEmailSend and releaseEmailSend', () => {
	it('mark a reserved send as sent, or release it', async () => {
		await confirmEmailSend('41', 'msg-1')
		expect(mocks.confirmEmailSendDb).toHaveBeenCalledWith('41', 'msg-1')
		await releaseEmailSend('41')
		expect(mocks.releaseEmailSendDb).toHaveBeenCalledWith('41')
	})

	it('do nothing for an unlogged send', async () => {
		await confirmEmailSend(null, 'msg-1')
		await releaseEmailSend(null)
		expect(mocks.confirmEmailSendDb).not.toHaveBeenCalled()
		expect(mocks.releaseEmailSendDb).not.toHaveBeenCalled()
	})

	it('log database errors instead of throwing', async () => {
		mocks.confirmEmailSendDb.mockRejectedValue(new Error('db'))
		mocks.releaseEmailSendDb.mockRejectedValue(new Error('db'))
		await expect(confirmEmailSend('41', null)).resolves.toBeUndefined()
		await expect(releaseEmailSend('41')).resolves.toBeUndefined()
		expect(console.error).toHaveBeenCalledTimes(2)
	})
})
