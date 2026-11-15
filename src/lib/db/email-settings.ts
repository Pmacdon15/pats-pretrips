import { neon } from '@neondatabase/serverless'
import { MAX_RECIPIENTS } from '@/lib/email/config'
import { splitRecipients } from '@/lib/email/recipients'
import { isMissingColumnOrTable, type Owner } from './owner-stamps'

/* The pt_email_settings table (src/lib/sql/2026-11-13-email.sql). */

export type EmailSettings = {
	recipients: string[]
	autoSend: boolean
	timeZone: string | null
}

export const NO_EMAIL_SETTINGS: EmailSettings = {
	recipients: [],
	autoSend: false,
	timeZone: null,
}

export async function getEmailSettingsDb(
	driverEmail: string,
): Promise<EmailSettings> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const [row] = await sql`
		SELECT recipients, auto_send, time_zone FROM pt_email_settings
		WHERE driver_email = ${driverEmail}
	`
	return toSettings(row)
}

/** A settings row as the app uses it; none saved yet without one. */
function toSettings(row: Record<string, unknown> | undefined): EmailSettings {
	if (!row) return NO_EMAIL_SETTINGS
	return {
		// Saving already cleans the list; this also holds a row edited by hand
		// to at most MAX_RECIPIENTS different addresses.
		recipients: splitRecipients(String(row.recipients)).slice(
			0,
			MAX_RECIPIENTS,
		),
		autoSend: Boolean(row.auto_send),
		timeZone: (row.time_zone as string | null) ?? null,
	}
}

export async function saveEmailSettingsDb(
	driverEmail: string,
	settings: EmailSettings,
): Promise<EmailSettings> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const recipients = settings.recipients.join(',')
	await sql`
		INSERT INTO pt_email_settings (driver_email, recipients, auto_send, time_zone)
		VALUES (${driverEmail}, ${recipients}, ${settings.autoSend}, ${settings.timeZone})
		ON CONFLICT (driver_email) DO UPDATE
		SET recipients = EXCLUDED.recipients,
			auto_send = EXCLUDED.auto_send,
			time_zone = EXCLUDED.time_zone,
			updated_at = NOW()
	`
	return settings
}

/*
 * An organization's email settings (pt_org_email_settings,
 * src/lib/sql/2026-11-22-organizations.sql; docs/organizations.md): who its
 * members' pre-trips go to. Every member's sends use them; the DAL lets only
 * the organization's admins save them.
 */

export async function getOrgEmailSettingsDb(
	orgId: string,
): Promise<EmailSettings> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const [row] = await sql`
		SELECT recipients, auto_send, time_zone FROM pt_org_email_settings
		WHERE clerk_org_id = ${orgId}
	`
	return toSettings(row)
}

let warnedOrgMissing = false

/**
 * The organization's settings, or none saved when they can't be read
 * (before src/lib/sql/2026-11-22-organizations.sql is run, logged once per
 * server instance). Other errors are thrown, as for a driver's settings.
 */
export async function getOrgEmailSettingsOrNone(
	orgId: string,
): Promise<EmailSettings> {
	try {
		return await getOrgEmailSettingsDb(orgId)
	} catch (error) {
		if (!isMissingColumnOrTable(error)) throw error
		if (!warnedOrgMissing) {
			warnedOrgMissing = true
			console.error(
				'Org email settings: the pt_org_email_settings table is missing, so organizations have none. Run src/lib/sql/2026-11-22-organizations.sql.',
			)
		}
		return NO_EMAIL_SETTINGS
	}
}

/** For tests: forget that the missing org table was already logged. */
export function resetOrgEmailSettingsWarnings() {
	warnedOrgMissing = false
}

/** Saves the organization's settings; `owner` is the admin saving them. */
export async function saveOrgEmailSettingsDb(
	orgId: string,
	owner: Owner,
	settings: EmailSettings,
): Promise<EmailSettings> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const recipients = settings.recipients.join(',')
	await sql`
		INSERT INTO pt_org_email_settings (
			clerk_org_id, recipients, auto_send, time_zone, driver_email,
			clerk_user_id
		)
		VALUES (
			${orgId}, ${recipients}, ${settings.autoSend}, ${settings.timeZone},
			${owner.email}, ${owner.userId || null}
		)
		ON CONFLICT (clerk_org_id) DO UPDATE
		SET recipients = EXCLUDED.recipients,
			auto_send = EXCLUDED.auto_send,
			time_zone = EXCLUDED.time_zone,
			driver_email = EXCLUDED.driver_email,
			clerk_user_id = EXCLUDED.clerk_user_id,
			updated_at = NOW()
	`
	return settings
}
