import type { KindeUser } from '@kinde-oss/kinde-auth-nextjs'

export default async function PageHead({
	userPromise,
}: {
	userPromise?:
		| Promise<KindeUser<Record<string, string>> | null>
		| Promise<void>
}) {
	const user = await userPromise
	return (
		<div className="w-full rounded-sm bg-[var(--color-background)] p-4 shadow-xl">
			Driver Name: {user?.given_name}
			<br />
			Driver Email: {user?.email}
		</div>
	)
}
