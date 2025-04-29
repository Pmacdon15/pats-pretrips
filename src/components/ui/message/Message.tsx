import Link
    from "next/link"
export default function Message({ message, driverEmail }: { message: string, driverEmail?: string }) {
    return (
        <div className="w-full md:w-4/6 p-8 gap-8 rounded-sm bg-[var(--color-primary)]">
            {driverEmail &&
                <div className="my-4">
                    <Link href={`/pretrips/${driverEmail}`}>Back to Trips</Link>
                </div>
            }
            <h1 className="text-2xl">{message}</h1>
        </div>
    )
}