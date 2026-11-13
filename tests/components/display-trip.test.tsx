import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Suspense } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DisplayTrip from '@/components/trips/display-trip/DisplayTrip'
import type { Trip } from '@/lib/types/types'
import { trip } from '../helpers/fixtures'

const mocks = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('@/lib/mutations/mutations', () => ({
	useAddDefectOnRoute: () => ({ mutateAsync: mocks.save }),
}))
// The repairs list has its own tests; here it shows which trip it's for.
vi.mock('@/components/repairs/defect-status-list', () => ({
	DefectStatusList: (p: { tripId: number }) => <p>Repairs for {p.tripId}</p>,
}))
// The signature card has its own tests; here it shows what it was given.
vi.mock('@/components/signature/trip-signature', () => ({
	TripSignature: (p: { trip: { tripid: number }; editable: boolean }) => (
		<p>
			Signature for {p.trip.tripid}
			{p.editable ? ' (can sign)' : ''}
		</p>
	),
}))
// The one-tap signature has its own tests.
vi.mock('@/components/signature/quick-sign', () => ({
	QuickSignButton: (p: { tripId: number; signHref: string }) => (
		<a href={p.signHref}>Quick sign {p.tripId}</a>
	),
}))
// The email form has its own tests; here it shows what it was given.
vi.mock('@/components/email/email-trip', () => ({
	EmailTrip: (p: { tripId: number }) => <p>Email trip {p.tripId}</p>,
}))

beforeEach(() => {
	vi.useFakeTimers({
		now: new Date('2026-01-02T12:00:00Z'),
		shouldAdvanceTime: true,
	})
})

const show = async (value: Trip | undefined) => {
	await act(async () => {
		render(
			<Suspense>
				<DisplayTrip
					emailAccessPromise={Promise.resolve({} as never)}
					tripPromise={Promise.resolve(value)}
					userPromise={Promise.resolve({
						givenName: 'Pat',
					} as never)}
				/>
			</Suspense>,
		)
	})
}

describe('DisplayTrip', () => {
	it('shows new defects until the save finishes', async () => {
		let finishSave = () => {}
		mocks.save.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					finishSave = resolve
				}),
		)
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
		await show(trip())

		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
			'Jan 2, 2026, 3:04 a.m.',
		)
		expect(screen.getByText('Pat')).toBeInTheDocument()
		expect(screen.getByText('Email trip 1')).toBeInTheDocument()
		expect(
			screen.getByRole('link', { name: 'Back to trips' }),
		).toBeInTheDocument()
		expect(screen.getByRole('listitem')).toHaveTextContent('Cab')

		await user.click(screen.getByRole('button', { name: 'Horn' }))
		await user.type(screen.getByLabelText('Remarks'), 'Too loud')
		await user.click(
			screen.getByRole('button', { name: 'Add on-route defects' }),
		)

		expect(mocks.save).toHaveBeenCalledWith({
			data: { defects: 'Horn', remarks: 'Too loud', trip_id: 1 },
		})
		const listed = () =>
			screen.getAllByRole('listitem').map((li) => li.textContent)
		expect(listed()).toEqual(['Cab', 'Horn'])
		expect(screen.getByText('Cracked, Too loud')).toBeInTheDocument()

		// Once saved, the page shows the server's trip again.
		await act(async () => finishSave())
		expect(listed()).toEqual(['Cab'])
	})

	it('drops the new defects if the save fails', async () => {
		mocks.save.mockRejectedValue(new Error('down'))
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
		await show(trip())

		await user.click(screen.getByRole('button', { name: 'Horn' }))
		await user.type(screen.getByLabelText('Remarks'), 'Too loud')
		await user.click(
			screen.getByRole('button', { name: 'Add on-route defects' }),
		)

		// The rollback re-renders after the rejected save settles.
		await waitFor(() =>
			expect(screen.getAllByRole('listitem')).toHaveLength(1),
		)
	})

	it('shows the repairs card for a trip with defects', async () => {
		await act(async () => {
			render(
				<Suspense>
					<DisplayTrip
						emailAccessPromise={Promise.resolve({} as never)}
						repairsPromise={Promise.resolve([])}
						tripPromise={Promise.resolve(trip())}
						userPromise={Promise.resolve(null)}
					/>
				</Suspense>,
			)
		})
		expect(
			screen.getByRole('heading', { name: 'Defect repairs' }),
		).toBeInTheDocument()
		expect(screen.getByText('Repairs for 1')).toBeInTheDocument()
	})

	it('has no repairs card without defects', async () => {
		await show(trip({ defects: '' }))
		expect(screen.queryByText('Repairs for 1')).toBeNull()
	})

	it("shows the trip's signature, signable while it can be changed", async () => {
		await show(trip())
		expect(
			screen.getByText('Signature for 1 (can sign)'),
		).toBeInTheDocument()
	})

	it('locks a trip older than 24 hours', async () => {
		await show(trip({ date: new Date('2025-12-31T00:00:00Z') }))
		expect(screen.getByText(/can no longer be changed/)).toBeInTheDocument()
		expect(
			screen.queryByRole('button', { name: 'Add on-route defects' }),
		).toBeNull()
	})

	it('says when the trip is missing', async () => {
		await show(undefined)
		expect(
			screen.getByRole('heading', { name: 'Trip not found' }),
		).toBeInTheDocument()
		expect(
			screen.getByRole('link', { name: 'Back to trips' }),
		).toBeInTheDocument()
	})
})
