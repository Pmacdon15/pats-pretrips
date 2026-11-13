import { z } from 'zod'
import { MAX_RECIPIENTS } from './config'

/** Splits "a@x.com, b@x.com; c@x.com" into addresses, without repeats. */
export function splitRecipients(value: string): string[] {
	const out: string[] = []
	for (const raw of value.split(/[,;\s]+/)) {
		const email = raw.trim().toLowerCase()
		if (email && !out.includes(email)) out.push(email)
	}
	return out
}

/** One or more addresses, as typed by the driver. */
export const recipientsSchema = z
	.string()
	.max(1000)
	.transform(splitRecipients)
	.pipe(
		z
			.array(
				z.email({
					error: (issue) =>
						`"${issue.input}" is not an email address`,
				}),
			)
			.min(1, 'Add at least one email address')
			.max(MAX_RECIPIENTS, `At most ${MAX_RECIPIENTS} email addresses`),
	)

/** An IANA time zone the runtime knows, e.g. "America/Edmonton". */
export function isTimeZone(value: string) {
	try {
		new Intl.DateTimeFormat('en-CA', { timeZone: value })
		return true
	} catch {
		return false
	}
}

export const timeZoneSchema = z
	.string()
	.max(64)
	.refine(isTimeZone, 'Unknown time zone')

export const emailSettingsSchema = z.object({
	recipients: z.string().max(1000),
	autoSend: z.boolean(),
	timeZone: timeZoneSchema.optional(),
})

export const emailTripSchema = z.object({
	tripId: z.number().int().positive(),
	recipients: recipientsSchema,
	timeZone: timeZoneSchema.optional(),
})
