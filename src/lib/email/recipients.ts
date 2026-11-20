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
	/** Typed addresses; may be empty when the driver only wants a copy. */
	recipients: z.string().max(1000),
	/** Also send it to the signed-in driver's own email address. */
	copyToMe: z.boolean().optional(),
	timeZone: timeZoneSchema.optional(),
})

/**
 * Who a pre-trip goes to: the typed addresses, plus the driver's own when
 * they asked for a copy. The driver's copy doesn't count toward
 * MAX_RECIPIENTS, which limits the other people.
 */
export const tripRecipientsSchema = z
	.object({
		recipients: z.string().max(1000),
		copyToMe: z.boolean().optional(),
		driverEmail: z.string(),
	})
	.transform((value, ctx) => {
		const typed = value.recipients.trim()
			? recipientsSchema.safeParse(value.recipients)
			: null
		if (typed && !typed.success) {
			for (const issue of typed.error.issues) {
				ctx.addIssue({ code: 'custom', message: issue.message })
			}
			return z.NEVER
		}
		const list = typed?.data ?? []
		const me = value.driverEmail.trim().toLowerCase()
		if (value.copyToMe && me && !list.includes(me)) list.push(me)
		if (list.length === 0) {
			ctx.addIssue({
				code: 'custom',
				message: 'Add an email address, or check “Email me a copy”',
			})
			return z.NEVER
		}
		return list
	})
