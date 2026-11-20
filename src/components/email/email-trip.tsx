'use client'
import { Mail } from 'lucide-react'
import { use, useId, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { emailTrip } from '@/lib/actions/email'
import type { EmailAccess } from '@/lib/DAL/email'
import { tripRecipientsSchema } from '@/lib/email/recipients'
import { EmailLocked } from './email-locked'
import { browserTimeZone } from './time-zone'

/**
 * Email this pre-trip, as a PDF, to anyone, at any time: the typed
 * addresses, the driver's own, or both.
 */
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
	const [copyToMe, setCopyToMe] = useState(false)
	const [pending, startTransition] = useTransition()
	const copyId = useId()

	if (!access.allowed) return <EmailLocked />

	const send = () => {
		const parsed = tripRecipientsSchema.safeParse({
			recipients,
			copyToMe,
			driverEmail: access.driverEmail,
		})
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
				copyToMe,
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
			className="flex flex-col gap-3"
			onSubmit={(e) => {
				e.preventDefault()
				send()
			}}
		>
			<div className="flex flex-col gap-2 sm:flex-row">
				<Input
					aria-label="Send to"
					autoComplete="email"
					inputMode="email"
					onChange={(e) => setRecipients(e.target.value)}
					placeholder="dispatch@carrier.com, safety@carrier.com"
					value={recipients}
				/>
				<Button
					disabled={pending || (!recipients.trim() && !copyToMe)}
					type="submit"
				>
					<Mail /> {pending ? 'Sending…' : 'Email PDF'}
				</Button>
			</div>
			<label className="flex items-start gap-3 text-sm" htmlFor={copyId}>
				<input
					checked={copyToMe}
					className="mt-0.5 size-4 accent-primary"
					id={copyId}
					onChange={(e) => setCopyToMe(e.target.checked)}
					type="checkbox"
				/>
				<span>
					<span className="font-medium">Email me a copy</span>
					<span className="block break-all text-muted-foreground">
						Also sends it to {access.driverEmail}
					</span>
				</span>
			</label>
		</form>
	)
}
