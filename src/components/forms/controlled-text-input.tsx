'use client'

import type { AnyFormApi } from '@tanstack/react-form'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

interface ControlledTextInputProps {
	// biome-ignore lint/suspicious/noExplicitAny: tanstack form generic
	form: AnyFormApi & { Field: any }
	name: string
	label: string
	placeholder?: string
	type?: 'text' | 'number' | 'password' | 'email'
	showCopyButton?: boolean
	optional?: boolean
	autoCapitalize?: 'characters' | 'words' | 'sentences' | 'none'
}

export function ControlledTextInput({
	form,
	name,
	label,
	placeholder,
	type = 'text',
	showCopyButton,
	optional,
	autoCapitalize,
}: ControlledTextInputProps) {
	const id = `form-${name}`

	return (
		<form.Field name={name}>
			{/* biome-ignore lint/suspicious/noExplicitAny: tanstack field */}
			{(field: any) => {
				const { errors, isTouched } = field.state.meta
				const isInvalid = isTouched && errors.length > 0
				const raw = field.state.value
				const value =
					type === 'number' && (raw === 0 || raw === undefined)
						? ''
						: (raw ?? '')

				return (
					<Field data-invalid={isInvalid}>
						<FieldLabel htmlFor={id}>
							{label}
							{optional && (
								<span className="font-normal text-muted-foreground">
									(optional)
								</span>
							)}
						</FieldLabel>
						<Input
							aria-invalid={isInvalid}
							autoCapitalize={autoCapitalize}
							autoComplete="off"
							id={id}
							inputMode={
								type === 'number' ? 'numeric' : undefined
							}
							name={field.name}
							onBlur={field.handleBlur}
							onChange={(e) => {
								const val = e.target.value
								field.handleChange(
									type === 'number' ? Number(val) : val,
								)
							}}
							placeholder={placeholder}
							showCopyButton={showCopyButton}
							type={type}
							value={value}
						/>
						{isInvalid && (
							<span className="font-medium text-destructive text-xs">
								{typeof errors[0] === 'string'
									? errors[0]
									: errors[0]?.message}
							</span>
						)}
					</Field>
				)
			}}
		</form.Field>
	)
}
