'use client'

import { useQueryClient } from '@tanstack/react-query'
import { PenLine } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { TripDate } from '@/components/trips/trip-date'
import { Button } from '@/components/ui/button'
import { signTrip } from '@/lib/actions/signatures'
import { SIGNATURE_STATUS_KEY } from '@/lib/hooks/hooks'
import { tripSignaturePath } from '@/lib/signatures/paths'
import type { Trip } from '@/lib/types/types'
import { DriverSignatureField } from './driver-signature-field'

/**
 * The driver's signature on a pre-trip, or a box to sign it while it can
 * still be changed (e.g. a trip an AI assistant started before the driver
 * saved a signature).
 */
export function TripSignature({
	trip,
	editable,
}: {
	trip: Trip
	editable: boolean
}) {
	if (trip.signed_at) {
		return (
			<figure className="flex flex-col gap-1">
				{/* biome-ignore lint/performance/noImgElement: a private file, not an optimisable asset */}
				<img
					alt="Driver signature"
					className="h-20 w-auto self-start rounded-md border bg-white p-1"
					height={80}
					src={tripSignaturePath(Number(trip.tripid))}
					width={240}
				/>
				<figcaption className="text-muted-foreground text-xs">
					Signed by the driver <TripDate date={trip.signed_at} />
				</figcaption>
			</figure>
		)
	}
	if (!editable) {
		return (
			<p className="text-muted-foreground text-sm">
				This pre-trip was not signed.
			</p>
		)
	}
	return <SignTripForm tripId={Number(trip.tripid)} />
}

function SignTripForm({ tripId }: { tripId: number }) {
	const [signature, setSignature] = useState('')
	const [save, setSave] = useState(true)
	const [pending, startTransition] = useTransition()
	const queryClient = useQueryClient()

	const sign = () => {
		if (!signature) {
			toast.error('Sign in the box first')
			return
		}
		startTransition(async () => {
			const res = await signTrip({
				tripId,
				signature,
				saveSignature: save,
			})
			if ('errorMessage' in res) {
				toast.error('Could not sign the pre-trip', {
					description: res.errorMessage,
				})
				return
			}
			if (save && signature !== 'saved') {
				queryClient.invalidateQueries({
					queryKey: SIGNATURE_STATUS_KEY,
				})
			}
			toast.success('Pre-trip signed')
		})
	}

	return (
		<form
			aria-label="Sign this pre-trip"
			className="flex flex-col gap-4"
			noValidate
			onSubmit={(e) => {
				e.preventDefault()
				sign()
			}}
		>
			<p className="text-muted-foreground text-sm">
				This pre-trip isn&apos;t signed yet.
			</p>
			<DriverSignatureField
				onChange={setSignature}
				onSaveChange={setSave}
				save={save}
				value={signature}
			/>
			<Button className="self-start" disabled={pending} type="submit">
				<PenLine />
				{pending ? 'Signing…' : 'Sign pre-trip'}
			</Button>
		</form>
	)
}
