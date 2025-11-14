'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useAddDefectOnRoute } from '@/lib/hooks/mutations/mutations'
import type { Trip } from '@/lib/types/types'
import { schemaAddDefects } from '@/lib/ZOD/schemas'
import { AddDefect } from '../AddDefect'

export default function AddDefectForm({
	tripPromise,
}: {
	tripPromise: Promise<Trip>
}) {
	const {
		control,
		handleSubmit,
		formState: { errors },
	} = useForm<typeof schemaAddDefects._type>({
		resolver: zodResolver(schemaAddDefects),
		defaultValues: {
			defects: '',
			remarks: '',
		},
	})

	const trip = use(tripPromise) // Still need to use 'use' for tripPromise to get trip data

	const tripId = Number(trip.tripid || '')
	const driverEmail = trip.driveremail

	const { mutate, isError, isPending } = useAddDefectOnRoute(
		Number(tripId),
		driverEmail,
	)

	const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
	if (trip?.date && new Date(trip.date) < twentyFourHoursAgo) return null

	const onSubmit = (data: typeof schemaAddDefects._type) => {
		mutate({ driverEmail, tripId, formData: data }) // Pass data directly
		console.log('Submitted', data)
	}

	return (
		<form
			className="flex w-full flex-col gap-4"
			onSubmit={handleSubmit(onSubmit)}
		>
			<AddDefect control={control} />
			{errors.defects && (
				<p className="text-red-500">{errors.defects.message}</p>
			)}
			{errors.remarks && (
				<p className="text-red-500">{errors.remarks.message}</p>
			)}
			{isError && (
				<div className="text-center text-red-600">
					Error Adding Defect
				</div>
			)}
			<div className="flex w-full justify-center">
				<button
					className={`w-full rounded-lg bg-green-500 p-4 hover:bg-green-600 md:w-3/6`}
					disabled={isPending}
					type="submit"
				>
					Add on Route Defects
				</button>
			</div>
		</form>
	)
}
