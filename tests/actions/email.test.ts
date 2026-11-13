import { errAsync, okAsync } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	emailTripDAL: vi.fn(),
	saveEmailSettingsDAL: vi.fn(),
}))
vi.mock('@/lib/DAL/email', () => mocks)

import { emailTrip, saveEmailSettings } from '@/lib/actions/email'

const trip = { tripId: 1, recipients: 'a@x.com' }
const settings = { recipients: 'a@x.com', autoSend: true }

describe('email actions', () => {
	it('email a trip', async () => {
		mocks.emailTripDAL.mockResolvedValue(okAsync({ sentTo: ['a@x.com'] }))
		await expect(emailTrip(trip)).resolves.toEqual({
			value: { sentTo: ['a@x.com'] },
		})
		mocks.emailTripDAL.mockResolvedValue(errAsync({ reason: 'Nope' }))
		await expect(emailTrip(trip)).resolves.toEqual({ errorMessage: 'Nope' })
	})

	it('save the settings', async () => {
		mocks.saveEmailSettingsDAL.mockResolvedValue(
			okAsync({ autoSend: true }),
		)
		await expect(saveEmailSettings(settings)).resolves.toEqual({
			value: { autoSend: true },
		})
		mocks.saveEmailSettingsDAL.mockResolvedValue(
			errAsync({ reason: 'Nope' }),
		)
		await expect(saveEmailSettings(settings)).resolves.toEqual({
			errorMessage: 'Nope',
		})
	})
})
