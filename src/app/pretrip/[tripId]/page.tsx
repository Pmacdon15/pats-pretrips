import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server'
import { Suspense } from 'react'
import DisplayTripFallback from '@/components/fallbacks/display-trip-fallback'
import DisplayTrip from '@/components/trips/display-trip/DisplayTrip'
import { fetchTrip } from '@/lib/DAL/trips'

export default function Page(props: PageProps<'/pretrip/[tripId]'>) {
	const tripPromise = props.params.then((params) =>
		fetchTrip(Number(params.tripId)),
	)
	const { getUser } = getKindeServerSession()
	const userPromise = getUser()
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-8">
			<Suspense fallback={<DisplayTripFallback />}>
				<DisplayTrip
					tripPromise={tripPromise}
					userPromise={userPromise}
				/>
			</Suspense>
		</div>
	)
}
