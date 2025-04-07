'use client'
import { useGetTrip } from '@/hooks/hooks'
import Message from '@/components/ui/message/Message';
import Link from 'next/link';
import AddDefectForm from "@/components/ui/add-defect/add-defect-form/AddDefectForm"
import { useAddDefectOnRoute } from '@/hooks/mutations/mutations';

export default function DisplayTrip({ tripId, driverEmail, driverName }: { tripId: number, driverEmail: string, driverName: string }) {

    const { data, isPending, isError: isErrorLoadingTrip } = useGetTrip(tripId, driverEmail);
    // This mutate is created on this component and passed the the AddDefectForm so that the query client matches and then there is no need for a call back
    const { mutate, isError: isErrorMutating, isPending: isPendingChange } = useAddDefectOnRoute(tripId, driverEmail);

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    if (isPending) return <Message message={"Loading......."} driverEmail={driverEmail} />
    if (isErrorLoadingTrip) return <Message message={"Error Loading"} driverEmail={driverEmail} />

    return (
        <div className="flex flex-col w-full md:w-4/6 p-4 gap-4 border rounded-sm shadow-sm">

            <Link href={`/pretrips/${driverEmail}`}>Back to Trips</Link>

            <div className="w-full border round-sm p-4">
                Driver Name: {driverName}<br />
                Driver Email: {data.driveremail}
            </div>

            <table className="w-full border round-sm p-4">
                <thead>
                    <tr className="border-b">
                        <th className="text-left p-2 w-1/3">Category</th>
                        <th className="text-left p-2 w-1/3">Value</th>
                    </tr>
                </thead>
                <tbody className="rounded-sm">
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
                        <td className="text-left p-2 w-1/3">Defects</td>
                        <td className="text-left p-2 w-1/3">{data.defects}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3">Remarks</td>
                        <td className="text-left p-2 w-1/3">{data.remarks}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3">Inspection Date</td>
                        <td className="text-left p-2 w-1/3">{new Date(data.date).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    </tr>
                </tbody>

            </table>
            {data?.date && new Date(data.date) > twentyFourHoursAgo &&
                <AddDefectForm tripId={data.tripid} driverEmail={driverEmail}  isError={isErrorMutating} isPendingChange={isPendingChange} formAction={mutate} />
            }
        </div>
    )
}

