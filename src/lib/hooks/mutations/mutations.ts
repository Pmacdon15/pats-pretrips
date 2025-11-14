import { useMutation } from '@tanstack/react-query'
import type { z } from 'zod'
import { addOnRouteDefects, addTrip } from '@/lib/actions/actions'
import { revalidatePathAction } from '@/lib/actions/revalidate-actions'
import type { schemaAddDefects, schemaAddTripForm } from '@/lib/ZOD/schemas'

export const useAddDefectOnRoute = (tripId: number) => {
	return useMutation({
		mutationFn: async ({
			data,
			driverEmail,
			tripId,
		}: {
			data: z.infer<typeof schemaAddDefects>
			driverEmail?: string
			tripId: number | null
		}) => {
			if (!driverEmail || !tripId) {
				throw new Error('Driver email and trip ID are required')
			}
			return addOnRouteDefects(driverEmail, tripId, data)
		},
		onSuccess: () => {
			revalidatePathAction('/pretrips')
			revalidatePathAction(`/pretrip/[${tripId}]`)
		},
		onError: (error) => {
			console.error('Mutation error:', error)
		},
	})
}
export const useAddTrip = (options?: {
	onSuccess?: () => void
	onError?: (error: unknown) => void
}) => {
	return useMutation({
		mutationFn: ({ data }: { data: z.infer<typeof schemaAddTripForm> }) => {
			return addTrip(data)
		},
		onSuccess: () => {
			options?.onSuccess?.()
			revalidatePathAction('/pretrips')
		},
		onError: options?.onError,
	})
}
