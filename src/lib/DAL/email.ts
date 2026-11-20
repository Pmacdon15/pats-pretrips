import { errAsync, okAsync } from 'neverthrow'
import {
	canEmailPretrips,
	type Driver,
	driverName,
	getDriver,
	getDriverById,
	getSpace,
	planIncludesEmail,
	type Space,
} from '@/lib/auth'
import { recordEvents } from '@/lib/db/audit-events'
import type { EmailSendKind } from '@/lib/db/email-sends'
import {
	type EmailSettings,
	getEmailSettingsDb,
	getOrgEmailSettingsOrNone,
	saveEmailSettingsDb,
	saveOrgEmailSettingsDb,
} from '@/lib/db/email-settings'
import { recordOwner } from '@/lib/db/owner-stamps'
import { getRepairFileDb, listTripRepairsDb } from '@/lib/db/repairs'
import { getTripSignatureDb } from '@/lib/db/signatures'
import { getTripDb } from '@/lib/db/trips'
import { fromAddress } from '@/lib/email/config'
import type { PdfRepair } from '@/lib/email/pdf'
import {
	emailSettingsSchema,
	emailTripSchema,
	recipientsSchema,
	tripRecipientsSchema,
} from '@/lib/email/recipients'
import {
	confirmEmailSend,
	releaseEmailSend,
	reserveEmailSend,
	sendLimitMessage,
} from '@/lib/email/send-log'
import { sendTripEmail } from '@/lib/email/trip-email'
import { errorForLog } from '@/lib/log'
import type { Trip } from '@/lib/types/types'

/*
 * Emailing pre-trips, when the active space's Clerk plan has the
 * email_pretrips feature (the driver's own plan in their personal space, the
 * organization's in an organization's; docs/organizations.md). Everything
 * here is for the signed-in driver only. The settings (who new pre-trips go
 * to) are the space's: the driver's own, or the organization's, which only
 * its admins can change.
 */

const issues = (error: { issues: { message: string }[] }) =>
	error.issues.map((issue) => issue.message).join(', ')

const LOCKED = {
	reason: 'Emailing pre-trips is part of a paid plan. Upgrade to turn it on.',
} as const

const NOT_ORG_ADMIN = {
	reason: 'Only an admin of your organization can change its email settings.',
} as const

export type EmailAccess = {
	/** The active space's plan includes emailing pre-trips. */
	allowed: boolean
	/** Whose settings these are: the driver's own, or their organization's. */
	space: Space['kind']
	/** The driver may change the settings: an admin of the space. */
	canEdit: boolean
	settings: EmailSettings
	/** The signed-in driver's own address, for "Email me a copy". */
	driverEmail: string
}

/** A space, as far as emailing goes: whose settings and plan apply. */
export type EmailSpace = { kind: 'personal' } | { kind: 'org'; orgId: string }

/** The space's saved settings: the driver's own, or the organization's. */
function spaceSettings(driver: { email: string }, space: EmailSpace) {
	return space.kind === 'org'
		? getOrgEmailSettingsOrNone(space.orgId)
		: getEmailSettingsDb(driver.email)
}

/** Whether the driver can email pre-trips, and the space's saved settings. */
export async function getEmailAccessDAL(): Promise<EmailAccess> {
	const [driver, space] = await Promise.all([getDriver(), getSpace()])
	if (!driver || !space) throw new Error('Must be logged in')
	const [allowed, settings] = await Promise.all([
		canEmailPretrips(),
		spaceSettings(driver, space),
	])
	return {
		allowed,
		space: space.kind,
		canEdit: space.isAdmin,
		settings,
		driverEmail: driver.email,
	}
}

export async function saveEmailSettingsDAL(data: {
	recipients: string
	autoSend: boolean
	timeZone?: string
}) {
	const [driver, space] = await Promise.all([getDriver(), getSpace()])
	if (!driver || !space) {
		return errAsync({ reason: 'Must be logged in' } as const)
	}
	if (!space.isAdmin) return errAsync(NOT_ORG_ADMIN)
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
		const values = {
			recipients,
			autoSend: parsed.data.autoSend,
			timeZone: parsed.data.timeZone ?? null,
		}
		const settings = await (space.kind === 'org'
			? saveOrgEmailSettingsDb(space.orgId, driver, values)
			: saveEmailSettingsDb(driver.email, values))
		if (space.kind === 'personal') {
			await recordOwner(driver, { table: 'email_settings' })
		}
		// How many recipients, never their addresses.
		await recordEvents(driver, {
			action: 'email.settings_saved',
			source: 'web',
			details: {
				recipient_count: settings.recipients.length,
				auto_send: settings.autoSend,
				time_zone: settings.timeZone,
				...(space.kind === 'org' ? { org_id: space.orgId } : {}),
			},
		})
		return okAsync(settings)
	} catch (e) {
		console.error('Db error saving email settings: ', errorForLog(e))
		return errAsync({
			reason: 'Could not save your email settings. Please try again.',
		} as const)
	}
}

/**
 * After an email went out: records the driver's Clerk user ID on the logged
 * send (none without a log), and the send in the audit trail, which also
 * keeps sends the log couldn't (and outlives the log's pruning).
 */
