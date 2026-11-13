'use client'
import { useForm } from '@tanstack/react-form'
import { LocateFixed } from 'lucide-react'
import { startTransition, useEffect, useState } from 'react'
import type { z } from 'zod'
import { DefectPicker } from '@/components/add-defect/defect-picker'
import { DriverSignatureField } from '@/components/signature/driver-signature-field'
import { useGetAddress, useGetLocation } from '@/lib/hooks/hooks'
import { useAddTrip } from '@/lib/mutations/mutations'
import type { Trip, TripsAction } from '@/lib/types/types'
import { schemaAddTripForm } from '@/lib/ZOD/schemas'
import { Button } from '../ui/button'
import { ControlledTextArea } from './controlled-text-area'
import { ControlledTextInput } from './controlled-text-input'

type TripForm = z.infer<typeof schemaAddTripForm>

export default function AddTripForm({
	onDone,
	setOptimisticCurrentTrips,
}: {
	onDone: () => void
	setOptimisticCurrentTrips: (action: TripsAction) => void
}) {
	const { mutateAsync } = useAddTrip()
	const { location, status: locationStatus } = useGetLocation()
	const { data: addressData, isFetching: isFetchingAddress } = useGetAddress(
		location?.latitude ?? 0,
		location?.longitude ?? 0,
	)
	const formattedAddress = addressData?.data?.results?.[0]?.formatted_address
	// Bumped after each save, so the signature box starts empty again.
	const [saves, setSaves] = useState(0)

	const form = useForm({
		defaultValues: {
			carrier: '',
			carrierAddress: '',
			inspectionAddress: '',
			make: '',
			model: '',
			odometer: 0,
			truckPlate: '',
			trailerPlateA: '',
			trailerPlateB: '',
			defects: '',
			remarks: '',
			signature: '',
			saveSignature: true,
		} as TripForm,
		validators: {
			onChange: schemaAddTripForm,
			onSubmit: schemaAddTripForm,
		},
		onSubmit: async ({ value }) => {
			handleAddTrip(value)
		},
	})

	// Fill the inspection address from GPS once it resolves, without
	// overwriting anything the driver already typed.
	useEffect(() => {
		if (formattedAddress && !form.getFieldValue('inspectionAddress')) {
			form.setFieldValue('inspectionAddress', formattedAddress)
		}
	}, [formattedAddress, form])

	const handleAddTrip = (formData: TripForm) => {
		const newTrip: Trip = {
			tripid: -Date.now(),
			driveremail: '',
			carrier: formData.carrier,
			carrieraddress: formData.carrierAddress,
			inspectionaddress: formData.inspectionAddress,
			make: formData.make,
			model: formData.model,
			odometer: formData.odometer,
			truckplate: formData.truckPlate,
			trailerplatea: formData.trailerPlateA,
			trailerplateb: formData.trailerPlateB,
			date: new Date(),
			defects: formData.defects,
			remarks: formData.remarks,
			signed_at: new Date(),
			pending: true,
		}

		// Keep the transition open until the save finishes so the optimistic
		// row stays visible. Errors are already reported by the mutation's toast.
		startTransition(async () => {
			setOptimisticCurrentTrips({ type: 'ADD', payload: newTrip })
			await mutateAsync({ data: formData }).catch(() => {})
		})
		form.reset()
		setSaves((n) => n + 1)
		if (formattedAddress) {
			form.setFieldValue('inspectionAddress', formattedAddress)
		}
		onDone()
	}

	const locationHint =
		locationStatus === 'denied'
			? 'Location access is off — enter the address manually.'
			: isFetchingAddress || locationStatus === 'loading'
				? 'Finding your location…'
				: formattedAddress
					? 'Filled in from your current location.'
					: undefined

	return (
		<form
			className="flex flex-col gap-8"
			noValidate
			onSubmit={(e) => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			<FormSection title="Carrier">
				<div className="grid gap-4 sm:grid-cols-2">
					<ControlledTextInput
						form={form}
						label="Carrier"
						name="carrier"
						placeholder="Company name"
					/>
					<ControlledTextInput
						form={form}
						label="Carrier address"
						name="carrierAddress"
						placeholder="123 North N St, Calgary AB"
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<ControlledTextInput
						form={form}
						label="Inspection address"
						name="inspectionAddress"
						placeholder="Where are you doing the inspection?"
						showCopyButton
					/>
					{locationHint && (
						<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
							<LocateFixed className="size-3.5" />
							{locationHint}
						</p>
					)}
				</div>
			</FormSection>

			<FormSection title="Vehicle">
				<div className="grid gap-4 sm:grid-cols-3">
					<ControlledTextInput
						form={form}
						label="Make"
						name="make"
						placeholder="e.g. Freightliner"
					/>
					<ControlledTextInput
						form={form}
						label="Model"
						name="model"
						placeholder="e.g. Cascadia"
					/>
					<ControlledTextInput
						form={form}
						label="Odometer"
						name="odometer"
						placeholder="km"
						type="number"
					/>
				</div>
				<div className="grid gap-4 sm:grid-cols-3">
					<ControlledTextInput
						autoCapitalize="characters"
						form={form}
						label="Truck plate"
						name="truckPlate"
						optional
					/>
					<ControlledTextInput
						autoCapitalize="characters"
						form={form}
						label="Trailer plate"
						name="trailerPlateA"
						optional
					/>
					<ControlledTextInput
						autoCapitalize="characters"
						form={form}
						label="Trailer B plate"
						name="trailerPlateB"
						optional
					/>
				</div>
			</FormSection>

			<FormSection title="Inspection">
				<form.Field name="defects">
					{(field) => (
						<DefectPicker
							onChange={(v) => field.handleChange(v)}
							value={field.state.value}
						/>
					)}
				</form.Field>
				<ControlledTextArea
					form={form}
					label="Remarks"
					name="remarks"
					placeholder="Anything worth noting about the inspection"
				/>
			</FormSection>

			<FormSection title="Sign">
				<form.Field name="signature">
					{(field) => (
						<form.Field name="saveSignature">
							{(saveField) => (
								<DriverSignatureField
									error={
										form.state.submissionAttempts > 0
											? field.state.meta.errors[0]
													?.message
											: undefined
									}
									key={saves}
									onChange={field.handleChange}
									onSaveChange={(v) =>
										saveField.handleChange(v)
									}
									save={Boolean(saveField.state.value)}
									value={field.state.value}
								/>
							)}
						</form.Field>
					)}
				</form.Field>
			</FormSection>

			<div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
				<Button
					className="h-11"
					onClick={() => {
						form.reset()
						onDone()
					}}
					type="button"
					variant="outline"
				>
					Cancel
				</Button>
				<form.Subscribe selector={(state) => state.isSubmitting}>
					{(isSubmitting) => (
						<Button
							className="h-11 px-8"
							disabled={isSubmitting}
							type="submit"
						>
							Save pre-trip
						</Button>
					)}
				</form.Subscribe>
			</div>
		</form>
	)
}

function FormSection({
	title,
	children,
}: {
	title: string
	children: React.ReactNode
}) {
	return (
		<div className="flex flex-col gap-4">
			<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
				{title}
			</h3>
			{children}
		</div>
	)
}
