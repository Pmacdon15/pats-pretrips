export default function Message({ message }: { message: string }) {
    return (
        <div className="w-full md:w-4/6 p-8 gap-8 border rounded-sm">
            <h1 className="text-2xl">{message}</h1>
        </div>
    )
}