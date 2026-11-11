import { act, fireEvent, render, screen } from '@testing-library/react'
import { Suspense, startTransition } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Pagination } from '@/components/pagination/pagination-buttons'
import {
	TripDefects,
	TripDetails,
} from '@/components/trips/display-trip/displayTripTable'
import PageHead from '@/components/trips/display-trip/page-head'
import DisplayTrips from '@/components/trips/display-trips/DisplayTrips'
import TripsTable from '@/components/trips/display-trips/trips-table'
import { TripDate } from '@/components/trips/trip-date'
import type { TripsAction } from '@/lib/types/types'
import { trip } from '../helpers/fixtures'

const nav = vi.hoisted(() => ({ push: vi.fn(), search: '' }))
vi.mock('next/navigation', () => ({
	useRouter: () => ({ push: nav.push }),
	useSearchParams: () => new URLSearchParams(nav.search),
}))

// The add-trip form has its own tests; here we only grab the optimistic dispatch.
const form = vi.hoisted(() => ({
	dispatch: undefined as undefined | ((action: TripsAction) => void),
}))
vi.mock('@/components/trips/add-trip/addTripContainer', () => ({
	default: ({
		setOptimisticCurrentTrips,
	}: {
		setOptimisticCurrentTrips: (action: TripsAction) => void
	}) => {
		form.dispatch = setOptimisticCurrentTrips
		return null
	},
}))

beforeEach(() => {
	nav.search = ''
})

describe('TripDate', () => {
	it('formats the date in the browser', () => {
		render(<TripDate date="2026-01-02T03:04:00Z" />)
		const time = screen.getByText('Jan 2, 2026, 3:04 a.m.')
		expect(time).toHaveAttribute('datetime', '2026-01-02T03:04:00.000Z')
	})

	it('renders only a placeholder on the server', () => {
		const html = renderToStaticMarkup(
			<TripDate date="2026-01-02T03:04:00Z" />,
		)
		expect(html).toContain('dateTime="2026-01-02T03:04:00.000Z"')
		expect(html).not.toContain('2026, 3:04')
	})
})

describe('TripsTable', () => {
	it('links each saved trip and summarises its defects', () => {
		render(
			<TripsTable
				emptyMessage="None"
				pageParam="page"
				trips={{
					trips: [
						trip(),
						trip({
							tripid: 2,
							defects: 'Cab, Horn',
							trailerplateb: '',
						}),
						trip({ tripid: 3, defects: '', make: '', model: '' }),
					],
					hasMore: false,
				}}
			/>,
		)
		const [one, two, three] = screen.getAllByRole('link')
		expect(one).toHaveAttribute('href', '/pretrip/1')
		expect(one).toHaveTextContent('1 defect')
		expect(one).toHaveTextContent('Acme — Volvo VNL — TRK1 · TRL1 · TRL2')
		expect(two).toHaveTextContent('2 defects')
		expect(two).toHaveTextContent('Cab, Horn')
		expect(three).toHaveTextContent('No defects')
		expect(three).toHaveTextContent('Acme — TRK1 · TRL1 · TRL2')
	})

	it.each([
		['pending', { pending: true }],
		['unsaved (negative id)', { tripid: -5 }],
		['id-less', { tripid: undefined }],
	])('does not link a %s trip', (_label, over) => {
		render(
			<TripsTable
				emptyMessage="None"
				pageParam="page"
				trips={{ trips: [trip(over)], hasMore: false }}
			/>,
		)
		expect(screen.queryByRole('link')).toBeNull()
		expect(document.querySelector('[aria-busy=true]')).not.toBeNull()
	})

	it('shows the empty message', () => {
		render(
			<TripsTable
				emptyMessage="No past trips yet."
				pageParam="page"
				trips={{ trips: [], hasMore: false }}
			/>,
		)
		expect(screen.getByText('No past trips yet.')).toBeInTheDocument()
	})
})

