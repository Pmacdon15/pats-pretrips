import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Disclaimer } from '@/components/disclaimer/disclaimer'
import DisplayTripFallback from '@/components/fallbacks/display-trip-fallback'
import DisplayTripsFallback from '@/components/fallbacks/display-trips-fallback'
import Footer from '@/components/footer/footer'
import { BackLink } from '@/components/links/back-home-button'
import { Badge } from '@/components/ui/badge'

describe('Footer', () => {
	it('links to plans, the legal pages, email and GitHub', () => {
		render(<Footer />)
		const href = (name: string) =>
			screen.getByRole('link', { name }).getAttribute('href')
		expect(href('Plans')).toBe('/#pricing')
		expect(href('Privacy')).toBe('/privacy')
		expect(href('Terms')).toBe('/termsOfService')
		expect(href('Contact')).toBe('mailto:patrick@patmac.ca')
		expect(href('GitHub')).toBe('https://github.com/pmacdon15')
		expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
			'target',
			'_blank',
		)
	})
})

describe('Disclaimer', () => {
	it('shows a trimmed title, collapsed text and a home link', () => {
		render(
			<Disclaimer name="  Terms " text={'Use at\n     your own risk '} />,
		)
		expect(screen.getByRole('heading')).toHaveTextContent(/^Terms$/)
		expect(screen.getByText('Use at your own risk')).toBeInTheDocument()
		expect(screen.getByRole('link', { name: 'Back home' })).toHaveAttribute(
			'href',
			'/',
		)
	})
})

describe('BackLink', () => {
	it('goes back to the trip list', () => {
		render(<BackLink />)
		expect(
			screen.getByRole('link', { name: 'Back to trips' }),
		).toHaveAttribute('href', '/pretrips')
	})
})

describe('Badge', () => {
	it('defaults to the outline variant', () => {
		render(<Badge>New</Badge>)
		expect(screen.getByText('New')).toHaveClass('text-muted-foreground')
	})
})

describe('fallbacks', () => {
	it('the trip list fallback keeps the page title', () => {
		render(<DisplayTripsFallback />)
		expect(
			screen.getByRole('heading', { level: 1, name: 'Your pre-trips' }),
		).toBeInTheDocument()
	})

	it('the trip fallback keeps the back link', () => {
		render(<DisplayTripFallback />)
		expect(
			screen.getByRole('link', { name: 'Back to trips' }),
		).toBeInTheDocument()
	})
})
