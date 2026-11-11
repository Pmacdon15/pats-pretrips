import { act, fireEvent, render, screen } from '@testing-library/react'
import { Suspense, startTransition } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Pagination } from '@/components/pagination/pagination-buttons'
import { DisplayTripTableBody } from '@/components/trips/display-trip/displayTripTable'
import PageHead from '@/components/trips/display-trip/page-head'
import DisplayTrips from '@/components/trips/display-trips/DisplayTrips'
import TripsTable from '@/components/trips/display-trips/trips-table'
import { trip } from '../helpers/fixtures'

const nav = vi.hoisted(() => ({ push: vi.fn(), search: '' }))
vi.mock('next/navigation', () => ({
	useRouter: () => ({ push: nav.push }),
	useSearchParams: () => new URLSearchParams(nav.search),
}))

// The add-trip form has its own tests; here we only grab the optimistic dispatch.
const form = vi.hoisted(() => ({
	dispatch: undefined as
		| undefined
		| ((action: { type: string; payload: unknown }) => void),
}))
vi.mock('@/components/trips/add-trip/addTripContainer', () => ({
	default: ({
		setOptimisticCurrentTrips,
	}: {
		setOptimisticCurrentTrips: (a: {
			type: string
			payload: unknown
		}) => void
	}) => {
		form.dispatch = setOptimisticCurrentTrips
		return null
	},
}))

beforeEach(() => {
	nav.search = ''
})

describe('TripsTable', () => {
	it('lists trips and opens one when its row is clicked', () => {
		render(
			<TripsTable
				trips={{
					trips: [trip(), trip({ tripid: 2, defects: '' })],
					hasMore: false,
				}}
			/>,
		)
		const rows = screen.getAllByRole('row').slice(1)
		expect(rows[0]).toHaveTextContent('2026-01-02, 3:04 a.m.TRK1TRL1Cab')
		expect(rows[1]).toHaveTextContent('No defects')

		fireEvent.click(rows[1])
		expect(nav.push).toHaveBeenCalledWith('/pretrip/2')
	})
})

describe('Pagination', () => {
	it('starts on page 1 with only a next button when there is more', () => {
		render(<Pagination hasMorePastTrips />)
		expect(screen.getByText('Page 1')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Next Page' })).toBeVisible()
		expect(
			screen.queryByRole('button', { name: 'Previous Page' }),
		).toBeNull()

		fireEvent.click(screen.getByRole('button', { name: 'Next Page' }))
		expect(nav.push).toHaveBeenCalledWith('?page=2')
	})

	it('goes back a page and keeps other params', () => {
		nav.search = 'page=3&x=1'
		render(<Pagination hasMorePastTrips={false} />)

		fireEvent.click(screen.getByRole('button', { name: 'Previous Page' }))
		expect(nav.push).toHaveBeenCalledWith('?page=2&x=1')
		expect(screen.queryByRole('button', { name: 'Next Page' })).toBeNull()
	})
})

describe('DisplayTripTableBody', () => {
	it('shows every field of the trip', () => {
		render(
			<table>
				<DisplayTripTableBody trip={trip()} />
			</table>,
		)
		for (const text of [
			'Acme',
			'1 Main St',
			'123 North St',
			'TRK1',
			'TRL2',
			'VNL',
			'1000',
			'Cracked',
			'2026-01-02, 3:04 a.m.',
		]) {
			expect(screen.getByText(text)).toBeInTheDocument()
		}
	})

	it('renders nothing without a trip', () => {
		const { container } = render(
			<table>
				<DisplayTripTableBody trip={undefined} />
			</table>,
		)
		expect(container.querySelector('tbody')).toBeNull()
	})
})

describe('PageHead', () => {
	it("shows the driver's name and email", async () => {
		await act(async () => {
			render(
				<Suspense>
					<PageHead
						userPromise={Promise.resolve({
							given_name: 'Pat',
							email: 'pat@x.com',
						} as never)}
					/>
				</Suspense>,
			)
		})
		expect(screen.getByText(/Driver Name: Pat/)).toHaveTextContent(
			'Driver Email: pat@x.com',
		)
	})

	it('renders blanks without a user', () => {
		render(<PageHead />)
		expect(screen.getByText(/Driver Name:/)).toBeInTheDocument()
	})
})

describe('DisplayTrips', () => {
	const renderTrips = async () => {
		await act(async () => {
			render(
				<Suspense>
					<DisplayTrips
						currentTripsPromise={Promise.resolve({
							trips: [trip({ truckplate: 'NOW' })],
							hasMore: false,
						})}
						pastTripsPromise={Promise.resolve({
							trips: [trip({ truckplate: 'OLD' })],
							hasMore: true,
						})}
					/>
				</Suspense>,
			)
		})
	}

	it('switches between current and past trips', async () => {
		await renderTrips()
		expect(screen.getByRole('heading')).toHaveTextContent('Current Trips')
		expect(screen.getByText('NOW')).toBeVisible()
		expect(screen.getByText('OLD')).not.toBeVisible()

		fireEvent.click(screen.getByRole('button', { name: 'View Past Trips' }))
		expect(screen.getByRole('heading')).toHaveTextContent('Past Trips')
		expect(screen.getByText('OLD')).toBeVisible()

		fireEvent.click(
			screen.getByRole('button', { name: 'View Current Trips' }),
		)
		expect(screen.getByText('NOW')).toBeVisible()
	})

	// The list updates optimistically while the server action runs.
	const whilePending = async (
		action: { type: string; payload: unknown },
		check: () => void,
	) => {
		let finish = () => {}
		await act(async () => {
			// Start the transition after act's own synchronous batch.
			await Promise.resolve()
			startTransition(async () => {
				form.dispatch?.(action)
				await new Promise<void>((r) => {
					finish = r
				})
			})
		})
		check()
		await act(async () => finish())
	}

	it('shows an added trip straight away', async () => {
		await renderTrips()
		await whilePending(
			{ type: 'ADD', payload: trip({ tripid: 9, truckplate: 'NEW' }) },
			() => expect(screen.getByText('NEW')).toBeInTheDocument(),
		)
		expect(screen.queryByText('NEW')).toBeNull()
	})

	it('can remove or update a current trip optimistically', async () => {
		await renderTrips()
		await whilePending({ type: 'REMOVE', payload: 1 }, () =>
			expect(screen.queryByText('NOW')).toBeNull(),
		)
		await whilePending(
			{ type: 'UPDATE', payload: { tripid: 1, truckplate: 'EDIT' } },
			() => expect(screen.getByText('EDIT')).toBeInTheDocument(),
		)
		await whilePending(
			{ type: 'UPDATE', payload: { tripid: 5, truckplate: 'NOPE' } },
			() => expect(screen.getByText('NOW')).toBeInTheDocument(),
		)
		await whilePending({ type: 'UNKNOWN', payload: null }, () =>
			expect(screen.getByText('NOW')).toBeInTheDocument(),
		)
	})
})
