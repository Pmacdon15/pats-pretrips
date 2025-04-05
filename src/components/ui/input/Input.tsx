export default function Input({ name, placeHolder, className, required }: { type?: string, name: string, placeHolder: string, className?: string, required?: boolean }) {
    return (
        <input required={required ? true : false} className={`border p-4 rounded-sm w-full ${className}`} type='text' name={name} placeholder={placeHolder} />
    )
}
