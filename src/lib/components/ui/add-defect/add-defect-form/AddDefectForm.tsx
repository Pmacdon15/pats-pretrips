import { useAddDefectOnRoute } from '@/lib/hooks/mutations/mutations'
import { AddDefect } from '../AddDefect'

export default function AddDefectForm({
	tripId,
	driverEmail,
}: {
	tripId: number
	driverEmail: string
}) {
	const { mutate, isError, isPending } = useAddDefectOnRoute(
		tripId,
		driverEmail,
	)
	return (
		<form
			action={(formData: FormData) => {
				mutate({ driverEmail, tripId, formData })
				console.log('Pressed')
			}}
			className="flex w-full flex-col gap-4"
		>
			<AddDefect required={true} />
			{isError && (
				<div className="text-center text-red-600">
					Error Adding Defect
				</div>
			)}
			<div className="flex w-full justify-center">
				<button
					className={`w-full rounded-lg bg-green-500 p-4 hover:bg-green-600 md:w-3/6`}
					disabled={isPending}
					type="submit"
				>
					Add on Route Defects
				</button>
			</div>
		</form>
	)
}
