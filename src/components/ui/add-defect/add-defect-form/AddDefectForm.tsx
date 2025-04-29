import { AddDefect } from "@/components/ui/add-defect/AddDefect"

export default function AddDefectForm({ tripId, driverEmail, isError, isPendingChange, formAction }: {
    tripId: number;
    driverEmail: string;
    isError: boolean;
    isPendingChange: boolean;
    formAction: ({ driverEmail, tripId, formData }: { driverEmail: string; tripId: number; formData: FormData; }) => void;
}) {
    return (
        <form
            action={(formData: FormData) => formAction({ driverEmail, tripId, formData })}
            className='flex flex-col gap-4 w-full '>
            <AddDefect required={true} />
            {isError && <div className="text-center text-red-600">Error Adding Deffect</div>}
            <div className="flex justify-center w-full">
                <button disabled={isPendingChange} className={`p-4 rounded-lg bg-green-500 hover:bg-green-600 w-full md:w-3/6`}>Add on Route Defects</button>
            </div>
        </form>
    )
}