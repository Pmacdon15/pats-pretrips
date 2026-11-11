'use client'
import { useSyncExternalStore } from 'react'
import { formatTripDate } from '@/lib/utils'

const subscribe = () => () => {}

/**
 * Formats a trip date in the viewer's own timezone. The server does not know
 * the driver's timezone, so the formatted value is only rendered in the
 * browser to avoid showing a UTC time or a hydration mismatch.
 */
export function TripDate({ date }: { date: Date | string }) {
	const isClient = useSyncExternalStore(
		subscribe,
		() => true,
		() => false,
	)
	const iso = new Date(date).toISOString()
	return (
		<time dateTime={iso}>
			{isClient ? (
				formatTripDate(date)
			) : (
				<span className="inline-block h-4 w-32 animate-pulse rounded bg-muted align-middle" />
			)}
		</time>
	)
}
