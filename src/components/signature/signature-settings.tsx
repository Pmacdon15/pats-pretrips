'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Save, Trash2 } from 'lucide-react'
import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { SignaturePad } from '@/components/repairs/signature-pad'
import { Button } from '@/components/ui/button'
import {
	deleteSignature,
	saveSignature,
	setAiSigning,
} from '@/lib/actions/signatures'
import type { SignatureStatus } from '@/lib/DAL/signatures'
import { SIGNATURE_STATUS_KEY, useSignatureStatus } from '@/lib/hooks/hooks'
import { SAVED_SIGNATURE_PATH } from '@/lib/signatures/paths'

/**
 * The driver's saved signature: see it, replace it or delete it, and choose
 * whether AI apps may sign with it.
 */
export function SignatureSettings() {
	const { data, isPending } = useSignatureStatus()
	const queryClient = useQueryClient()
	const [drawn, setDrawn] = useState<string | null>(null)
	// Bumped after a save, so the box starts empty again.
	const [saves, setSaves] = useState(0)
	const [pending, startTransition] = useTransition()
	const [aiPending, startAiTransition] = useTransition()
	const aiSigningId = useId()

	// Its own transition, so turning it on or off keeps a half-drawn signature.
	const changeAiSigning = (allow: boolean) =>
		startAiTransition(async () => {
			const res = await setAiSigning(allow)
			if ('errorMessage' in res) {
				toast.error('Could not change the setting', {
					description: res.errorMessage,
				})
				return
			}
			queryClient.setQueryData(SIGNATURE_STATUS_KEY, res.value)
			toast.success(
				res.value.allowAiSigning
					? 'AI apps can now sign pre-trips for you'
					: 'AI apps can no longer sign pre-trips for you',
			)
		})

	const update = (
		action: () => Promise<
			{ value: SignatureStatus } | { errorMessage: string }
		>,
		done: string,
	) =>
		startTransition(async () => {
			const res = await action()
			if ('errorMessage' in res) {
				toast.error('Could not update your signature', {
					description: res.errorMessage,
				})
				return
			}
			queryClient.setQueryData(SIGNATURE_STATUS_KEY, res.value)
			setDrawn(null)
			setSaves((n) => n + 1)
			toast.success(done)
		})

	if (isPending) {
		return <div className="h-40 animate-pulse rounded-md bg-muted" />
	}

	return (
		<div className="flex flex-col gap-6">
			{data?.saved ? (
				<div className="flex flex-col gap-3">
					<span className="font-medium text-sm">
						Your saved signature
					</span>
					{/* biome-ignore lint/performance/noImgElement: a private file, not an optimisable asset */}
					<img
						alt="Your saved signature"
						className="h-24 w-auto self-start rounded-md border bg-white p-1"
						height={96}
						src={`${SAVED_SIGNATURE_PATH}?v=${encodeURIComponent(String(data.updatedAt))}`}
						width={288}
					/>
					<Button
						className="self-start"
						disabled={pending}
						onClick={() =>
							update(deleteSignature, 'Saved signature deleted')
						}
						size="sm"
						type="button"
						variant="outline"
					>
						<Trash2 />
						Delete saved signature
					</Button>
					<label
						className="flex items-start gap-3 rounded-md border p-3 text-sm"
						htmlFor={aiSigningId}
					>
						<input
							aria-checked={data.allowAiSigning}
							checked={data.allowAiSigning}
							className="mt-0.5 size-4 accent-primary"
							disabled={aiPending}
							id={aiSigningId}
							onChange={(e) => changeAiSigning(e.target.checked)}
							role="switch"
							type="checkbox"
						/>
						<span>
							<span className="font-medium">
								Allow AI apps to sign for me
							</span>
							<span className="block text-muted-foreground">
								AI apps you&apos;ve connected (like Claude or
								ChatGPT) can sign the pre-trips they start for
								you with this signature. While it&apos;s off,
								those pre-trips are saved unsigned and you sign
								them yourself on the trip&apos;s page.
							</span>
						</span>
					</label>
				</div>
			) : (
				<p className="text-muted-foreground text-sm">
					You don&apos;t have a saved signature yet. Pre-trips an AI
					assistant starts for you are saved unsigned; you can sign
					them on the trip&apos;s page.
				</p>
			)}
			<form
				aria-label="Save a signature"
				className="flex flex-col gap-4"
				noValidate
				onSubmit={(e) => {
					e.preventDefault()
					if (!drawn) {
						toast.error('Sign in the box first')
						return
					}
					update(() => saveSignature(drawn), 'Signature saved')
				}}
			>
				<SignaturePad
					hint="Signed pre-trips keep the signature they were signed with."
					key={saves}
					label={
						data?.saved
							? 'Replace it with a new signature'
							: 'Sign here'
					}
					onChange={setDrawn}
				/>
				<Button className="self-start" disabled={pending} type="submit">
					<Save />
					{pending ? 'Saving…' : 'Save signature'}
				</Button>
			</form>
		</div>
	)
}
