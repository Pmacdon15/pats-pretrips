import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CarrierList } from '@/components/carriers/carrier-list'
import { CarriersHeader } from '@/components/carriers/carriers-header'
import { queryWrapper } from '../helpers/query'

const mocks = vi.hoisted(() => ({
	getCarriers: vi.fn(),
	addCarrier: vi.fn(),
	updateCarrier: vi.fn(),
	deleteCarrier: vi.fn(),
	toast: { success: vi.fn(), error: vi.fn() },
	// The active space, as Clerk's client session gives it.
	space: {
		orgId: null as string | null,
		orgName: null as string | null,
		inOrg: false,
		canManage: true,
	},
}))
vi.mock('@/lib/hooks/space', () => ({ useSpace: () => mocks.space }))
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
	mocks.space = { orgId: null, orgName: null, inOrg: false, canManage: true }
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

	it("shows an organization's carriers read-only to a member who isn't an admin", async () => {
		mocks.space = {
			orgId: 'org_1',
			orgName: 'Acme Freight',
			inOrg: true,
			canManage: false,
		}
		setup()
		expect(await screen.findByText('Acme Freight')).toBeInTheDocument()
		expect(
			screen.getByText(/Only its admins can add, change or delete them/),
		).toBeInTheDocument()
		expect(
			screen.queryByRole('button', { name: 'Add a carrier' }),
		).toBeNull()
		expect(
			screen.queryByRole('button', { name: 'Edit Acme Freight' }),
		).toBeNull()
		expect(
			screen.queryByRole('button', { name: 'Delete Acme Freight' }),
		).toBeNull()
	})

	it('says when an organization has no carriers, without offering to add one', async () => {
		mocks.space = {
			orgId: 'org_1',
			orgName: 'Acme Freight',
			inOrg: true,
			canManage: false,
		}
		mocks.getCarriers.mockResolvedValue([])
		setup()
		expect(
			await screen.findByText(
				'Your organization has no saved sites yet.',
			),
		).toBeInTheDocument()
		expect(screen.queryByText(/No saved carriers yet/)).toBeNull()
	})

	it("lets an organization's admin manage its sites", async () => {
		mocks.space = {
			orgId: 'org_1',
			orgName: 'Acme Freight',
			inOrg: true,
			canManage: true,
		}
		setup()
		expect(
			await screen.findByText(
				/These sites are shared with everyone in your organization/,
			),
		).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Add a site' })).toBeEnabled()
		expect(
			screen.getByRole('button', { name: 'Edit Acme Freight' }),
		).toBeInTheDocument()
	})

	it('adds a site, by its name and address, in an organization', async () => {
		mocks.space = {
			orgId: 'org_1',
			orgName: 'Acme Freight',
			inOrg: true,
			canManage: true,
		}
		mocks.getCarriers.mockResolvedValue([])
		mocks.addCarrier.mockResolvedValue({ value: carrier() })
		setup()
		await userEvent.click(
			await screen.findByRole('button', { name: 'Add a site' }),
		)
		const form = screen.getByRole('form', { name: 'Add a site' })
		expect(form).toBeInTheDocument()
		await userEvent.type(screen.getByLabelText('Site name'), 'North Shop')
		await userEvent.type(
			screen.getByLabelText('Address'),
			'1 Shop Rd, Calgary AB',
		)
		await userEvent.click(screen.getByRole('button', { name: 'Save site' }))
		await waitFor(() =>
			expect(mocks.addCarrier).toHaveBeenCalledWith({
				name: 'North Shop',
				address: '1 Shop Rd, Calgary AB',
			}),
		)
		expect(mocks.toast.success).toHaveBeenCalledWith('Site saved')
	})
})

describe('CarriersHeader', () => {
	it('is about carriers in the personal space', () => {
		render(<CarriersHeader />)
		expect(screen.getByText('Your carriers')).toBeInTheDocument()
	})

	it("is about the organization's sites in its space", () => {
		mocks.space = {
			orgId: 'org_1',
			orgName: 'Acme Freight',
			inOrg: true,
			canManage: true,
		}
		render(<CarriersHeader />)
		expect(screen.getByText('Your sites')).toBeInTheDocument()
		expect(
			screen.getByText(/Acme Freight is the carrier on every pre-trip/),
		).toBeInTheDocument()
	})
})
