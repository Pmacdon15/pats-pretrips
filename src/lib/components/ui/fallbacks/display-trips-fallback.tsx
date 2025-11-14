import { TableHead } from '../trips/display-trips/trips-table'

export default function DisplayTripsFallback() {
	return (
		<div className="flex w-full flex-col gap-4 rounded-sm bg-[var(--color-primary)] p-4 shadow-sm md:w-4/6">
			<div className="flex items-center justify-between">
				<h1 className="min-w-fit text-2xl">Current Trips</h1>
			</div>
			<div className="flex justify-end gap-2 rounded-sm bg-[var(--color-background)] p-2">
				<button className="cursor-pointer" type="button">
					View Past Trips
				</button>
			</div>
			<table className="w-full overflow-hidden rounded-sm border shadow-sm">
				<TableHead />
                <tr>
                    <td>Loading....</td>
                </tr>
			</table>
		</div>
	)
}
