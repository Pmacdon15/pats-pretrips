import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { z } from 'zod'
import { addOnRouteDefects, addTrip } from '@/lib/actions/actions'
import { SIGNATURE_STATUS_KEY } from '@/lib/hooks/hooks'
import type { schemaAddDefects, schemaAddTripForm } from '@/lib/ZOD/schemas'

export const useAddDefectOnRoute = () => {
	return useMutation({
		mutationFn: async ({
			data,
		}: {
			data: z.infer<typeof schemaAddDefects>
			driverEmail?: string
		}) => {
			const res = await addOnRouteDefects(data)

			if (res && 'errorMessage' in res) {
				throw new Error(res.errorMessage)
			}

			if (res && 'value' in res) {
				return res.value
			}
			return res
		},
		onSuccess: () => {
			toast.success('On-route defects saved')
		},
		onError: (error) => {
			toast.error('Could not add defects', {
				description:
					error instanceof Error
						? error.message
						: 'An error occurred while uploading your trip.',
			})
		},
	})
}
export const useAddTrip = () => {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: async ({
			data,
		}: {
			data: z.infer<typeof schemaAddTripForm>
		}) => {
			const res = await addTrip(data)
			if (res && 'errorMessage' in res) {
				throw new Error(res.errorMessage)
			}

			if (res && 'value' in res) {
				return res.value
			}
			return res
		},
		onSuccess: (_trip, { data }) => {
			toast.success('Pre-trip saved')
			// A drawn signature may now be the driver's saved one.
			if (data.saveSignature && data.signature !== 'saved') {
				queryClient.invalidateQueries({
					queryKey: SIGNATURE_STATUS_KEY,
				})
			}
		},
		onError: (error) => {
			toast.error('Could not save pre-trip', {
				description:
					error instanceof Error
						? error.message
						: 'An error occurred while uploading your trip.',
			})
		},
	})
}
