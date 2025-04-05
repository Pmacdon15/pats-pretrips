import { useQuery } from '@tanstack/react-query';
import { Trip } from '@/types/types'

const fetchTrips = async (driverEmail: string): Promise<Array<Trip>> => {
  const response = await fetch(`/api/trips/${driverEmail}`)
  // console.log(JSON.stringify(response))
  return await response.json();
}

export const useGetTrips = (driverEmail: string) => {
  return useQuery({
    queryKey: ['trips', driverEmail],
    queryFn: () => fetchTrips(driverEmail),
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
  })
}


//TODO: Add check to make sure vars are present
