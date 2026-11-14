import { neon } from '@neondatabase/serverless'
import { MAX_RECIPIENTS } from '@/lib/email/config'
import { splitRecipients } from '@/lib/email/recipients'

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
	if (!row) return NO_EMAIL_SETTINGS
	return {
		// Saving already cleans the list; this also holds a row edited by hand
		// to at most MAX_RECIPIENTS different addresses.
		recipients: splitRecipients(String(row.recipients)).slice(
			0,
			MAX_RECIPIENTS,
		),
		autoSend: Boolean(row.auto_send),
		timeZone: row.time_zone ?? null,
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
