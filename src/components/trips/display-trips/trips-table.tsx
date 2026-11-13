'use client'
import {
	AlertTriangle,
	CheckCircle2,
	ChevronRight,
	Loader2,
} from 'lucide-react'
import Link from 'next/link'
import { QuickSignButton, SignedBadge } from '@/components/signature/quick-sign'
import { Badge } from '@/components/ui/badge'
import type { Trip, TripsResponse } from '@/lib/types/types'
import { parseDefects } from '@/lib/utils-defects'
import { Pagination } from '../../pagination/pagination-buttons'
import { TripDate } from '../trip-date'

export default function TripsTable({
	trips,
	pageParam,
	emptyMessage,
}: {
	trips: TripsResponse
	pageParam: string
	emptyMessage: string
}) {
	return (
		<>
			{trips.trips.length === 0 ? (
				<p className="px-5 py-12 text-center text-muted-foreground text-sm sm:px-6">
					{emptyMessage}
				</p>
			) : (
				<ul className="divide-y">
					{trips.trips.map((trip) => (
						<li key={trip.tripid}>
							<TripRow trip={trip} />
						</li>
					))}
				</ul>
			)}
			<Pagination hasMore={trips.hasMore} param={pageParam} />
		</>
	)
}

const DAY_MS = 24 * 60 * 60 * 1000

function TripRow({ trip }: { trip: Trip }) {
	const defectList = parseDefects(trip.defects)
	const units = [trip.truckplate, trip.trailerplatea, trip.trailerplateb]
		.filter(Boolean)
		.join(' · ')

	const content = (
		<>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
					<span className="font-medium">
						<TripDate date={trip.date} />
					</span>
					{defectList.length === 0 ? (
						<Badge variant="success">
							<CheckCircle2 />
							No defects
						</Badge>
					) : (
						<Badge variant="warning">
							<AlertTriangle />
							{defectList.length} defect
							{defectList.length === 1 ? '' : 's'}
						</Badge>
					)}
					{trip.signed_at && !trip.pending ? <SignedBadge /> : null}
				</div>
				<p className="truncate text-muted-foreground text-sm">
					{[trip.carrier, `${trip.make} ${trip.model}`.trim(), units]
						.filter(Boolean)
						.join(' — ')}
				</p>
				{defectList.length > 0 && (
					<p className="truncate text-warning-foreground text-xs">
						{defectList.join(', ')}
					</p>
				)}
			</div>
			{trip.pending ? (
				<Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
			) : (
				<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
			)}
		</>
	)

	const className =
		'flex items-center gap-4 px-5 py-4 sm:px-6 transition-colors'

	if (trip.pending || !trip.tripid || trip.tripid < 0) {
		return (
			<div aria-busy="true" className={`${className} opacity-70`}>
				{content}
			</div>
		)
	}

	const link = (
		<Link
			className={`${className} hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none`}
			href={`/pretrip/${trip.tripid}`}
		>
			{content}
		</Link>
	)
	// Unsigned trips that can still be changed get a one-tap signature.
	const canSign =
		!trip.signed_at && Date.now() - new Date(trip.date).getTime() < DAY_MS
	if (!canSign) return link

	return (
		<div className="flex items-center">
			<div className="min-w-0 flex-1">{link}</div>
			<div className="shrink-0 pr-5 sm:pr-6">
				<QuickSignButton
					signHref={`/pretrip/${trip.tripid}#signature`}
					tripId={trip.tripid}
				/>
			</div>
		</div>
	)
}
