import type { KindeUser } from '@kinde-oss/kinde-auth-nextjs'
import { use } from 'react'

export default function PageHead({
	userPromise,
}: {
	userPromise:
		| Promise<KindeUser<Record<string, string>> | null>
		| null
}) {
	const user = userPromise ? use(userPromise) : null
	return (
		<div className="w-full rounded-sm bg-[var(--color-background)] p-4 shadow-xl">
			Driver Name: {user?.given_name}
			<br />
			Driver Email: {user?.email}
		</div>
	)
}
