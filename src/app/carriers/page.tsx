import { CarrierList } from '@/components/carriers/carrier-list'
import { CarriersHeader } from '@/components/carriers/carriers-header'
import { Card, CardContent } from '@/components/ui/card'

export const metadata = { title: 'Carriers' }

export default function Page() {
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-8">
			<Card>
				<CarriersHeader />
				<CardContent>
					<CarrierList />
				</CardContent>
			</Card>
		</div>
	)
}
