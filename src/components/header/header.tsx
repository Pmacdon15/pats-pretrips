import { SignInButton, SignOutButton } from '@clerk/nextjs'
import { Bot, ClipboardCheck, LogOut, Truck } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { isSignedIn } from '@/lib/auth'

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
	const loggedIn = await isSignedIn()

	if (!loggedIn) {
		return (
			<SignInButton forceRedirectUrl="/pretrips">
				<button
					className={buttonVariants({ size: 'sm' })}
					type="button"
				>
					Sign in
				</button>
			</SignInButton>
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
			<Link
				aria-label="Connect your AI"
				className={buttonVariants({ variant: 'ghost', size: 'sm' })}
				href="/connect"
			>
				<Bot />
				<span className="hidden sm:inline">Connect AI</span>
			</Link>
			<SignOutButton redirectUrl="/">
				<button
					aria-label="Sign out"
					className={buttonVariants({ variant: 'ghost', size: 'sm' })}
					type="button"
				>
					<LogOut />
					<span className="hidden sm:inline">Sign out</span>
				</button>
			</SignOutButton>
		</nav>
	)
}
