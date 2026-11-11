import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddDefectForm } from '@/components/add-defect/add-defect-form/AddDefectForm'
import { DefectPicker } from '@/components/add-defect/defect-picker'
import AddTripForm from '@/components/forms/add-a-trip-form'
import AddTripContainer from '@/components/trips/add-trip/addTripContainer'
import { trip } from '../helpers/fixtures'

const mocks = vi.hoisted(() => ({
	addTrip: vi.fn(),
	addDefect: vi.fn(),
	location: {
		location: null as null | { latitude: number; longitude: number },
		status: 'loading',
	},
	address: { data: undefined as unknown, isFetching: false },
}))
vi.mock('@/lib/mutations/mutations', () => ({
	useAddTrip: () => ({ mutate: mocks.addTrip }),
	useAddDefectOnRoute: () => ({ mutate: mocks.addDefect }),
}))
vi.mock('@/lib/hooks/hooks', () => ({
	useGetLocation: () => mocks.location,
	useGetAddress: () => mocks.address,
}))

beforeEach(() => {
	mocks.location = { location: null, status: 'ready' }
	mocks.address = { data: undefined, isFetching: false }
})

const chip = (name: string) => screen.getByRole('button', { name })

describe('DefectPicker', () => {
	function Picker({ disabled }: { disabled?: string[] }) {
		const [value, setValue] = useState('')
		return (
			<>
				<DefectPicker
					disabledOptions={disabled}
					onChange={setValue}
					value={value}
				/>
				<output>{value}</output>
			</>
		)
	}

	it('toggles defects on and off', () => {
		render(<Picker />)
		expect(screen.getByText('No defects selected.')).toBeInTheDocument()

		fireEvent.click(chip('Horn'))
		fireEvent.click(chip('Cab'))
		expect(chip('Horn')).toHaveAttribute('aria-pressed', 'true')
		expect(screen.getByRole('status')).toHaveTextContent('Horn, Cab')
		expect(screen.getByText('2 selected: Horn, Cab')).toBeInTheDocument()

		fireEvent.click(chip('Horn'))
		expect(chip('Horn')).toHaveAttribute('aria-pressed', 'false')
		expect(screen.getByRole('status')).toHaveTextContent(/^Cab$/)
	})

	it('clears everything at once', () => {
		render(<Picker />)
		fireEvent.click(chip('Horn'))
		fireEvent.click(chip('Clear (1)'))
		expect(screen.getByRole('status')).toBeEmptyDOMElement()
		expect(screen.queryByRole('button', { name: /Clear/ })).toBeNull()
	})

	it('disables defects that are already recorded', () => {
		render(<Picker disabled={['horn']} />)
		expect(chip('Horn')).toBeDisabled()
		expect(chip('Horn')).toHaveAttribute('title', 'Already recorded')
		expect(chip('Cab')).toBeEnabled()
	})
})

