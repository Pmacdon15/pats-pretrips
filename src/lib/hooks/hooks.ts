import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { getAddress } from '../actions/actions'
import { getCarriers } from '../actions/carriers'
import { getSignatureStatus } from '../actions/signatures'
import { getVehicles } from '../actions/vehicles'

export const SIGNATURE_STATUS_KEY = ['signatureStatus']
export const VEHICLES_KEY = ['vehicles']
export const CARRIERS_KEY = ['carriers']

/** The driver's saved carriers, for the Carriers page and the trip form. */
export const useCarriers = () => {
	return useQuery({
		queryKey: CARRIERS_KEY,
		queryFn: () => getCarriers(),
		staleTime: 5 * 60 * 1000,
	})
}

/** The driver's saved vehicles, for the Vehicles page and the trip form. */
export const useVehicles = () => {
	return useQuery({
		queryKey: VEHICLES_KEY,
		queryFn: () => getVehicles(),
		staleTime: 5 * 60 * 1000,
	})
}

/** Whether the driver has a saved signature to sign pre-trips with. */
export const useSignatureStatus = () => {
	return useQuery({
		queryKey: SIGNATURE_STATUS_KEY,
		queryFn: () => getSignatureStatus(),
		staleTime: 5 * 60 * 1000,
	})
}

/**
 * The address for the driver's (rounded) position. `getAddress` returns only
 * Google's status and the first `formatted_address`; on any failure there is
 * none and the driver types it. The result stays in this browser only (see
 * docs/geocoding.md for why nothing is cached on the server).
 */
export const useGetAddress = (lat: number, long: number) => {
	return useQuery({
		queryKey: ['inspectionAddress', lat, long],
		queryFn: () => getAddress(lat, long),
		enabled: !!lat && !!long,
		staleTime: 5 * 60 * 1000,
	})
}

type LocationStatus = 'loading' | 'ready' | 'denied' | 'unsupported'

export function useGetLocation() {
	const [location, setLocation] = useState<{
		latitude: number
		longitude: number
	} | null>(null)
	const [status, setStatus] = useState<LocationStatus>('loading')

	useEffect(() => {
		if (!navigator.geolocation) {
			setStatus('unsupported')
			return
		}
		navigator.geolocation.getCurrentPosition(
			(position) => {
				// Round to ~10m so tiny GPS jitter reuses the cached address.
				setLocation({
					latitude: Number(position.coords.latitude.toFixed(4)),
					longitude: Number(position.coords.longitude.toFixed(4)),
				})
				setStatus('ready')
			},
			() => setStatus('denied'),
			{ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
		)
	}, [])

	return { location, status }
}
