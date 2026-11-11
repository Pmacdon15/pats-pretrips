import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { getAddress } from '../actions/actions'

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
