'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { CircleX } from 'lucide-react'
import { Activity, use, useState } from 'react'
import { useForm } from 'react-hook-form'
import type z from 'zod'
import { ControlledTextArea } from '@/components/forms/controlled-text-area'
import { Button } from '@/components/ui/button'
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

	const [defects, setDefects] = useState('')

	const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
	if (trip?.date && new Date(trip.date) < twentyFourHoursAgo) return null

	const handleSelectDefect = (defect: string) => {
		if (defect !== '') {
			form.setValue('defects', `${defect}, ${form.getValues().defects}`)
			setDefects(`${defect}, ${form.getValues().defects}`)
		}
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
			{isError && (
				<div className="text-center text-red-600">
					Error Adding Defect
				</div>
			)}
			<div className="flex w-full justify-center">
				<Button
					className={`rounded-lg bg-green-500 p-4 hover:bg-green-600`}
					disabled={isPending}
					size={'lg'}
					type="submit"
					variant={'outline'}
				>
					Add on Route Defects
				</Button>
			</div>
		</form>
	)
}
