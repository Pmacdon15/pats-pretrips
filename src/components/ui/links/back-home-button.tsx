import Link from "next/link";

export function BackLink() {
    return (
        <Link
            className='border w-fit p-2 rounded-sm'
            href={`/pretrips`}>
            Back to Trips
        </Link>
    )
}