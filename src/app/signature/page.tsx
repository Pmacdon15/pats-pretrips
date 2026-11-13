import { PenLine } from 'lucide-react'
import { SignatureSettings } from '@/components/signature/signature-settings'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'

export const metadata = { title: "Signature · Pat's PreTrips" }

export default function Page() {
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-8">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<PenLine className="size-5" /> Your signature
					</CardTitle>
					<CardDescription>
						Sign once and every new pre-trip is signed with it,
						including the ones your AI assistant starts for you.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<SignatureSettings />
				</CardContent>
			</Card>
		</div>
	)
}
