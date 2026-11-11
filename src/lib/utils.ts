import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

export function formatTripDate(date: Date | string) {
	return new Date(date).toLocaleString('en-CA', {
		dateStyle: 'medium',
		timeStyle: 'short',
	})
}
