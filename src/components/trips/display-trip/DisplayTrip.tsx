'use client'
import { Lock } from 'lucide-react'
import { use, useOptimistic } from 'react'
import { AddDefectForm } from '@/components/add-defect/add-defect-form/AddDefectForm'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import type { Driver } from '@/lib/auth'
import type { Trip } from '@/lib/types/types'
import { BackLink } from '../../links/back-home-button'
import { TripDate } from '../trip-date'
import { TripDefects, TripDetails } from './displayTripTable'
import PageHead from './page-head'

const DAY_MS = 24 * 60 * 60 * 1000

export default function DisplayTrip({
	tripPromise,
	userPromise,
}: {
	tripPromise: Promise<Trip | undefined>
	userPromise: Promise<Driver | null>
}) {
	const trip = use(tripPromise)
	const [optimisticTrip, updateOptimisticTrip] = useOptimistic(trip)

	if (!optimisticTrip) {
		return (
			<div className="flex flex-col gap-6">
				<BackLink />
				<Card>
					<CardHeader className="border-b-0">
						<CardTitle>Trip not found</CardTitle>
						<CardDescription>
							This trip doesn&apos;t exist or belongs to another
							driver.
						</CardDescription>
					</CardHeader>
				</Card>
			</div>
		)
	}

	const isEditable =
		Date.now() - new Date(optimisticTrip.date).getTime() < DAY_MS

	return (
		<div className="flex flex-col gap-6">
			<BackLink />
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p className="text-muted-foreground text-sm">
						Pre-trip inspection
					</p>
					<h1 className="font-bold text-2xl tracking-tight sm:text-3xl">
						<TripDate date={optimisticTrip.date} />
					</h1>
				</div>
				<PageHead userPromise={userPromise} />
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Vehicle &amp; carrier</CardTitle>
				</CardHeader>
				<CardContent>
					<TripDetails trip={optimisticTrip} />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Defects &amp; remarks</CardTitle>
				</CardHeader>
				<CardContent>
					<TripDefects trip={optimisticTrip} />
				</CardContent>
			</Card>

			{isEditable ? (
				<Card>
					<CardHeader>
						<CardTitle>Add on-route defects</CardTitle>
						<CardDescription>
							Found something after the inspection? Add it here
							within 24 hours of the pre-trip.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<AddDefectForm
							trip={optimisticTrip}
							updateOptimisticTrip={updateOptimisticTrip}
						/>
					</CardContent>
				</Card>
			) : (
				<p className="flex items-center gap-2 text-muted-foreground text-sm">
					<Lock className="size-4" />
					This inspection is older than 24 hours and can no longer be
					changed.
				</p>
			)}
		</div>
	)
}
