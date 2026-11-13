import { ClipboardCheck, History, ShieldCheck, Truck } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'

const perks = [
	{ icon: ClipboardCheck, text: 'Log a pre-trip in a couple of minutes' },
	{ icon: History, text: 'Every inspection saved and easy to pull up' },
	{ icon: ShieldCheck, text: 'Your trips stay private — nothing is sold' },
]

/*
 * The frame around Clerk's sign-in and sign-up cards: a branded panel with the
 * fleet photo beside the form on wide screens, and just the form on phones.
 */
export default function AuthShell({
	title,
	subtitle,
	children,
}: {
	title: string
	subtitle: string
	children: React.ReactNode
}) {
	return (
		<div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 sm:py-16 lg:grid-cols-2 lg:items-center lg:gap-12">
			<section className="relative isolate hidden overflow-hidden rounded-2xl border shadow-lg lg:flex lg:min-h-[36rem] lg:flex-col lg:justify-end">
				<Image
					alt=""
					className="-z-10 object-cover"
					fill
					priority
					sizes="(min-width: 1024px) 480px, 0px"
					src="/images/modern_truck_fleet.png"
				/>
				<div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/40 via-slate-950/70 to-slate-950/95" />
				<div className="flex flex-col gap-6 p-8 text-white">
					<span className="flex size-12 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-lg">
						<Truck className="size-6" />
					</span>
					<div>
						<h2 className="font-extrabold text-3xl tracking-tight">
							Pre-trips done in minutes,{' '}
							<span className="text-emerald-400">
								not paperwork.
							</span>
						</h2>
					</div>
					<ul className="flex flex-col gap-3 text-slate-200">
						{perks.map((perk) => (
							<li
								className="flex items-center gap-3"
								key={perk.text}
							>
								<span className="flex size-8 items-center justify-center rounded-lg bg-white/10 backdrop-blur">
									<perk.icon className="size-4 text-emerald-300" />
								</span>
								{perk.text}
							</li>
						))}
					</ul>
				</div>
			</section>

			<section className="mx-auto flex w-full max-w-md flex-col gap-6">
				<div className="text-center lg:text-left">
					<h1 className="font-bold text-3xl tracking-tight">
						{title}
					</h1>
					<p className="mt-2 text-muted-foreground">{subtitle}</p>
				</div>
				{/* Clerk's card reads the request, so it streams in after the shell. */}
				<Suspense fallback={<AuthCardFallback />}>{children}</Suspense>
				<p className="text-center text-muted-foreground text-xs lg:text-left">
					By continuing you agree to our{' '}
					<Link
						className="underline hover:text-foreground"
						href="/termsOfService"
					>
						Terms of Service
					</Link>{' '}
					and{' '}
					<Link
						className="underline hover:text-foreground"
						href="/privacy"
					>
						Privacy Policy
					</Link>
					.
				</p>
			</section>
		</div>
	)
}

function AuthCardFallback() {
	return (
		<div
			aria-busy="true"
			className="flex h-[28rem] w-full flex-col gap-4 rounded-2xl border bg-card p-8 shadow-xl"
		>
			<span className="sr-only">Loading…</span>
			<div className="h-11 animate-pulse rounded-md bg-muted" />
			<div className="h-11 animate-pulse rounded-md bg-muted" />
			<div className="mt-4 h-4 w-24 animate-pulse rounded bg-muted" />
			<div className="h-11 animate-pulse rounded-md bg-muted" />
			<div className="h-11 animate-pulse rounded-md bg-primary/40" />
		</div>
	)
}
