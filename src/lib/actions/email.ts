'use server'

import { emailTripDAL, saveEmailSettingsDAL } from '../DAL/email'

export async function emailTrip(data: {
	tripId: number
	recipients: string
	timeZone?: string
}) {
	const result = await emailTripDAL(data)
	return result.match(
		(value) => ({ value }),
		(err) => ({ errorMessage: err.reason }),
	)
}

export async function saveEmailSettings(data: {
	recipients: string
	autoSend: boolean
	timeZone?: string
}) {
	const result = await saveEmailSettingsDAL(data)
	return result.match(
		(value) => ({ value }),
		(err) => ({ errorMessage: err.reason }),
	)
}
