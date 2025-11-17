'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { CircleX } from 'lucide-react'
import { Activity, useEffect, useState } from 'react'
import { type UseFormReturn, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type * as z from 'zod'
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
	const { mutate } = useAddTrip({
		onSuccess: () => {
			toast.success('Pre-Trip received', {
				description: 'Your trip has been sent to our servers!',
			})
			form.reset()
			setShowForm(false)
		},
		onError: (error) => {
			toast.error('Error Sending Trip', {
				description:
					error instanceof Error
						? error.message
						: 'An error occurred while uploading your trip.',
			})
		},
	})
	const { location } = useGetLocation()
	console.log('Location in AddTripForm:', location)
	const { data: addressData } = useGetAddress(
		location?.latitude ?? 0,
		location?.longitude ?? 0,
	)
	console.log('AddressData in AddTripForm:', addressData)
	const formattedAddress =
		addressData?.data?.features[0]?.properties?.formatted
	console.log('FormattedAddress in AddTripForm:', formattedAddress)

	const form = useForm<z.infer<typeof schemaAddTripForm>>({
		resolver: zodResolver(schemaAddTripForm),
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
		},
	})

	useSetCurrentAddress(formattedAddress, form)

	function onSubmit(data: z.infer<typeof schemaAddTripForm>) {
		mutate({ data })
	}

	const [defects, setDefects] = useState('')
	const handleSelectDefect = (defect: string) => {
		if (defect !== '') {
			form.setValue('defects', `${defect}, ${form.getValues().defects}`)
			setDefects(`${defect}, ${form.getValues().defects}`)
		}
	}

	return (
		<form
			className={'flex w-full flex-col gap-4'}
			id="form"
			onSubmit={(e) => {
				e.preventDefault()
				form.handleSubmit(onSubmit)(e)
			}}
		>
			<h1 className="text-2xl">Create a Trip</h1>
			<div className="flex w-full flex-col gap-4">
				<ControlledTextInput
					control={form.control}
					label="Carrier"
					name="carrier"
					placeholder="Company Name"
				/>
				<ControlledTextInput
					control={form.control}
					label="Carrier Address"
					name="carrierAddress"
					placeholder="123 North N St Calgary Ab"
				/>
				<ControlledTextInput
					control={form.control}
					label="Inspection Address"
					name="inspectionAddress"
					placeholder="123 North N St Calgary Ab"
					showCopyButton={true}
				/>
			</div>
			<div className="flex w-full gap-4">
				<ControlledTextInput
					control={form.control}
					label="Make"
					name="make"
					placeholder="Make of vehicle"
				/>
				<ControlledTextInput
					control={form.control}
					label="Model"
					name="model"
					placeholder="Model of vehicle"
				/>
				<ControlledTextInput
					control={form.control}
					label="Odometer"
					name="odometer"
					type="number"
				/>
			</div>
			<div className="flex w-full gap-4">
				<ControlledTextInput
					control={form.control}
					label="Truck Plate"
					name="truckPlate"
				/>
				<ControlledTextInput
					control={form.control}
					label="Trailer Plate"
					name="trailerPlateA"
				/>
				<ControlledTextInput
					control={form.control}
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
								form.setValue('defects', '')
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
						control={form.control}
						label="Defects"
						name="defects"
						readOnly
					/>
				</div>

				<ControlledTextArea
					control={form.control}
					label="Remarks"
					name="remarks"
				/>
			</AddDefect>

			<Button
				className={`rounded-lg bg-green-500 p-4 shadow-lg hover:bg-green-600`}
				size={'lg'}
				type="submit"
				// variant={'outline'}
			>
				Submit
			</Button>
		</form>
	)
}

const useSetCurrentAddress = (
	formattedAddress: string | undefined,
	form: UseFormReturn<z.infer<typeof schemaAddTripForm>>,
) => {
	useEffect(() => {
		if (formattedAddress) {
			form.setValue('inspectionAddress', formattedAddress)
		}
	}, [formattedAddress, form])
}
