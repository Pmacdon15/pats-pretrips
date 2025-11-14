import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server'
import Link from 'next/link'
import { Suspense } from 'react'
import HomePageButtons from '@/components/ui/home/home-page-buttons'

export default function Home() {
	const { isAuthenticated } = getKindeServerSession()
	return (
		<div className="flex flex-col items-center justify-items-center gap-4 p-4">
			<div className="flex w-full flex-col items-center justify-center gap-4 rounded-md bg-[var(--color-primary)] p-4 shadow-md md:w-4/6">
				<p className="rounded-sm bg-[var(--color-background)] p-8 indent-8 text-sm shadow-md">
					Currently, only login through one of the below services is
					available. Accounts with these services are free - feel free
					to sign up to try the app! Built with Next.js 15, TanStack
					Query, Tailwind CSS, NextAuth and TypeScript.
				</p>
				<p className="p-4 text-center">
					Checkout our{' '}
					<Link className="underline" href="/termsOfService">
						terms of service
					</Link>{' '}
					and{' '}
					<Link className="underline" href="/privacy">
						privacy policy
					</Link>
					.
				</p>
				<Suspense>
					<HomePageButtons
						isLoggedInPromise={isAuthenticated()?.then(
							(result) => result,
						)}
					/>
				</Suspense>
			</div>
		</div>
	)
}
