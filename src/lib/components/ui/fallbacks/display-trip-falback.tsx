import { BackLink } from '../links/back-home-button'
import { PageHead, TableHeadTrip } from '../trips/display-trip/DisplayTrip'

export default function DisplayTripFallback() {
	return (
		<div className="flex w-full flex-col gap-4 rounded-sm bg-[var(--color-primary)] p-4 shadow-sm md:w-4/6">
			<BackLink />
			<PageHead />

			<table className="w-full overflow-hidden rounded-sm border p-4">
				<TableHeadTrip />
				<tr>
					<td>Loading....</td>
				</tr>
			</table>
		</div>
	)
}
