import Link from "next/link";

export function BackLink({ driverEmail }: { driverEmail: string }) {
    return (
        <Link
            className='border w-fit p-2 rounded-sm'
            href={`/pretrips/${driverEmail}`}>
            Back to Trips
        </Link>
    )
}