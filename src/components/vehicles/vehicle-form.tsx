'use client'

import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useTransition } from 'react'
import { toast } from 'sonner'
import type { z } from 'zod'
import { ControlledTextInput } from '@/components/forms/controlled-text-input'
import { Button } from '@/components/ui/button'
import { addVehicle, updateVehicle } from '@/lib/actions/vehicles'
import type { Vehicle } from '@/lib/db/vehicles'
import { VEHICLES_KEY } from '@/lib/hooks/hooks'
import { MAKE_MODEL_MAX, PLATE_MAX, VEHICLE_NAME_MAX } from '@/lib/trip-limits'
import { schemaVehicle } from '@/lib/ZOD/schemas'

type VehicleForm = z.infer<typeof schemaVehicle>

/** Adds a vehicle, or edits `vehicle` when given. */
export function VehicleForm({
	vehicle,
	onDone,
}: {
	vehicle?: Vehicle
	onDone: () => void
}) {
	const queryClient = useQueryClient()
	const [pending, startTransition] = useTransition()

	const form = useForm({
		defaultValues: {
			name: vehicle?.name ?? '',
			make: vehicle?.make ?? '',
			model: vehicle?.model ?? '',
			truckPlate: vehicle?.truck_plate ?? '',
			trailerPlateA: vehicle?.trailer_plate_a ?? '',
			trailerPlateB: vehicle?.trailer_plate_b ?? '',
		} as VehicleForm,
		validators: { onChange: schemaVehicle, onSubmit: schemaVehicle },
		onSubmit: ({ value }) =>
			startTransition(async () => {
				const res = vehicle
					? await updateVehicle(vehicle.id, value)
					: await addVehicle(value)
				if ('errorMessage' in res) {
					toast.error('Could not save the vehicle', {
						description: res.errorMessage,
					})
					return
				}
				await queryClient.invalidateQueries({ queryKey: VEHICLES_KEY })
				toast.success(vehicle ? 'Vehicle updated' : 'Vehicle saved')
				form.reset()
				onDone()
			}),
	})

	return (
		<form
			aria-label={vehicle ? 'Edit vehicle' : 'Add a vehicle'}
			className="flex flex-col gap-4"
			noValidate
			onSubmit={(e) => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			<ControlledTextInput
				form={form}
				label="Name"
				maxLength={VEHICLE_NAME_MAX}
				name="name"
				optional
				placeholder="e.g. Unit 42"
			/>
			<div className="grid gap-4 sm:grid-cols-2">
				<ControlledTextInput
					form={form}
					label="Make"
					maxLength={MAKE_MODEL_MAX}
					name="make"
					placeholder="e.g. Freightliner"
				/>
				<ControlledTextInput
					form={form}
					label="Model"
					maxLength={MAKE_MODEL_MAX}
					name="model"
					placeholder="e.g. Cascadia"
				/>
			</div>
			<div className="grid gap-4 sm:grid-cols-3">
				<ControlledTextInput
					autoCapitalize="characters"
					form={form}
					label="Truck plate"
					maxLength={PLATE_MAX}
					name="truckPlate"
					optional
				/>
				<ControlledTextInput
					autoCapitalize="characters"
					form={form}
					label="Trailer plate"
					maxLength={PLATE_MAX}
					name="trailerPlateA"
					optional
				/>
				<ControlledTextInput
					autoCapitalize="characters"
					form={form}
					label="Trailer B plate"
					maxLength={PLATE_MAX}
					name="trailerPlateB"
					optional
				/>
			</div>
			<div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
				<Button
					onClick={() => {
						form.reset()
						onDone()
					}}
					type="button"
					variant="outline"
				>
					Cancel
				</Button>
				<Button disabled={pending} type="submit">
					{pending
						? 'Saving…'
						: vehicle
							? 'Save changes'
							: 'Save vehicle'}
				</Button>
			</div>
		</form>
	)
}
