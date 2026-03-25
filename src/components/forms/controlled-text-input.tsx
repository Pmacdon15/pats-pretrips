'use client'

import type { AnyFormApi } from '@tanstack/react-form'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

interface ControlledTextInputProps {
    form: AnyFormApi & { Field: any }
    name: string
    label: string
    placeholder?: string
    type?: 'text' | 'number' | 'password' | 'email'
    defaultValue?: string
    showCopyButton?: boolean
}

export function ControlledTextInput({
    form,
    name,
    label,
    placeholder,
    type = 'text',
    showCopyButton,
}: ControlledTextInputProps) {
    const id = `form-${name}`

    return (
        <FieldGroup>
            <form.Field name={name}>
                {(field: any) => {
                    // FIX: isTouched and errors are siblings in field.state.meta
                    const { errors, isTouched } = field.state.meta
                    const isInvalid = isTouched && errors.length > 0

                    return (
                        <Field data-invalid={isInvalid}>
                            <FieldLabel htmlFor={id}>{label}</FieldLabel>
                            <Input
                                aria-invalid={isInvalid}
                                autoComplete="off"
                                id={id}
                                name={field.name}
                                onBlur={field.handleBlur} // This triggers "isTouched"
                                onChange={(e) => {
                                    const val = e.target.value
                                    field.handleChange(
                                        type === 'number' ? Number(val) : val,
                                    )
                                }}
                                placeholder={placeholder}
                                showCopyButton={showCopyButton}
                                type={type}
                                value={field.state.value ?? ''}
                            />
                            {isInvalid && (
                                <span className="text-[10px] font-medium text-destructive mt-1 block">
                                    {/* Handle both string errors and Zod error objects */}
                                    {typeof errors[0] === 'string' ? errors[0] : errors[0]?.message}
                                </span>
                            )}
                        </Field>
                    )
                }}
            </form.Field>
        </FieldGroup>
    )
}