import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Suspense } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DisplayTrip from '@/components/trips/display-trip/DisplayTrip'
import type { Trip } from '@/lib/types/types'
import { trip } from '../helpers/fixtures'

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }))
vi.mock('@/lib/mutations/mutations', () => ({
	useAddDefectOnRoute: () => ({ mutate: mocks.mutate }),
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
					tripPromise={Promise.resolve(value)}
					userPromise={Promise.resolve({
						given_name: 'Pat',
					} as never)}
				/>
			</Suspense>,
		)
	})
}

describe('DisplayTrip', () => {
	it('shows the trip and sends new defects', async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
		await show(trip())

		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
			'Jan 2, 2026, 3:04 a.m.',
		)
		expect(screen.getByText('Pat')).toBeInTheDocument()
		expect(
			screen.getByRole('link', { name: 'Back to trips' }),
		).toBeInTheDocument()
		expect(screen.getByRole('listitem')).toHaveTextContent('Cab')

		await user.click(screen.getByRole('button', { name: 'Horn' }))
		await user.type(screen.getByLabelText('Remarks'), 'Too loud')
		await user.click(
			screen.getByRole('button', { name: 'Add on-route defects' }),
		)

		expect(mocks.mutate).toHaveBeenCalledWith({
			data: { defects: 'Horn', remarks: 'Too loud', trip_id: 1 },
		})
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
