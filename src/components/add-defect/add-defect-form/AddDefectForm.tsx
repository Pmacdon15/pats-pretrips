'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { use } from 'react'
import { useForm } from 'react-hook-form'
import type z from 'zod'
import { ControlledTextArea } from '@/components/forms/controlled-text-area'
import { useAddDefectOnRoute } from '@/lib/hooks/mutations/mutations'
import type { Trip } from '@/lib/types/types'
import { schemaAddDefects } from '@/lib/ZOD/schemas'
import { AddDefect } from '../AddDefect'

export default function AddDefectForm({
	tripPromise,
}: {
	tripPromise: Promise<Trip | undefined>
}) {
	const trip = use(tripPromise) // Still need to use 'use' for tripPromise to get trip data

	const tripId = Number(trip?.tripid || '')
	const driverEmail = trip?.driveremail || ''

	const form = useForm<z.infer<typeof schemaAddDefects>>({
		resolver: zodResolver(schemaAddDefects),
		defaultValues: {
			defects: '',
			remarks: '',
		},
	})

	const { mutate, isError, isPending } = useAddDefectOnRoute(Number(tripId))

	const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
	if (trip?.date && new Date(trip.date) < twentyFourHoursAgo) return null

	const handleSelectDefect = (defect: string) => {
		form.setValue('defects', `${defect}, ${form.getValues().defects}`)
	}

	const onSubmit = (data: z.infer<typeof schemaAddDefects>) => {
		mutate({
			driverEmail,
			tripId,
			data,
		})
	}

	return (
		<form
			className="flex w-full flex-col gap-4"
			onSubmit={form.handleSubmit(onSubmit)}
		>
			{' '}
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
