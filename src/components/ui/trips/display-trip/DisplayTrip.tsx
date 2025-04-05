'use client'
import { useGetTrip } from '@/hooks/hooks'
import Message from '@/components/ui/message/Message';
import Link from 'next/link';

export default function DisplayTrip({ tripId, driverEmail }: { tripId: number, driverEmail: string }) {

    const { data, isPending, isError: isErrorLoadingTrip } = useGetTrip(tripId, driverEmail);

    if (isPending) return <Message message={"Loading......."} driverEmail={driverEmail} />
    if (isErrorLoadingTrip) return <Message message={"Error Loading"} driverEmail={driverEmail} />

    return (
        <div className="w-full md:w-4/6 p-8 gap-8 border rounded-sm">
            <div className="mt-4">
                <Link href={`/pretrips/${driverEmail}`}>Back to Trips</Link>
            </div>

            <div className="w-full mt-4 border round-sm p-4">
                Driver Name: {"Patrick MacDonald"}<br />
                Driver Email: {data.driveremail}
            </div>

            <table className="w-full mt-4 border round-sm p-4">
                <thead>
                    <tr className="border-b">
                        <th className="text-left p-2 w-1/3">Category</th>
                        <th className="text-left p-2 w-1/3">Value</th>
                    </tr>
                </thead>
                <tbody className="rounded-sm">
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3">Truck Plate</td>
                        <td className="text-left p-2 w-1/3">{data.truckplate}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3">Trailer Plate A</td>
                        <td className="text-left p-2 w-1/3">{data.trailerplatea}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3">Trailer Plate B</td>
                        <td className="text-left p-2 w-1/3">{data.trailerplateb}</td>
                    </tr>
                    <tr className="border-b rounded-sm">
                        <td className="text-left p-2 w-1/3">Make</td>
                        <td className="text-left p-2 w-1/3">{data.make}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3">Model</td>
                        <td className="text-left p-2 w-1/3">{data.model}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3">Odometer</td>
                        <td className="text-left p-2 w-1/3">{data.odometer}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3">Carrier</td>
                        <td className="text-left p-2 w-1/3">{data.carrier}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3">Carrier Address</td>
                        <td className="text-left p-2 w-1/3">{data.carrieraddress}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3">Inspection Address</td>
                        <td className="text-left p-2 w-1/3">{data.inspectionaddress}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3">Defects</td>
                        <td className="text-left p-2 w-1/3">{data.defects}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3">Inspection Date</td>
                        <td className="text-left p-2 w-1/3">{new Date(data.date).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    </tr>
                </tbody>
            </table>

        </div>
    )
}
