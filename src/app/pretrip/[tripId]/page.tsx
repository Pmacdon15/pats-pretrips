import { Suspense } from 'react'
import DisplayTripFallback from '@/components/fallbacks/display-trip-fallback'
import DisplayTrip from '@/components/trips/display-trip/DisplayTrip'
import { getDriver } from '@/lib/auth'
import { getEmailAccessDAL } from '@/lib/DAL/email'
import { fetchTripRepairs } from '@/lib/DAL/repairs'
import { fetchTrip } from '@/lib/DAL/trips'

export default function Page(props: PageProps<'/pretrip/[tripId]'>) {
	const tripPromise = props.params.then((params) =>
		fetchTrip(Number(params.tripId)),
	)
	const repairsPromise = props.params.then((params) =>
		fetchTripRepairs(Number(params.tripId)),
	)
	const userPromise = getDriver()
	const emailAccessPromise = getEmailAccessDAL()
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-8">
			<Suspense fallback={<DisplayTripFallback />}>
				<DisplayTrip
					emailAccessPromise={emailAccessPromise}
					repairsPromise={repairsPromise}
					tripPromise={tripPromise}
					userPromise={userPromise}
				/>
			</Suspense>
		</div>
	)
}
