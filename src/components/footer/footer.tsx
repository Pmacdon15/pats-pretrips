import Link from 'next/link'

export default function Footer() {
	const email = 'patrick@patmac.ca'
	const githubUrl = 'https://github.com/pmacdon15'

	return (
		<footer className="mt-auto border-t bg-card">
			<div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 py-6 text-muted-foreground text-sm sm:flex-row">
				<p>Pat&apos;s PreTrips &middot; Daily vehicle inspections</p>
				<nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
					<Link className="hover:text-foreground" href="/privacy">
						Privacy
					</Link>
					<Link
						className="hover:text-foreground"
						href="/termsOfService"
					>
						Terms
					</Link>
					<a
						className="hover:text-foreground"
						href={`mailto:${email}`}
					>
						Contact
					</a>
					<a
						className="hover:text-foreground"
						href={githubUrl}
						rel="noopener noreferrer"
						target="_blank"
					>
						GitHub
					</a>
				</nav>
			</div>
		</footer>
	)
}
