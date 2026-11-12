import { SignInButton, SignUpButton } from '@clerk/nextjs'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default async function HomePageButtons({
	isLoggedInPromise,
}: {
	isLoggedInPromise?: Promise<boolean> | null
}) {
	const isLoggedIn = await isLoggedInPromise
	const big = 'h-12 w-full px-6 text-base sm:w-auto'

	return isLoggedIn ? (
		<Link className={cn(buttonVariants(), big)} href="/pretrips">
			Go to my trips
			<ArrowRight />
		</Link>
	) : (
		<div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
			<SignUpButton forceRedirectUrl="/pretrips">
				<button className={cn(buttonVariants(), big)} type="button">
					Create free account
					<ArrowRight />
				</button>
			</SignUpButton>
			<SignInButton forceRedirectUrl="/pretrips">
				<button
					className={cn(
						buttonVariants({ variant: 'outline' }),
						big,
						'border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white dark:bg-white/10',
					)}
					type="button"
				>
					Sign in
				</button>
			</SignInButton>
		</div>
	)
}
