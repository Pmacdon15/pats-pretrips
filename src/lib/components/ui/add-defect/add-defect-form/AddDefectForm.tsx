'use client'
import { use } from 'react'
import { useAddDefectOnRoute } from '@/lib/hooks/mutations/mutations'
import type { Trip } from '@/lib/types/types'
import { AddDefect } from '../AddDefect'

export default function AddDefectForm({
	tripPromise,
}: {
	tripPromise: Promise<Trip>
}) {
	const trip = use(tripPromise)

	const tripId = Number(trip.tripid || '')
	const driverEmail = trip.driveremail

	const { mutate, isError, isPending } = useAddDefectOnRoute(
		Number(tripId),
		driverEmail,
	)

	const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
	if (trip?.date && new Date(trip.date) > twentyFourHoursAgo) return null

	return (
		<form
			action={(formData: FormData) => {
				mutate({ driverEmail, tripId, formData })
				console.log('Pressed')
			}}
			className="flex w-full flex-col gap-4"
		>
			<AddDefect required={true} />
			{isError && (
				<div className="text-center text-red-600">
					Error Adding Defect
				</div>
			)}
			<div className="flex w-full justify-center">
				<button
					className={`w-full rounded-lg bg-green-500 p-4 hover:bg-green-600 md:w-3/6`}
					disabled={isPending}
					type="submit"
				>
					Add on Route Defects
				</button>
			</div>
		</form>
	)
}
