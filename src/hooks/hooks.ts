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
