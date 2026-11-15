'use client'
import { SignInButton, SignOutButton, UserButton, useAuth } from '@clerk/nextjs'
import {
	Bot,
	ClipboardCheck,
	LogOut,
	Mail,
	PenLine,
	Wrench,
} from 'lucide-react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Shown with labels on wide screens; on phones they move into the avatar menu. */
const secondaryLink = cn(
	buttonVariants({ variant: 'ghost', size: 'sm' }),
	'hidden lg:inline-flex',
)

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
		<nav className="flex shrink-0 items-center gap-0.5 sm:gap-1">
			<Link
				aria-label="My Trips"
				className={buttonVariants({ variant: 'ghost', size: 'sm' })}
				href="/pretrips"
			>
				<ClipboardCheck />
				<span className="hidden sm:inline">My Trips</span>
			</Link>
			<Link
				aria-label="Defects and repairs"
				className={buttonVariants({ variant: 'ghost', size: 'sm' })}
				href="/defects"
			>
				<Wrench />
				<span className="hidden sm:inline">Defects</span>
			</Link>
			<Link
				aria-label="Email pre-trips"
				className={secondaryLink}
				href="/email"
			>
				<Mail />
				Email
			</Link>
			<Link
				aria-label="Your signature"
				className={secondaryLink}
				href="/signature"
			>
				<PenLine />
				Signature
			</Link>
			<Link
				aria-label="Connect your AI"
				className={secondaryLink}
				href="/connect"
			>
				<Bot />
				Connect AI
			</Link>
			<SignOutButton redirectUrl="/">
				<button
					aria-label="Sign out"
					className={secondaryLink}
					type="button"
				>
					<LogOut />
					Sign out
				</button>
			</SignOutButton>
			<div className="flex size-9 items-center justify-center sm:ml-1">
				<UserButton appearance={{ elements: { avatarBox: 'size-8' } }}>
					{/* On small screens these live only here; the menu already has Sign out. */}
					<UserButton.MenuItems>
						<UserButton.Link
							href="/email"
							label="Email pre-trips"
							labelIcon={<Mail className="size-4" />}
						/>
						<UserButton.Link
							href="/signature"
							label="Your signature"
							labelIcon={<PenLine className="size-4" />}
						/>
						<UserButton.Link
							href="/connect"
							label="Connect your AI"
							labelIcon={<Bot className="size-4" />}
						/>
					</UserButton.MenuItems>
				</UserButton>
			</div>
		</nav>
	)
}
