'use client'

import { useForm } from '@tanstack/react-form'
import { CircleX } from 'lucide-react'
import { Activity, useState } from 'react'
import type { z } from 'zod'
import { ControlledTextArea } from '@/components/forms/controlled-text-area'
import { Button } from '@/components/ui/button'
import { useAddDefectOnRoute } from '@/lib/mutations/mutations'
import type { Trip } from '@/lib/types/types'
import { schemaAddDefects } from '@/lib/ZOD/schemas'
import { AddDefect } from '../AddDefect'

interface AddDefectFormProps {
	trip: Trip | undefined
	updateOptimisticTrip: (action: Trip) => void
}

export function AddDefectForm({
	trip,
	updateOptimisticTrip,
}: AddDefectFormProps) {
	const tripId = Number(trip?.tripid || '')

	const { mutate } = useAddDefectOnRoute()

	const form = useForm({
		defaultValues: {
			defects: '',
			remarks: '',
			trip_id: tripId,
		} as z.infer<typeof schemaAddDefects>,
		validators: {
			onBlur: schemaAddDefects,
			onSubmit: schemaAddDefects,
		},
		onSubmit: async ({ value }) => {
			if (!trip) return

			const updatedTrip = {
				...trip,
				defects: [trip.defects, value.defects]
					.filter(Boolean)
					.join(', '),
				remarks: [trip.remarks, value.remarks]
					.filter(Boolean)
					.join(', '),
			}
			updateOptimisticTrip(updatedTrip)
			mutate({ data: value })
		},
	})

	const [defects, setDefects] = useState('')

	const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
	if (trip?.date && new Date(trip.date) < twentyFourHoursAgo) return null

	const handleSelectDefect = (defect: string) => {
		if (defect !== '') {
			const currentDefects = form.getFieldValue('defects')
			const defectsArray = currentDefects
				? currentDefects.split(',').map((d) => d.trim())
				: []
			if (!defectsArray.includes(defect)) {
				const newDefects = [...defectsArray, defect].join(', ')
				form.setFieldValue('defects', newDefects)
				setDefects(newDefects)
			}
		}
	}

	return (
		<form
			className="flex w-full flex-col gap-4"
			onSubmit={(e) => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			<h1 className="text-2xl">Add On Route Defects</h1>
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
				{([isSubmitting]) => (
					<Button
						className="rounded-lg bg-green-500 p-4 shadow-lg hover:bg-green-600"
						disabled={isSubmitting}
						size={'lg'}
						type="submit"
					>
						{isSubmitting ? '...' : 'Add on Route Defects'}
					</Button>
				)}
			</form.Subscribe>
		</form>
	)
}
