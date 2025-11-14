import Link from 'next/link'

export function BackLink() {
	return (
		<Link className="w-fit rounded-sm border p-2" href={`/pretrips`}>
			Back to Trips
		</Link>
	)
}
