import { useQueryClient } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryWrapper } from '../helpers/query'

const mocks = vi.hoisted(() => ({
	getAddress: vi.fn(),
	getVehicles: vi.fn(),
	getCarriers: vi.fn(),
	useAuth: vi.fn(),
	useOrganization: vi.fn(),
}))
vi.mock('@clerk/nextjs', () => ({
	useAuth: mocks.useAuth,
	useOrganization: mocks.useOrganization,
}))
vi.mock('@/lib/actions/actions', () => ({ getAddress: mocks.getAddress }))
vi.mock('@/lib/actions/vehicles', () => ({ getVehicles: mocks.getVehicles }))
vi.mock('@/lib/actions/carriers', () => ({ getCarriers: mocks.getCarriers }))

import {
	CARRIERS_KEY,
	useCarriers,
	useGetAddress,
	useGetLocation,
	useVehicles,
	VEHICLES_KEY,
} from '@/lib/hooks/hooks'
import { useSpace } from '@/lib/hooks/space'

beforeEach(() => {
	mocks.useAuth.mockReturnValue({ orgId: null, has: () => false })
	mocks.useOrganization.mockReturnValue({ organization: null })
})

describe('useSpace', () => {
	it('is the personal space, which a solo user manages, with no active organization', () => {
		const { result } = renderHook(() => useSpace())
		expect(result.current).toEqual({
			orgId: null,
			orgName: null,
			inOrg: false,
			canManage: true,
		})
	})

	it("is an organization's space, managed only by its admins", () => {
		const has = vi.fn((p: { role?: string }) => p.role === 'org:admin')
		mocks.useAuth.mockReturnValue({ orgId: 'org_1', has })
		mocks.useOrganization.mockReturnValue({
			organization: { name: 'Acme Freight' },
		})
		expect(renderHook(() => useSpace()).result.current).toEqual({
			orgId: 'org_1',
			orgName: 'Acme Freight',
			inOrg: true,
			canManage: true,
		})
		expect(has).toHaveBeenCalledWith({ role: 'org:admin' })
		has.mockReturnValue(false)
		expect(renderHook(() => useSpace()).result.current.canManage).toBe(
			false,
		)
	})
})

describe('space lists', () => {
	it('keys each space separately, under the shared prefix mutations clear', async () => {
		mocks.getVehicles.mockResolvedValue([])
		mocks.getCarriers.mockResolvedValue([])
		mocks.useAuth.mockReturnValue({ orgId: 'org_1', has: () => false })
		const wrapper = queryWrapper()
		const { result } = renderHook(
			() => {
				useVehicles()
				useCarriers()
				return useQueryClient()
			},
			{ wrapper },
		)
		await waitFor(() =>
			expect(
				result.current.getQueryData([...VEHICLES_KEY, 'org_1']),
			).toEqual([]),
		)
		expect(result.current.getQueryData([...CARRIERS_KEY, 'org_1'])).toEqual(
			[],
		)
		expect(
			result.current.getQueryData([...VEHICLES_KEY, 'personal']),
		).toBeUndefined()
	})
})

describe('useCarriers', () => {
	it("reads the driver's saved carriers", async () => {
		mocks.getCarriers.mockResolvedValue([{ id: 5 }])
		const { result } = renderHook(() => useCarriers(), {
			wrapper: queryWrapper(),
		})
		await waitFor(() => expect(result.current.data).toEqual([{ id: 5 }]))
	})
})

describe('useVehicles', () => {
	it("reads the driver's saved vehicles", async () => {
		mocks.getVehicles.mockResolvedValue([{ id: 3 }])
		const { result } = renderHook(() => useVehicles(), {
			wrapper: queryWrapper(),
		})
		await waitFor(() => expect(result.current.data).toEqual([{ id: 3 }]))
	})
})

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
