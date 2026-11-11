import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
	const stubGeolocation = (
		getCurrentPosition: (ok: PositionCallback, fail: () => void) => void,
	) => vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('starts loading', () => {
		stubGeolocation(() => {})
		const { result } = renderHook(() => useGetLocation())
		expect(result.current).toEqual({ location: null, status: 'loading' })
	})

	it("returns the browser's position rounded to ~10m", async () => {
		stubGeolocation((ok) =>
			ok({
				coords: { latitude: 51.044_73, longitude: -114.071_88 },
			} as never),
		)

		const { result } = renderHook(() => useGetLocation())

		await waitFor(() =>
			expect(result.current).toEqual({
				location: { latitude: 51.0447, longitude: -114.0719 },
				status: 'ready',
			}),
		)
	})

	it('reports a denied permission', async () => {
		stubGeolocation((_ok, fail) => fail())
		const { result } = renderHook(() => useGetLocation())
		await waitFor(() => expect(result.current.status).toBe('denied'))
	})

	it('reports a browser without geolocation', async () => {
		vi.stubGlobal('navigator', {})
		const { result } = renderHook(() => useGetLocation())
		await waitFor(() => expect(result.current.status).toBe('unsupported'))
		expect(result.current.location).toBeNull()
	})
})
