import GoHomeButton from "../go-home-button/GoHomeButton";

export function Disclaimer({ text, name }: { text: string, name: string }) {
    return (
        <div className="flex flex-col items-center justify-items-center min-h-screen gap-8 p-4  ">
            <div className="flex flex-col bg-[var(--color-primary)] items-center justify-center rounded-md w-5/6 md:w-3/6  p-8 shadow-md gap-4">
                <h1> {name} </h1>
                <p className="text-sm  indent-8 bg-[var(--color-background)]  rounded-sm p-8 shadow-md">
                    {text}
                </p>
                <GoHomeButton />
            </div>
        </div>
    );
}