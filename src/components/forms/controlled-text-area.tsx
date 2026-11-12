'use client'

import type { AnyFormApi } from '@tanstack/react-form'
import { Field, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'

export interface ControlledTextAreaProps {
	// biome-ignore lint/suspicious/noExplicitAny: tanstack form generic
	form: AnyFormApi & { Field: any }
	name: string
	label: string
	placeholder?: string
	readOnly?: boolean
}

export function ControlledTextArea({
	form,
	name,
	label,
	placeholder,
	readOnly = false,
}: ControlledTextAreaProps) {
	const id = `form-textarea-${name}`

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

				return (
					<Field data-invalid={isInvalid}>
						<FieldLabel htmlFor={id}>{label}</FieldLabel>
						<Textarea
							aria-invalid={isInvalid}
							className="min-h-24"
							id={id}
							name={field.name}
							onBlur={() => {
								field.handleBlur()
								// Validate with the same (change) rules on blur so an
								// untouched empty field is flagged when the driver
								// leaves it, without a separate blur error that would
								// linger until the next blur.
								field.validate('change')
							}}
							onChange={(e) => field.handleChange(e.target.value)}
							placeholder={placeholder}
							readOnly={readOnly}
							value={field.state.value ?? ''}
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
