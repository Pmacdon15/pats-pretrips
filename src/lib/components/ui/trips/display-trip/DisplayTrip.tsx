'use client'

import { useGetTrip } from '@/lib/hooks/hooks'
import { useAddDefectOnRoute } from '@/lib/hooks/mutations/mutations'
import type { Trip } from '@/lib/types/types'
import { BackLink } from '../../links/back-home-button'
import Message from '../../message/Message'
import AddDefectForm from '../../add-defect/add-defect-form/AddDefectForm'

export default function DisplayTrip({
	tripId,
	driverEmail,
	driverName,
}: {
	tripId: number
	driverEmail: string
	driverName: string
}) {
	const {
		data,
		isPending,
		isError: isErrorLoadingTrip,
	} = useGetTrip(tripId, driverEmail)
	// This mutate is created on this component and passed the the AddDefectForm so that the query client matches and then there is no need for a call back
	const {
		mutate,
		isError: isErrorMutating,
		isPending: isPendingChange,
	} = useAddDefectOnRoute(tripId, driverEmail)

	const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

	if (isPending)
		return <Message driverEmail={driverEmail} message={'Loading.......'} />
	if (isErrorLoadingTrip)
		return <Message driverEmail={driverEmail} message={'Error Loading'} />

	return (
		<div className="flex w-full flex-col gap-4 rounded-sm bg-[var(--color-primary)] p-4 shadow-sm md:w-4/6">
			<BackLink />

			<PageHead driverEmail={data.driveremail} driverName={driverName} />

			<table className="w-full overflow-hidden rounded-sm border p-4">
				<TableHead />
				<TableBody data={data} />
			</table>

			{data?.date && new Date(data.date) > twentyFourHoursAgo && (
				<AddDefectForm
					driverEmail={driverEmail}
					formAction={mutate}
					isError={isErrorMutating}
					isPendingChange={isPendingChange}
					tripId={Number(data.tripid)}
				/>
			)}
		</div>
	)
}

function PageHead({
	driverName,
	driverEmail,
}: {
	driverName: string
	driverEmail: string
}) {
	return (
		<div className="w-full rounded-sm bg-[var(--color-background)] p-4 shadow-xl">
			Driver Name: {driverName}
			<br />
			Driver Email: {driverEmail}
		</div>
	)
}

function TableHead() {
	return (
		<thead>
			<tr className="border-b">
				<th className="w-1/3 rounded-sm p-2 text-left">Category</th>
				<th className="w-1/3 rounded-sm p-2 text-left">Value</th>
			</tr>
		</thead>
	)
}

function TableBody({ data }: { data: Trip }) {
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
