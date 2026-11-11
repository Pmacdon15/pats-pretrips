import type * as React from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: React.ComponentProps<'section'>) {
	return (
		<section
			className={cn(
				'rounded-xl border bg-card text-card-foreground shadow-sm',
				className,
			)}
			{...props}
		/>
	)
}

export function CardHeader({
	className,
	...props
}: React.ComponentProps<'div'>) {
	return (
		<div
			className={cn(
				'flex flex-col gap-1 border-b px-5 py-4 sm:px-6',
				className,
			)}
			{...props}
		/>
	)
}

export function CardTitle({ className, ...props }: React.ComponentProps<'h2'>) {
	return (
		<h2
			className={cn('font-semibold text-lg tracking-tight', className)}
			{...props}
		/>
	)
}

export function CardDescription({
	className,
	...props
}: React.ComponentProps<'p'>) {
	return (
		<p
			className={cn('text-muted-foreground text-sm', className)}
			{...props}
		/>
	)
}

export function CardContent({
	className,
	...props
}: React.ComponentProps<'div'>) {
	return <div className={cn('px-5 py-5 sm:px-6', className)} {...props} />
}
