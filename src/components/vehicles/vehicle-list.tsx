'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2, Truck } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { deleteVehicle } from '@/lib/actions/vehicles'
import type { Vehicle } from '@/lib/db/vehicles'
import { useVehicles, VEHICLES_KEY } from '@/lib/hooks/hooks'
import { useSpace } from '@/lib/hooks/space'
import { formatLimit, VEHICLES_MAX } from '@/lib/trip-limits'
import { VehicleForm } from './vehicle-form'

/**
 * The space's saved vehicles (the driver's own, or their organization's):
 * add one, edit one or delete one, when the driver manages the space. Pick one on
 * a new pre-trip to fill in its make, model and plates.
 */
export function VehicleList() {
	const { data: vehicles = [], isPending } = useVehicles()
	const { inOrg, canManage } = useSpace()
	// 'new' while adding, a vehicle's id while editing it.
	const [editing, setEditing] = useState<'new' | number | null>(null)

	if (isPending) {
		return <div className="h-32 animate-pulse rounded-md bg-muted" />
	}

	const full = vehicles.length >= VEHICLES_MAX

	return (
		<div className="flex flex-col gap-4">
			{inOrg && canManage && (
				<p className="rounded-md bg-muted p-3 text-muted-foreground text-sm">
					These vehicles are shared with everyone in your
					organization. As an admin, you can change them.
				</p>
			)}
			{!canManage && (
				<p className="rounded-md bg-muted p-3 text-muted-foreground text-sm">
					These are your organization&apos;s vehicles. Only its admins
					can add, change or delete them.
				</p>
			)}
			{vehicles.length === 0 && editing !== 'new' && !canManage && (
				<p className="rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
					Your organization has no saved vehicles yet.
				</p>
			)}
			{vehicles.length === 0 && editing !== 'new' && canManage && (
				<p className="rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
					No saved vehicles yet. Add the trucks you drive, then pick
					one when you start a pre-trip.
				</p>
			)}
			<ul className="flex flex-col gap-3">
				{vehicles.map((v) => (
					<li className="rounded-md border p-4" key={v.id}>
						{editing === v.id ? (
							<VehicleForm
								onDone={() => setEditing(null)}
								vehicle={v}
							/>
						) : (
							<VehicleRow
								canManage={canManage}
								onEdit={() => setEditing(v.id)}
								vehicle={v}
							/>
						)}
					</li>
				))}
			</ul>
			{!canManage ? null : editing === 'new' ? (
				<div className="rounded-md border p-4">
					<VehicleForm onDone={() => setEditing(null)} />
				</div>
			) : (
				<Button
					className="self-start"
					disabled={full}
					onClick={() => setEditing('new')}
					type="button"
				>
					<Plus />
					Add a vehicle
				</Button>
			)}
			{canManage && full && (
				<p className="text-muted-foreground text-xs">
					You can save up to {formatLimit(VEHICLES_MAX)} vehicles.
				</p>
			)}
		</div>
	)
}

function VehicleRow({
	vehicle: v,
	onEdit,
	canManage,
}: {
	vehicle: Vehicle
	onEdit: () => void
	/** Shows Edit and Delete: the driver manages this space. */
	canManage: boolean
}) {
	const queryClient = useQueryClient()
	const [confirming, setConfirming] = useState(false)
	const [pending, startTransition] = useTransition()

	const remove = () =>
		startTransition(async () => {
			const res = await deleteVehicle(v.id)
			if ('errorMessage' in res) {
				toast.error('Could not delete the vehicle', {
					description: res.errorMessage,
				})
				return
			}
			await queryClient.invalidateQueries({ queryKey: VEHICLES_KEY })
			toast.success('Vehicle deleted')
		})

	const plates = [
		v.truck_plate && `Truck ${v.truck_plate}`,
		v.trailer_plate_a && `Trailer ${v.trailer_plate_a}`,
		v.trailer_plate_b && `Trailer B ${v.trailer_plate_b}`,
	].filter(Boolean)

	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-start gap-3">
				<Truck className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
				<div>
					<p className="font-medium">
						{v.name || `${v.make} ${v.model}`}
					</p>
					{v.name && (
						<p className="text-muted-foreground text-sm">
							{v.make} {v.model}
						</p>
					)}
					{plates.length > 0 && (
						<p className="text-muted-foreground text-sm">
							{plates.join(' · ')}
						</p>
					)}
				</div>
			</div>
			<div className="flex gap-2">
				{!canManage ? null : confirming ? (
					<>
						<Button
							disabled={pending}
							onClick={remove}
							size="sm"
							type="button"
							variant="destructive"
						>
							<Trash2 />
							{pending ? 'Deleting…' : 'Delete'}
						</Button>
						<Button
							disabled={pending}
							onClick={() => setConfirming(false)}
							size="sm"
							type="button"
							variant="outline"
						>
							Keep
						</Button>
					</>
				) : (
					<>
						<Button
							aria-label={`Edit ${v.name || `${v.make} ${v.model}`}`}
							onClick={onEdit}
							size="sm"
							type="button"
							variant="outline"
						>
							<Pencil />
							Edit
						</Button>
						<Button
							aria-label={`Delete ${v.name || `${v.make} ${v.model}`}`}
							onClick={() => setConfirming(true)}
							size="sm"
							type="button"
							variant="outline"
						>
							<Trash2 />
							Delete
						</Button>
					</>
				)}
			</div>
		</div>
	)
}
