import { errAsync, okAsync } from 'neverthrow'
import {
	canEmailPretrips,
	type Driver,
	driverName,
	getDriver,
} from '@/lib/auth'
import {
	type EmailSettings,
	getEmailSettingsDb,
	saveEmailSettingsDb,
} from '@/lib/db/email-settings'
import { getRepairFileDb, listTripRepairsDb } from '@/lib/db/repairs'
import { getTripSignatureDb } from '@/lib/db/signatures'
import { getTripDb } from '@/lib/db/trips'
import { fromAddress } from '@/lib/email/config'
import type { PdfRepair } from '@/lib/email/pdf'
import {
	emailSettingsSchema,
	emailTripSchema,
	recipientsSchema,
} from '@/lib/email/recipients'
import { sendTripEmail } from '@/lib/email/trip-email'
import type { Trip } from '@/lib/types/types'

/*
 * Emailing pre-trips, for drivers whose Clerk plan has the email_pretrips
 * feature. Everything here is for the signed-in driver only.
 */

const issues = (error: { issues: { message: string }[] }) =>
	error.issues.map((issue) => issue.message).join(', ')

const LOCKED = {
	reason: 'Emailing pre-trips is part of a paid plan. Upgrade to turn it on.',
} as const

export type EmailAccess = {
	/** The driver's plan includes emailing pre-trips. */
	allowed: boolean
	settings: EmailSettings
}

/** Whether the driver can email pre-trips, and their saved settings. */
export async function getEmailAccessDAL(): Promise<EmailAccess> {
	const driver = await getDriver()
	if (!driver) throw new Error('Must be logged in')
	const [allowed, settings] = await Promise.all([
		canEmailPretrips(),
		getEmailSettingsDb(driver.email),
	])
	return { allowed, settings }
}

export async function saveEmailSettingsDAL(data: {
	recipients: string
	autoSend: boolean
	timeZone?: string
}) {
	const driver = await getDriver()
	if (!driver) return errAsync({ reason: 'Must be logged in' } as const)
	if (!(await canEmailPretrips())) return errAsync(LOCKED)

	const parsed = emailSettingsSchema.safeParse(data)
	if (!parsed.success) return errAsync({ reason: issues(parsed.error) })

	// Auto-send needs someone to send to; with it off, the list may be empty.
	const list = parsed.data.recipients.trim()
		? recipientsSchema.safeParse(parsed.data.recipients)
		: null
	if (list && !list.success) return errAsync({ reason: issues(list.error) })
	const recipients = list?.data ?? []
	if (parsed.data.autoSend && recipients.length === 0) {
		return errAsync({
			reason: 'Add an email address to send new pre-trips to',
		} as const)
	}

	try {
		const settings = await saveEmailSettingsDb(driver.email, {
			recipients,
			autoSend: parsed.data.autoSend,
			timeZone: parsed.data.timeZone ?? null,
		})
		return okAsync(settings)
	} catch (e) {
		console.error('Db error saving email settings: ', e)
		return errAsync({
			reason: 'Could not save your email settings. Please try again.',
		} as const)
	}
}

const pdfDriver = (driver: Driver) => ({
	name: driverName(driver),
	email: driver.email,
})

/** The trip's repairs, each with its signature, for the email and PDF. */
async function tripRepairs(
	tripId: number,
	driverEmail: string,
): Promise<PdfRepair[]> {
	const repairs = await listTripRepairsDb(tripId, driverEmail)
	return Promise.all(
		repairs.map(async (repair) => {
			if (!repair.has_signature) return repair
			const file = await getRepairFileDb(
				repair.id,
				driverEmail,
				'signature',
			)
			return { ...repair, signature: file?.bytes ?? null }
		}),
	)
}

/** The driver's signature on the trip, for the PDF; null when unsigned. */
async function tripSignature(trip: Trip, driverEmail: string) {
	if (!trip.signed_at) return null
	const file = await getTripSignatureDb(Number(trip.tripid), driverEmail)
	return file?.bytes ?? null
}

/** Emails one of the driver's pre-trips, of any age, now. */
export async function emailTripDAL(data: {
	tripId: number
	recipients: string
	timeZone?: string
}) {
	const driver = await getDriver()
	if (!driver) return errAsync({ reason: 'Must be logged in' } as const)
	if (!(await canEmailPretrips())) return errAsync(LOCKED)

	const parsed = emailTripSchema.safeParse(data)
	if (!parsed.success) return errAsync({ reason: issues(parsed.error) })
	if (!fromAddress()) {
		return errAsync({
			reason: 'Email isn’t set up on the server yet.',
		} as const)
	}

	try {
		const trip = await getTripDb(parsed.data.tripId, driver.email)
		if (!trip) return errAsync({ reason: 'Trip not found' } as const)
		const [repairs, signature] = await Promise.all([
			tripRepairs(parsed.data.tripId, driver.email),
			tripSignature(trip, driver.email),
		])
		await sendTripEmail(
			trip,
			pdfDriver(driver),
			parsed.data.recipients,
			parsed.data.timeZone,
			repairs,
			signature,
		)
		return okAsync({ sentTo: parsed.data.recipients })
	} catch (e) {
		console.error('Error emailing trip: ', e)
		return errAsync({
			reason: 'Could not send the email. Please try again.',
		} as const)
	}
}

/**
 * What to do once a new pre-trip is saved: a function that emails it to the
 * driver's recipients, or null when auto-send is off or not in their plan.
 * Everything that reads the request runs now, so the sending itself can
 * happen after the response.
 */
export async function prepareAutoEmailDAL() {
	const driver = await getDriver()
	if (!driver || !fromAddress()) return null
	if (!(await canEmailPretrips())) return null
	const settings = await getEmailSettingsDb(driver.email)
	if (!settings.autoSend || settings.recipients.length === 0) return null

	return async (trip: Trip) => {
		try {
			await sendTripEmail(
				trip,
				pdfDriver(driver),
				settings.recipients,
				settings.timeZone ?? undefined,
				[],
				await tripSignature(trip, driver.email),
			)
		} catch (e) {
			console.error('Error auto-emailing trip: ', e)
		}
	}
}
