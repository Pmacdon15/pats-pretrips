import { Mail } from 'lucide-react'
import { Suspense } from 'react'
import { EmailSettingsForm } from '@/components/email/email-settings'
import { SpacePricingTable } from '@/components/email/space-pricing'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { getEmailAccessDAL } from '@/lib/DAL/email'

export const metadata = { title: 'Email pre-trips' }

export default function Page() {
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-8">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Mail className="size-5" /> Email pre-trips
					</CardTitle>
					<CardDescription>
						Send each pre-trip as a PDF to yourself, dispatch or
						your safety manager when you complete it, or from any
						trip at any time.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Suspense
						fallback={
							<div className="h-40 animate-pulse rounded-md bg-muted" />
						}
					>
						<EmailSettingsForm
							accessPromise={getEmailAccessDAL()}
							pricing={
								<div className="grid gap-4">
									<p className="text-muted-foreground text-sm">
										Emailing pre-trips is part of a paid
										plan. In an organization, its plan
										covers every member.
									</p>
									<SpacePricingTable />
								</div>
							}
						/>
					</Suspense>
				</CardContent>
			</Card>
		</div>
	)
}
