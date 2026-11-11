import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { buttonVariants } from '../ui/button'

export function BackLink() {
	return (
		<Link
			className={buttonVariants({
				variant: 'ghost',
				size: 'sm',
				className: '-ml-3 self-start text-muted-foreground',
			})}
			href="/pretrips"
		>
			<ArrowLeft />
			Back to trips
		</Link>
	)
}
