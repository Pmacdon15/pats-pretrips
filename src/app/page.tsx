import { PricingTable } from '@clerk/nextjs'
import {
	ClipboardList,
	History,
	MapPin,
	ShieldCheck,
	Smartphone,
	Wrench,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import HomePageButtons from '@/components/home/home-page-buttons'

const features = [
	{
		icon: ClipboardList,
		title: 'Fast pre-trip entry',
		desc: 'Carrier, unit, plates and odometer in one short form. Tap to flag defects instead of typing them out.',
	},
	{
		icon: MapPin,
		title: 'Location filled in for you',
		desc: 'Your inspection address is looked up from your phone’s location, so you don’t have to.',
	},
	{
		icon: Wrench,
		title: 'Log on-route defects',
		desc: 'Found something after you rolled out? Add defects and remarks to today’s trip for 24 hours.',
	},
	{
		icon: History,
		title: 'Full inspection history',
		desc: 'Every past pre-trip is saved and easy to pull up when you need to show it.',
	},
	{
		icon: Smartphone,
		title: 'Built for the cab',
		desc: 'Big tap targets, works on any phone, and follows your device’s light or dark mode.',
	},
	{
		icon: ShieldCheck,
		title: 'Private by default',
		desc: 'We only store your email to tie your trips to you. Nothing is shared or sold.',
	},
]

export default function Home() {
	return (
		<div className="flex flex-col pb-16">
			<section className="relative isolate overflow-hidden">
				<Image
					alt=""
					className="-z-10 object-cover"
					fill
					priority
					src="/images/modern_truck_fleet.png"
				/>
				<div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/80 via-slate-950/70 to-slate-950/90" />
				<div className="mx-auto flex max-w-5xl flex-col items-start gap-6 px-4 py-24 sm:py-32">
					<span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 font-medium text-emerald-100 text-sm backdrop-blur">
						<span className="size-2 rounded-full bg-emerald-400" />
						Daily vehicle inspection reports
					</span>
					<h1 className="max-w-3xl font-extrabold text-4xl text-white tracking-tight sm:text-6xl">
						Pre-trips done in minutes,{' '}
						<span className="text-emerald-400">not paperwork.</span>
					</h1>
					<p className="max-w-2xl text-lg text-slate-300">
						Record your inspection, flag defects, and keep a clean
						history of every trip — right from your phone.
					</p>
					<HomePageButtons />
					<p className="text-slate-400 text-xs">
						By signing up you agree to our{' '}
						<Link
							className="underline hover:text-white"
							href="/termsOfService"
						>
							Terms of Service
						</Link>{' '}
						and{' '}
						<Link
							className="underline hover:text-white"
							href="/privacy"
						>
							Privacy Policy
						</Link>
						.
					</p>
				</div>
			</section>

			<section className="mx-auto w-full max-w-5xl px-4 pt-20">
				<div className="mb-10 max-w-2xl">
					<h2 className="font-bold text-3xl tracking-tight">
						Everything you need for the walk-around
					</h2>
					<p className="mt-3 text-lg text-muted-foreground">
						Simple tools that keep your inspections accurate and
						your records ready.
					</p>
				</div>
				<ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{features.map((feature) => (
						<li
							className="rounded-xl border bg-card p-6 shadow-sm"
							key={feature.title}
						>
							<div className="mb-4 flex size-11 items-center justify-center rounded-lg bg-accent text-accent-foreground">
								<feature.icon className="size-5" />
							</div>
							<h3 className="font-semibold">{feature.title}</h3>
							<p className="mt-1 text-muted-foreground text-sm">
								{feature.desc}
							</p>
						</li>
					))}
				</ul>
			</section>

			<section
				className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 pt-20"
				id="pricing"
			>
				<div className="mb-10 max-w-2xl">
					<h2 className="font-bold text-3xl tracking-tight">
						Pricing
					</h2>
					<p className="mt-3 text-lg text-muted-foreground">
						Pre-trips are free. Upgrade to email each inspection as
						a PDF to yourself, dispatch or your safety manager.
					</p>
				</div>
				<PricingTable newSubscriptionRedirectUrl="/email" />
			</section>

			<section className="mx-auto w-full max-w-5xl px-4 pt-20">
				<div className="relative aspect-[16/7] w-full overflow-hidden rounded-2xl border shadow-lg">
					<Image
						alt="Truck dashboard"
						className="object-cover"
						fill
						sizes="(min-width: 1024px) 1024px, 100vw"
						src="/images/premium_truck_dashboard.png"
					/>
				</div>
			</section>
		</div>
	)
}
