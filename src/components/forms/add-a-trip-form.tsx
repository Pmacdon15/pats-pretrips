'use client'
import { useForm } from '@tanstack/react-form'
import { CircleX } from 'lucide-react'
import { Activity, useEffect, useState } from 'react'
import type { z } from 'zod'
import { useGetAddress, useGetLocation } from '@/lib/hooks/hooks'
import { useAddTrip } from '@/lib/mutations/mutations'
import { schemaAddTripForm } from '@/lib/ZOD/schemas'
import { AddDefect } from '../add-defect/AddDefect'
import { Button } from '../ui/button'
import { ControlledTextArea } from './controlled-text-area'
import { ControlledTextInput } from './controlled-text-input'

export default function AddTripForm({
	setShowForm,
}: {
	setShowForm: (value: boolean) => void
}) {
	const { mutate } = useAddTrip()
	const { location } = useGetLocation()
	const { data: addressData } = useGetAddress(
		location?.latitude ?? 0,
		location?.longitude ?? 0,
	)
	const formattedAddress =
		addressData?.data?.features[0]?.properties?.formatted

	const form = useForm({
		defaultValues: {
			carrier: '',
			carrierAddress: '',
			inspectionAddress: formattedAddress || '',
			make: '',
			model: '',
			odometer: 0,
			truckPlate: '',
			trailerPlateA: '',
			trailerPlateB: '',
			defects: '',
			remarks: '',
		} as z.infer<typeof schemaAddTripForm>,

		validators: {
			// onChange: schemaAddTripForm,
			onBlur: schemaAddTripForm,
			onSubmit: schemaAddTripForm,
		},
		onSubmit: async ({ value }) => {
			mutate({ data: value })
		},
	})

	useSetCurrentAddress(formattedAddress, form)

	const [defects, setDefects] = useState('')
	const handleSelectDefect = (defect: string) => {
		if (defect !== '') {
			const currentDefects = form.getFieldValue('defects') as string
			const newDefects = `${defect}, ${currentDefects}`
			form.setFieldValue('defects', newDefects)
			setDefects(newDefects)
		}
	}

	return (
		<form
			className={'flex w-full flex-col gap-4'}
			id="form"
			onSubmit={(e) => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			<h1 className="text-2xl">Create a Trip</h1>
			<div className="flex w-full flex-col gap-4">
				<ControlledTextInput
					form={form}
					label="Carrier"
					name="carrier"
					placeholder="Company Name"
				/>
				<ControlledTextInput
					form={form}
					label="Carrier Address"
					name="carrierAddress"
					placeholder="123 North N St Calgary Ab"
				/>
				<ControlledTextInput
					form={form}
					label="Inspection Address"
					name="inspectionAddress"
					placeholder="123 North N St Calgary Ab"
					showCopyButton={true}
				/>
			</div>
			<div className="flex w-full gap-4">
				<ControlledTextInput
					form={form}
					label="Make"
					name="make"
					placeholder="Make of vehicle"
				/>
				<ControlledTextInput
					form={form}
					label="Model"
					name="model"
					placeholder="Model of vehicle"
				/>
				<ControlledTextInput
					form={form}
					label="Odometer"
					name="odometer"
					type="number"
				/>
			</div>
			<div className="flex w-full gap-4">
				<ControlledTextInput
					form={form}
					label="Truck Plate"
					name="truckPlate"
				/>
				<ControlledTextInput
					form={form}
					label="Trailer Plate"
					name="trailerPlateA"
				/>
				<ControlledTextInput
					form={form}
					label="Trailer B Plate"
					name="trailerPlateB"
				/>
			</div>
			<AddDefect handleSelectDefect={handleSelectDefect}>
				<div className="relative">
					<Activity mode={defects === '' ? 'hidden' : 'visible'}>
						<Button
							className="absolute top-8 right-0"
							onClick={() => {
								form.setFieldValue('defects', '')
								setDefects('')
							}}
							size={'icon-lg'}
							type="button"
							variant={'ghost'}
						>
							<CircleX />
						</Button>
					</Activity>
					<ControlledTextArea
						form={form}
						label="Defects"
						name="defects"
						readOnly
					/>
				</div>

				<ControlledTextArea
					form={form}
					label="Remarks"
					name="remarks"
				/>
			</AddDefect>

			<form.Subscribe selector={(state) => [state.isSubmitting]}>
				{([, isSubmitting]) => (
					<Button
						className={`rounded-lg bg-green-500 p-4 shadow-lg hover:bg-green-600`}
						disabled={isSubmitting}
						size={'lg'}
						type="submit"
					>
						{isSubmitting ? '...' : 'Submit'}
					</Button>
				)}
			</form.Subscribe>
		</form>
	)
}

const useSetCurrentAddress = (
	formattedAddress: string | undefined,
	// biome-ignore lint/suspicious/noExplicitAny: form generic
	form: any,
) => {
	useEffect(() => {
		if (formattedAddress) {
			form.setFieldValue('inspectionAddress', formattedAddress)
		}
	}, [formattedAddress, form])
}
