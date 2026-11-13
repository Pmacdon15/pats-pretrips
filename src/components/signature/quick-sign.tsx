'use client'

import { PenLine } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { signTrip } from '@/lib/actions/signatures'
import { useSignatureStatus } from '@/lib/hooks/hooks'

/** The "Signed" badge on a signed pre-trip. */
export function SignedBadge() {
	return (
		<Badge variant="success">
			<PenLine />
			Signed
		</Badge>
	)
}

/**
 * One tap to sign an unsigned pre-trip: with the driver's saved signature
 * when they have one, or straight to the sign box (`signHref`) when they
 * don't, where "Save my signature" is ticked so the next trip is one tap.
 */
export function QuickSignButton({
	tripId,
	signHref,
}: {
	tripId: number
	/** Where the sign box is: the trip page's #signature card. */
	signHref: string
}) {
	const { data } = useSignatureStatus()
	const [signed, setSigned] = useState(false)
	const [pending, startTransition] = useTransition()

	if (signed) return <SignedBadge />

	if (!data?.saved) {
		return (
			<Link
				className={buttonVariants({ size: 'sm', variant: 'outline' })}
				href={signHref as Route}
			>
				<PenLine />
				Add signature
			</Link>
		)
	}

	const sign = () =>
		startTransition(async () => {
			const res = await signTrip({ tripId, signature: 'saved' })
			if ('errorMessage' in res) {
				toast.error('Could not sign the pre-trip', {
					description: res.errorMessage,
				})
				return
			}
			setSigned(true)
			toast.success('Pre-trip signed')
		})

	return (
		<Button
			disabled={pending}
			onClick={sign}
			size="sm"
			type="button"
			variant="outline"
		>
			<PenLine />
			{pending ? 'Signing…' : 'Add signature'}
		</Button>
	)
}
