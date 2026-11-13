'use client'
import { Save } from 'lucide-react'
import { use, useId, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveEmailSettings } from '@/lib/actions/email'
import type { EmailAccess } from '@/lib/DAL/email'
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

	const save = () =>
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
					Up to 5 addresses, separated by commas. Replies come to you.
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
						Email each pre-trip when I complete it
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
