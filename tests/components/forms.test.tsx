import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddDefect } from '@/components/add-defect/AddDefect'
import { AddDefectForm } from '@/components/add-defect/add-defect-form/AddDefectForm'
import AddTripForm from '@/components/forms/add-a-trip-form'
import AddTripContainer from '@/components/trips/add-trip/addTripContainer'
import { trip } from '../helpers/fixtures'

const mocks = vi.hoisted(() => ({
	addTrip: vi.fn(),
	addDefect: vi.fn(),
	location: null as null | { latitude: number; longitude: number },
	address: undefined as unknown,
}))
vi.mock('@/lib/mutations/mutations', () => ({
	useAddTrip: () => ({ mutate: mocks.addTrip }),
	useAddDefectOnRoute: () => ({ mutate: mocks.addDefect }),
}))
vi.mock('@/lib/hooks/hooks', () => ({
	useGetLocation: () => ({ location: mocks.location }),
	useGetAddress: () => ({ data: mocks.address }),
}))

beforeEach(() => {
	mocks.location = null
	mocks.address = undefined
	vi.spyOn(console, 'log').mockImplementation(() => {})
})

/** Opens the defect dropdown, picks one, and presses Add Defect. */
async function pickDefect(
	user: ReturnType<typeof userEvent.setup>,
	name: string,
) {
	await user.click(screen.getByRole('combobox'))
	await user.click(await screen.findByRole('option', { name }))
	await user.click(screen.getByRole('button', { name: 'Add Defect' }))
}

describe('AddDefect', () => {
	it('passes the chosen defect up, or an empty string if none', async () => {
		const user = userEvent.setup()
		const onSelect = vi.fn()
		render(
			<AddDefect handleSelectDefect={onSelect}>
				<p>child</p>
			</AddDefect>,
		)
		expect(screen.getByText('child')).toBeInTheDocument()

		await user.click(screen.getByRole('button', { name: 'Add Defect' }))
		expect(onSelect).toHaveBeenLastCalledWith('')

		await pickDefect(user, 'Horn')
		expect(onSelect).toHaveBeenLastCalledWith('Horn')
	})
})

describe('AddTripForm', () => {
	const setup = () => {
		const setShowForm = vi.fn()
		const setOptimistic = vi.fn()
		render(
			<AddTripForm
				setOptimisticCurrentTrips={setOptimistic}
				setShowForm={setShowForm}
			/>,
		)
		return { setShowForm, setOptimistic, user: userEvent.setup() }
	}

	it('fills the inspection address from the current location', () => {
		mocks.location = { latitude: 51, longitude: -114 }
		mocks.address = {
			data: { results: [{ formatted_address: '9 Ave SW' }] },
		}
		setup()
		expect(screen.getByLabelText('Inspection Address')).toHaveValue(
			'9 Ave SW',
		)
	})

	it('shows a field error after leaving it invalid', async () => {
		const { user } = setup()
		await user.click(screen.getByLabelText('Carrier'))
		await user.tab()
		expect(
			await screen.findByText('Carrier name is required'),
		).toBeInTheDocument()
		expect(screen.getByLabelText('Carrier')).toHaveAttribute(
			'aria-invalid',
			'true',
		)
	})

	it('adds and clears defects', async () => {
		const { user } = setup()
		const defects = screen.getByLabelText('Defects')

		await pickDefect(user, 'Horn')
		expect(defects).toHaveValue('Horn, ')
		await pickDefect(user, 'Cab')
		expect(defects).toHaveValue('Cab, Horn, ')

		await user.click(
			document
				.querySelector('.lucide-circle-x')
				?.closest('button') as HTMLElement,
		)
		expect(defects).toHaveValue('')
	})

	it('adds the trip optimistically, sends it and closes', async () => {
		const { user, setOptimistic, setShowForm } = setup()
		await user.type(screen.getByLabelText('Carrier'), 'Acme')
		await user.type(screen.getByLabelText('Carrier Address'), '1 Main St')
		await user.type(
			screen.getByLabelText('Inspection Address'),
			'123 North St',
		)
		await user.type(screen.getByLabelText('Make'), 'Volvo')
		await user.type(screen.getByLabelText('Model'), 'VNL')
		await user.clear(screen.getByLabelText('Odometer'))
		await user.type(screen.getByLabelText('Odometer'), '1500')
		await user.type(screen.getByLabelText('Truck Plate'), 'TRK1')
		await user.type(screen.getByLabelText('Remarks'), 'All good')

		await user.click(screen.getByRole('button', { name: 'Submit' }))

		const data = {
			carrier: 'Acme',
			carrierAddress: '1 Main St',
			inspectionAddress: '123 North St',
			make: 'Volvo',
			model: 'VNL',
			odometer: 1500,
			truckPlate: 'TRK1',
			trailerPlateA: '',
			trailerPlateB: '',
			defects: '',
			remarks: 'All good',
		}
		expect(mocks.addTrip).toHaveBeenCalledWith({ data })
		expect(setOptimistic).toHaveBeenCalledWith({
			type: 'ADD',
			payload: expect.objectContaining({
				carrier: 'Acme',
				odometer: 1500,
				truckplate: 'TRK1',
			}),
		})
		expect(setShowForm).toHaveBeenCalledWith(false)
		expect(screen.getByLabelText('Carrier')).toHaveValue('')
	})
})

