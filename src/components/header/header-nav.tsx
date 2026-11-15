'use client'
import {
	OrganizationSwitcher,
	SignInButton,
	SignOutButton,
	UserButton,
	useAuth,
} from '@clerk/nextjs'
import {
	Bot,
	Building2,
	ClipboardCheck,
	LogOut,
	Mail,
	PenLine,
	Truck,
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

/**
 * Every page of the app, listed in the avatar menu so each one is a tap away
 * on a phone, where the header shows only some of them.
 */
export const NAV_LINKS = [
	{ href: '/pretrips', label: 'My Trips', icon: ClipboardCheck },
	{ href: '/vehicles', label: 'Vehicles', icon: Truck },
	{ href: '/carriers', label: 'Carriers', icon: Building2 },
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
				aria-label="Your carriers"
				className={secondaryLink}
				href="/carriers"
			>
				<Building2 />
				Carriers
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
			{/*
			 * The active space: the driver's personal space or one of their
			 * organizations (docs/organizations.md). Switching changes whose
			 * vehicles, carriers, email settings and plan the app uses.
			 */}
			<div className="flex max-w-28 items-center sm:ml-1 sm:max-w-44">
				<OrganizationSwitcher
					afterCreateOrganizationUrl="/vehicles"
					appearance={{
						elements: {
							organizationSwitcherTrigger:
								'max-w-full truncate px-1.5 py-1',
						},
					}}
					hidePersonal={false}
				/>
			</div>
			<div className="flex size-9 items-center justify-center sm:ml-1">
				<UserButton appearance={{ elements: { avatarBox: 'size-8' } }}>
					{/* Every page; Carriers, Email, Signature and Connect AI live only here on small screens. The menu already has Sign out. */}
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
