'use client'
import { SignInButton, SignOutButton, UserButton, useAuth } from '@clerk/nextjs'
import { Bot, ClipboardCheck, LogOut, Mail } from 'lucide-react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

/** Sign in, or the signed-in driver's links, from Clerk's client session. */
export function HeaderNav() {
	const { isLoaded, isSignedIn } = useAuth()

	if (!isLoaded) return <div className="h-9 w-24" />

	if (!isSignedIn) {
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
				aria-label="Email pre-trips"
				className={buttonVariants({ variant: 'ghost', size: 'sm' })}
				href="/email"
			>
				<Mail />
				<span className="hidden sm:inline">Email</span>
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
			<div className="ml-1 flex size-9 items-center justify-center">
				<UserButton
					appearance={{ elements: { avatarBox: 'size-8' } }}
				/>
			</div>
		</nav>
	)
}