async function recordEmailSent(
	driver: Driver,
	sendId: string | null,
	send: { tripId: number | null; recipients: number; kind: EmailSendKind },
	source = 'web',
) {
	if (sendId !== null) {
		await recordOwner(driver, { table: 'email_send', sendId })
	}
	await recordEvents(driver, {
		action: 'email.sent',
		source,
		tripId: send.tripId,
		details: {
			kind: send.kind,
			recipient_count: send.recipients,
			send_id: sendId,
		},
	})
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
	/** Also send it to the signed-in driver's own address. */
	copyToMe?: boolean
	timeZone?: string
}) {
	const driver = await getDriver()
	if (!driver) return errAsync({ reason: 'Must be logged in' } as const)
	if (!(await canEmailPretrips())) return errAsync(LOCKED)

	const parsed = emailTripSchema.safeParse(data)
	if (!parsed.success) return errAsync({ reason: issues(parsed.error) })
	// The driver's own address comes from their session, never the form.
	const to = tripRecipientsSchema.safeParse({
		recipients: parsed.data.recipients,
		copyToMe: parsed.data.copyToMe,
		driverEmail: driver.email,
	})
	if (!to.success) return errAsync({ reason: issues(to.error) })
	const recipients = to.data
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
		// Within the driver's send limits, or nothing is sent.
		const slot = await reserveEmailSend(driver.email, {
			tripId: parsed.data.tripId,
			recipients: recipients.length,
			kind: 'manual',
		})
		if (!slot.ok) {
			return errAsync({ reason: sendLimitMessage(slot.retryInSeconds) })
		}
		let messageId: string | null
		try {
			messageId = await sendTripEmail(
				trip,
				pdfDriver(driver),
				recipients,
				parsed.data.timeZone,
				repairs,
				signature,
			)
		} catch (e) {
			await releaseEmailSend(driver.email, slot.id)
			throw e
		}
		await confirmEmailSend(driver.email, slot.id, messageId)
		await recordEmailSent(driver, slot.id, {
			tripId: parsed.data.tripId,
			recipients: recipients.length,
			kind: 'manual',
		})
		return okAsync({ sentTo: recipients })
	} catch (e) {
		console.error('Error emailing trip: ', errorForLog(e))
		return errAsync({
			reason: 'Could not send the email. Please try again.',
		} as const)
	}
}

/**
 * What to do once a new pre-trip is saved: a function that emails it to the
 * space's recipients, or null when auto-send is off or not in its plan.
 * Everything that reads the request runs now, so the sending itself can
 * happen after the response.
 */
export async function prepareAutoEmailDAL() {
	const [driver, space] = await Promise.all([getDriver(), getSpace()])
	if (!driver || !space || !fromAddress()) return null
	if (!(await canEmailPretrips())) return null
	const settings = await spaceSettings(driver, space)
	if (!settings.autoSend || settings.recipients.length === 0) return null
	return autoEmailSender(driver, settings, 'web')
}

/**
 * The same for a pre-trip an AI app saved over MCP, which has no Clerk
 * session: the verified caller and the space the trip was started in (its
 * settings and plan apply, as in the web app). The plan is read from Clerk
 * Billing. `source` is the AI app, for the audit trail. Null when the
 * caller has no Clerk user ID, auto-send is off, or the plan lacks email.
 */
export async function prepareCallerAutoEmailDAL(
	caller: { email: string; userId?: string | null },
	space: EmailSpace,
	source: string,
) {
	const { userId } = caller
	if (!userId || !fromAddress()) return null
	const settings = await spaceSettings(caller, space)
	if (!settings.autoSend || settings.recipients.length === 0) return null
	const allowed = await planIncludesEmail(
		space.kind === 'org' ? { orgId: space.orgId } : { userId },
	)
	if (!allowed) return null
	const driver = await getDriverById(userId, caller.email)
	return {
		recipients: settings.recipients.length,
		send: autoEmailSender(driver, settings, source),
	}
}

/** Emails a new trip to the settings' recipients, within the send limits. */
function autoEmailSender(
	driver: Driver,
	settings: EmailSettings,
	source: string,
) {
	return async (trip: Trip) => {
		const send = {
			tripId: trip.tripid ?? null,
			recipients: settings.recipients.length,
			kind: 'auto' as const,
		}
		// Over the send limits, the trip is saved but not emailed.
		const slot = await reserveEmailSend(driver.email, send)
		if (!slot.ok) {
			console.warn(
				`Not auto-emailing trip ${trip.tripid}: the driver is over the email send limit`,
			)
			return
		}
		try {
			const messageId = await sendTripEmail(
				trip,
				pdfDriver(driver),
				settings.recipients,
				settings.timeZone ?? undefined,
				[],
				await tripSignature(trip, driver.email),
			)
			await confirmEmailSend(driver.email, slot.id, messageId)
			await recordEmailSent(driver, slot.id, send, source)
		} catch (e) {
			await releaseEmailSend(driver.email, slot.id)
			console.error('Error auto-emailing trip: ', errorForLog(e))
		}
	}
}
