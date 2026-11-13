'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Save, Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { SignaturePad } from '@/components/repairs/signature-pad'
import { Button } from '@/components/ui/button'
import { deleteSignature, saveSignature } from '@/lib/actions/signatures'
import type { SignatureStatus } from '@/lib/DAL/signatures'
import { SIGNATURE_STATUS_KEY, useSignatureStatus } from '@/lib/hooks/hooks'
import { SAVED_SIGNATURE_PATH } from '@/lib/signatures/paths'

/** The driver's saved signature: see it, replace it or delete it. */
export function SignatureSettings() {
	const { data, isPending } = useSignatureStatus()
	const queryClient = useQueryClient()
	const [drawn, setDrawn] = useState<string | null>(null)
	// Bumped after a save, so the box starts empty again.
	const [saves, setSaves] = useState(0)
	const [pending, startTransition] = useTransition()

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
				</div>
			) : (
				<p className="text-muted-foreground text-sm">
					You don&apos;t have a saved signature yet. Pre-trips an AI
					assistant starts for you stay unsigned until you save one.
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
