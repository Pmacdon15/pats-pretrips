import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
	'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 font-medium text-xs [&_svg]:size-3',
	{
		variants: {
			variant: {
				success: 'border-transparent bg-accent text-accent-foreground',
				warning:
					'border-transparent bg-warning-soft text-warning-foreground',
				outline: 'text-muted-foreground',
			},
		},
		defaultVariants: { variant: 'outline' },
	},
)

export function Badge({
	className,
	variant,
	...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
	return (
		<span
			className={cn(badgeVariants({ variant }), className)}
			{...props}
		/>
	)
}
