import { useQuery } from '@tanstack/react-query';
import { Trip } from '@/types/types'
import { getAddress } from '@/actions/actions';

const fetchTrips = async (driverEmail: string): Promise<Array<Trip>> => {
  const response = await fetch(`/api/trips/${driverEmail}`)
  // console.log(JSON.stringify(response))
  return await response.json();
}

export const useGetTrips = (driverEmail: string) => {
  return useQuery({
    queryKey: ['trips', driverEmail],
    queryFn: () => fetchTrips(driverEmail),
    enabled: !!driverEmail,
  })
}

const fetchTrip = async (tripId: number, driverEmail: string): Promise<Trip> => {
  const response = await fetch(`/api/trip/${tripId}/${driverEmail}`)
  return await response.json();
}

export const useGetTrip = (tripId: number, driverEmail: string) => {
  return useQuery({
    queryKey: ['trip', tripId, driverEmail],
    queryFn: () => fetchTrip(tripId, driverEmail),
    enabled: !!tripId && !!driverEmail,
  })
}

export const useGetAddress = (lat: number, long: number, driverEmail: string) => {
  return useQuery({
    queryKey: ['inspectionAddress', lat, long, driverEmail],
    queryFn: () => getAddress(lat, long, driverEmail),
    enabled: !!lat && !!long && !!driverEmail,
  })
}


