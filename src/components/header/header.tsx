import { LoginLink, LogoutLink } from '@kinde-oss/kinde-auth-nextjs/components'
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server'
import { ClipboardCheck, LogOut, Truck } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'
import { buttonVariants } from '@/components/ui/button'

export default function Header() {
	return (
		<header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
			<div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
				<Link
					className="flex items-center gap-2 font-semibold text-lg tracking-tight"
					href="/"
				>
					<span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
						<Truck className="size-5" />
					</span>
					<span>
						Pat&apos;s{' '}
						<span className="text-primary">PreTrips</span>
					</span>
				</Link>
				<Suspense fallback={<div className="h-9 w-24" />}>
					<HeaderNav />
				</Suspense>
			</div>
		</header>
	)
}

async function HeaderNav() {
	const { isAuthenticated } = getKindeServerSession()
	const loggedIn = await isAuthenticated()

	if (!loggedIn) {
		return (
			<LoginLink
				className={buttonVariants({ size: 'sm' })}
				postLoginRedirectURL="/pretrips"
			>
				Sign in
			</LoginLink>
		)
	}

	return (
		<nav className="flex items-center gap-1">
			<Link
				className={buttonVariants({ variant: 'ghost', size: 'sm' })}
				href="/pretrips"
			>
				<ClipboardCheck />
				My Trips
			</Link>
			<LogoutLink
				aria-label="Sign out"
				className={buttonVariants({ variant: 'ghost', size: 'sm' })}
			>
				<LogOut />
				<span className="hidden sm:inline">Sign out</span>
			</LogoutLink>
		</nav>
	)
}
