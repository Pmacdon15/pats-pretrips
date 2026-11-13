/** The browser's time zone, so emailed times match what the driver sees. */
export function browserTimeZone() {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
}
