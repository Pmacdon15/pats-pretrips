'use client'
import { Lock } from 'lucide-react'
import { Suspense, use, useOptimistic } from 'react'
import { AddDefectForm } from '@/components/add-defect/add-defect-form/AddDefectForm'
import { EmailTrip } from '@/components/email/email-trip'
import { DefectStatusList } from '@/components/repairs/defect-status-list'
import { TripSignature } from '@/components/signature/trip-signature'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import type { Driver } from '@/lib/auth'
import type { EmailAccess } from '@/lib/DAL/email'
import type { Repair } from '@/lib/db/repairs'
import type { Trip } from '@/lib/types/types'
import { parseDefects } from '@/lib/utils-defects'
import { BackLink } from '../../links/back-home-button'
import { TripDate } from '../trip-date'
import { TripDefects, TripDetails } from './displayTripTable'
import PageHead from './page-head'

const DAY_MS = 24 * 60 * 60 * 1000
const NO_REPAIRS: Promise<Repair[]> = Promise.resolve([])

export default function DisplayTrip({
	tripPromise,
	userPromise,
	emailAccessPromise,
	repairsPromise,
}: {
	tripPromise: Promise<Trip | undefined>
	/** The trip's defect repairs; none when left out. */
	repairsPromise?: Promise<Repair[]>
	userPromise: Promise<Driver | null>
	emailAccessPromise: Promise<EmailAccess>
}) {
	const trip = use(tripPromise)
	const repairs = use(repairsPromise ?? NO_REPAIRS)
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
					<TripDefects repairs={repairs} trip={optimisticTrip} />
				</CardContent>
			</Card>

			<Card id="signature">
				<CardHeader>
					<CardTitle>Driver signature</CardTitle>
				</CardHeader>
				<CardContent>
					<TripSignature
						editable={isEditable}
						trip={optimisticTrip}
					/>
				</CardContent>
			</Card>

			{parseDefects(optimisticTrip.defects).length > 0 ? (
				<Card id="repairs">
					<CardHeader>
						<CardTitle>Defect repairs</CardTitle>
						<CardDescription>
							Had a defect fixed? Mark it repaired with the
							signature, the invoice number and a copy of the
							invoice.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<DefectStatusList
							defects={optimisticTrip.defects}
							repairs={repairs}
							tripId={Number(optimisticTrip.tripid)}
						/>
					</CardContent>
				</Card>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>Email this pre-trip</CardTitle>
					<CardDescription>
						Sends the inspection as a PDF, with links back here to
						edit it or add an on-route defect.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Suspense
						fallback={
							<div className="h-9 animate-pulse rounded-md bg-muted" />
						}
					>
						<EmailTrip
							accessPromise={emailAccessPromise}
							tripId={Number(optimisticTrip.tripid)}
						/>
					</Suspense>
				</CardContent>
			</Card>

			{isEditable ? (
				<Card id="add-defect">
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
