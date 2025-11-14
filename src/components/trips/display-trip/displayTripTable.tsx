import type { Trip } from '@/lib/types/types'

export function DisplayTripTableHead() {
	return (
		<thead>
			<tr className="border-b">
				<th className="w-1/3 rounded-sm p-2 text-left">Category</th>
				<th className="w-1/3 rounded-sm p-2 text-left">Value</th>
			</tr>
		</thead>
	)
}

export async function DisplayTripTableBody({
	dataPromise,
}: {
	dataPromise: Promise<Trip>
}) {
	const data = await dataPromise
	return (
		<tbody className="rounded-sm">
			<tr className="border-b">
				<td className="w-1/3 rounded-sm p-2 text-left">Carrier</td>
				<td className="w-1/3 rounded-sm p-2 text-left">
					{data.carrier}
				</td>
			</tr>
			<tr className="border-b">
				<td className="w-1/3 rounded-sm p-2 text-left">
					Carrier Address
				</td>
				<td className="w-1/3 rounded-sm p-2 text-left">
					{data.carrieraddress}
				</td>
			</tr>
			<tr className="border-b">
				<td className="w-1/3 rounded-sm p-2 text-left">
					Inspection Address
				</td>
				<td className="w-1/3 rounded-sm p-2 text-left">
					{data.inspectionaddress}
				</td>
			</tr>
			<tr className="border-b">
				<td className="w-1/3 rounded-sm p-2 text-left">Truck Plate</td>
				<td className="w-1/3 rounded-sm p-2 text-left">
					{data.truckplate}
				</td>
			</tr>
			<tr className="border-b">
				<td className="w-1/3 rounded-sm p-2 text-left">
					Trailer Plate A
				</td>
				<td className="w-1/3 rounded-sm p-2 text-left">
					{data.trailerplatea}
				</td>
			</tr>
			<tr className="border-b">
				<td className="w-1/3 rounded-sm p-2 text-left">
					Trailer Plate B
				</td>
				<td className="w-1/3 rounded-sm p-2 text-left">
					{data.trailerplateb}
				</td>
			</tr>
			<tr className="border-b">
				<td className="w-1/3 rounded-sm p-2 text-left">Make</td>
				<td className="w-1/3 rounded-sm p-2 text-left">{data.make}</td>
			</tr>
			<tr className="border-b">
				<td className="w-1/3 rounded-sm p-2 text-left">Model</td>
				<td className="w-1/3 rounded-sm p-2 text-left">{data.model}</td>
			</tr>
			<tr className="border-b">
				<td className="w-1/3 rounded-sm p-2 text-left">Odometer</td>
				<td className="w-1/3 rounded-sm p-2 text-left">
					{data.odometer}
				</td>
			</tr>
			<tr className="border-b">
				<td className="w-1/3 rounded-sm p-2 text-left">Defects</td>
				<td className="w-1/3 rounded-sm p-2 text-left">
					{data.defects}
				</td>
			</tr>
			<tr className="border-b">
				<td className="w-1/3 rounded-sm p-2 text-left">Remarks</td>
				<td className="w-1/3 rounded-sm p-2 text-left">
					{data.remarks}
				</td>
			</tr>
			<tr className="border-b">
				<td className="w-1/3 rounded-sm p-2 text-left">
					Inspection Date
				</td>
				<td className="w-1/3 rounded-sm p-2 text-left">
					{new Date(data.date).toLocaleString('en-CA', {
						dateStyle: 'short',
						timeStyle: 'short',
					})}
				</td>
			</tr>
		</tbody>
	)
}
