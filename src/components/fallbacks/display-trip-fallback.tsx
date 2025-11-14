import { BackLink } from '../links/back-home-button'
import { DisplayTripTableHead } from '../trips/display-trip/displayTripTable'
import PageHead from '../trips/display-trip/page-head'

export default function DisplayTripFallback() {
	return (
		<div className="flex w-full flex-col gap-4 rounded-sm bg-[var(--color-primary)] p-4 shadow-sm md:w-4/6">
			<BackLink />
			<PageHead />

			<table className="w-full overflow-hidden rounded-sm border p-4">
				<DisplayTripTableHead />
				<tbody className="rounded-sm">
					<tr className="border-b">
						<td className="w-1/3 rounded-sm p-2 text-left">
							Loading....
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	)
}
