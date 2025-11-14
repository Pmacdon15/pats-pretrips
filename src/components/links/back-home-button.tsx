import Link from 'next/link'
import { Button } from '../ui/button'

export function BackLink() {
	return (
		<Link className="w-fit rounded-sm border p-2" href={`/pretrips`}>
			<Button size={'lg'} type="button" variant={'outline'}>
				Back to Trips
			</Button>
		</Link>
	)
}
