'use client'
import type { FieldValues } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import type { ControlledTextAreaProps } from '@/lib/types/types'

export function ControlledTextArea<T extends FieldValues>({
	control,
	name,
	label,
	placeholder,
	readOnly = false,
}: ControlledTextAreaProps<T>) {
	const id = `form-get-a-quote-${name}`
	return (
		<FieldGroup>
			<Controller
				control={control}
				name={name}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor={id}>{label}</FieldLabel>
						<Textarea
							{...field}
							aria-invalid={fieldState.invalid}
							autoComplete="off"
							id={id}
							placeholder={placeholder}
							readOnly={readOnly}
						/>
						{fieldState.invalid && (
							<FieldError errors={[fieldState.error]} />
						)}
					</Field>
				)}
			/>
		</FieldGroup>
	)
}
