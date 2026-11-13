import type { Metadata } from 'next'

/*
 * Canary for the static shell: this page reads nothing, so it must build as
 * ○ Static (tests/build/static-shell.test.ts checks). If it comes out ◐, a
 * shared layout (header, footer, providers) started reading the request on
 * the server, and every page lost part of its shell. Fix the layout, not this.
 */

export const metadata: Metadata = {
	title: "Shell check · Pat's PreTrips",
	robots: { index: false, follow: false },
}

export default function ShellCheckPage() {
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-8">
			<h1 className="font-bold text-2xl">Static shell check</h1>
			<p className="mt-2 text-muted-foreground">
				This page is prerendered in full at build time.
			</p>
		</div>
	)
}
