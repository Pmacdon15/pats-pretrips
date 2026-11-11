import type { KindeUser } from '@kinde-oss/kinde-auth-nextjs'
import { UserRound } from 'lucide-react'
import { use } from 'react'

export default function PageHead({
	userPromise,
}: {
	userPromise?: Promise<KindeUser<Record<string, string>> | null> | null
}) {
	const user = userPromise ? use(userPromise) : null
	const name = [user?.given_name, user?.family_name].filter(Boolean).join(' ')
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