describe('AddTripContainer', () => {
	it('toggles the form', async () => {
		const user = userEvent.setup()
		render(<AddTripContainer setOptimisticCurrentTrips={() => {}} />)
		expect(
			screen.getByRole('heading', {
				name: 'Create a Trip',
				hidden: true,
			}),
		).not.toBeVisible()

		await user.click(screen.getByRole('button', { name: 'Add Trip' }))
		expect(
			screen.getByRole('heading', { name: 'Create a Trip' }),
		).toBeVisible()
		await user.click(screen.getByRole('button', { name: 'Cancel' }))
		expect(
			screen.getByRole('button', { name: 'Add Trip' }),
		).toBeInTheDocument()
	})
})

describe('AddDefectForm', () => {
	beforeEach(() => {
		vi.useFakeTimers({
			now: new Date('2026-01-02T12:00:00Z'),
			shouldAdvanceTime: true,
		})
	})

	it('hides for a trip more than a day old', () => {
		const { container } = render(
			<AddDefectForm
				trip={trip({ date: new Date('2025-12-31T00:00:00Z') })}
				updateOptimisticTrip={() => {}}
			/>,
		)
		expect(container).toBeEmptyDOMElement()
	})

	it('adds each defect once and can clear them', async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
		render(<AddDefectForm trip={trip()} updateOptimisticTrip={() => {}} />)
		const defects = screen.getByLabelText('Defects')

		await pickDefect(user, 'Horn')
		await pickDefect(user, 'Cab')
		await user.click(screen.getByRole('button', { name: 'Add Defect' }))
		expect(defects).toHaveValue('Horn, Cab')

		await user.click(
			document
				.querySelector('.lucide-circle-x')
				?.closest('button') as HTMLElement,
		)
		expect(defects).toHaveValue('')
	})

	it('shows a remarks error when left too short', async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
		render(<AddDefectForm trip={trip()} updateOptimisticTrip={() => {}} />)
		await user.type(screen.getByLabelText('Remarks'), 'x')
		await user.tab()
		expect(await screen.findByText('Must Add Remark')).toBeInTheDocument()
	})

	it.each([
		['adds to', trip(), 'Cab, Horn', 'Cracked, Too loud'],
		['starts', trip({ defects: '', remarks: '' }), 'Horn', 'Too loud'],
	])('%s the trip defects optimistically and sends them', async (_l, t, defects, remarks) => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
		const update = vi.fn()
		render(<AddDefectForm trip={t} updateOptimisticTrip={update} />)

		await pickDefect(user, 'Horn')
		await user.type(screen.getByLabelText('Remarks'), 'Too loud')
		await act(async () => {
			fireEvent.submit(
				screen.getByRole('button', { name: 'Add on Route Defects' }),
			)
		})

		expect(update).toHaveBeenCalledWith({ ...t, defects, remarks })
		expect(mocks.addDefect).toHaveBeenCalledWith({
			data: { defects: 'Horn', remarks: 'Too loud', trip_id: 1 },
		})
	})
})

describe('AddDefectForm without a trip', () => {
	it('renders but never sends', async () => {
		const user = userEvent.setup()
		render(
			<AddDefectForm trip={undefined} updateOptimisticTrip={() => {}} />,
		)
		await pickDefect(user, 'Horn')
		await user.type(screen.getByLabelText('Remarks'), 'Too loud')
		await user.click(
			screen.getByRole('button', { name: 'Add on Route Defects' }),
		)
		expect(mocks.addDefect).not.toHaveBeenCalled()
	})
})
