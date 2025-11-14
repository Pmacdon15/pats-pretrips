import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server'
import { Suspense } from 'react'
import AddDefectForm from '@/lib/components/ui/add-defect/add-defect-form/AddDefectForm'
import DisplayTripFallback from '@/lib/components/ui/fallbacks/display-trip-fallback'
import DisplayTrip from '@/lib/components/ui/trips/display-trip/DisplayTrip'
import {
	DisplayTripTableBody,
	DisplayTripTableHead,
} from '@/lib/components/ui/trips/display-trip/displayTripTable'
import PageHead from '@/lib/components/ui/trips/display-trip/page-head'
import { fetchTrip } from '@/lib/DAL/trips'

export default function Page(props: PageProps<'/pretrip/[tripId]'>) {
	const tripPromise = props.params.then((params) =>
		fetchTrip(Number(params.tripId)),
	)
	const { getUser } = getKindeServerSession()
	const userPromise = getUser()
	return (
		<div className="flex flex-col items-center justify-items-center gap-4 p-4">
			<Suspense fallback={<DisplayTripFallback />}>
				<DisplayTrip
					addDefectForm={<AddDefectForm tripPromise={tripPromise} />}
					pageHead={<PageHead userPromise={userPromise} />}
					tripTable={
						<table className="w-full overflow-hidden rounded-sm border p-4">
							<DisplayTripTableHead />
							<DisplayTripTableBody dataPromise={tripPromise} />
						</table>
					}
				/>
			</Suspense>
		</div>
	)
}
