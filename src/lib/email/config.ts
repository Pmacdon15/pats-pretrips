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
