import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '@/components/ui/button'
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLegend,
	FieldSeparator,
	FieldSet,
	FieldTitle,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Toaster } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'

describe('Button', () => {
	it('renders a button, or its child with asChild', () => {
		render(
			<>
				<Button>Save</Button>
				<Button asChild variant="link">
					<a href="/x">Go</a>
				</Button>
			</>,
		)
		expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
			'data-slot',
			'button',
		)
		expect(screen.getByRole('link', { name: 'Go' })).toHaveAttribute(
			'href',
			'/x',
		)
	})
})

describe('Input', () => {
	it('copies its value and shows a check for two seconds', async () => {
		vi.useFakeTimers()
		const writeText = vi.fn()
		vi.stubGlobal('navigator', { clipboard: { writeText } })
		render(<Input onChange={() => {}} showCopyButton value="1 Main St" />)

		fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
		expect(writeText).toHaveBeenCalledWith('1 Main St')
		expect(document.querySelector('.lucide-check')).not.toBeNull()

		await act(() => vi.advanceTimersByTimeAsync(2000))
		expect(document.querySelector('.lucide-copy')).not.toBeNull()
		vi.unstubAllGlobals()
	})

	it('does not copy a non-string value', () => {
		const writeText = vi.fn()
		vi.stubGlobal('navigator', { clipboard: { writeText } })
		render(
			<Input
				onChange={() => {}}
				showCopyButton
				type="number"
				value={5}
			/>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
		expect(writeText).not.toHaveBeenCalled()
		vi.unstubAllGlobals()
	})

	it('hides the copy button when empty', () => {
		render(<Input onChange={() => {}} showCopyButton value="" />)
		expect(screen.queryByRole('button')).toBeNull()
	})
})

describe('Field parts', () => {
	it('render with their slots', () => {
		render(
			<FieldSet>
				<FieldLegend>Legend</FieldLegend>
				<Field orientation="horizontal">
					<FieldContent>
						<FieldTitle>Title</FieldTitle>
						<FieldDescription>Help</FieldDescription>
					</FieldContent>
				</Field>
				<FieldSeparator>or</FieldSeparator>
				<FieldSeparator />
				<Separator orientation="vertical" />
			</FieldSet>,
		)
		expect(screen.getByText('Legend')).toHaveAttribute(
			'data-variant',
			'legend',
		)
		expect(document.querySelector('[data-slot=field]')).toHaveAttribute(
			'data-orientation',
			'horizontal',
		)
		expect(screen.getByText('or')).toHaveAttribute(
			'data-slot',
			'field-separator-content',
		)
	})

	it('FieldError shows children, one error, or a list of unique errors', () => {
		const { rerender } = render(<FieldError>Custom</FieldError>)
		expect(screen.getByRole('alert')).toHaveTextContent('Custom')

		rerender(<FieldError errors={[{ message: 'A' }, { message: 'A' }]} />)
		expect(screen.getByRole('alert')).toHaveTextContent('A')
		expect(screen.queryByRole('listitem')).toBeNull()

		rerender(
			<FieldError
				errors={[{ message: 'A' }, { message: 'B' }, undefined]}
			/>,
		)
		expect(
			screen.getAllByRole('listitem').map((li) => li.textContent),
		).toEqual(['A', 'B'])

		rerender(<FieldError errors={[]} />)
		expect(screen.queryByRole('alert')).toBeNull()

		rerender(<FieldError />)
		expect(screen.queryByRole('alert')).toBeNull()
	})
})

describe('Textarea and Toaster', () => {
	it('render', () => {
		render(
			<>
				<Textarea aria-label="Notes" />
				<Toaster />
			</>,
		)
		expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveAttribute(
			'data-slot',
			'textarea',
		)
		expect(document.querySelector('section[aria-label]')).not.toBeNull()
	})
})

describe('Select', () => {
	it('renders groups, labels and separators when open', () => {
		render(
			<Select defaultOpen>
				<SelectTrigger aria-label="Pick" size="sm">
					<SelectValue placeholder="Pick one" />
				</SelectTrigger>
				<SelectContent position="item-aligned">
					<SelectGroup>
						<SelectLabel>Brakes</SelectLabel>
						<SelectItem value="air">Air</SelectItem>
					</SelectGroup>
					<SelectSeparator />
				</SelectContent>
			</Select>,
		)
		expect(screen.getByRole('group')).toHaveAttribute(
			'data-slot',
			'select-group',
		)
		expect(screen.getByText('Brakes')).toHaveAttribute(
			'data-slot',
			'select-label',
		)
		expect(
			document.querySelector('[data-slot=select-separator]'),
		).not.toBeNull()
		expect(screen.getByRole('option', { name: 'Air' })).toBeInTheDocument()
	})
})

describe('FieldGroup and popper Select', () => {
	it('render', () => {
		render(
			<FieldGroup>
				<Select defaultOpen>
					<SelectTrigger aria-label="Pick">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="a">A</SelectItem>
					</SelectContent>
				</Select>
			</FieldGroup>,
		)
		expect(document.querySelector('[data-slot=field-group]')).not.toBeNull()
		expect(screen.getByRole('listbox')).toHaveAttribute('data-side')
	})
})
