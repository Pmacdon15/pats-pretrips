'use client'

import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { use } from 'react'
import { Badge } from '@/components/ui/badge'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import type { DefectRecord } from '@/lib/repairs/status'
import { TripDate } from '../trips/trip-date'
import { RepairSummary } from './repair-summary'

const truck = (t: {
	truck_plate: string | null
	make: string
	model: string
}) => [`${t.make} ${t.model}`.trim(), t.truck_plate].filter(Boolean).join(' · ')

/** Every defect the driver reported: the open ones, then the repaired ones. */
export function DefectRecordView({
	recordPromise,
}: {
	recordPromise: Promise<DefectRecord>
}) {
	const { open, repaired } = use(recordPromise)

	return (
		<div className="flex flex-col gap-6">
			<p className="-mt-4 text-muted-foreground text-sm">
				{open.length} open · {repaired.length} repaired
			</p>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<AlertTriangle className="size-5 text-warning-foreground" />
						Open defects
					</CardTitle>
					<CardDescription>
						Reported on a pre-trip and not marked repaired yet. Open
						the trip to mark one repaired.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{open.length === 0 ? (
						<Badge className="text-sm" variant="success">
							<CheckCircle2 />
							No open defects
						</Badge>
					) : (
						<ul className="flex flex-col divide-y rounded-lg border">
							{open.map((d) => (
								<li key={`${d.trip_id}:${d.defect}`}>
									<Link
										className="flex items-center justify-between gap-3 p-3 hover:bg-muted/50"
										href={`/pretrip/${d.trip_id}#repairs`}
									>
										<span className="flex min-w-0 flex-col">
											<span className="flex items-center gap-2 font-medium">
												{d.defect}
												<Badge variant="warning">
													Open
												</Badge>
											</span>
											<span className="truncate text-muted-foreground text-xs">
												Trip {d.trip_id} ·{' '}
												<TripDate date={d.trip_date} />{' '}
												· {truck(d)}
											</span>
										</span>
										<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
									</Link>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<CheckCircle2 className="size-5 text-accent-foreground" />
						Repaired defects
					</CardTitle>
					<CardDescription>
						Who fixed each one, when, the invoice and their
						signature.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{repaired.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No repairs recorded yet.
						</p>
					) : (
						<ul className="flex flex-col divide-y rounded-lg border">
							{repaired.map((r) => (
								<li
									className="flex flex-col gap-3 p-3"
									key={r.id}
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<span className="flex items-center gap-2 font-medium">
											{r.defect}
											<Badge variant="success">
												<CheckCircle2 />
												Repaired
											</Badge>
										</span>
										<Link
											className="text-muted-foreground text-xs underline-offset-4 hover:underline"
											href={`/pretrip/${r.trip_id}#repairs`}
										>
											Found on trip {r.trip_id} ·{' '}
											<TripDate date={r.trip_date} /> ·{' '}
											{truck(r)}
										</Link>
									</div>
									<RepairSummary repair={r} />
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
