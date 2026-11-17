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

/** Shown from tablet width up; on phones every page lives in the avatar menu. */
const primaryLink = cn(
	buttonVariants({ variant: 'ghost', size: 'sm' }),
	'hidden sm:inline-flex',
)

/**
 * Icon-only on wide screens, so with every link showing there is still room
 * for the organization switcher; on phones they move into the avatar menu.
 */
const secondaryLink = cn(
	buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
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
		<nav className="flex min-w-0 items-center gap-1">
			<Link
				aria-label="My Trips"
				className={primaryLink}
				href="/pretrips"
			>
				<ClipboardCheck />
				My Trips
			</Link>
			<Link
				aria-label="Your vehicles"
				className={primaryLink}
				href="/vehicles"
			>
				<Truck />
				Vehicles
			</Link>
			<Link
				aria-label="Defects and repairs"
				className={primaryLink}
				href="/defects"
			>
				<Wrench />
				Defects
			</Link>
			<Link
				aria-label="Your carriers"
				className={secondaryLink}
				href="/carriers"
				title="Carriers"
			>
				<Building2 />
				<span className="sr-only">Carriers</span>
			</Link>
			<Link
				aria-label="Email pre-trips"
				className={secondaryLink}
				href="/email"
				title="Email"
			>
				<Mail />
				<span className="sr-only">Email</span>
			</Link>
			<Link
				aria-label="Your signature"
				className={secondaryLink}
				href="/signature"
				title="Signature"
			>
				<PenLine />
				<span className="sr-only">Signature</span>
			</Link>
			<Link
				aria-label="Connect your AI"
				className={secondaryLink}
				href="/connect"
				title="Connect AI"
			>
				<Bot />
				<span className="sr-only">Connect AI</span>
			</Link>
			<SignOutButton redirectUrl="/">
				<button
					aria-label="Sign out"
					className={secondaryLink}
					title="Sign out"
					type="button"
				>
					<LogOut />
					<span className="sr-only">Sign out</span>
				</button>
			</SignOutButton>
			{/*
			 * The active space: the driver's personal space or one of their
			 * organizations (docs/organizations.md). Switching changes whose
			 * vehicles, carriers, email settings and plan the app uses.
			 */}
			<div className="flex min-w-24 max-w-40 items-center overflow-hidden sm:ml-1 sm:max-w-44">
				<OrganizationSwitcher
					afterCreateOrganizationUrl="/vehicles"
					appearance={{
						elements: {
							organizationSwitcherTrigger:
								'max-w-full min-w-0 px-1.5 py-1',
							organizationPreview: 'min-w-0',
							organizationPreviewTextContainer: 'min-w-0',
							organizationPreviewMainIdentifier: 'truncate',
							userPreview: 'min-w-0',
							userPreviewTextContainer: 'min-w-0',
							userPreviewMainIdentifier: 'truncate',
						},
					}}
					hidePersonal={false}
				/>
			</div>
			<div className="flex size-9 shrink-0 items-center justify-center sm:ml-1">
				<UserButton appearance={{ elements: { avatarBox: 'size-8' } }}>
					{/* Every page; on phones this menu is the only nav, and Carriers, Email, Signature and Connect AI live only here below lg. The menu already has Sign out. */}
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