describe('AddTripForm', () => {
	const setup = () => {
		const onDone = vi.fn()
		const setOptimistic = vi.fn()
		render(
			<AddTripForm
				onDone={onDone}
				setOptimisticCurrentTrips={setOptimistic}
			/>,
		)
		return { onDone, setOptimistic, user: userEvent.setup() }
	}
	const located = (address = '9 Ave SW') => {
		mocks.location = {
			location: { latitude: 51, longitude: -114 },
			status: 'ready',
		}
		mocks.address = {
			data: { data: { results: [{ formatted_address: address }] } },
			isFetching: false,
		}
	}

	it('fills the inspection address from the current location', () => {
		located()
		setup()
		expect(screen.getByLabelText('Inspection address')).toHaveValue(
			'9 Ave SW',
		)
		expect(
			screen.getByText('Filled in from your current location.'),
		).toBeInTheDocument()
	})

	it.each([
		[
			'denied',
			false,
			'Location access is off — enter the address manually.',
		],
		['loading', false, 'Finding your location…'],
		['ready', true, 'Finding your location…'],
	])('explains the location when it is %s (fetching: %s)', (status, isFetching, hint) => {
		mocks.location = { location: null, status }
		mocks.address = { data: undefined, isFetching }
		setup()
		expect(screen.getByText(hint)).toBeInTheDocument()
	})

	it('gives no hint without a location or address', () => {
		setup()
		expect(screen.queryByText(/location/i)).toBeNull()
	})

	it('marks the plates optional and leaves an empty odometer blank', () => {
		setup()
		expect(screen.getByText('Truck plate')).toHaveTextContent(
			'Truck plate(optional)',
		)
		expect(screen.getByLabelText('Odometer')).toHaveValue(null)
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

	it('cancels and resets', async () => {
		const { user, onDone } = setup()
		await user.type(screen.getByLabelText('Carrier'), 'Acme')
		await user.click(screen.getByRole('button', { name: 'Cancel' }))
		expect(onDone).toHaveBeenCalled()
		expect(screen.getByLabelText('Carrier')).toHaveValue('')
	})

	it.each([
		['without a location', undefined],
		['and keeps the GPS address', '9 Ave SW'],
	])('adds the trip optimistically, sends it and closes %s', async (_label, gps) => {
		vi.useFakeTimers({
			now: new Date('2026-01-02T12:00:00Z'),
			shouldAdvanceTime: true,
		})
		if (gps) located(gps)
		const { user, setOptimistic, onDone } = setup()
		await user.type(screen.getByLabelText('Carrier'), 'Acme')
		await user.type(screen.getByLabelText('Carrier address'), '1 Main St')
		const inspection = screen.getByLabelText('Inspection address')
		await user.clear(inspection)
		await user.type(inspection, '123 North St')
		await user.type(screen.getByLabelText('Make'), 'Volvo')
		await user.type(screen.getByLabelText('Model'), 'VNL')
		await user.type(screen.getByLabelText('Odometer'), '1500')
		await user.type(screen.getByLabelText(/Truck plate/), 'TRK1')
		await user.click(chip('Horn'))
		await user.type(screen.getByLabelText('Remarks'), 'All good')

		await user.click(screen.getByRole('button', { name: 'Save pre-trip' }))

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
			defects: 'Horn',
			remarks: 'All good',
		}
		expect(mocks.addTrip).toHaveBeenCalledWith({ data })
		expect(setOptimistic).toHaveBeenCalledWith({
			type: 'ADD',
			payload: expect.objectContaining({
				// A negative id marks it as not saved yet.
				tripid: expect.toSatisfy((id: number) => id < 0),
				carrier: 'Acme',
				defects: 'Horn',
				truckplate: 'TRK1',
				pending: true,
			}),
		})
		expect(onDone).toHaveBeenCalled()
		expect(screen.getByLabelText('Carrier')).toHaveValue('')
		expect(inspection).toHaveValue(gps ?? '')
	})
})

describe('AddTripContainer', () => {
	it('opens the form and closes it on cancel', async () => {
		const user = userEvent.setup()
		render(<AddTripContainer setOptimisticCurrentTrips={() => {}} />)
		const title = screen.getByRole('heading', {
			hidden: true,
			name: 'New pre-trip inspection',
		})
		expect(title).not.toBeVisible()

		await user.click(
			screen.getByRole('button', { name: 'Start a new pre-trip' }),
		)
		expect(title).toBeVisible()

		await user.click(screen.getByRole('button', { name: 'Cancel' }))
		expect(title).not.toBeVisible()
	})
})

describe('AddDefectForm', () => {
	it('disables defects the trip already has', () => {
		render(<AddDefectForm trip={trip()} updateOptimisticTrip={() => {}} />)
		expect(chip('Cab')).toBeDisabled()
	})

	it('asks for a defect and a remark', async () => {
		const user = userEvent.setup()
		render(<AddDefectForm trip={trip()} updateOptimisticTrip={() => {}} />)
		await user.click(
			screen.getByRole('button', { name: 'Add on-route defects' }),
		)
		expect(
			await screen.findByText('Select at least one defect.'),
		).toBeInTheDocument()
		expect(mocks.addDefect).not.toHaveBeenCalled()
	})

	it.each([
		['adds to', trip(), 'Cab, Horn', 'Cracked, Too loud'],
		['starts', trip({ defects: '', remarks: '' }), 'Horn', 'Too loud'],
	])('%s the trip defects optimistically and sends them', async (_l, t, defects, remarks) => {
		const user = userEvent.setup()
		const update = vi.fn()
		render(<AddDefectForm trip={t} updateOptimisticTrip={update} />)

		await user.click(chip('Horn'))
		await user.type(screen.getByLabelText('Remarks'), 'Too loud')
		await user.click(
			screen.getByRole('button', { name: 'Add on-route defects' }),
		)

		expect(update).toHaveBeenCalledWith({ ...t, defects, remarks })
		expect(mocks.addDefect).toHaveBeenCalledWith({
			data: { defects: 'Horn', remarks: 'Too loud', trip_id: 1 },
		})
		expect(screen.getByLabelText('Remarks')).toHaveValue('')
	})

	it('sends trip id 0 for a trip without an id', async () => {
		const user = userEvent.setup()
		render(
			<AddDefectForm
				trip={trip({ tripid: undefined })}
				updateOptimisticTrip={() => {}}
			/>,
		)
		await user.click(chip('Horn'))
		await user.type(screen.getByLabelText('Remarks'), 'Too loud')
		await user.click(
			screen.getByRole('button', { name: 'Add on-route defects' }),
		)
		expect(mocks.addDefect).not.toHaveBeenCalled()
	})
})
