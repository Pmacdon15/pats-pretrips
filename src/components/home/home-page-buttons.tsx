import {
	LoginLink,
	RegisterLink,
} from '@kinde-oss/kinde-auth-nextjs/components'
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
			<RegisterLink
				className={cn(buttonVariants(), big)}
				postLoginRedirectURL="/pretrips"
			>
				Create free account
				<ArrowRight />
			</RegisterLink>
			<LoginLink
				className={cn(
					buttonVariants({ variant: 'outline' }),
					big,
					'border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white dark:bg-white/10',
				)}
				postLoginRedirectURL="/pretrips"
			>
				Sign in
			</LoginLink>
		</div>
	)
}
