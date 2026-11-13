import { ConnectAi } from '@/components/connect/connect-ai'

export const metadata = { title: "Connect your AI · Pat's PreTrips" }

/** Static: how to connect an AI app. Nothing on this page loads data. */
export default function Page() {
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-8">
			<ConnectAi />
		</div>
	)
}
