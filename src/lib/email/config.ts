/*
 * Settings for emailing pre-trips. Everything comes from the environment:
 *
 *   SES_FROM_EMAIL         a verified SES identity, e.g. "PreTrips <trips@patspretrips.ca>"
 *   AWS_REGION             the SES region, e.g. "ca-central-1"
 *   AWS_ACCESS_KEY_ID      an IAM key allowed ses:SendRawEmail / ses:SendEmail
 *   AWS_SECRET_ACCESS_KEY
 *   APP_URL                optional, where links in the email point (defaults to the live site)
 */

/** The Clerk Billing feature that unlocks emailing pre-trips. */
export const EMAIL_FEATURE = 'email_pretrips'

/** At most this many people get each pre-trip. */
export const MAX_RECIPIENTS = 5

/*
 * Send limits, so a driver's account (or a script calling the server action
 * in a loop) can't turn the app's SES identity into a spam relay. They count
 * deliveries: one email to 3 people is 3. Manual and automatic sends share
 * them. Counted from the pt_email_sends log (src/lib/sql/2026-11-16-email-sends.sql).
 */

/**
 * Deliveries a driver may send in any rolling 24 hours. A busy driver does
 * about 3 pre-trips a day; auto-sending each to the maximum 5 people is 15,
 * which leaves room for about 9 more full re-sends of old trips. Roughly 4x
 * real use, while a hijacked account is held to 60 messages a day.
 */
export const DAILY_SEND_LIMIT = 60

/**
 * Deliveries a driver may send in any 10 minutes: 5 full sends (25), enough
 * to re-send a handful of old trips in one sitting, but a loop can't spend
 * the whole day's allowance in seconds.
 */
export const BURST_SEND_LIMIT = 25

/** The rolling windows those limits count over, in seconds. */
export const DAILY_SEND_WINDOW_SECONDS = 24 * 60 * 60
export const BURST_SEND_WINDOW_SECONDS = 10 * 60

export function appUrl() {
	return (process.env.APP_URL || 'https://patspretrips.ca').replace(
		/\/+$/,
		'',
	)
}

/** The trip's page in the app, where on-route defects are added. */
export function tripUrl(tripId: number | undefined) {
	return `${appUrl()}/pretrip/${tripId}`
}

export function fromAddress() {
	return process.env.SES_FROM_EMAIL || null
}
