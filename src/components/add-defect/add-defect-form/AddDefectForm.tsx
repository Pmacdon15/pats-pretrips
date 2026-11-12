'use client'

import { useForm } from '@tanstack/react-form'
import { startTransition } from 'react'
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
	const { mutateAsync } = useAddDefectOnRoute()
	const existingDefects = parseDefects(trip.defects)

	const form = useForm({
		defaultValues: {
			defects: '',
			remarks: '',
			trip_id: Number(trip.tripid ?? 0),
		} as z.infer<typeof schemaAddDefects>,
		validators: {
			onChange: schemaAddDefects,
			onSubmit: schemaAddDefects,
		},
		onSubmit: async ({ value }) => {
			// Keep the transition open until the save finishes so the optimistic
			// defects stay visible. Errors are already reported by a toast.
			startTransition(async () => {
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
				await mutateAsync({ data: value }).catch(() => {})
			})
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
						{form.state.submissionAttempts > 0 &&
							field.state.meta.errors.length > 0 && (
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
