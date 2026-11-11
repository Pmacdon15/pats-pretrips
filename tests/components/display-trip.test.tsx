import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Suspense } from 'react'
import { describe, expect, it, vi } from 'vitest'
import DisplayTrip from '@/components/trips/display-trip/DisplayTrip'
import { trip } from '../helpers/fixtures'

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }))
vi.mock('@/lib/mutations/mutations', () => ({
	useAddDefectOnRoute: () => ({ mutate: mocks.mutate }),
}))

describe('DisplayTrip', () => {
	it('shows the trip and its new defects straight away', async () => {
		vi.useFakeTimers({
			now: new Date('2026-01-02T12:00:00Z'),
			shouldAdvanceTime: true,
		})
		vi.spyOn(console, 'log').mockImplementation(() => {})
		// Keep the save pending so the optimistic trip stays on screen.
		mocks.mutate.mockImplementation(() => new Promise(() => {}))
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

		await act(async () => {
			render(
				<Suspense>
					<DisplayTrip
						tripPromise={Promise.resolve(trip())}
						userPromise={Promise.resolve({
							given_name: 'Pat',
						} as never)}
					/>
				</Suspense>,
			)
		})
		expect(screen.getByText(/Driver Name: Pat/)).toBeInTheDocument()
		expect(
			screen.getByRole('link', { name: 'Back to Trips' }),
		).toHaveAttribute('href', '/pretrips')
		expect(screen.getByRole('cell', { name: 'Cab' })).toBeInTheDocument()

		await user.click(screen.getByRole('combobox'))
		await user.click(await screen.findByRole('option', { name: 'Horn' }))
		await user.click(screen.getByRole('button', { name: 'Add Defect' }))
		await user.type(screen.getByLabelText('Remarks'), 'Too loud')
		await user.click(
			screen.getByRole('button', { name: 'Add on Route Defects' }),
		)

		expect(mocks.mutate).toHaveBeenCalled()
	})
})
