import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Trip } from '@/lib/types/types'
import { parseDefects } from '@/lib/utils-defects'

function Item({
	label,
	children,
	wide,
}: {
	label: string
	children: React.ReactNode
	wide?: boolean
}) {
	return (
		<div className={wide ? 'sm:col-span-2' : undefined}>
			<dt className="text-muted-foreground text-xs uppercase tracking-wider">
				{label}
			</dt>
			<dd className="mt-1 break-words">{children || '—'}</dd>
		</div>
	)
}

export function TripDetails({ trip }: { trip: Trip }) {
	return (
		<dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
			<Item label="Carrier">{trip.carrier}</Item>
			<Item label="Carrier address">{trip.carrieraddress}</Item>
			<Item label="Inspection address" wide>
				{trip.inspectionaddress}
			</Item>
			<Item label="Make / model">
				{[trip.make, trip.model].filter(Boolean).join(' ')}
			</Item>
			<Item label="Odometer">
				{trip.odometer ? `${trip.odometer.toLocaleString()} km` : ''}
			</Item>
			<Item label="Truck plate">{trip.truckplate}</Item>
			<Item label="Trailer plates">
				{[trip.trailerplatea, trip.trailerplateb]
					.filter(Boolean)
					.join(' · ')}
			</Item>
		</dl>
	)
}

export function TripDefects({ trip }: { trip: Trip }) {
	const defects = parseDefects(trip.defects)
	return (
		<div className="flex flex-col gap-4">
			{defects.length === 0 ? (
				<Badge className="self-start text-sm" variant="success">
					<CheckCircle2 />
					No defects reported
				</Badge>
			) : (
				<ul className="flex flex-wrap gap-2">
					{defects.map((d) => (
						<li key={d}>
							<Badge className="text-sm" variant="warning">
								<AlertTriangle />
								{d}
							</Badge>
						</li>
					))}
				</ul>
			)}
			<div>
				<h3 className="text-muted-foreground text-xs uppercase tracking-wider">
					Remarks
				</h3>
				<p className="mt-1 whitespace-pre-line">
					{trip.remarks || '—'}
				</p>
			</div>
		</div>
	)
}
