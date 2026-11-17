'use client'

import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useTransition } from 'react'
import { toast } from 'sonner'
import type { z } from 'zod'
import { ControlledTextInput } from '@/components/forms/controlled-text-input'
import { Button } from '@/components/ui/button'
import { addTrailer, updateTrailer } from '@/lib/actions/trailers'
import type { Trailer } from '@/lib/db/trailers'
import { TRAILERS_KEY } from '@/lib/hooks/hooks'
import { PLATE_MAX, TRAILER_NAME_MAX } from '@/lib/trip-limits'
import { schemaTrailer } from '@/lib/ZOD/schemas'

type TrailerForm = z.infer<typeof schemaTrailer>

/** Adds a trailer, or edits `trailer` when given: a name and a plate. */
export function TrailerForm({
	trailer,
	onDone,
}: {
	trailer?: Trailer
	onDone: () => void
}) {
	const queryClient = useQueryClient()
	const [pending, startTransition] = useTransition()

	const form = useForm({
		defaultValues: {
			name: trailer?.name ?? '',
			plate: trailer?.plate ?? '',
		} as TrailerForm,
		validators: { onChange: schemaTrailer, onSubmit: schemaTrailer },
		onSubmit: ({ value }) =>
			startTransition(async () => {
				const res = trailer
					? await updateTrailer(trailer.id, value)
					: await addTrailer(value)
				if ('errorMessage' in res) {
					toast.error('Could not save the trailer', {
						description: res.errorMessage,
					})
					return
				}
				await queryClient.invalidateQueries({ queryKey: TRAILERS_KEY })
				toast.success(trailer ? 'Trailer updated' : 'Trailer saved')
				form.reset()
				onDone()
			}),
	})

	return (
		<form
			aria-label={trailer ? 'Edit trailer' : 'Add a trailer'}
			className="flex flex-col gap-4"
			noValidate
			onSubmit={(e) => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<ControlledTextInput
					form={form}
					label="Trailer name"
					maxLength={TRAILER_NAME_MAX}
					name="name"
					optional
					placeholder="e.g. 53' dry van"
				/>
				<ControlledTextInput
					autoCapitalize="characters"
					form={form}
					label="Plate"
					maxLength={PLATE_MAX}
					name="plate"
				/>
			</div>
			<div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
				<Button
					onClick={() => {
						form.reset()
						onDone()
					}}
					type="button"
					variant="outline"
				>
					Cancel
				</Button>
				<Button disabled={pending} type="submit">
					{pending
						? 'Saving…'
						: trailer
							? 'Save changes'
							: 'Save trailer'}
				</Button>
			</div>
		</form>
	)
}
