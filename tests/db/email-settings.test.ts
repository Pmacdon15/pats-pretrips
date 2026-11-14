import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqlMock } from './sql-mock'

const mocks = vi.hoisted(() => ({ neon: vi.fn() }))
vi.mock('@neondatabase/serverless', () => ({ neon: mocks.neon }))

import {
	getEmailSettingsDb,
	NO_EMAIL_SETTINGS,
	saveEmailSettingsDb,
} from '@/lib/db/email-settings'

const sql = createSqlMock()

beforeEach(() => {
	sql.reset()
	mocks.neon.mockReturnValue(sql.sql)
	vi.stubEnv('DATABASE_URL', 'postgres://test')
})

describe('email settings queries', () => {
	it("reads the driver's settings", async () => {
		sql.respond(() => [
			{
				recipients: 'a@x.com,b@x.com',
				auto_send: true,
				time_zone: 'UTC',
			},
		])
		await expect(getEmailSettingsDb('pat@x.com')).resolves.toEqual({
			recipients: ['a@x.com', 'b@x.com'],
			autoSend: true,
			timeZone: 'UTC',
		})
		expect(sql.calls[0].values).toEqual(['pat@x.com'])
	})

	it('has defaults for drivers with no settings', async () => {
		await expect(getEmailSettingsDb('pat@x.com')).resolves.toBe(
			NO_EMAIL_SETTINGS,
		)
		sql.respond(() => [
			{ recipients: '', auto_send: false, time_zone: null },
		])
		await expect(getEmailSettingsDb('pat@x.com')).resolves.toEqual(
			NO_EMAIL_SETTINGS,
		)
	})

	it('reads at most 5 different addresses, even from a row edited by hand', async () => {
		sql.respond(() => [
			{
				recipients:
					'a@x.com,A@x.com,b@x.com,,c@x.com,d@x.com,e@x.com,f@x.com',
				auto_send: true,
				time_zone: null,
			},
		])
		const settings = await getEmailSettingsDb('pat@x.com')
		expect(settings.recipients).toEqual([
			'a@x.com',
			'b@x.com',
			'c@x.com',
			'd@x.com',
			'e@x.com',
		])
	})

	it('saves over any earlier settings', async () => {
		const settings = {
			recipients: ['a@x.com', 'b@x.com'],
			autoSend: true,
			timeZone: null,
		}
		await expect(saveEmailSettingsDb('pat@x.com', settings)).resolves.toBe(
			settings,
		)
		expect(sql.calls[0].text).toContain(
			'ON CONFLICT (driver_email) DO UPDATE',
		)
		expect(sql.calls[0].values).toEqual([
			'pat@x.com',
			'a@x.com,b@x.com',
			true,
			null,
		])
	})
})
