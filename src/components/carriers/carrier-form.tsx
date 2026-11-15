'use client'

import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useTransition } from 'react'
import { toast } from 'sonner'
import type { z } from 'zod'
import { ControlledTextInput } from '@/components/forms/controlled-text-input'
import { Button } from '@/components/ui/button'
import { addCarrier, updateCarrier } from '@/lib/actions/carriers'
import type { Carrier } from '@/lib/db/carriers'
import { CARRIERS_KEY } from '@/lib/hooks/hooks'
import { ADDRESS_MAX, CARRIER_MAX } from '@/lib/trip-limits'
import { schemaCarrier } from '@/lib/ZOD/schemas'

type CarrierForm = z.infer<typeof schemaCarrier>

/** Adds a carrier, or edits `carrier` when given. */
export function CarrierForm({
	carrier,
	onDone,
}: {
	carrier?: Carrier
	onDone: () => void
}) {
	const queryClient = useQueryClient()
	const [pending, startTransition] = useTransition()

	const form = useForm({
		defaultValues: {
			name: carrier?.name ?? '',
			address: carrier?.address ?? '',
		} as CarrierForm,
		validators: { onChange: schemaCarrier, onSubmit: schemaCarrier },
		onSubmit: ({ value }) =>
			startTransition(async () => {
				const res = carrier
					? await updateCarrier(carrier.id, value)
					: await addCarrier(value)
				if ('errorMessage' in res) {
					toast.error('Could not save the carrier', {
						description: res.errorMessage,
					})
					return
				}
				await queryClient.invalidateQueries({ queryKey: CARRIERS_KEY })
				toast.success(carrier ? 'Carrier updated' : 'Carrier saved')
				form.reset()
				onDone()
			}),
	})

	return (
		<form
			aria-label={carrier ? 'Edit carrier' : 'Add a carrier'}
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
					label="Carrier name"
					maxLength={CARRIER_MAX}
					name="name"
					placeholder="e.g. Acme Freight"
				/>
				<ControlledTextInput
					form={form}
					label="Address"
					maxLength={ADDRESS_MAX}
					name="address"
					placeholder="123 North N St, Calgary AB"
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
						: carrier
							? 'Save changes'
							: 'Save carrier'}
				</Button>
			</div>
		</form>
	)
}
