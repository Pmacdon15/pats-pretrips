import { UserRound } from 'lucide-react'
import { use } from 'react'
import type { Driver } from '@/lib/auth'

export default function PageHead({
	userPromise,
}: {
	userPromise?: Promise<Driver | null> | null
}) {
	const user = userPromise ? use(userPromise) : null
	const name = [user?.givenName, user?.familyName].filter(Boolean).join(' ')
	return (
		<div className="flex items-center gap-3 text-sm">
			<span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<UserRound className="size-4" />
			</span>
			<div className="min-w-0">
				<p className="font-medium">{name || 'Driver'}</p>
				<p className="truncate text-muted-foreground">
					{user?.email ?? ' '}
				</p>
			</div>
		</div>
	)
}
