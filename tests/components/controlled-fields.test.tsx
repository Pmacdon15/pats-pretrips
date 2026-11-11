import { useForm } from '@tanstack/react-form'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ControlledTextArea } from '@/components/forms/controlled-text-area'
import { ControlledTextInput } from '@/components/forms/controlled-text-input'

// A form whose fields start undefined and fail with a plain string error.
function TestForm() {
	const form = useForm({
		defaultValues: {} as { note?: string; name?: string },
		validators: {
			onBlur: () => ({
				fields: { note: 'Note please', name: 'Name please' },
			}),
		},
	})
	return (
		<>
			<ControlledTextInput form={form} label="Name" name="name" />
			<ControlledTextArea form={form} label="Note" name="note" />
		</>
	)
}

describe('controlled fields', () => {
	it('start empty when the value is undefined', () => {
		render(<TestForm />)
		expect(screen.getByLabelText('Name')).toHaveValue('')
		expect(screen.getByLabelText('Note')).toHaveValue('')
	})

	it('show string errors after blur', async () => {
		const user = userEvent.setup()
		render(<TestForm />)
		await user.click(screen.getByLabelText('Name'))
		await user.click(screen.getByLabelText('Note'))
		await user.tab()
		expect(await screen.findByText('Name please')).toBeInTheDocument()
		expect(screen.getByText('Note please')).toBeInTheDocument()
	})
})
