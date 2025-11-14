import { Trip } from "@/types/types";
import Link from "next/link";

export default async function TripsTable({tripsPromise, driverEmailPromise}:{tripsPromise:Promise<Trip[]>, driverEmailPromise:Promise<string>}){
    const currentTrips = await tripsPromise
    const driverEmail = await driverEmailPromise
    return (
        <table className="w-full border rounded-sm overflow-hidden shadow-sm">
            <TableHead />
            <TableBody selectedTrips={currentTrips} driverEmail={driverEmail} />
        </table>
    )
}


function TableHead() {
    return (
        <thead>
            <tr className="bg-[var(--color-background)] border-b rounded-sm">
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Truck</th>
                <th className="text-left p-2">Trailer</th>
                <th className="text-left p-2">Defects</th>
            </tr>
        </thead>
    );
}

function TableBody({ selectedTrips, driverEmail }: { selectedTrips: Trip[], driverEmail: string }) {
    return (
        <tbody className='rounded-sm'>
            {selectedTrips?.map((trip: Trip, index: number) => (
                <tr key={index} className="border">
                    <td className="p-2 w-2/6">
                        <Link href={`/pretrip/${trip.tripid}/${driverEmail}`}>
                            {new Date(trip.date).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' })}
                        </Link>
                    </td>
                    <td className="p-2">
                        <Link href={`/pretrip/${trip.tripid}/${driverEmail}`}>
                            {trip.truckplate}
                        </Link>
                    </td>
                    <td className="p-2">
                        <Link href={`/pretrip/${trip.tripid}/${driverEmail}`}>
                            {trip.trailerplatea}
                        </Link>
                    </td>
                    <td className="p-2">
                        <Link href={`/pretrip/${trip.tripid}/${driverEmail}`}>
                            {trip.defects ? trip.defects : 'No defects'}
                        </Link>
                    </td>
                </tr>
            ))}
        </tbody>
    );
}