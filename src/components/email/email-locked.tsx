import { Lock } from 'lucide-react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

/** Shown instead of email tools when the driver's plan doesn't include them. */
export function EmailLocked() {
	return (
		<div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
			<p className="flex items-center gap-2 text-muted-foreground">
				<Lock className="size-4 shrink-0" />
				Email pre-trips as a PDF to yourself, dispatch or your safety
				manager with a paid plan.
			</p>
			<Link className={buttonVariants({ size: 'sm' })} href="/email">
				See plans
			</Link>
		</div>
	)
}
