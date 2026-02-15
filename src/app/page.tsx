import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server'
import Link from 'next/link'
import { Suspense } from 'react'
import HomePageButtons from '@/components/home/home-page-buttons'

export default function Home() {
	const { isAuthenticated } = getKindeServerSession()
	return (
		<div className="flex flex-col items-center justify-items-center gap-4 p-4">
			<div className="flex w-full flex-col items-center justify-center gap-4 rounded-md bg-[var(--color-primary)] p-4 shadow-md md:w-4/6">
				<p className="rounded-sm bg-[var(--color-background)] p-8 indent-8 text-sm shadow-md">
					Currently, only login through google or email is
					available. Feel free
					to sign up to try the app! Built with Next.js 16, TanStack
					Query, Tailwind CSS, Kinde Auth and TypeScript.
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
							(result: boolean) => result,
						)}
					/>
				</Suspense>
			</div>
		</div>
	)
}