describe('Pagination', () => {
	it('is hidden when everything fits on page 1', () => {
		const { container } = render(
			<Pagination hasMore={false} param="page" />,
		)
		expect(container).toBeEmptyDOMElement()
	})

	it('moves to the next page without scrolling', () => {
		render(<Pagination hasMore param="page" />)
		expect(screen.getByText('Page 1')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

		fireEvent.click(screen.getByRole('button', { name: 'Next' }))
		expect(nav.push).toHaveBeenCalledWith('?page=2', { scroll: false })
	})

	it('goes back a page and keeps the other params', () => {
		nav.search = 'pastPage=3&page=2'
		render(<Pagination hasMore={false} param="pastPage" />)
		expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

		fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
		expect(nav.push).toHaveBeenCalledWith('?pastPage=2&page=2', {
			scroll: false,
		})
	})

	it('drops the param when going back to page 1', () => {
		nav.search = 'page=2'
		render(<Pagination hasMore={false} param="page" />)
		fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
		expect(nav.push).toHaveBeenCalledWith('?', { scroll: false })
	})
})

describe('TripDetails', () => {
	it('shows every field of the trip', () => {
		render(<TripDetails trip={trip({ odometer: 123456 })} />)
		const value = (label: string) =>
			screen.getByText(label).nextElementSibling?.textContent
		expect(value('Carrier')).toBe('Acme')
		expect(value('Carrier address')).toBe('1 Main St')
		expect(value('Inspection address')).toBe('123 North St')
		expect(value('Make / model')).toBe('Volvo VNL')
		expect(value('Odometer')).toBe('123,456 km')
		expect(value('Truck plate')).toBe('TRK1')
		expect(value('Trailer plates')).toBe('TRL1 · TRL2')
	})

	it('shows a dash for blank fields', () => {
		render(
			<TripDetails
				trip={trip({
					odometer: 0,
					truckplate: '',
					trailerplatea: '',
					trailerplateb: '',
				})}
			/>,
		)
		expect(
			screen.getByText('Odometer').nextElementSibling,
		).toHaveTextContent('—')
		expect(
			screen.getByText('Trailer plates').nextElementSibling,
		).toHaveTextContent('—')
	})
})

describe('TripDefects', () => {
	it('lists each defect and the remarks', () => {
		render(<TripDefects trip={trip({ defects: 'Cab, Horn' })} />)
		expect(
			screen.getAllByRole('listitem').map((li) => li.textContent),
		).toEqual(['Cab', 'Horn'])
		expect(screen.getByText('Cracked')).toBeInTheDocument()
	})

	it('says when there are no defects or remarks', () => {
		render(<TripDefects trip={trip({ defects: 'None', remarks: '' })} />)
		expect(screen.getByText('No defects reported')).toBeInTheDocument()
		expect(screen.getByText('—')).toBeInTheDocument()
	})
})

describe('PageHead', () => {
	it("shows the driver's full name and email", async () => {
		await act(async () => {
			render(
				<Suspense>
					<PageHead
						userPromise={Promise.resolve({
							given_name: 'Pat',
							family_name: 'Mac',
							email: 'pat@x.com',
						} as never)}
					/>
				</Suspense>,
			)
		})
		expect(screen.getByText('Pat Mac')).toBeInTheDocument()
		expect(screen.getByText('pat@x.com')).toBeInTheDocument()
	})

	it('falls back to "Driver" without a user', () => {
		render(<PageHead />)
		expect(screen.getByText('Driver')).toBeInTheDocument()
	})
})

describe('DisplayTrips', () => {
	const renderTrips = async () => {
		await act(async () => {
			render(
				<Suspense>
					<DisplayTrips
						currentTripsPromise={Promise.resolve({
							trips: [trip({ carrier: 'NOW' })],
							hasMore: false,
						})}
						pastTripsPromise={Promise.resolve({
							trips: [trip({ tripid: 2, carrier: 'OLD' })],
							hasMore: true,
						})}
					/>
				</Suspense>,
			)
		})
	}
	const tab = (name: string) => screen.getByRole('tab', { name })
	const carrier = (name: string) => screen.getByText(new RegExp(`^${name} —`))

	it("starts on today's trips and switches with the tabs", async () => {
		await renderTrips()
		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
			'Your pre-trips',
		)
		expect(tab('Today')).toHaveAttribute('aria-selected', 'true')
		expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
			"Today's trips",
		)
		expect(carrier('NOW')).toBeVisible()
		expect(carrier('OLD')).not.toBeVisible()

		fireEvent.click(tab('Past'))
		expect(tab('Past')).toHaveAttribute('aria-selected', 'true')
		expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
			'Past trips',
		)
		expect(carrier('OLD')).toBeVisible()

		fireEvent.click(tab('Today'))
		expect(carrier('NOW')).toBeVisible()
	})

	it('opens on past trips when paging through them', async () => {
		nav.search = 'pastPage=2'
		await renderTrips()
		expect(tab('Past')).toHaveAttribute('aria-selected', 'true')
	})

	// The list updates optimistically while the server action runs.
	const whilePending = async (action: TripsAction, check: () => void) => {
		let finish = () => {}
		await act(async () => {
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

	it('shows an added trip until the save finishes', async () => {
		await renderTrips()
		await whilePending(
			{
				type: 'ADD',
				payload: trip({ tripid: -1, carrier: 'NEW', pending: true }),
			},
			() => expect(carrier('NEW')).toBeInTheDocument(),
		)
		expect(screen.queryByText(/^NEW —/)).toBeNull()
	})

	it('can remove or update a current trip optimistically', async () => {
		await renderTrips()
		await whilePending({ type: 'REMOVE', payload: 1 }, () =>
			expect(screen.queryByText(/^NOW —/)).toBeNull(),
		)
		await whilePending(
			{ type: 'UPDATE', payload: trip({ carrier: 'EDIT' }) },
			() => expect(carrier('EDIT')).toBeInTheDocument(),
		)
		await whilePending(
			{ type: 'UPDATE', payload: trip({ tripid: 5, carrier: 'NOPE' }) },
			() => expect(carrier('NOW')).toBeInTheDocument(),
		)
		await whilePending({ type: 'UNKNOWN' } as never, () =>
			expect(carrier('NOW')).toBeInTheDocument(),
		)
	})
})
