'use client'

import { PenLine } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { SignaturePad } from '@/components/repairs/signature-pad'
import { Button } from '@/components/ui/button'
import { useSignatureStatus } from '@/lib/hooks/hooks'
import { SAVED_SIGNATURE_PATH } from '@/lib/signatures/paths'

/**
 * The driver signs a pre-trip: with their saved signature when they have
 * one, or by drawing it, optionally keeping that as their saved signature.
 * `value` is "saved", the drawn PNG as a data URL, or "" when not signed.
 */
export function DriverSignatureField({
	value,
	onChange,
	save,
	onSaveChange,
	error,
}: {
	value: string
	onChange: (value: string) => void
	save: boolean
	onSaveChange: (save: boolean) => void
	error?: string
}) {
	const { data } = useSignatureStatus()
	const saved = Boolean(data?.saved)
	const updatedAt = data?.updatedAt ?? null
	const [drawing, setDrawing] = useState(false)
	const [seen, setSeen] = useState(updatedAt)
	const saveId = useId()

	// A newly saved signature is the one to sign with from now on.
	if (updatedAt !== seen) {
		setSeen(updatedAt)
		setDrawing(false)
	}
	const useSaved = saved && !drawing

	useEffect(() => {
		if (useSaved && value !== 'saved') onChange('saved')
		else if (!useSaved && value === 'saved') onChange('')
	}, [useSaved, value, onChange])

	return (
		<div className="flex flex-col gap-3">
			{useSaved ? (
				<div className="flex flex-col gap-2">
					<span className="font-medium text-sm">
						Driver signature
					</span>
					<figure className="flex flex-col gap-1">
						{/* biome-ignore lint/performance/noImgElement: a private file, not an optimisable asset */}
						<img
							alt="Your saved signature"
							className="h-20 w-auto self-start rounded-md border bg-white p-1"
							height={80}
							src={`${SAVED_SIGNATURE_PATH}?v=${encodeURIComponent(String(updatedAt))}`}
							width={240}
						/>
						<figcaption className="text-muted-foreground text-xs">
							Signed with your saved signature.
						</figcaption>
					</figure>
					<Button
						className="self-start"
						onClick={() => {
							setDrawing(true)
							onSaveChange(false)
							onChange('')
						}}
						size="sm"
						type="button"
						variant="outline"
					>
						<PenLine />
						Sign differently
					</Button>
				</div>
			) : (
				<>
					<SignaturePad
						hint="Sign to certify you inspected this vehicle and reported what you found."
						label="Driver signature"
						onChange={(dataUrl) => onChange(dataUrl ?? '')}
					/>
					<label
						className="flex items-start gap-3 text-sm"
						htmlFor={saveId}
					>
						<input
							checked={save}
							className="mt-0.5 size-4 accent-primary"
							id={saveId}
							onChange={(e) => onSaveChange(e.target.checked)}
							type="checkbox"
						/>
						<span>
							<span className="font-medium">
								{saved
									? 'Make this my saved signature'
									: 'Save my signature for next time'}
							</span>
							<span className="block text-muted-foreground">
								Pre-trips you or your AI assistant start are
								signed with it automatically.
							</span>
						</span>
					</label>
					{saved ? (
						<Button
							className="self-start"
							onClick={() => setDrawing(false)}
							size="sm"
							type="button"
							variant="ghost"
						>
							Use my saved signature
						</Button>
					) : null}
				</>
			)}
			{error ? (
				<p className="text-destructive text-sm" role="alert">
					{error}
				</p>
			) : null}
		</div>
	)
}
