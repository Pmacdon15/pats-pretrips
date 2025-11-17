import { useMutation } from '@tanstack/react-query'
import type { z } from 'zod'
import { addOnRouteDefects, addTrip } from '@/lib/actions/actions'
import type { schemaAddDefects, schemaAddTripForm } from '@/lib/ZOD/schemas'
import { updateTagAction } from '../actions/update-tags-action'

export const useAddDefectOnRoute = (	
	options?: {
		onSuccess?: () => void
		onError?: (error: unknown) => void
	},
) => {
	return useMutation({
		mutationFn: async ({
			data,
			tripId,
		}: {
			data: z.infer<typeof schemaAddDefects>
			driverEmail?: string
			tripId: number | null
		}) => {
			return addOnRouteDefects(data, tripId)
		},
		onSuccess: () => {
			options?.onSuccess?.()
			updateTagAction('current-trips')
			updateTagAction('trip')
			// updateTagAction('past-trips')
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
			updateTagAction('current-trips')
			// updateTagAction('past-trips')
		},
		onError: options?.onError,
	})
}
