import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CarrierList } from '@/components/carriers/carrier-list'
import { queryWrapper } from '../helpers/query'

const mocks = vi.hoisted(() => ({
	getCarriers: vi.fn(),
	addCarrier: vi.fn(),
	updateCarrier: vi.fn(),
	deleteCarrier: vi.fn(),
	toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/actions/carriers', () => ({
	getCarriers: mocks.getCarriers,
	addCarrier: mocks.addCarrier,
	updateCarrier: mocks.updateCarrier,
	deleteCarrier: mocks.deleteCarrier,
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))

const carrier = (over = {}) => ({
	id: 5,
	name: 'Acme Freight',
	address: '12 Depot Rd, Calgary AB',
	created_at: '2026-11-01T00:00:00.000Z',
	updated_at: '2026-11-01T00:00:00.000Z',
	...over,
})

beforeEach(() => {
	mocks.getCarriers.mockResolvedValue([carrier()])
})

const setup = () => {
	render(<CarrierList />, { wrapper: queryWrapper() })
	return userEvent.setup()
}

describe('CarrierList', () => {
	it('lists the saved carriers with their addresses', async () => {
		mocks.getCarriers.mockResolvedValue([
			carrier(),
			carrier({ id: 6, name: 'Bolt Haul', address: '9 Yard Ave' }),
		])
		setup()
		expect(await screen.findByText('Acme Freight')).toBeInTheDocument()
		expect(screen.getByText('12 Depot Rd, Calgary AB')).toBeInTheDocument()
		expect(screen.getByText('Bolt Haul')).toBeInTheDocument()
		expect(screen.getByText('9 Yard Ave')).toBeInTheDocument()
		expect(screen.getAllByRole('listitem')).toHaveLength(2)
	})

	it('says when there are none, and adds one', async () => {
		mocks.getCarriers.mockResolvedValue([])
		mocks.addCarrier.mockResolvedValue({ value: carrier() })
		const user = setup()
		expect(
			await screen.findByText(/No saved carriers yet/),
		).toBeInTheDocument()
		await user.click(screen.getByRole('button', { name: 'Add a carrier' }))
		expect(screen.queryByText(/No saved carriers yet/)).toBeNull()
		await user.type(screen.getByLabelText('Carrier name'), 'Bolt Haul')
		await user.type(screen.getByLabelText('Address'), '9 Yard Ave')
		mocks.getCarriers.mockResolvedValue([carrier()])
		await user.click(screen.getByRole('button', { name: 'Save carrier' }))
		await waitFor(() =>
			expect(mocks.toast.success).toHaveBeenCalledWith('Carrier saved'),
		)
		expect(mocks.addCarrier).toHaveBeenCalledWith({
			name: 'Bolt Haul',
			address: '9 Yard Ave',
		})
		expect(
			await screen.findByRole('button', { name: 'Add a carrier' }),
		).toBeInTheDocument()
	})

	it('says why a carrier could not be saved, keeping the form', async () => {
		mocks.getCarriers.mockResolvedValue([])
		mocks.addCarrier.mockResolvedValue({ errorMessage: 'Too many' })
		const user = setup()
		await user.click(
			await screen.findByRole('button', { name: 'Add a carrier' }),
		)
		await user.type(screen.getByLabelText('Carrier name'), 'Bolt Haul')
		await user.type(screen.getByLabelText('Address'), '9 Yard Ave')
		await user.click(screen.getByRole('button', { name: 'Save carrier' }))
		await waitFor(() =>
			expect(mocks.toast.error).toHaveBeenCalledWith(
				'Could not save the carrier',
				{ description: 'Too many' },
			),
		)
		expect(screen.getByLabelText('Carrier name')).toHaveValue('Bolt Haul')
	})

	it("doesn't send a carrier without a name and address", async () => {
		mocks.getCarriers.mockResolvedValue([])
		const user = setup()
		await user.click(
			await screen.findByRole('button', { name: 'Add a carrier' }),
		)
		await user.click(screen.getByRole('button', { name: 'Save carrier' }))
		expect(
			await screen.findByText('Carrier name is required'),
		).toBeInTheDocument()
		expect(
			screen.getByText('Carrier address is required'),
		).toBeInTheDocument()
		expect(mocks.addCarrier).not.toHaveBeenCalled()
		await user.click(screen.getByRole('button', { name: 'Cancel' }))
		expect(
			screen.getByRole('button', { name: 'Add a carrier' }),
		).toBeInTheDocument()
	})

	it("edits a carrier's address", async () => {
		mocks.updateCarrier.mockResolvedValue({ value: carrier() })
		const user = setup()
		await user.click(
			await screen.findByRole('button', { name: 'Edit Acme Freight' }),
		)
		expect(screen.getByLabelText('Carrier name')).toHaveValue(
			'Acme Freight',
		)
		const address = screen.getByLabelText('Address')
		expect(address).toHaveValue('12 Depot Rd, Calgary AB')
		await user.clear(address)
		await user.type(address, '9 Yard Ave')
		await user.click(screen.getByRole('button', { name: 'Save changes' }))
		await waitFor(() =>
			expect(mocks.toast.success).toHaveBeenCalledWith('Carrier updated'),
		)
		expect(mocks.updateCarrier).toHaveBeenCalledWith(5, {
			name: 'Acme Freight',
			address: '9 Yard Ave',
		})
	})

	it('cancels an edit', async () => {
		const user = setup()
		await user.click(
			await screen.findByRole('button', { name: 'Edit Acme Freight' }),
		)
		await user.click(screen.getByRole('button', { name: 'Cancel' }))
		expect(screen.getByText('Acme Freight')).toBeInTheDocument()
		expect(mocks.updateCarrier).not.toHaveBeenCalled()
	})

	it('deletes a carrier once confirmed', async () => {
		mocks.deleteCarrier.mockResolvedValue({ value: carrier() })
		const user = setup()
		await user.click(
			await screen.findByRole('button', { name: 'Delete Acme Freight' }),
		)
		await user.click(screen.getByRole('button', { name: 'Keep' }))
		expect(mocks.deleteCarrier).not.toHaveBeenCalled()
		await user.click(
			screen.getByRole('button', { name: 'Delete Acme Freight' }),
		)
		mocks.getCarriers.mockResolvedValue([])
		await user.click(screen.getByRole('button', { name: 'Delete' }))
		await waitFor(() =>
			expect(mocks.toast.success).toHaveBeenCalledWith('Carrier deleted'),
		)
		expect(mocks.deleteCarrier).toHaveBeenCalledWith(5)
		expect(
			await screen.findByText(/No saved carriers yet/),
		).toBeInTheDocument()
	})

	it('says why a carrier could not be deleted', async () => {
		mocks.deleteCarrier.mockResolvedValue({ errorMessage: 'Nope' })
		const user = setup()
		await user.click(
			await screen.findByRole('button', { name: 'Delete Acme Freight' }),
		)
		await user.click(screen.getByRole('button', { name: 'Delete' }))
		await waitFor(() =>
			expect(mocks.toast.error).toHaveBeenCalledWith(
				'Could not delete the carrier',
				{ description: 'Nope' },
			),
		)
	})

	it('stops adding at the most carriers', async () => {
		mocks.getCarriers.mockResolvedValue(
			Array.from({ length: 50 }, (_, i) => carrier({ id: i + 1 })),
		)
		setup()
		expect(
			await screen.findByRole('button', { name: 'Add a carrier' }),
		).toBeDisabled()
		expect(
			screen.getByText('You can save up to 50 carriers.'),
		).toBeInTheDocument()
	})
})
