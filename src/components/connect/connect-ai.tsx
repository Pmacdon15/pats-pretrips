import { Bot } from 'lucide-react'
import { Suspense } from 'react'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import type { ApiKey } from '@/lib/api-keys'
import { ApiKeys } from './api-keys'
import { CopyButton } from './copy-button'

export const MCP_URL = 'https://patspretrips.ca/api/mcp'

/**
 * How to connect an AI assistant. The URL and steps render straight away;
 * the driver's API keys stream in.
 */
export function ConnectAi({ keysPromise }: { keysPromise: Promise<ApiKey[]> }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Bot className="size-5" /> Connect your AI
				</CardTitle>
				<CardDescription>
					Add PreTrips to Claude, Muse, Gemini or any app that
					supports MCP connectors. Then send it a photo of the
					odometer and the licence plate, tell it the make and model,
					and it starts your pre-trip.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4 text-sm">
				<div className="flex items-center gap-2">
					<code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-xs">
						{MCP_URL}
					</code>
					<CopyButton label="Copy connector URL" value={MCP_URL} />
				</div>
				<ol className="grid list-decimal gap-1 pl-5 text-muted-foreground">
					<li>
						In your AI app, add a custom connector with this URL.
					</li>
					<li>Sign in with your PreTrips account when it asks.</li>
					<li>
						Send it your photos. It shows you the trip and only
						saves it once you say OK.
					</li>
				</ol>
				<div className="grid gap-2 border-t pt-4">
					<p className="text-muted-foreground">
						App can&apos;t sign in? Give it the URL and an API key
						instead.
					</p>
					<Suspense
						fallback={
							<div className="h-10 animate-pulse rounded-md bg-muted" />
						}
					>
						<ApiKeys keysPromise={keysPromise} />
					</Suspense>
				</div>
			</CardContent>
		</Card>
	)
}
