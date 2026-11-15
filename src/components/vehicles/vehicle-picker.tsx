'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import { Label } from '@/components/ui/label'
import type { Vehicle } from '@/lib/db/vehicles'
import { useVehicles } from '@/lib/hooks/hooks'

/**
 * Picks one of the driver's saved vehicles on a new pre-trip; `onPick` fills
 * the form's make, model and plates from it, which the driver can still edit.
 */
export function VehiclePicker({
	onPick,
}: {
	onPick: (vehicle: Vehicle) => void
}) {
	const { data: vehicles = [], isPending } = useVehicles()
	const [picked, setPicked] = useState('')
	const id = useId()

	if (isPending) return null

	if (vehicles.length === 0) {
		return (
			<p className="text-muted-foreground text-xs">
				Drive the same trucks often?{' '}
				<Link className="underline" href="/vehicles">
					Save your vehicles
				</Link>{' '}
				to fill these in with a tap.
			</p>
		)
	}

	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>Saved vehicle</Label>
			<select
				className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
				id={id}
				onChange={(e) => {
					setPicked(e.target.value)
					const vehicle = vehicles.find(
						(v) => String(v.id) === e.target.value,
					)
					if (vehicle) onPick(vehicle)
				}}
				value={picked}
			>
				<option value="">Choose a vehicle…</option>
				{vehicles.map((v) => (
					<option key={v.id} value={v.id}>
						{vehicleOption(v)}
					</option>
				))}
			</select>
			<p className="text-muted-foreground text-xs">
				Fills in the make, model and plates.{' '}
				<Link className="underline" href="/vehicles">
					Manage vehicles
				</Link>
			</p>
		</div>
	)
}

function vehicleOption(v: Vehicle) {
	const base = `${v.make} ${v.model}`
	const label = v.name ? `${v.name} — ${base}` : base
	return v.truck_plate ? `${label} (${v.truck_plate})` : label
}
