import { act, render, screen } from '@testing-library/react'
import { Suspense, use } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	fetchCurrentTrips: vi.fn(),
	fetchPastTrips: vi.fn(),
	fetchTrip: vi.fn(),
	getUser: vi.fn(),
	isAuthenticated: vi.fn(),
}))

vi.mock('@/lib/DAL/trips', () => ({
	fetchCurrentTrips: mocks.fetchCurrentTrips,
	fetchPastTrips: mocks.fetchPastTrips,
	fetchTrip: mocks.fetchTrip,
}))
vi.mock('@kinde-oss/kinde-auth-nextjs/server', () => ({
	getKindeServerSession: () => ({
		getUser: mocks.getUser,
		isAuthenticated: mocks.isAuthenticated,
	}),
}))
vi.mock('next/image', () => ({
	default: ({ alt, src }: { alt: string; src: string }) => (
		// biome-ignore lint/performance/noImgElement: test stand-in for next/image
		<img alt={alt} src={src} />
	),
}))
vi.mock('next/font/google', () => ({
	Geist: () => ({ variable: 'geist' }),
	Geist_Mono: () => ({ variable: 'geist-mono' }),
}))
vi.mock('@vercel/analytics/next', () => ({ Analytics: () => null }))
vi.mock('@/components/providers/auth-provider', () => ({
	AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Children that consume a promise: render what it resolved to.
const Show = ({ label, value }: { label: string; value: Promise<unknown> }) => (
	<pre data-testid={label}>{JSON.stringify(use(value))}</pre>
)
vi.mock('@/components/trips/display-trips/DisplayTrips', () => ({
	default: (p: Record<string, Promise<unknown>>) => (
		<>
			<Show label="current" value={p.currentTripsPromise} />
			<Show label="past" value={p.pastTripsPromise} />
		</>
	),
}))
vi.mock('@/components/trips/display-trip/DisplayTrip', () => ({
	default: (p: Record<string, Promise<unknown>>) => (
		<>
			<Show label="trip" value={p.tripPromise} />
			<Show label="user" value={p.userPromise} />
		</>
	),
}))
vi.mock('@/components/home/home-page-buttons', () => ({
	default: (p: { isLoggedInPromise: Promise<boolean> }) => (
		<Show label="logged-in" value={p.isLoggedInPromise} />
	),
}))

import RootLayout, { metadata } from '@/app/layout'
import Home from '@/app/page'
import TripPage from '@/app/pretrip/[tripId]/page'
import TripsPage from '@/app/pretrips/page'
import Privacy from '@/app/privacy/page'
import Terms from '@/app/termsOfService/page'

beforeEach(() => {
	mocks.fetchCurrentTrips.mockResolvedValue({
		trips: ['now'],
		hasMore: false,
	})
	mocks.fetchPastTrips.mockResolvedValue({ trips: ['old'], hasMore: true })
	mocks.fetchTrip.mockResolvedValue({ tripid: 4 })
	mocks.getUser.mockResolvedValue({ email: 'pat@x.com' })
	mocks.isAuthenticated.mockResolvedValue(true)
})

const renderAsync = async (ui: React.ReactNode) => {
	await act(async () => {
		render(<Suspense>{ui}</Suspense>)
	})
}

describe('/pretrips', () => {
	it('loads the requested page of current and past trips', async () => {
		await renderAsync(
			<TripsPage
				params={Promise.resolve({})}
				searchParams={Promise.resolve({ page: '3' })}
			/>,
		)
		expect(screen.getByTestId('current')).toHaveTextContent('now')
		expect(screen.getByTestId('past')).toHaveTextContent('old')
		expect(mocks.fetchCurrentTrips).toHaveBeenCalledWith(3)
		expect(mocks.fetchPastTrips).toHaveBeenCalledWith(3)
	})

	it('defaults to page 1', async () => {
		await renderAsync(
			<TripsPage
				params={Promise.resolve({})}
				searchParams={Promise.resolve({ page: 'x' })}
			/>,
		)
		expect(mocks.fetchCurrentTrips).toHaveBeenCalledWith(1)
		expect(mocks.fetchPastTrips).toHaveBeenCalledWith(1)
	})
})

describe('/pretrip/[tripId]', () => {
	it('loads the trip and the driver', async () => {
		await renderAsync(
			<TripPage
				params={Promise.resolve({ tripId: '4' })}
				searchParams={Promise.resolve({})}
			/>,
		)
		expect(mocks.fetchTrip).toHaveBeenCalledWith(4)
		expect(screen.getByTestId('trip')).toHaveTextContent('"tripid":4')
		expect(screen.getByTestId('user')).toHaveTextContent('pat@x.com')
	})
})

describe('/', () => {
	it('passes the sign-in state to the buttons and links the legal pages', async () => {
		await renderAsync(<Home />)
		expect(screen.getByTestId('logged-in')).toHaveTextContent('true')
		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
			'Streamline Your Pre-Trips',
		)
		expect(
			screen.getByRole('link', { name: 'Terms of Service' }),
		).toHaveAttribute('href', '/termsOfService')
		expect(
			screen.getByRole('link', { name: 'Privacy Policy' }),
		).toHaveAttribute('href', '/privacy')
		expect(
			screen.getByRole('link', { name: /Start Pre-Tripping Now/ }),
		).toHaveAttribute('href', '/api/auth/login')
	})
})

describe('legal pages', () => {
	it.each([
		[
			'privacy',
			Privacy,
			'Privacy policy',
			/only collect and store your email/,
		],
		['terms', Terms, 'Terms of Service', /at your own risk/],
	])('%s', (_name, Page, title, text) => {
		render(<Page />)
		expect(screen.getByRole('heading')).toHaveTextContent(title)
		expect(screen.getByText(text)).toBeInTheDocument()
	})
})

describe('RootLayout', () => {
	it('wraps the page in the header, footer and providers', () => {
		const html = renderToStaticMarkup(
			<RootLayout>
				<p>page body</p>
			</RootLayout>,
		)
		expect(html).toContain('<html lang="en">')
		expect(html).toContain('geist geist-mono')
		expect(html).toContain(
			'<main class="flex-grow"><p>page body</p></main>',
		)
		expect(html).toContain('patrick@patmac.ca')
		expect(metadata.title).toBe("Pat's PreTrips")
	})
})
