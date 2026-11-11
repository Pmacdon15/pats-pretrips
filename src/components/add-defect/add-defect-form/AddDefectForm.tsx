'use client'

import { useForm } from '@tanstack/react-form'
import type { z } from 'zod'
import { ControlledTextArea } from '@/components/forms/controlled-text-area'
import { Button } from '@/components/ui/button'
import { useAddDefectOnRoute } from '@/lib/mutations/mutations'
import type { Trip } from '@/lib/types/types'
import { joinDefects, parseDefects } from '@/lib/utils-defects'
import { schemaAddDefects } from '@/lib/ZOD/schemas'
import { DefectPicker } from '../defect-picker'

interface AddDefectFormProps {
	trip: Trip
	updateOptimisticTrip: (action: Trip) => void
}

export function AddDefectForm({
	trip,
	updateOptimisticTrip,
}: AddDefectFormProps) {
	const { mutate } = useAddDefectOnRoute()
	const existingDefects = parseDefects(trip.defects)

	const form = useForm({
		defaultValues: {
			defects: '',
			remarks: '',
			trip_id: Number(trip.tripid ?? 0),
		} as z.infer<typeof schemaAddDefects>,
		validators: {
			onSubmit: schemaAddDefects,
		},
		onSubmit: async ({ value }) => {
			updateOptimisticTrip({
				...trip,
				defects: joinDefects([
					...existingDefects,
					...parseDefects(value.defects),
				]),
				remarks: [trip.remarks, value.remarks]
					.filter(Boolean)
					.join(', '),
			})
			mutate({ data: value })
			form.reset()
		},
	})

	return (
		<form
			className="flex flex-col gap-6"
			noValidate
			onSubmit={(e) => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			<form.Field name="defects">
				{(field) => (
					<div className="flex flex-col gap-1.5">
						<DefectPicker
							disabledOptions={existingDefects}
							onChange={(v) => field.handleChange(v)}
							value={field.state.value}
						/>
						{field.state.meta.errors.length > 0 && (
							<span className="font-medium text-destructive text-xs">
								Select at least one defect.
							</span>
						)}
					</div>
				)}
			</form.Field>

			<ControlledTextArea
				form={form}
				label="Remarks"
				name="remarks"
				placeholder="Where and when did you notice it?"
			/>

			<form.Subscribe selector={(state) => state.isSubmitting}>
				{(isSubmitting) => (
					<Button
						className="h-11 self-stretch px-8 sm:self-end"
						disabled={isSubmitting}
						type="submit"
					>
						{isSubmitting ? 'Saving…' : 'Add on-route defects'}
					</Button>
				)}
			</form.Subscribe>
		</form>
	)
}
