'use client'
import Link from 'next/link'
import { Trip } from '@/types/types'
import { useGetPastTrips, useGetTrips } from '@/hooks/hooks'
import Message from '@/components/ui/message/Message'
import { useState, useEffect } from "react"

export default function DisplayTrips({ driverEmail }: { driverEmail: string }) {
    const [page, setPage] = useState(1);
    const [selectedTripsName, setSelectedTripsName] = useState<'Current' | 'Past'>('Current');

    const { data: currentTrips, isPending: isPendingCurrent, isError: isErrorLoadingCurrentTrips } = useGetTrips(driverEmail);
    const { data: pastTripsData, isPending: isPendingPast, isError: isErrorLoadingPastTrips } = useGetPastTrips(driverEmail, page);

    const pastTrips = pastTripsData?.pastTrips;
    const hasMorePastTrips = pastTripsData?.hasMore;

    const { selectedTrips, setSelectedTrips } = useSelectedTrips(currentTrips, pastTrips, selectedTripsName);

    if (isPendingCurrent || isPendingPast) return <Message message={"Loading......."} />;
    if (isErrorLoadingCurrentTrips || isErrorLoadingPastTrips) return <Message message={"Error Loading"} />;

    return (
        <div className="flex flex-col w-full bg-[var(--color-primary)] md:w-4/6 p-4 gap-4 rounded-sm shadow-sm">
            <div className='flex justify-between items-center'>
                <h1 className="text-2xl min-w-fit">{selectedTripsName} Trips</h1>
            </div>
            {pastTrips && pastTrips.length > 0 && currentTrips && (
                <TripSwitcher
                    selectedTripsName={selectedTripsName}
                    setSelectedTrips={setSelectedTrips}
                    setSelectedTripsName={setSelectedTripsName}
                    currentTrips={currentTrips}
                    pastTrips={pastTrips}
                    setPage={setPage}
                />
            )}
            <table className="w-full border rounded-sm overflow-hidden shadow-sm">
                <TableHead />
                <TableBody selectedTrips={selectedTrips} driverEmail={driverEmail} />
            </table>
            {selectedTripsName === "Past" && (
                <Pagination
                    page={page}
                    setPage={setPage}
                    hasMorePastTrips={hasMorePastTrips}
                />
            )}
        </div>
    );
}


interface TripSwitcherProps {
    selectedTripsName: 'Current' | 'Past';
    setSelectedTrips: React.Dispatch<React.SetStateAction<Trip[]>>; // A function to update selected trips
    setSelectedTripsName: React.Dispatch<React.SetStateAction<'Current' | 'Past'>>; // Corrected type for setSelectedTripsName
    currentTrips: Trip[]; // An array of current trips
    pastTrips: Trip[]; // An array of past trips
    setPage: React.Dispatch<React.SetStateAction<number>>; // A function to set the page number
}

function TripSwitcher({
    selectedTripsName,
    setSelectedTrips,
    setSelectedTripsName,
    currentTrips,
    pastTrips,
    setPage,
}: TripSwitcherProps) {
    return (
        <div className='flex bg-[var(--color-background)]  gap-2 p-2 justify-end rounded-sm'>
            {selectedTripsName === 'Past' && (
                <button
                    className="cursor-pointer"
                    onClick={() => {
                        setSelectedTrips(currentTrips);
                        setSelectedTripsName("Current");
                        setPage(1); // Reset page when switching
                    }}
                >
                    View Current Trips
                </button>
            )}
            {selectedTripsName === 'Current' && pastTrips.length > 0 && (
                <button
                    className="cursor-pointer"
                    onClick={() => {
                        setSelectedTripsName("Past");
                        setSelectedTrips(pastTrips);
                        setPage(1); // Reset page when switching
                    }}
                >
                    View Past Trips
                </button>
            )}
        </div>
    );
}

interface PaginationProps {
    page: number;
    setPage: React.Dispatch<React.SetStateAction<number>>;
    hasMorePastTrips: boolean | undefined;
}

function Pagination({ page, setPage, hasMorePastTrips }: PaginationProps) {
    return (
        <div className='flex justify-between items-center mt-4'>
            <button
                onClick={() => {
                    setPage((old) => Math.max(old - 1, 1));
                }}
                disabled={page === 1}
            >
                Previous Page
            </button>
            <span>Page {page}</span>
            <button
                onClick={() => {
                    if (hasMorePastTrips) {
                        setPage((old) => old + 1);
                    }
                }}
                disabled={!hasMorePastTrips}
            >
                Next Page
            </button>
        </div>
    );
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

function useSelectedTrips(
    currentTrips: Trip[] | undefined,
    pastTrips: Trip[] | undefined,
    selectedTripsName: 'Current' | 'Past'
) {
    const [selectedTrips, setSelectedTrips] = useState<Trip[]>([]);

    useEffect(() => {
        if (selectedTripsName === 'Current' && currentTrips) {
            setSelectedTrips(currentTrips);
        } else if (selectedTripsName === 'Past' && pastTrips) {
            setSelectedTrips(pastTrips);
        }
    }, [selectedTripsName, currentTrips, pastTrips]);

    return { selectedTrips, setSelectedTrips };
}