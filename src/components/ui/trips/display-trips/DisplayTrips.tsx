'use client'
import Link from 'next/link'


interface Trip {
    tripId: number;
    driverId: number;
    truckPlate?: string;
    trailerPlateA?: string;
    trailerPlateB?: string;
    date: Date;
    defects: string[];
}

const trips: Trip[] = [
    {
        tripId: 1,
        driverId: 1,
        truckPlate: "AXA6969",
        trailerPlateA: "TRL123",
        trailerPlateB: "",
        date: new Date('2025-04-01T09:30:00'),
        defects: ["Low tire pressure", "Broken headlight"]
    },
    {
        tripId: 2,
        driverId: 1,
        truckPlate: "AXA6969",
        trailerPlateA: "TRL124",
        trailerPlateB: "",
        date: new Date('2025-04-01T09:30:00'),
        defects: ["Oil leak", "Cracked windshield"]
    },
    {
        tripId: 3,
        driverId: 1,
        truckPlate: "AXA6969",
        trailerPlateA: "TRL125",
        trailerPlateB: "",
        date: new Date('2025-04-01T09:30:00'),
        defects: ["Faulty brake light", "Worn brake pads"]
    },
    {
        tripId: 4,
        driverId: 1,
        truckPlate: "AXA6969",
        trailerPlateA: "TRL126",
        trailerPlateB: "",
        date: new Date('2024-02-25T16:45:00'),
        defects: ["Missing mirror", "Damaged mudflap"]
    }
]

export default function DisplayTrips({ tripTypeName }: { tripTypeName: string}) {
    return (
        <div className="w-full md:w-4/6 p-8 gap-8 border rounded-sm">
            <h1 className="text-2xl">{tripTypeName} Trips</h1>
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
                    {trips.map((trip, index) => (
                        <tr key={index} className="border-b">
                            <td className="p-2">
                                <Link href={`/trip/${trip.tripId}/${'userEmail'}`}>
                                    {trip.date.toISOString().split('T')[0]}
                                </Link>
                            </td>
                            <td className="p-2">
                                <Link href={`/trip/${trip.tripId}/${'userEmail'}`}>
                                    {trip.truckPlate}
                                </Link>
                            </td>
                            <td className="p-2">
                                <Link href={`/trip/${trip.tripId}/${'userEmail'}`}>
                                    {trip.trailerPlateA}
                                </Link>
                            </td>
                            <td className="p-2">
                                <Link href={`/trip/${trip.tripId}/${'userEmail'}`}>
                                    {trip.defects.join(', ')}
                                </Link>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div >
    )
}