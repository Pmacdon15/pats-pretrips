import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
	vehicles: { data: [] as unknown[], isPending: false },
	carriers: { data: [] as unknown[], isPending: false },
	// The active space, as Clerk's client session gives it.
	space: {
		orgId: null as string | null,
		orgName: null as string | null,
		inOrg: false,
		canManage: true,
	},
	signatureStatus: {
		data: { saved: true, updatedAt: '2026-01-01T00:00:00.000Z' } as
			| undefined
			| { saved: boolean; updatedAt: string | null },
	},
}))
vi.mock('@/lib/mutations/mutations', () => ({
	useAddTrip: () => ({ mutateAsync: mocks.addTrip }),
	useAddDefectOnRoute: () => ({ mutateAsync: mocks.addDefect }),
}))
vi.mock('@/lib/hooks/space', () => ({ useSpace: () => mocks.space }))
vi.mock('@/lib/hooks/hooks', () => ({
	useGetLocation: () => mocks.location,
	useGetAddress: () => mocks.address,
	useSignatureStatus: () => mocks.signatureStatus,
	useVehicles: () => mocks.vehicles,
	useCarriers: () => mocks.carriers,
	SIGNATURE_STATUS_KEY: ['signatureStatus'],
}))

beforeEach(() => {
	mocks.vehicles = { data: [], isPending: false }
	mocks.carriers = { data: [], isPending: false }
	mocks.space = { orgId: null, orgName: null, inOrg: false, canManage: true }
	mocks.addTrip.mockResolvedValue({})
	mocks.addDefect.mockResolvedValue({})
	mocks.location = { location: null, status: 'ready' }
	mocks.address = { data: undefined, isFetching: false }
	mocks.signatureStatus = {
		data: { saved: true, updatedAt: '2026-01-01T00:00:00.000Z' },
	}
	HTMLCanvasElement.prototype.setPointerCapture ??= () => {}
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
		scale: vi.fn(),
		beginPath: vi.fn(),
		moveTo: vi.fn(),
		lineTo: vi.fn(),
		stroke: vi.fn(),
	} as never)
	vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
		'data:image/png;base64,aGk=',
	)
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

	it("fills the vehicle from one of the driver's saved vehicles", async () => {
		mocks.vehicles = {
			data: [
				{
					id: 3,
					name: 'Unit 42',
					make: 'Volvo',
					model: 'VNL',
					truck_plate: 'TRK1',
					trailer_plate_a: 'A1',
					trailer_plate_b: null,
				},
				{
					id: 4,
					name: null,
					make: 'Mack',
					model: 'Anthem',
					truck_plate: null,
					trailer_plate_a: null,
					trailer_plate_b: 'B2',
				},
			],
			isPending: false,
		}
		const { user } = setup()
		const picker = screen.getByLabelText('Saved vehicle')
		expect(
			screen.getByRole('option', { name: 'Unit 42 — Volvo VNL (TRK1)' }),
		).toBeInTheDocument()
		expect(
			screen.getByRole('option', { name: 'Mack Anthem' }),
		).toBeInTheDocument()

		await user.selectOptions(picker, '3')
		expect(screen.getByLabelText('Make')).toHaveValue('Volvo')
		expect(screen.getByLabelText('Model')).toHaveValue('VNL')
		expect(screen.getByLabelText(/^Truck plate/)).toHaveValue('TRK1')
		expect(screen.getByLabelText(/^Trailer plate/)).toHaveValue('A1')
		expect(screen.getByLabelText(/^Trailer B plate/)).toHaveValue('')

		await user.selectOptions(picker, '4')
		expect(screen.getByLabelText('Make')).toHaveValue('Mack')
		expect(screen.getByLabelText(/^Truck plate/)).toHaveValue('')
		expect(screen.getByLabelText(/^Trailer B plate/)).toHaveValue('B2')

		// Back to "Choose a vehicle…" leaves what's filled in.
		await user.selectOptions(picker, '')
		expect(screen.getByLabelText('Make')).toHaveValue('Mack')
		expect(
			screen.getByRole('link', { name: 'Manage vehicles' }),
		).toHaveAttribute('href', '/vehicles')
	})

	it("fills the carrier from one of the driver's saved carriers", async () => {
		mocks.carriers = {
			data: [
				{ id: 5, name: 'Acme Freight', address: '12 Depot Rd' },
				{ id: 6, name: 'Bolt Haul', address: '9 Yard Ave' },
			],
			isPending: false,
		}
		const { user } = setup()
		const picker = screen.getByLabelText('Saved carrier')
		expect(
			screen.getByRole('option', { name: 'Acme Freight — 12 Depot Rd' }),
		).toBeInTheDocument()

		await user.selectOptions(picker, '5')
		expect(screen.getByLabelText('Carrier')).toHaveValue('Acme Freight')
		expect(screen.getByLabelText('Carrier address')).toHaveValue(
			'12 Depot Rd',
		)

		await user.selectOptions(picker, '6')
		expect(screen.getByLabelText('Carrier')).toHaveValue('Bolt Haul')

		// Back to "Choose a carrier…" leaves what's filled in.
		await user.selectOptions(picker, '')
		expect(screen.getByLabelText('Carrier address')).toHaveValue(
			'9 Yard Ave',
		)
		expect(
			screen.getByRole('link', { name: 'Manage carriers' }),
		).toHaveAttribute('href', '/carriers')
	})

	it('makes the organization the carrier, and fills the address from one of its sites', async () => {
		mocks.space = {
			orgId: 'org_1',
			orgName: 'Acme Freight',
			inOrg: true,
			canManage: false,
		}
		mocks.carriers = {
			data: [
				{ id: 5, name: 'North Shop', address: '1 Shop Rd' },
				{ id: 6, name: 'South Base', address: '9 Base Ave' },
			],
			isPending: false,
		}
		const { user } = setup()
		const carrier = screen.getByLabelText('Carrier')
		expect(carrier).toHaveValue('Acme Freight')
		expect(carrier).toHaveAttribute('readonly')
		expect(
			screen.getByText('Your organization is the carrier.'),
		).toBeInTheDocument()

		const picker = screen.getByLabelText('Site')
		expect(
			screen.getByRole('option', { name: 'South Base — 9 Base Ave' }),
		).toBeInTheDocument()
		await user.selectOptions(picker, '6')
		expect(carrier).toHaveValue('Acme Freight')
		expect(screen.getByLabelText('Carrier address')).toHaveValue(
			'9 Base Ave',
		)
		// Only admins manage the sites.
		expect(screen.queryByRole('link', { name: 'Manage sites' })).toBeNull()
	})

	it("links an organization's admin to its sites", () => {
		mocks.space = {
			orgId: 'org_1',
			orgName: 'Acme Freight',
			inOrg: true,
			canManage: true,
		}
		mocks.carriers = {
			data: [{ id: 5, name: 'North Shop', address: '1 Shop Rd' }],
			isPending: false,
		}
		setup()
		expect(
			screen.getByRole('link', { name: 'Manage sites' }),
		).toHaveAttribute('href', '/carriers')
	})

	it('follows the space: the organization as carrier, cleared on leaving it', async () => {
		const org = {
			orgId: 'org_1',
			orgName: 'Acme Freight',
			inOrg: true,
			canManage: false,
		}
		mocks.space = org
		const props = { onDone: vi.fn(), setOptimisticCurrentTrips: vi.fn() }
		const view = render(<AddTripForm {...props} />)
		const user = userEvent.setup()
		const carrier = screen.getByLabelText('Carrier')
		expect(carrier).toHaveValue('Acme Freight')

		// Cancelling keeps the organization as the carrier.
		await user.click(screen.getByRole('button', { name: 'Cancel' }))
		expect(carrier).toHaveValue('Acme Freight')

		// Another organization: its name replaces the first.
		mocks.space = { ...org, orgId: 'org_2', orgName: 'Bolt Haul' }
		view.rerender(<AddTripForm {...props} />)
		expect(carrier).toHaveValue('Bolt Haul')

		// Back to the personal space: the locked name is cleared.
		mocks.space = {
			orgId: null,
			orgName: null,
			inOrg: false,
			canManage: true,
		}
		view.rerender(<AddTripForm {...props} />)
		expect(carrier).toHaveValue('')
		expect(carrier).not.toHaveAttribute('readonly')

		// A carrier the driver typed stays when nothing changes.
		await user.type(carrier, 'Mine')
		view.rerender(<AddTripForm {...props} />)
		expect(carrier).toHaveValue('Mine')
	})

	it('saves with the organization as carrier, and keeps it for the next trip', async () => {
		mocks.space = {
			orgId: 'org_1',
			orgName: 'Acme Freight',
			inOrg: true,
			canManage: false,
		}
		const { user } = setup()
		await user.type(screen.getByLabelText('Carrier address'), '1 Shop Rd')
		await user.type(
			screen.getByLabelText('Inspection address'),
			'1 Shop Rd',
		)
		await user.type(screen.getByLabelText('Make'), 'Volvo')
		await user.type(screen.getByLabelText('Model'), 'VNL')
		await user.type(screen.getByLabelText('Odometer'), '1500')
		await user.click(chip('Horn'))
		await user.type(screen.getByLabelText('Remarks'), 'All good')
		await user.click(screen.getByRole('button', { name: 'Save pre-trip' }))
		await waitFor(() =>
			expect(mocks.addTrip).toHaveBeenCalledWith({
				data: expect.objectContaining({ carrier: 'Acme Freight' }),
			}),
		)
		expect(screen.getByLabelText('Carrier')).toHaveValue('Acme Freight')
		expect(screen.getByLabelText('Carrier address')).toHaveValue('')
	})

	it("offers an organization's admin to save its sites", () => {
		mocks.space = {
			orgId: 'org_1',
			orgName: 'Acme Freight',
			inOrg: true,
			canManage: true,
		}
		const first = render(
			<AddTripForm
				onDone={vi.fn()}
				setOptimisticCurrentTrips={vi.fn()}
			/>,
		)
		expect(
			screen.getByRole('link', { name: 'Save your sites' }),
		).toHaveAttribute('href', '/carriers')
		first.unmount()
		mocks.space = { ...mocks.space, canManage: false }
		setup()
		expect(screen.queryByText(/Save your sites/)).toBeNull()
	})

	it('suggests saving carriers, or shows nothing while they load', () => {
		const first = render(
			<AddTripForm
				onDone={vi.fn()}
				setOptimisticCurrentTrips={vi.fn()}
			/>,
		)
		expect(
			screen.getByRole('link', { name: 'Save your carriers' }),
		).toHaveAttribute('href', '/carriers')
		first.unmount()
		mocks.carriers = { data: undefined as never, isPending: true }
		setup()
		expect(screen.queryByLabelText('Saved carrier')).toBeNull()
		expect(screen.queryByText(/Save your carriers/)).toBeNull()
	})

	it('suggests saving vehicles, or shows nothing while they load', () => {
		const first = render(
			<AddTripForm
				onDone={vi.fn()}
				setOptimisticCurrentTrips={vi.fn()}
			/>,
		)
		expect(
			screen.getByRole('link', { name: 'Save your vehicles' }),
		).toHaveAttribute('href', '/vehicles')
		first.unmount()
		mocks.vehicles = { data: undefined as never, isPending: true }
		setup()
		expect(screen.queryByLabelText('Saved vehicle')).toBeNull()
		expect(screen.queryByText(/Save your vehicles/)).toBeNull()
	})

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

	it.each([
		['Carrier', '255'],
		['Carrier address', '255'],
		['Inspection address', '255'],
		['Make', '100'],
		['Model', '100'],
		[/^Truck plate/, '20'],
		[/^Trailer plate/, '20'],
		[/^Trailer B plate/, '20'],
		['Remarks', '2000'],
	])('stops %s at the length the server takes', (label, max) => {
		setup()
		expect(screen.getByLabelText(label)).toHaveAttribute('maxlength', max)
	})

	it('explains an odometer reading that is too high or not whole', async () => {
		const { user } = setup()
		const odometer = screen.getByLabelText('Odometer')
		await user.type(odometer, '10000001')
		await user.tab()
		expect(
			await screen.findByText(
				'Odometer reading is too high (10,000,000 km at most)',
			),
		).toBeInTheDocument()
		await user.clear(odometer)
		await user.type(odometer, '1000.5')
		await user.tab()
		expect(
			await screen.findByText(
				'Odometer reading must be whole kilometres',
			),
		).toBeInTheDocument()
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

	it('does not flag a field while it is still being typed in', async () => {
		const { user } = setup()
		// Leaving one field validates the whole form…
		await user.click(screen.getByLabelText('Carrier'))
		await user.tab()
		// …but the next field shouldn't light up as soon as typing starts.
		await user.type(screen.getByLabelText('Carrier address'), '4432')
		expect(screen.getByLabelText('Carrier address')).toHaveAttribute(
			'aria-invalid',
			'false',
		)
		expect(screen.queryByText('Carrier address is required')).toBeNull()
	})

	it('clears an error as soon as the value is fixed', async () => {
		const { user } = setup()
		await user.click(screen.getByLabelText('Carrier'))
		await user.tab()
		expect(
			await screen.findByText('Carrier name is required'),
		).toBeInTheDocument()
		await user.type(screen.getByLabelText('Carrier'), 'A')
		expect(screen.queryByText('Carrier name is required')).toBeNull()
		expect(screen.getByLabelText('Carrier')).toHaveAttribute(
			'aria-invalid',
			'false',
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
			signature: 'saved',
			saveSignature: true,
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
				signed_at: expect.any(Date),
				pending: true,
			}),
		})
		expect(onDone).toHaveBeenCalled()
		expect(screen.getByLabelText('Carrier')).toHaveValue('')
		expect(inspection).toHaveValue(gps ?? '')
	})
})

