// import { keepPreviousData, useQuery } from '@tanstack/react-query'
// import { getAddress } from '@/lib/actions/actions'
// import type { Trip } from '@/lib/types/types'

import { useQuery } from "@tanstack/react-query"
import { getAddress } from "../actions/actions"
import { useEffect, useState } from "react"

// const fetchTrips = async (driverEmail: string): Promise<Array<Trip>> => {
// 	const response = await fetch(`/api/trips/${driverEmail}?page=2`)
// 	return await response.json()
// }

// export const useGetTrips = (driverEmail: string) => {
// 	return useQuery({
// 		queryKey: ['trips', driverEmail],
// 		queryFn: () => fetchTrips(driverEmail),
// 		enabled: !!driverEmail,
// 	})
// }

// const fetchPastTrips = async ({
// 	driverEmail,
// 	page,
// }: {
// 	driverEmail: string
// 	page: number
// }) => {
// 	const response = await fetch(
// 		`/api/pastTrips/${driverEmail}?page=${page}&limit=${process.env.LIMIT_FOR_PAG || 4}`,
// 	)
// 	return await response.json()
// }

// export const useGetPastTrips = (driverEmail: string, page: number) => {
// 	return useQuery({
// 		queryKey: ['trips', driverEmail, page],
// 		queryFn: () => fetchPastTrips({ driverEmail, page }),
// 		placeholderData: keepPreviousData,
// 		enabled: !!driverEmail && !!page,
// 	})
// }

// const fetchTrip = async (
// 	tripId: number,
// 	driverEmail: string,
// ): Promise<Trip> => {
// 	const response = await fetch(`/api/trip/${tripId}/${driverEmail}`)
// 	return await response.json()
// }

// export const useGetTrip = (tripId: number, driverEmail: string) => {
// 	return useQuery({
// 		queryKey: ['trip', tripId, driverEmail],
// 		queryFn: () => fetchTrip(tripId, driverEmail),
// 		enabled: !!tripId && !!driverEmail,
// 	})
// }

export const useGetAddress = (
	lat: number,
	long: number,	
) => {
	return useQuery({
		queryKey: ['inspectionAddress', lat, long],
		queryFn: () => getAddress(lat, long),
		enabled: !!lat && !!long
	})
}

export function useGetLocation() {
	const [location, setLocation] = useState<{
		latitude: number
		longitude: number
	} | null>(null)

	useEffect(() => {
		async function getLocation() {
			if (navigator.geolocation) {
				navigator.geolocation.getCurrentPosition(async (position) => {
					setLocation({
						latitude: position.coords.latitude,
						longitude: position.coords.longitude,
					})
				})
				console.log("location",location)
			} else {
				console.log('Geolocation is not supported by this browser.')
			}
		}
		getLocation()
	}, [location])

	return { location }
}