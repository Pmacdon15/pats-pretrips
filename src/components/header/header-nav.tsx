'use client'
import { SignInButton, SignOutButton, UserButton, useAuth } from '@clerk/nextjs'
import {
	Bot,
	ClipboardCheck,
	LogOut,
	Mail,
	PenLine,
	Truck,
	Wrench,
} from 'lucide-react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

/**
 * The signed-in driver's pages, shown in the header and again in Clerk's
 * profile menu (the avatar), so every page is a tap away on a phone too.
 */
export const NAV_LINKS = [
	{ href: '/pretrips', label: 'My Trips', icon: ClipboardCheck },
	{ href: '/vehicles', label: 'Vehicles', icon: Truck },
	{ href: '/defects', label: 'Defects', icon: Wrench },
	{ href: '/email', label: 'Email', icon: Mail },
	{ href: '/signature', label: 'Signature', icon: PenLine },
	{ href: '/connect', label: 'Connect AI', icon: Bot },
] as const

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
				aria-label="Your vehicles"
				className={buttonVariants({ variant: 'ghost', size: 'sm' })}
				href="/vehicles"
			>
				<Truck />
				<span className="hidden sm:inline">Vehicles</span>
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
				className={buttonVariants({ variant: 'ghost', size: 'sm' })}
				href="/email"
			>
				<Mail />
				<span className="hidden sm:inline">Email</span>
			</Link>
			<Link
				aria-label="Your signature"
				className={buttonVariants({ variant: 'ghost', size: 'sm' })}
				href="/signature"
			>
				<PenLine />
				<span className="hidden sm:inline">Signature</span>
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
			<div className="flex size-9 items-center justify-center sm:ml-1">
				<UserButton appearance={{ elements: { avatarBox: 'size-8' } }}>
					<UserButton.MenuItems>
						{NAV_LINKS.map(({ href, label, icon: Icon }) => (
							<UserButton.Link
								href={href}
								key={href}
								label={label}
								labelIcon={<Icon className="size-4" />}
							/>
						))}
					</UserButton.MenuItems>
				</UserButton>
			</div>
		</nav>
	)
}
