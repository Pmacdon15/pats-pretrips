import { BackLink } from '../links/back-home-button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function DisplayTripFallback() {
	return (
		<>
		<div className="gap-6 flex-col flex">
			<BackLink />
			<div className="gap-2 flex flex-col">
				<div className="bg-muted rounded animate-pulse w-32 h-4" />
				<div className="w-64 h-8 bg-muted animate-pulse rounded" />
			</div>
			{[0, 1].map((i) => (
				<Card key={i}>
					<CardHeader>
						<div className="animate-pulse h-5 bg-muted w-40 rounded" />
					</CardHeader>
					<CardContent className="sm:grid-cols-2 grid gap-5">
						{[0, 1, 2, 3].map((j) => (
							<div key={j} className="flex-col gap-2 flex">
								<div className="rounded h-3 w-20 bg-muted animate-pulse" />
								<div className="bg-muted h-4 animate-pulse rounded w-40" />
							</div>
						))}
					</CardContent>
				</Card>
			))}
		</div>
		</>
	)
}
