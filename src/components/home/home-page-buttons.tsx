import {
	LoginLink,
	LogoutLink,
	RegisterLink,
} from '@kinde-oss/kinde-auth-nextjs/components'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
export default async function HomePageButtons({
	isLoggedInPromise,
}: {
	isLoggedInPromise?: Promise<boolean> | null
}) {
	const isLoggedIn = await isLoggedInPromise
	return isLoggedIn ? (
		<div className="flex gap-4">
			<LogoutLink>
				<Button variant={'outline'}>Logout</Button>
			</LogoutLink>
			<Link href={'/pretrips'}>
				<Button variant={'outline'}>PreTrips</Button>
			</Link>
		</div>
	) : (
		<div className="flex gap-4">
			<LoginLink postLoginRedirectURL="/">Sign in</LoginLink>
			<RegisterLink postLoginRedirectURL="/">Sign up</RegisterLink>
		</div>
	)
}
