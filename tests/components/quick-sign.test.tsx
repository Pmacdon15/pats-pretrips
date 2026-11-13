import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickSignButton, SignedBadge } from '@/components/signature/quick-sign'
import { trip } from '../helpers/fixtures'
import { queryWrapper } from '../helpers/query'

const mocks = vi.hoisted(() => ({
	getSignatureStatus: vi.fn(),
	signTrip: vi.fn(),
	toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/actions/signatures', () => ({
	getSignatureStatus: mocks.getSignatureStatus,
	signTrip: mocks.signTrip,
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))

beforeEach(() => {
	mocks.getSignatureStatus.mockResolvedValue({
		saved: true,
		updatedAt: '2026-01-01T00:00:00.000Z',
	})
	mocks.signTrip.mockResolvedValue({ value: trip() })
})

const show = async () => {
	render(<QuickSignButton signHref="/pretrip/3#signature" tripId={3} />, {
		wrapper: queryWrapper(),
	})
	await act(async () => {})
}

describe('QuickSignButton', () => {
	it('signs with the saved signature in one tap', async () => {
		const user = userEvent.setup()
		await show()
		await user.click(
			await screen.findByRole('button', { name: 'Add signature' }),
		)
		expect(mocks.signTrip).toHaveBeenCalledWith({
			tripId: 3,
			signature: 'saved',
		})
		expect(mocks.toast.success).toHaveBeenCalledWith('Pre-trip signed')
		expect(screen.getByText('Signed')).toBeInTheDocument()
		expect(screen.queryByRole('button')).toBeNull()
	})

	it('keeps the button when signing fails', async () => {
		mocks.signTrip.mockResolvedValue({ errorMessage: 'Too old' })
		const user = userEvent.setup()
		await show()
		await user.click(
			await screen.findByRole('button', { name: 'Add signature' }),
		)
		expect(mocks.toast.error).toHaveBeenCalledWith(
			'Could not sign the pre-trip',
			{ description: 'Too old' },
		)
		expect(
			screen.getByRole('button', { name: 'Add signature' }),
		).toBeEnabled()
	})

	it('goes to the sign box without a saved signature', async () => {
		mocks.getSignatureStatus.mockResolvedValue({
			saved: false,
			updatedAt: null,
		})
		await show()
		expect(
			screen.getByRole('link', { name: 'Add signature' }),
		).toHaveAttribute('href', '/pretrip/3#signature')
	})
})

describe('SignedBadge', () => {
	it('says the trip is signed', () => {
		render(<SignedBadge />)
		expect(screen.getByText('Signed')).toBeInTheDocument()
	})
})
