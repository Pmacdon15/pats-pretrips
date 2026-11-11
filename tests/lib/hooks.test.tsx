import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryWrapper } from '../helpers/query'

const mocks = vi.hoisted(() => ({ getAddress: vi.fn() }))
vi.mock('@/lib/actions/actions', () => ({ getAddress: mocks.getAddress }))

import { useGetAddress, useGetLocation } from '@/lib/hooks/hooks'

describe('useGetAddress', () => {
	it('looks up the address for the coordinates', async () => {
		mocks.getAddress.mockResolvedValue({ data: { status: 'OK' } })

		const { result } = renderHook(() => useGetAddress(51, -114), {
			wrapper: queryWrapper(),
		})

		await waitFor(() =>
			expect(result.current.data).toEqual({ data: { status: 'OK' } }),
		)
		expect(mocks.getAddress).toHaveBeenCalledWith(51, -114)
	})

	it('waits until both coordinates are known', () => {
		const { result } = renderHook(() => useGetAddress(0, -114), {
			wrapper: queryWrapper(),
		})
		expect(result.current.fetchStatus).toBe('idle')
		expect(mocks.getAddress).not.toHaveBeenCalled()
	})
})

describe('useGetLocation', () => {
	beforeEach(() => {
		vi.spyOn(console, 'log').mockImplementation(() => {})
	})

	it("returns the browser's position", async () => {
		vi.stubGlobal('navigator', {
			geolocation: {
				getCurrentPosition: (cb: PositionCallback) =>
					cb({ coords: { latitude: 51, longitude: -114 } } as never),
			},
		})

		const { result } = renderHook(() => useGetLocation())

		await waitFor(() =>
			expect(result.current.location).toEqual({
				latitude: 51,
				longitude: -114,
			}),
		)
		vi.unstubAllGlobals()
	})

	it('stays null without geolocation', () => {
		vi.stubGlobal('navigator', {})
		const { result } = renderHook(() => useGetLocation())
		expect(result.current.location).toBeNull()
		expect(console.log).toHaveBeenCalledWith(
			'Geolocation is not supported by this browser.',
		)
		vi.unstubAllGlobals()
	})
})
