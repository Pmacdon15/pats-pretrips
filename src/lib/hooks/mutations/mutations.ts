import { useMutation } from '@tanstack/react-query'
import { addOnRouteDefects, addTrip } from '@/lib/actions/actions'
import { revalidatePathAction } from '@/lib/actions/revalidate-actions'

export const useAddDefectOnRoute = (tripId: number, _driverEmail: string) => {
	return useMutation({
		mutationFn: ({
			formData,
			driverEmail,
			tripId,
		}: {
			formData: FormData
			driverEmail?: string
			tripId: number| null
		}) => {
			const bindWithDriverEmail = addOnRouteDefects.bind(
				null,
				driverEmail||"",
			)
			const bindActionWithTripId = bindWithDriverEmail.bind(null, Number(tripId))
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

export const useAddTrip = () => {
	return useMutation({
		mutationFn: ({
			formData,
			driverEmail,
		}: {
			formData: FormData
			driverEmail: string
		}) => {
			const bindWithDriverEmail = addTrip.bind(null, driverEmail)
			return bindWithDriverEmail(formData)
		},
		onSuccess: () => {},
		onError: (error) => {
			console.error('Mutation error:', error)
		},
	})
}
