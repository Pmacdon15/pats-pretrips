import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { BackLink } from '../links/back-home-button'

export default function DisplayTripFallback() {
	return (
		<div className="flex flex-col gap-6">
			<BackLink />
			<div className="flex flex-col gap-2">
				<div className="h-4 w-32 animate-pulse rounded bg-muted" />
				<div className="h-8 w-64 animate-pulse rounded bg-muted" />
			</div>
			{[0, 1].map((i) => (
				<Card key={i}>
					<CardHeader>
						<div className="h-5 w-40 animate-pulse rounded bg-muted" />
					</CardHeader>
					<CardContent className="grid gap-5 sm:grid-cols-2">
						{[0, 1, 2, 3].map((j) => (
							<div className="flex flex-col gap-2" key={j}>
								<div className="h-3 w-20 animate-pulse rounded bg-muted" />
								<div className="h-4 w-40 animate-pulse rounded bg-muted" />
							</div>
						))}
					</CardContent>
				</Card>
			))}
		</div>
	)
}
