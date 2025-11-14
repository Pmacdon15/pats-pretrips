import { useMutation } from '@tanstack/react-query'
import type { z } from 'zod'
import { addOnRouteDefects, addTrip } from '@/lib/actions/actions'
import { revalidatePathAction } from '@/lib/actions/revalidate-actions'
import type { schemaAddTripForm } from '@/lib/ZOD/schemas'

export const useAddDefectOnRoute = (tripId: number, _driverEmail: string) => {
	return useMutation({
		mutationFn: ({
			formData,
			driverEmail,
			tripId,
		}: {
			formData: FormData
			driverEmail?: string
			tripId: number | null
		}) => {
			const bindWithDriverEmail = addOnRouteDefects.bind(
				null,
				driverEmail || '',
			)
			const bindActionWithTripId = bindWithDriverEmail.bind(
				null,
				Number(tripId),
			)
			return bindActionWithTripId(formData)
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
