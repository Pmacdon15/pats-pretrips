'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { useKindeBrowserClient } from '@kinde-oss/kinde-auth-nextjs'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type * as z from 'zod'
import { useGetAddress } from '@/lib/hooks/hooks'
import { useAddTrip } from '@/lib/hooks/mutations/mutations'
import { schemaAddTripForm } from '@/lib/ZOD/schemas'
import { AddDefect } from '../add-defect/AddDefect'
import { useGetLocation } from '../trips/add-trip/addTripContainer'
import { ControlledTextArea } from './controlled-text-area'
import { ControlledTextInput } from './controlled-text-input'
//TODO REMOVE THIS EMAIL ITS UNNEEDED
export default function AddTripForm({
	setShowForm,
}: {
	setShowForm: (value: boolean) => void
}) {
	const { user } = useKindeBrowserClient()

	const driverEmail = user?.email

	const { mutate } = useAddTrip({
		onSuccess: () => {
			toast.success('Pre-Trip received', {
				description: 'Your message has been sent to Contractor Chris!',
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
	const { data: addressData } = useGetAddress(
		location?.latitude ?? 0,
		location?.longitude ?? 0,
		driverEmail || '',
	)
	const formattedAddress =
		addressData?.data?.features[0]?.properties?.formatted

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

	function onSubmit(data: z.infer<typeof schemaAddTripForm>) {
		mutate({ data })
	}

	const handleSelectDefect = (defect: string) => {
		form.setValue('defects', `${defect}" ," ${form.getValues().defects}`)
	}

	return (
		<form
			className={'flex w-full flex-col gap-4'}
			id="form-get-a-quote"
			onSubmit={form.handleSubmit(onSubmit)}
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
				<ControlledTextArea
					control={form.control}
					label="Defects"
					name="defects"
					readOnly
				/>
				<ControlledTextArea
					control={form.control}
					label="Remarks"
					name="remarks"
				/>
			</AddDefect>

			<button
				className={`rounded-lg bg-green-500 p-4 shadow-lg hover:bg-green-600`}
				type="submit"
			>
				Submit
			</button>
		</form>
	)
}
