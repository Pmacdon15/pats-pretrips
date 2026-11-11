import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ButtonNormal } from '@/components/buttons/normal-button'
import { ButtonToggle } from '@/components/buttons/toggle-button'
import { Disclaimer } from '@/components/disclaimer/disclaimer'
import DisplayTripFallback from '@/components/fallbacks/display-trip-fallback'
import DisplayTripsFallback from '@/components/fallbacks/display-trips-fallback'
import Footer from '@/components/footer/footer'
import Header from '@/components/header/header'
import Input from '@/components/input/Input'
import Message from '@/components/message/Message'

vi.mock('next/navigation', () => ({
	useRouter: () => ({ push: vi.fn() }),
	useSearchParams: () => new URLSearchParams(),
}))

describe('buttons', () => {
	it('ButtonNormal calls onClick', () => {
		const onClick = vi.fn()
		render(<ButtonNormal onClick={onClick} text="Go" />)
		fireEvent.click(screen.getByRole('button', { name: 'Go' }))
		expect(onClick).toHaveBeenCalledOnce()
	})

	it('ButtonToggle swaps its text when toggled', () => {
		const { rerender } = render(
			<ButtonToggle
				onClick={() => {}}
				text="Add"
				toggle={false}
				toggleText="Cancel"
			/>,
		)
		expect(screen.getByRole('button')).toHaveTextContent('Add')
		rerender(
			<ButtonToggle
				onClick={() => {}}
				text="Add"
				toggle
				toggleText="Cancel"
			/>,
		)
		expect(screen.getByRole('button')).toHaveTextContent('Cancel')
	})
})

describe('layout pieces', () => {
	it('Header shows the app name', () => {
		render(<Header />)
		expect(screen.getByRole('heading')).toHaveTextContent("Pat's PreTrips")
	})

	it('Footer links to email and GitHub', () => {
		render(<Footer />)
		expect(
			screen.getByRole('link', { name: 'patrick@patmac.ca' }),
		).toHaveAttribute('href', 'mailto:patrick@patmac.ca')
		expect(screen.getByRole('link', { name: 'pmacdon15' })).toHaveAttribute(
			'target',
			'_blank',
		)
	})

	it('Disclaimer shows its title, text and a home link', () => {
		render(<Disclaimer name="Terms" text="Use at your own risk" />)
		expect(screen.getByRole('heading')).toHaveTextContent('Terms')
		expect(screen.getByText('Use at your own risk')).toBeInTheDocument()
		expect(screen.getByRole('link', { name: 'Go Home' })).toHaveAttribute(
			'href',
			'/',
		)
	})

	it('Message shows a back link only with a driver email', () => {
		const { rerender } = render(<Message message="Nothing here" />)
		expect(screen.getByRole('heading')).toHaveTextContent('Nothing here')
		expect(screen.queryByRole('link')).toBeNull()
		rerender(<Message driverEmail="pat@x.com" message="Nothing here" />)
		expect(screen.getByRole('link')).toHaveAttribute('href', '/pretrips')
	})

	it('Input renders a required text input', () => {
		const { rerender } = render(
			<Input name="carrier" placeHolder="Carrier" required />,
		)
		expect(screen.getByPlaceholderText('Carrier')).toBeRequired()
		rerender(<Input name="carrier" placeHolder="Carrier" />)
		expect(screen.getByPlaceholderText('Carrier')).not.toBeRequired()
	})
})

describe('fallbacks', () => {
	it('show loading rows', () => {
		render(
			<>
				<DisplayTripFallback />
				<DisplayTripsFallback />
			</>,
		)
		expect(screen.getAllByText('Loading....')).toHaveLength(2)
		expect(
			screen.getByRole('heading', { name: 'Current Trips' }),
		).toBeInTheDocument()
	})
})
