'use client'
import Link from 'next/link'
import { Trip } from '@/types/types'
import { useGetTrips } from '@/hooks/hooks'
import Message from '@/components/ui/message/Message'
import { useState, useEffect, useMemo } from "react"

export default function DisplayTrips({ driverEmail }: { driverEmail: string }) {

    const { data, isPending, isError: isErrorLoadingCurrentTrips } = useGetTrips(driverEmail);
    
    const twentyFourHoursAgo = useMemo(() => new Date(Date.now() - 24 * 60 * 60 * 1000), []);
    const currentTrips = useMemo(() => data?.filter((trip) => new Date(trip.date) > twentyFourHoursAgo), [data, twentyFourHoursAgo]);
    const pastTrips = useMemo(() => data?.filter((trip) => new Date(trip.date) < twentyFourHoursAgo), [data, twentyFourHoursAgo]);

    const { selectedTrips, setSelectedTrips } = useSetSelectedTrips(currentTrips)
    const [selectedTripsName, setSelectedTripsName] = useState<string>('Current')

    if (isPending) return <Message message={"Loading......."} />
    if (isErrorLoadingCurrentTrips) return <Message message={"Error Loading"} />

    return (
        <div className="w-full md:w-4/6 p-4 gap-8  border rounded-sm">
            <div className='flex justify-between items-center'>
                <h1 className="text-2xl min-w-fit">{selectedTripsName} Trips</h1>
                <div className='flex border gap-4 p-4 rounded-sm'>
                    {currentTrips && <button className="cursor-pointer" onClick={() => { setSelectedTrips(currentTrips); setSelectedTripsName("Current") }}>Current Trips</button>}
                    {pastTrips && pastTrips.length > 0 && (<button className="cursor-pointer" onClick={() => { setSelectedTrips(pastTrips); setSelectedTripsName("Past"); }}>Past Trips</button>)}
                </div>
            </div>
            <table className="w-full border round-sm">
                <TableHead />
                <TableBody selectedTrips={selectedTrips} driverEmail={driverEmail} />
            </table>
        </div >
    )
}

function TableHead() {
    return (
        <thead>
            <tr className="border-b round-sm">
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Truck</th>
                <th className="text-left p-2">Trailer A</th>
                <th className="text-left p-2">Defects</th>
            </tr>
        </thead>
    )
}

function TableBody({ selectedTrips, driverEmail }: { selectedTrips: Trip[], driverEmail: string }) {
    return (
        <tbody>
            {selectedTrips?.map((trip: Trip, index: number) => (
                <tr key={index} className="border-b">
                    <td className="p-2">
                        <Link href={`/pretrip/${trip.tripid}/${driverEmail}'}`}>
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
    )
}
function useSetSelectedTrips(trips: Trip[] | undefined) {
    const [selectedTrips, setSelectedTrips] = useState<Trip[]>([])

    useEffect(() => {
        if (trips) setSelectedTrips(trips);
    }, [trips]);

    return { selectedTrips, setSelectedTrips }
}