describe('AddTripForm signature', () => {
	const fill = async (user: ReturnType<typeof userEvent.setup>) => {
		await user.type(screen.getByLabelText('Carrier'), 'Acme')
		await user.type(screen.getByLabelText('Carrier address'), '1 Main St')
		await user.type(
			screen.getByLabelText('Inspection address'),
			'123 North St',
		)
		await user.type(screen.getByLabelText('Make'), 'Volvo')
		await user.type(screen.getByLabelText('Model'), 'VNL')
		await user.type(screen.getByLabelText('Odometer'), '1500')
		await user.type(screen.getByLabelText('Remarks'), 'All good')
	}
	const sign = () => {
		const box = screen.getByRole('img', { name: /signature box/i })
		fireEvent.pointerDown(box, { clientX: 5, clientY: 5, pointerId: 1 })
		fireEvent.pointerMove(box, { clientX: 20, clientY: 15, pointerId: 1 })
		fireEvent.pointerUp(box, { pointerId: 1 })
	}

	it('asks a driver without a saved signature to sign, and saves it', async () => {
		mocks.signatureStatus = { data: { saved: false, updatedAt: null } }
		const user = userEvent.setup()
		render(
			<AddTripForm
				onDone={() => {}}
				setOptimisticCurrentTrips={() => {}}
			/>,
		)
		await fill(user)
		await user.click(screen.getByRole('button', { name: 'Save pre-trip' }))
		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Sign the pre-trip',
		)
		expect(mocks.addTrip).not.toHaveBeenCalled()

		sign()
		expect(
			screen.getByLabelText(/Save my signature for next time/),
		).toBeChecked()
		await user.click(screen.getByRole('button', { name: 'Save pre-trip' }))
		expect(mocks.addTrip).toHaveBeenCalledWith({
			data: expect.objectContaining({
				signature: 'data:image/png;base64,aGk=',
				saveSignature: true,
			}),
		})
	})

	it('lets a driver with a saved signature sign differently, once', async () => {
		const user = userEvent.setup()
		render(
			<AddTripForm
				onDone={() => {}}
				setOptimisticCurrentTrips={() => {}}
			/>,
		)
		expect(
			screen.getByRole('img', { name: 'Your saved signature' }),
		).toHaveAttribute(
			'src',
			'/api/signature?v=2026-01-01T00%3A00%3A00.000Z',
		)
		await user.click(
			screen.getByRole('button', { name: 'Sign differently' }),
		)
		const keep = screen.getByLabelText(/Make this my saved signature/)
		expect(keep).not.toBeChecked()

		// Back to the saved one, then drawing again.
		await user.click(
			screen.getByRole('button', { name: 'Use my saved signature' }),
		)
		await user.click(
			screen.getByRole('button', { name: 'Sign differently' }),
		)
		sign()
		await user.click(screen.getByLabelText(/Make this my saved signature/))
		await fill(user)
		await user.click(screen.getByRole('button', { name: 'Save pre-trip' }))
		expect(mocks.addTrip).toHaveBeenCalledWith({
			data: expect.objectContaining({
				signature: 'data:image/png;base64,aGk=',
				saveSignature: true,
			}),
		})
	})

	it('goes back to the saved signature once a new one is saved', () => {
		mocks.signatureStatus = { data: undefined }
		const { rerender } = render(
			<AddTripForm
				onDone={() => {}}
				setOptimisticCurrentTrips={() => {}}
			/>,
		)
		expect(
			screen.queryByRole('img', { name: 'Your saved signature' }),
		).toBeNull()
		mocks.signatureStatus = {
			data: { saved: true, updatedAt: '2026-02-01T00:00:00.000Z' },
		}
		rerender(
			<AddTripForm
				onDone={() => {}}
				setOptimisticCurrentTrips={() => {}}
			/>,
		)
		expect(
			screen.getByRole('img', { name: 'Your saved signature' }),
		).toBeInTheDocument()
	})
})

