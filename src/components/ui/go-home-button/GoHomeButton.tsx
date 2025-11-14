import Link from 'next/link'

export default function GoHomeButton() {
	return (
		<Link
			className="flex w-3/6 items-center justify-center rounded-sm bg-[var(--color-background)] p-4 text-center shadow-lg transition-transform hover:scale-105 hover:shadow-xl"
			href="/"
		>
			Go Home
		</Link>
	)
}
