import { AddDefect } from "@/components/ui/add-defect/AddDefect"

export default function AddDefectForm() {
    return (
        <form className='flex flex-col gap-4 w-full '>
            <AddDefect requiered={true} />
            <div className="flex justify-center w-full">
                <button className={`border p-4 rounded-lg bg-green-400 hover:bg-green-600 w-full md:w-3/6`}>Add on Route Defects</button>
            </div>
        </form>
    )
}