import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VehicleList } from '@/components/vehicles/vehicle-list'
import { queryWrapper } from '../helpers/query'

const mocks = vi.hoisted(() => ({
	getVehicles: vi.fn(),
	addVehicle: vi.fn(),
	updateVehicle: vi.fn(),
	deleteVehicle: vi.fn(),
	toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/actions/vehicles', () => ({
	getVehicles: mocks.getVehicles,
	addVehicle: mocks.addVehicle,
	updateVehicle: mocks.updateVehicle,
	deleteVehicle: mocks.deleteVehicle,
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))

const vehicle = (over = {}) => ({
	id: 3,
	name: 'Unit 42',
	make: 'Volvo',
	model: 'VNL',
	truck_plate: 'TRK1',
	trailer_plate_a: 'A1',
	trailer_plate_b: 'B1',
	created_at: '2026-11-01T00:00:00.000Z',
	updated_at: '2026-11-01T00:00:00.000Z',
	...over,
})

beforeEach(() => {
	mocks.getVehicles.mockResolvedValue([vehicle()])
})

const setup = () => {
	render(<VehicleList />, { wrapper: queryWrapper() })
	return userEvent.setup()
}

describe('VehicleList', () => {
	it('lists the saved vehicles', async () => {
		mocks.getVehicles.mockResolvedValue([
			vehicle(),
			vehicle({
				id: 4,
				name: null,
				truck_plate: null,
				trailer_plate_a: null,
				trailer_plate_b: null,
			}),
		])
		setup()
		expect(await screen.findByText('Unit 42')).toBeInTheDocument()
		expect(screen.getAllByText('Volvo VNL')).toHaveLength(2)
		expect(
			screen.getByText('Truck TRK1 · Trailer A1 · Trailer B B1'),
		).toBeInTheDocument()
		expect(screen.getAllByRole('listitem')).toHaveLength(2)
	})

	it('says when there are none, and adds one', async () => {
		mocks.getVehicles.mockResolvedValue([])
		mocks.addVehicle.mockResolvedValue({ value: vehicle() })
		const user = setup()
		expect(
			await screen.findByText(/No saved vehicles yet/),
		).toBeInTheDocument()
		await user.click(screen.getByRole('button', { name: 'Add a vehicle' }))
		expect(screen.queryByText(/No saved vehicles yet/)).toBeNull()
		await user.type(screen.getByLabelText(/^Name/), 'Unit 7')
		await user.type(screen.getByLabelText('Make'), 'Mack')
		await user.type(screen.getByLabelText('Model'), 'Anthem')
		await user.type(screen.getByLabelText(/^Truck plate/), 'ZZ 9')
		mocks.getVehicles.mockResolvedValue([vehicle()])
		await user.click(screen.getByRole('button', { name: 'Save vehicle' }))
		await waitFor(() =>
			expect(mocks.toast.success).toHaveBeenCalledWith('Vehicle saved'),
		)
		expect(mocks.addVehicle).toHaveBeenCalledWith({
			name: 'Unit 7',
			make: 'Mack',
			model: 'Anthem',
			truckPlate: 'ZZ 9',
			trailerPlateA: '',
			trailerPlateB: '',
		})
		expect(
			await screen.findByRole('button', { name: 'Add a vehicle' }),
		).toBeInTheDocument()
	})

	it('says why a vehicle could not be saved, keeping the form', async () => {
		mocks.getVehicles.mockResolvedValue([])
		mocks.addVehicle.mockResolvedValue({ errorMessage: 'Too many' })
		const user = setup()
		await user.click(
			await screen.findByRole('button', { name: 'Add a vehicle' }),
		)
		await user.type(screen.getByLabelText('Make'), 'Mack')
		await user.type(screen.getByLabelText('Model'), 'Anthem')
		await user.click(screen.getByRole('button', { name: 'Save vehicle' }))
		await waitFor(() =>
			expect(mocks.toast.error).toHaveBeenCalledWith(
				'Could not save the vehicle',
				{ description: 'Too many' },
			),
		)
		expect(screen.getByLabelText('Make')).toHaveValue('Mack')
	})

	it("doesn't send a vehicle without a make and model", async () => {
		mocks.getVehicles.mockResolvedValue([])
		const user = setup()
		await user.click(
			await screen.findByRole('button', { name: 'Add a vehicle' }),
		)
		await user.click(screen.getByRole('button', { name: 'Save vehicle' }))
		expect(
			await screen.findByText('Vehicle make is required'),
		).toBeInTheDocument()
		expect(mocks.addVehicle).not.toHaveBeenCalled()
		await user.click(screen.getByRole('button', { name: 'Cancel' }))
		expect(
			screen.getByRole('button', { name: 'Add a vehicle' }),
		).toBeInTheDocument()
	})

	it('edits a vehicle', async () => {
		mocks.updateVehicle.mockResolvedValue({ value: vehicle() })
		const user = setup()
		await user.click(
			await screen.findByRole('button', { name: 'Edit Unit 42' }),
		)
		const name = screen.getByLabelText(/^Name/)
		expect(name).toHaveValue('Unit 42')
		await user.clear(name)
		await user.clear(screen.getByLabelText(/^Trailer B plate/))
		await user.click(screen.getByRole('button', { name: 'Save changes' }))
		await waitFor(() =>
			expect(mocks.toast.success).toHaveBeenCalledWith('Vehicle updated'),
		)
		expect(mocks.updateVehicle).toHaveBeenCalledWith(3, {
			name: '',
			make: 'Volvo',
			model: 'VNL',
			truckPlate: 'TRK1',
			trailerPlateA: 'A1',
			trailerPlateB: '',
		})
	})

	it('edits a vehicle without a name or plates', async () => {
		mocks.getVehicles.mockResolvedValue([
			vehicle({
				name: null,
				truck_plate: null,
				trailer_plate_a: null,
				trailer_plate_b: null,
			}),
		])
		const user = setup()
		await user.click(
			await screen.findByRole('button', { name: 'Edit Volvo VNL' }),
		)
		expect(screen.getByLabelText(/^Name/)).toHaveValue('')
		expect(screen.getByLabelText(/^Truck plate/)).toHaveValue('')
		await user.click(screen.getByRole('button', { name: 'Cancel' }))
		expect(screen.getByText('Volvo VNL')).toBeInTheDocument()
	})

	it('deletes a vehicle once confirmed', async () => {
		mocks.deleteVehicle.mockResolvedValue({ value: vehicle() })
		const user = setup()
		await user.click(
			await screen.findByRole('button', { name: 'Delete Unit 42' }),
		)
		await user.click(screen.getByRole('button', { name: 'Keep' }))
		expect(mocks.deleteVehicle).not.toHaveBeenCalled()
		await user.click(screen.getByRole('button', { name: 'Delete Unit 42' }))
		mocks.getVehicles.mockResolvedValue([])
		await user.click(screen.getByRole('button', { name: 'Delete' }))
		await waitFor(() =>
			expect(mocks.toast.success).toHaveBeenCalledWith('Vehicle deleted'),
		)
		expect(mocks.deleteVehicle).toHaveBeenCalledWith(3)
		expect(
			await screen.findByText(/No saved vehicles yet/),
		).toBeInTheDocument()
	})

	it('says why a vehicle could not be deleted', async () => {
		mocks.deleteVehicle.mockResolvedValue({ errorMessage: 'Nope' })
		const user = setup()
		await user.click(
			await screen.findByRole('button', { name: 'Delete Unit 42' }),
		)
		await user.click(screen.getByRole('button', { name: 'Delete' }))
		await waitFor(() =>
			expect(mocks.toast.error).toHaveBeenCalledWith(
				'Could not delete the vehicle',
				{ description: 'Nope' },
			),
		)
	})

	it('stops adding at the most vehicles', async () => {
		mocks.getVehicles.mockResolvedValue(
			Array.from({ length: 50 }, (_, i) => vehicle({ id: i + 1 })),
		)
		setup()
		expect(
			await screen.findByRole('button', { name: 'Add a vehicle' }),
		).toBeDisabled()
		expect(
			screen.getByText('You can save up to 50 vehicles.'),
		).toBeInTheDocument()
	})
})
