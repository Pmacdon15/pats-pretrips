import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TrailerList } from '@/components/trailers/trailer-list'
import { queryWrapper } from '../helpers/query'

const mocks = vi.hoisted(() => ({
	getTrailers: vi.fn(),
	addTrailer: vi.fn(),
	updateTrailer: vi.fn(),
	deleteTrailer: vi.fn(),
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
vi.mock('@/lib/actions/trailers', () => ({
	getTrailers: mocks.getTrailers,
	addTrailer: mocks.addTrailer,
	updateTrailer: mocks.updateTrailer,
	deleteTrailer: mocks.deleteTrailer,
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))

const trailer = (over = {}) => ({
	id: 7,
	name: "53' dry van",
	plate: 'TR1',
	created_at: '2026-11-01T00:00:00.000Z',
	updated_at: '2026-11-01T00:00:00.000Z',
	...over,
})

beforeEach(() => {
	mocks.space = { orgId: null, orgName: null, inOrg: false, canManage: true }
	mocks.getTrailers.mockResolvedValue([trailer()])
})

const setup = () => {
	render(<TrailerList />, { wrapper: queryWrapper() })
	return userEvent.setup()
}

describe('TrailerList', () => {
	it('lists the saved trailers, named or by plate', async () => {
		mocks.getTrailers.mockResolvedValue([
			trailer(),
			trailer({ id: 8, name: null, plate: 'TR2' }),
		])
		setup()
		expect(await screen.findByText("53' dry van")).toBeInTheDocument()
		expect(screen.getByText('Plate TR1')).toBeInTheDocument()
		expect(screen.getByText('TR2')).toBeInTheDocument()
		expect(
			screen.getByRole('button', { name: 'Edit TR2' }),
		).toBeInTheDocument()
	})

	it('says when there are none, and adds one', async () => {
		mocks.getTrailers.mockResolvedValue([])
		mocks.addTrailer.mockResolvedValue({ value: trailer() })
		const user = setup()
		expect(
			await screen.findByText(/No saved trailers yet/),
		).toBeInTheDocument()
		await user.click(screen.getByRole('button', { name: 'Add a trailer' }))
		await user.type(screen.getByLabelText(/^Trailer name/), 'Flatdeck')
		await user.type(screen.getByLabelText(/^Plate/), 'FD 1')
		mocks.getTrailers.mockResolvedValue([trailer()])
		await user.click(screen.getByRole('button', { name: 'Save trailer' }))
		await waitFor(() =>
			expect(mocks.toast.success).toHaveBeenCalledWith('Trailer saved'),
		)
		expect(mocks.addTrailer).toHaveBeenCalledWith({
			name: 'Flatdeck',
			plate: 'FD 1',
		})
		expect(
			await screen.findByRole('button', { name: 'Add a trailer' }),
		).toBeInTheDocument()
	})

	it('needs a plate', async () => {
		mocks.getTrailers.mockResolvedValue([])
		const user = setup()
		await user.click(
			await screen.findByRole('button', { name: 'Add a trailer' }),
		)
		await user.click(screen.getByRole('button', { name: 'Save trailer' }))
		expect(
			await screen.findByText('Trailer plate is required'),
		).toBeInTheDocument()
		expect(mocks.addTrailer).not.toHaveBeenCalled()
	})

	it('says why a trailer could not be saved, keeping the form', async () => {
		mocks.getTrailers.mockResolvedValue([])
		mocks.addTrailer.mockResolvedValue({ errorMessage: 'Too many' })
		const user = setup()
		await user.click(
			await screen.findByRole('button', { name: 'Add a trailer' }),
		)
		await user.type(screen.getByLabelText(/^Plate/), 'FD 1')
		await user.click(screen.getByRole('button', { name: 'Save trailer' }))
		await waitFor(() =>
			expect(mocks.toast.error).toHaveBeenCalledWith(
				'Could not save the trailer',
				{ description: 'Too many' },
			),
		)
		expect(
			screen.getByRole('form', { name: 'Add a trailer' }),
		).toBeInTheDocument()
	})

	it('cancels adding a trailer', async () => {
		mocks.getTrailers.mockResolvedValue([])
		const user = setup()
		await user.click(
			await screen.findByRole('button', { name: 'Add a trailer' }),
		)
		await user.click(screen.getByRole('button', { name: 'Cancel' }))
		expect(
			screen.queryByRole('form', { name: 'Add a trailer' }),
		).not.toBeInTheDocument()
	})

	it('edits a trailer, clearing its name', async () => {
		mocks.updateTrailer.mockResolvedValue({ value: trailer() })
		const user = setup()
		await user.click(
			await screen.findByRole('button', { name: "Edit 53' dry van" }),
		)
		const name = screen.getByLabelText(/^Trailer name/)
		expect(name).toHaveValue("53' dry van")
		await user.clear(name)
		await user.click(screen.getByRole('button', { name: 'Save changes' }))
		await waitFor(() =>
			expect(mocks.toast.success).toHaveBeenCalledWith('Trailer updated'),
		)
		expect(mocks.updateTrailer).toHaveBeenCalledWith(7, {
			name: '',
			plate: 'TR1',
		})
	})

	it('edits a trailer without a name', async () => {
		mocks.getTrailers.mockResolvedValue([trailer({ name: null })])
		const user = setup()
		await user.click(
			await screen.findByRole('button', { name: 'Edit TR1' }),
		)
		expect(screen.getByLabelText(/^Trailer name/)).toHaveValue('')
		await user.click(screen.getByRole('button', { name: 'Cancel' }))
		expect(screen.getByRole('button', { name: 'Edit TR1' })).toBeVisible()
	})

	it('deletes a trailer after confirming, or keeps it', async () => {
		mocks.deleteTrailer.mockResolvedValue({ value: trailer() })
		const user = setup()
		await user.click(
			await screen.findByRole('button', { name: "Delete 53' dry van" }),
		)
		await user.click(screen.getByRole('button', { name: 'Keep' }))
		await user.click(
			screen.getByRole('button', { name: "Delete 53' dry van" }),
		)
		await user.click(screen.getByRole('button', { name: 'Delete' }))
		await waitFor(() =>
			expect(mocks.toast.success).toHaveBeenCalledWith('Trailer deleted'),
		)
		expect(mocks.deleteTrailer).toHaveBeenCalledWith(7)
	})

	it('says why a trailer could not be deleted', async () => {
		mocks.deleteTrailer.mockResolvedValue({ errorMessage: 'Nope' })
		const user = setup()
		await user.click(
			await screen.findByRole('button', { name: "Delete 53' dry van" }),
		)
		await user.click(screen.getByRole('button', { name: 'Delete' }))
		await waitFor(() =>
			expect(mocks.toast.error).toHaveBeenCalledWith(
				'Could not delete the trailer',
				{ description: 'Nope' },
			),
		)
	})

	it('stops adding at the most allowed', async () => {
		mocks.getTrailers.mockResolvedValue(
			Array.from({ length: 50 }, (_, i) => trailer({ id: i + 1 })),
		)
		setup()
		expect(
			await screen.findByRole('button', { name: 'Add a trailer' }),
		).toBeDisabled()
		expect(
			screen.getByText('You can save up to 50 trailers.'),
		).toBeInTheDocument()
	})

	it("tells an organization's admin the trailers are shared", async () => {
		mocks.space = {
			orgId: 'org_1',
			orgName: 'Acme',
			inOrg: true,
			canManage: true,
		}
		setup()
		expect(
			await screen.findByText(
				/shared with everyone in your organization/,
			),
		).toBeInTheDocument()
	})

	it("only shows an organization's trailers to its drivers", async () => {
		mocks.space = {
			orgId: 'org_1',
			orgName: 'Acme',
			inOrg: true,
			canManage: false,
		}
		setup()
		expect(await screen.findByText("53' dry van")).toBeInTheDocument()
		expect(screen.getByText(/Only its admins/)).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull()
		expect(
			screen.queryByRole('button', { name: 'Add a trailer' }),
		).toBeNull()
	})

	it('says when an organization has no trailers, to its drivers', async () => {
		mocks.getTrailers.mockResolvedValue([])
		mocks.space = {
			orgId: 'org_1',
			orgName: 'Acme',
			inOrg: true,
			canManage: false,
		}
		setup()
		expect(
			await screen.findByText(
				'Your organization has no saved trailers yet.',
			),
		).toBeInTheDocument()
	})
})
