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
        <div className="flex flex-col w-full bg-[var(--color-primary)] md:w-4/6 p-4 gap-4 border rounded-sm shadow-sm">

            <Link 
            className='border w-fit p-2 rounded-sm'
            href={`/pretrips/${driverEmail}`}>Back to Trips</Link>

            <div className="w-full rounded-sm p-4 bg-[var(--color-background)] shadow-xl">
                Driver Name: {driverName}<br />
                Driver Email: {data.driveremail}
            </div>

            <table className="w-full border rounded-sm p-4 overflow-hidden">
                <thead>
                    <tr className="border-b">
                        <th className="text-left p-2 w-1/3 rounded-sm">Category</th>
                        <th className="text-left p-2 w-1/3 rounded-sm">Value</th>
                    </tr>
                </thead>
                <tbody className="rounded-sm">
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3 rounded-sm">Carrier</td>
                        <td className="text-left p-2 w-1/3 rounded-sm">{data.carrier}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3 rounded-sm">Carrier Address</td>
                        <td className="text-left p-2 w-1/3 rounded-sm">{data.carrieraddress}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3 rounded-sm">Inspection Address</td>
                        <td className="text-left p-2 w-1/3 rounded-sm">{data.inspectionaddress}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3 rounded-sm">Truck Plate</td>
                        <td className="text-left p-2 w-1/3 rounded-sm">{data.truckplate}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3 rounded-sm">Trailer Plate A</td>
                        <td className="text-left p-2 w-1/3 rounded-sm">{data.trailerplatea}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3 rounded-sm">Trailer Plate B</td>
                        <td className="text-left p-2 w-1/3 rounded-sm">{data.trailerplateb}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3 rounded-sm">Make</td>
                        <td className="text-left p-2 w-1/3 rounded-sm">{data.make}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3 rounded-sm">Model</td>
                        <td className="text-left p-2 w-1/3 rounded-sm">{data.model}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3 rounded-sm">Odometer</td>
                        <td className="text-left p-2 w-1/3 rounded-sm">{data.odometer}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3 rounded-sm">Defects</td>
                        <td className="text-left p-2 w-1/3 rounded-sm">{data.defects}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3 rounded-sm">Remarks</td>
                        <td className="text-left p-2 w-1/3 rounded-sm">{data.remarks}</td>
                    </tr>
                    <tr className="border-b">
                        <td className="text-left p-2 w-1/3 rounded-sm">Inspection Date</td>
                        <td className="text-left p-2 w-1/3 rounded-sm">{new Date(data.date).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    </tr>
                </tbody>
            </table>
            {data?.date && new Date(data.date) > twentyFourHoursAgo &&
                <AddDefectForm tripId={Number(data.tripid)} driverEmail={driverEmail} isError={isErrorMutating} isPendingChange={isPendingChange} formAction={mutate} />
            }
        </div>
    )
}

