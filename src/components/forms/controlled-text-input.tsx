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
				// Only surface errors once the driver has left the field (or tried
				// to submit), so a half-typed value isn't flagged mid-keystroke.
				// The form re-validates on every change, so a fixed value clears
				// its error immediately instead of waiting for the next blur.
				const { errors, isBlurred } = field.state.meta
				const hasSubmitted = form.state.submissionAttempts > 0
				const isInvalid =
					(isBlurred || hasSubmitted) && errors.length > 0
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
							onBlur={() => {
								field.handleBlur()
								// Validate with the same (change) rules on blur so an
								// untouched empty field is flagged when the driver
								// leaves it, without a separate blur error that would
								// linger until the next blur.
								field.validate('change')
							}}
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
