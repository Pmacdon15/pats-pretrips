'use client'

import type { Control, FieldValues, Path } from 'react-hook-form'
import { Controller } from 'react-hook-form'

import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'

interface ControlledTextInputProps<T extends FieldValues> {
	control: Control<T>
	name: Path<T>
	label: string
	placeholder?: string
	type?: 'number'
}

export function ControlledTextInput<T extends FieldValues>({
	control,
	name,
	label,
	placeholder,
	type,
}: ControlledTextInputProps<T>) {
	const id = `form-get-a-quote-${name}`
	return (
		<FieldGroup>
			<Controller
				control={control}
				name={name}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor={id}>{label}</FieldLabel>
						<Input
							{...field}
							aria-invalid={fieldState.invalid}
							autoComplete="off"
							id={id}
							onChange={(e) => {
								if (type === 'number') {
									field.onChange(Number(e.target.value))
								} else {
									field.onChange(e.target.value)
								}
							}}
							placeholder={placeholder}
							type={type}
							value={
								type === 'number' && field.value === 0
									? ''
									: field.value
							}
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
