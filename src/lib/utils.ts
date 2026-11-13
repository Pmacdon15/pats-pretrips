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

/** When a trip was created, with its time zone, e.g. "Jan 1, 2026, 8:04 p.m. MST". */
export function formatTripCreated(date: Date | string, timeZone?: string) {
	return new Date(date).toLocaleString('en-CA', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZoneName: 'short',
		timeZone,
	})
}

/** A trip's local day and time for subjects and file names: "2026-01-01 8:04 p.m.". */
export function tripDayAndTime(date: Date | string, timeZone?: string) {
	const d = new Date(date)
	const day = d.toLocaleDateString('en-CA', { timeZone })
	const time = d.toLocaleTimeString('en-CA', { timeStyle: 'short', timeZone })
	return { day, time }
}
