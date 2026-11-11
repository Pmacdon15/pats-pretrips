import { Card } from '@/components/ui/card'
import { PageTitle } from '../trips/display-trips/DisplayTrips'

export default function DisplayTripsFallback() {
	return (
		<div className="flex flex-col gap-6">
			<PageTitle />
			<div className="h-14 w-full animate-pulse rounded-md bg-muted" />
			<Card className="overflow-hidden">
				<div className="flex flex-col gap-2 border-b px-5 py-4 sm:px-6">
					<div className="h-5 w-32 animate-pulse rounded bg-muted" />
					<div className="h-4 w-64 animate-pulse rounded bg-muted" />
				</div>
				<ul className="divide-y">
					{[0, 1, 2].map((i) => (
						<li
							className="flex flex-col gap-2 px-5 py-4 sm:px-6"
							key={i}
						>
							<div className="h-4 w-40 animate-pulse rounded bg-muted" />
							<div className="h-3 w-56 animate-pulse rounded bg-muted" />
						</li>
					))}
				</ul>
			</Card>
		</div>
	)
}
