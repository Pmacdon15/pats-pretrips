import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server'
import { ArrowRight, CheckCircle, ShieldCheck, Zap } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import HomePageButtons from '@/components/home/home-page-buttons'

export default function Home() {
	const { isAuthenticated } = getKindeServerSession()
	return (
		<div className="flex min-h-screen flex-col bg-[var(--color-background)] pb-12">
			{/* Hero Section */}
			<section className="relative flex min-h-[85vh] flex-col items-center justify-center overflow-hidden px-4 shadow-xl">
				<div className="absolute inset-0 z-0 bg-black">
					<Image
						alt="Modern Truck Fleet"
						className="object-cover opacity-50 transition-opacity duration-1000 ease-in-out"
						fill
						priority
						src="/images/modern_truck_fleet.png"
					/>
					<div className="absolute inset-0 bg-gradient-to-t from-[var(--color-background)] via-transparent to-transparent" />
				</div>
				<div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center gap-8 text-center pt-16">
					<div className="inline-flex items-center rounded-full border border-emerald-500/50 bg-emerald-500/10 px-4 py-1.5 text-sm font-medium text-emerald-100 shadow-sm backdrop-blur-md">
						<span className="flex h-2 w-2 rounded-full bg-emerald-400 mr-2 animate-pulse" />
						Next-Generation Logistics
					</div>
					<h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-7xl">
						Streamline Your{' '}
						<span className="bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent drop-shadow-sm">
							Pre-Trips
						</span>
					</h1>
					<p className="max-w-2xl text-lg text-gray-300 md:text-xl">
						Experience the future of fleet management. Built with
						cutting-edge tech to deliver speed, accuracy, and
						reliability for drivers on the go.
					</p>

					{/* Glassmorphism Auth Container */}
					<div className="mt-8 flex w-full max-w-sm flex-col gap-6 rounded-3xl border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur-xl transition-all sm:max-w-md">
						<Suspense
							fallback={
								<div className="h-12 w-full animate-pulse rounded-lg bg-white/10" />
							}
						>
							<div className='mx-auto'>
								<HomePageButtons
									isLoggedInPromise={isAuthenticated()?.then(
										(result: boolean) => result,
									)}
								/>
							</div>
						</Suspense>
						<div className="mt-2 text-xs text-gray-400">
							By joining, you agree to our{' '}
							<Link
								className="underline hover:text-white transition-colors"
								href="/termsOfService"
							>
								Terms of Service
							</Link>{' '}
							and{' '}
							<Link
								className="underline hover:text-white transition-colors"
								href="/privacy"
							>
								Privacy Policy
							</Link>
							.
						</div>
					</div>
				</div>
			</section>

			{/* Features Dashboard Integration */}
			<section className="relative z-20 mx-auto w-full max-w-7xl px-4 pt-24">
				<div className="flex flex-col items-center gap-16 lg:flex-row">
					<div className="flex w-full flex-1 flex-col justify-center space-y-8">
						<h2 className="text-3xl font-extrabold text-[var(--color-primary)] md:text-4xl">
							Command Center for Your Fleet
						</h2>
						<p className="text-lg text-gray-600 dark:text-gray-300">
							Monitor health, efficiency, and real-time active
							routes. Pats Pretrips ensures every vehicle performs
							optimally through structured inspections and
							logging.
						</p>
						<ul className="space-y-6">
							{[
								{
									icon: (
										<Zap className="h-6 w-6 text-cyan-500" />
									),
									title: 'Lightning Fast Data Entry',
									desc: 'Powered by highly optimized architectures.',
								},
								{
									icon: (
										<ShieldCheck className="h-6 w-6 text-emerald-500" />
									),
									title: 'Rock-Solid Reliability',
									desc: 'Zero exceptions thanks to safe-data patterns.',
								},
								{
									icon: (
										<CheckCircle className="h-6 w-6 text-purple-500" />
									),
									title: 'Instant Synchronization',
									desc: 'Dynamic cache tags update routing instantly.',
								},
							].map((feature, i) => (
								<li className="flex gap-5" key={i}>
									<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-primary)]/10">
										{feature.icon}
									</div>
									<div>
										<h3 className="text-xl font-semibold text-[var(--color-foreground)]">
											{feature.title}
										</h3>
										<p className="mt-1 text-gray-500 dark:text-gray-400">
											{feature.desc}
										</p>
									</div>
								</li>
							))}
						</ul>
						<div className="pt-4">
							<Link
								className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-8 py-4 font-semibold text-white shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl dark:bg-emerald-600 dark:hover:bg-emerald-500 hover:scale-105"
								href="/api/auth/login"
							>
								Start Pre-Tripping Now
								<ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
							</Link>
						</div>
					</div>

					{/* Image Container Showcase */}
					<div className="flex w-full flex-1 items-center justify-center">
						<div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-gray-200 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:border-gray-800 dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-transform hover:scale-[1.02]">
							<Image
								alt="Premium Truck Dashboard"
								className="object-cover"
								fill
								src="/images/premium_truck_dashboard.png"
							/>
						</div>
					</div>
				</div>
			</section>
		</div>
	)
}