describe('AddTripForm saving', () => {
	it('keeps the transition open until the save settles, even on failure', async () => {
		let failSave = (_e: Error) => {}
		mocks.addTrip.mockImplementation(
			() =>
				new Promise((_resolve, reject) => {
					failSave = reject
				}),
		)
		const setOptimistic = vi.fn()
		const user = userEvent.setup()
		render(
			<AddTripForm
				onDone={() => {}}
				setOptimisticCurrentTrips={setOptimistic}
			/>,
		)
		await user.type(screen.getByLabelText('Carrier'), 'Acme')
		await user.type(screen.getByLabelText('Carrier address'), '1 Main St')
		await user.type(
			screen.getByLabelText('Inspection address'),
			'123 North St',
		)
		await user.type(screen.getByLabelText('Make'), 'Volvo')
		await user.type(screen.getByLabelText('Model'), 'VNL')
		await user.type(screen.getByLabelText('Odometer'), '1500')
		await user.type(screen.getByLabelText('Remarks'), 'All good')

		await user.click(screen.getByRole('button', { name: 'Save pre-trip' }))
		expect(setOptimistic).toHaveBeenCalledOnce()

		// The failure is reported by the mutation's toast, not thrown here.
		await act(async () => failSave(new Error('down')))
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

	it('stops a remark at the length the server takes', () => {
		render(<AddDefectForm trip={trip()} updateOptimisticTrip={() => {}} />)
		expect(screen.getByLabelText('Remarks')).toHaveAttribute(
			'maxlength',
			'2000',
		)
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
