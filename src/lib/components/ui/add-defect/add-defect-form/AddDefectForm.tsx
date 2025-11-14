import { AddDefect } from "../AddDefect"


export default function AddDefectForm({
	tripId,
	driverEmail,
	isError,
	isPendingChange,
	formAction,
}: {
	tripId: number
	driverEmail: string
	isError: boolean
	isPendingChange: boolean
	formAction: ({
		driverEmail,
		tripId,
		formData,
	}: {
		driverEmail: string
		tripId: number
		formData: FormData
	}) => void
}) {
	return (
		<form
			action={(formData: FormData) =>
				formAction({ driverEmail, tripId, formData })
			}
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
					disabled={isPendingChange}
					type="button"
				>
					Add on Route Defects
				</button>
			</div>
		</form>
	)
}
