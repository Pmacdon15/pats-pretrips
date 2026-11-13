import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

/** A trip's date and time, in `timeZone` or the runtime's own. */
export function formatTripDate(date: Date | string, timeZone?: string) {
	return new Date(date).toLocaleString('en-CA', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone,
	})
}
