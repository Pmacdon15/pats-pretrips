import { ConnectAi } from '@/components/connect/connect-ai'
import { getApiKeysDAL } from '@/lib/DAL/api-keys'

export const metadata = { title: "Connect your AI · Pat's PreTrips" }

export default function Page() {
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-8">
			<ConnectAi keysPromise={getApiKeysDAL()} />
		</div>
	)
}
