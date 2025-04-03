'use client'
import Link from 'next/link'
import { Trip } from '@/types/types'
import { useGetTrips } from '@/hooks/hooks'

export default function DisplayTrips({ driverEmail }: { driverEmail: string }) {

    const { data, isPending, isError: isErrorLoadingCurrentTrips } = useGetTrips(driverEmail);
    console.log(data)

    if (isPending) return (
        <div className="w-full md:w-4/6 p-8 gap-8 border rounded-sm">
            <h1 className="text-2xl">Loading.......</h1>
        </div>
    )

    if (isErrorLoadingCurrentTrips) return (
        <div className="w-full md:w-4/6 p-8 gap-8 border rounded-sm">
            <h1 className="text-2xl">Error loading</h1>
        </div>
    )

    return (
        <div className="w-full md:w-4/6 p-8 gap-8 border rounded-sm">
            <h1 className="text-2xl">Current Trips</h1>
            <table className="w-full mt-4 border round-sm">
                <thead>
                    <tr className="border-b">
                        <th className="text-left p-2">Date</th>
                        <th className="text-left p-2">Truck</th>
                        <th className="text-left p-2">Trailer A</th>
                        <th className="text-left p-2">Defects</th>
                    </tr>
                </thead>
                <tbody>
                    {data?.map((trip: Trip, index: number) => (
                        <tr key={index} className="border-b">
                            <td className="p-2">
                                <Link href={`/trip/${trip.tripid}/${'driveEmail'}`}>
                                    {new Date(trip.date).toISOString().split('T')[0]}
                                </Link>
                            </td>
                            <td className="p-2">
                                <Link href={`/trip/${trip.tripid}/${'driveEmail'}`}>
                                    {trip.truckplate}
                                </Link>
                            </td>
                            <td className="p-2">
                                <Link href={`/trip/${trip.tripid}/${'driveEmail'}`}>
                                    {trip.trailerplatea}
                                </Link>
                            </td>
                            <td className="p-2">
                                <Link href={`/trip/${trip.tripid}/${'driveEmail'}`}>
                                    {Array.isArray(trip.defects) ? trip.defects.join(', ') : 'No defects'}
                                </Link>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div >
    )
}