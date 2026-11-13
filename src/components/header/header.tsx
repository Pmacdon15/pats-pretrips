import { Truck } from 'lucide-react'
import Link from 'next/link'
import { HeaderNav } from './header-nav'

/** Static: the nav reads the session in the browser, so pages can prerender. */
export default function Header() {
	return (
		<header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
			<div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-2 px-4 sm:gap-4">
				<Link
					aria-label="Pat's PreTrips"
					className="flex min-w-0 items-center gap-2 font-semibold text-base tracking-tight sm:text-lg"
					href="/"
				>
					<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
						<Truck className="size-5" />
					</span>
					<span className="hidden truncate min-[380px]:inline">
						Pat&apos;s{' '}
						<span className="text-primary">PreTrips</span>
					</span>
				</Link>
				<HeaderNav />
			</div>
		</header>
	)
}
