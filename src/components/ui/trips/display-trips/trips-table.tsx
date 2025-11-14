'use client'
import { Trip } from "@/lib/types/types";
import { useRouter } from "next/navigation";
import { use } from "react";

export default function TripsTable({tripsPromise, driverEmailPromise}:{tripsPromise:Promise<{trips:Trip[], hasMore:boolean}>, driverEmailPromise:Promise<string>}){
    const trips = use(tripsPromise)
    const driverEmail = use(driverEmailPromise)

    return (
        <table className="w-full border rounded-sm overflow-hidden shadow-sm">
            <TableHead />
            <TableBody selectedTrips={trips.trips} driverEmail={driverEmail} />
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
    const router = useRouter();

    const handleRowClick = (tripId: string) => {
        router.push(`/pretrip/${tripId}/${driverEmail}`);
    };

    return (
        <tbody className='rounded-sm'>
            {selectedTrips?.map((trip: Trip, index: number) => (
                <tr key={index} className="border cursor-pointer hover:bg-gray-100" onClick={() => handleRowClick(String(trip.tripid))}>
                    <td className="p-2 w-2/6">
                        {new Date(trip.date).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="p-2">
                        {trip.truckplate}
                    </td>
                    <td className="p-2">
                        {trip.trailerplatea}
                    </td>
                    <td className="p-2">
                        {trip.defects ? trip.defects : 'No defects'}
                    </td>
                </tr>
            ))}
        </tbody>
    );
}