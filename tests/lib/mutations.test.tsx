import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { queryWrapper } from '../helpers/query'

const mocks = vi.hoisted(() => ({
	addTrip: vi.fn(),
	addOnRouteDefects: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
}))
vi.mock('@/lib/actions/actions', () => ({
	addTrip: mocks.addTrip,
	addOnRouteDefects: mocks.addOnRouteDefects,
}))
vi.mock('sonner', () => ({
	toast: { success: mocks.success, error: mocks.error },
}))

import { useAddDefectOnRoute, useAddTrip } from '@/lib/mutations/mutations'

const defects = { defects: 'Horn', remarks: 'Loud', trip_id: 3 }
const form = {
	carrier: 'Acme',
	carrierAddress: '1 Main St',
	inspectionAddress: '123 North St',
	make: 'Volvo',
	model: 'VNL',
	odometer: 1000,
	defects: '',
	remarks: 'All good',
}

describe.each([
	{
		name: 'useAddDefectOnRoute',
		hook: useAddDefectOnRoute,
		action: mocks.addOnRouteDefects,
		data: defects,
		ok: 'On-route defects saved',
		fail: 'Could not add defects',
	},
	{
		name: 'useAddTrip',
		hook: useAddTrip,
		action: mocks.addTrip,
		data: form,
		ok: 'Pre-trip saved',
		fail: 'Could not save pre-trip',
	},
])('$name', ({ hook, action, data, ok, fail }) => {
	const run = async () => {
		const { result } = renderHook(() => hook(), { wrapper: queryWrapper() })
		await act(async () => {
			// biome-ignore lint/suspicious/noExplicitAny: both hooks take { data }
			await result.current.mutateAsync({ data } as any).catch(() => {})
		})
		return result
	}

	it('returns the saved trip and shows a success toast', async () => {
		action.mockResolvedValue({ value: { tripid: 3 } })

		const result = await run()

		await waitFor(() => expect(result.current.data).toEqual({ tripid: 3 }))
		expect(action).toHaveBeenCalledWith(data)
		expect(mocks.success).toHaveBeenCalledWith(ok)
	})

	it('shows the server error message', async () => {
		action.mockResolvedValue({ errorMessage: 'Not authorized' })

		await run()

		expect(mocks.error).toHaveBeenCalledWith(fail, {
			description: 'Not authorized',
		})
	})

	it('passes through any other response', async () => {
		action.mockResolvedValue(undefined)
		const result = await run()
		await waitFor(() => expect(result.current.isSuccess).toBe(true))
		expect(result.current.data).toBeUndefined()
	})

	it('shows a generic message when the action throws a non-Error', async () => {
		action.mockRejectedValue('boom')

		await run()

		expect(mocks.error).toHaveBeenCalledWith(fail, {
			description: 'An error occurred while uploading your trip.',
		})
	})
})
