'use client'
import { Save } from 'lucide-react'
import { use, useId, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveEmailSettings } from '@/lib/actions/email'
import type { EmailAccess } from '@/lib/DAL/email'
import { recipientsSchema } from '@/lib/email/recipients'
import { browserTimeZone } from './time-zone'

/** Who pre-trips go to, and whether each new one is sent automatically. */
export function EmailSettingsForm({
	accessPromise,
	pricing,
}: {
	accessPromise: Promise<EmailAccess>
	/** Shown instead of the form when the plan doesn't include email. */
	pricing: React.ReactNode
}) {
	const access = use(accessPromise)
	const [recipients, setRecipients] = useState(
		access.settings.recipients.join(', '),
	)
	const [autoSend, setAutoSend] = useState(access.settings.autoSend)
	const [pending, startTransition] = useTransition()
	const recipientsId = useId()
	const autoSendId = useId()

	if (!access.allowed) return pricing
	if (!access.canEdit) return <OrgSettings access={access} />

	const save = () => {
		// Same rules as the server: an empty list is fine unless auto-send is on.
		const list = recipients.trim()
			? recipientsSchema.safeParse(recipients)
			: null
		const problem =
			list && !list.success
				? list.error.issues.map((i) => i.message).join(', ')
				: autoSend && !list
					? 'Add an email address to send new pre-trips to'
					: null
		if (problem) {
			toast.error('Could not save', { description: problem })
			return
		}
		startTransition(async () => {
			const res = await saveEmailSettings({
				recipients,
				autoSend,
				timeZone: browserTimeZone(),
			})
			if ('errorMessage' in res) {
				toast.error('Could not save', { description: res.errorMessage })
				return
			}
			setRecipients(res.value.recipients.join(', '))
			toast.success('Email settings saved')
		})
	}

	return (
		<form
			className="flex flex-col gap-5"
			onSubmit={(e) => {
				e.preventDefault()
				save()
			}}
		>
			<div className="grid gap-2">
				<Label htmlFor={recipientsId}>Send pre-trips to</Label>
				<Input
					autoComplete="email"
					id={recipientsId}
					inputMode="email"
					onChange={(e) => setRecipients(e.target.value)}
					placeholder="dispatch@carrier.com, me@email.com"
					value={recipients}
				/>
				<p className="text-muted-foreground text-xs">
					Up to 5 addresses, separated by commas.{' '}
					{access.space === 'org'
						? 'Used for everyone in your organization.'
						: 'Replies come to you.'}
				</p>
			</div>
			<label
				className="flex items-start gap-3 text-sm"
				htmlFor={autoSendId}
			>
				<input
					checked={autoSend}
					className="mt-0.5 size-4 accent-primary"
					id={autoSendId}
					onChange={(e) => setAutoSend(e.target.checked)}
					type="checkbox"
				/>
				<span>
					<span className="font-medium">
						{access.space === 'org'
							? 'Email each pre-trip when a driver completes it'
							: 'Email each pre-trip when I complete it'}
					</span>
					<span className="block text-muted-foreground">
						The PDF has links back to the trip to edit it or add an
						on-route defect.
					</span>
				</span>
			</label>
			<Button className="self-start" disabled={pending} type="submit">
				<Save /> {pending ? 'Saving…' : 'Save'}
			</Button>
		</form>
	)
}

/**
 * An organization's settings, for a member who isn't one of its admins:
 * what's set, read-only. They can still email any trip from its page.
 */
function OrgSettings({ access }: { access: EmailAccess }) {
	const { recipients, autoSend } = access.settings
	return (
		<div className="flex flex-col gap-3 text-sm">
			<p className="rounded-md bg-muted p-3 text-muted-foreground">
				Your organization&apos;s admins choose who pre-trips are emailed
				to. You can still email any trip from its page.
			</p>
			<p>
				<span className="font-medium">Sent to: </span>
				{recipients.length ? recipients.join(', ') : 'nobody yet'}
			</p>
			<p>
				<span className="font-medium">
					Each new pre-trip is emailed automatically:{' '}
				</span>
				{autoSend ? 'yes' : 'no'}
			</p>
		</div>
	)
}
