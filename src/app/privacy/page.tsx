import type { Metadata } from 'next'
import { Disclaimer } from '@/components/disclaimer/disclaimer'

export const metadata: Metadata = {
	title: 'Privacy policy',
	description:
		"How Pat's PreTrips handles your data: we only store your email to tie your pre-trip inspections to you, and never share or sell it.",
	alternates: { canonical: '/privacy' },
}

export default function Page() {
	return (
		<Disclaimer
			name=" Privacy policy"
			text="At Pat&apos;s Pre-Trips, we take your privacy seriously. We only collect and store your email address, which is used solely to associate you with the
                    trips you save on our platform. Your email is securely stored in our database and is not shared with any third parties or used for marketing purposes.
                    We do not collect, track, or store any additional personal information. If you have any questions about our privacy practices, please contact us."
		/>
	)
}
