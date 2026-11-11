import { Suspense } from 'react'
import DisplayTripsFallback from '@/components/fallbacks/display-trips-fallback'
import DisplayTrips from '@/components/trips/display-trips/DisplayTrips'
import { fetchCurrentTrips, fetchPastTrips } from '@/lib/DAL/trips'

const toPage = (value: string | string[] | undefined) =>
	Math.max(1, Number(value) || 1)

export default function Page(props: PageProps<'/pretrips'>) {
	const currentTripsPromise = props.searchParams.then((search) =>
		fetchCurrentTrips(toPage(search.page)),
	)
	const pastTripsPromise = props.searchParams.then((search) =>
		fetchPastTrips(toPage(search.pastPage)),
	)

	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-8">
			<Suspense fallback={<DisplayTripsFallback />}>
				<DisplayTrips
					currentTripsPromise={currentTripsPromise}
					pastTripsPromise={pastTripsPromise}
				/>
			</Suspense>
		</div>
	)
}
