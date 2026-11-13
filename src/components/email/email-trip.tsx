'use client'
import { Mail } from 'lucide-react'
import { use, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { emailTrip } from '@/lib/actions/email'
import type { EmailAccess } from '@/lib/DAL/email'
import { recipientsSchema } from '@/lib/email/recipients'
import { EmailLocked } from './email-locked'
import { browserTimeZone } from './time-zone'

/** Email this pre-trip, as a PDF, to anyone, at any time. */
export function EmailTrip({
	tripId,
	accessPromise,
}: {
	tripId: number
	accessPromise: Promise<EmailAccess>
}) {
	const access = use(accessPromise)
	const [recipients, setRecipients] = useState(
		access.settings.recipients.join(', '),
	)
	const [pending, startTransition] = useTransition()

	if (!access.allowed) return <EmailLocked />

	const send = () => {
		const parsed = recipientsSchema.safeParse(recipients)
		if (!parsed.success) {
			toast.error('Could not email this pre-trip', {
				description: parsed.error.issues
					.map((i) => i.message)
					.join(', '),
			})
			return
		}
		startTransition(async () => {
			const res = await emailTrip({
				tripId,
				recipients,
				timeZone: browserTimeZone(),
			})
			if ('errorMessage' in res) {
				toast.error('Could not email this pre-trip', {
					description: res.errorMessage,
				})
				return
			}
			toast.success(`Pre-trip emailed to ${res.value.sentTo.join(', ')}`)
		})
	}

	return (
		<form
			className="flex flex-col gap-2 sm:flex-row"
			onSubmit={(e) => {
				e.preventDefault()
				send()
			}}
		>
			<Input
				aria-label="Send to"
				autoComplete="email"
				inputMode="email"
				onChange={(e) => setRecipients(e.target.value)}
				placeholder="dispatch@carrier.com, me@email.com"
				value={recipients}
			/>
			<Button disabled={pending || !recipients.trim()} type="submit">
				<Mail /> {pending ? 'Sending…' : 'Email PDF'}
			</Button>
		</form>
	)
}
