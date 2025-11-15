'use client'
import type { KindeUser } from '@kinde-oss/kinde-auth-nextjs'
import { use, useOptimistic, useTransition } from 'react'
import { AddDefectForm } from '@/components/add-defect/add-defect-form/AddDefectForm'
import type { Trip } from '@/lib/types/types'
import { BackLink } from '../../links/back-home-button'
import { DisplayTripTableBody, DisplayTripTableHead } from './displayTripTable'
import PageHead from './page-head'

export default function DisplayTrip({
	tripPromise,
	userPromise,
}: {
	tripPromise: Promise<Trip | undefined>
	userPromise: Promise<KindeUser<Record<string, string>> | null>
}) {
	const trip = use(tripPromise)
	const [optimisticTrip, updateOptimisticTrip] = useOptimistic(trip)
	const [isPending, startTransition] = useTransition()
	console.log(isPending)

	const handleUpdate = (newTrip: Trip) => {
		startTransition(() => {
			updateOptimisticTrip(newTrip)
		})
	}

	return (
		<div className="flex w-full flex-col gap-4 rounded-sm bg-[var(--color-primary)] p-4 shadow-sm md:w-4/6">
			<BackLink />

			<PageHead userPromise={userPromise} />

			<table className="w-full overflow-hidden rounded-sm border p-4">
				<DisplayTripTableHead />
				<DisplayTripTableBody trip={optimisticTrip} />
			</table>

			<AddDefectForm
				trip={optimisticTrip}
				updateOptimisticTrip={handleUpdate}
			/>
		</div>
	)
}
