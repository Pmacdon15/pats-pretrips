import Link from "next/link";
import HomePageButtons from "@/components/ui/home/home-page-buttons";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { Suspense } from "react";

export default function Home() {
	 const { isAuthenticated } = getKindeServerSession();	
	return (
		<div className="flex flex-col items-center justify-items-center gap-4 p-4  ">
			<div className="flex flex-col bg-[var(--color-primary)] items-center justify-center rounded-md w-full md:w-4/6  p-4 shadow-md gap-4 ">
				<p className="text-sm  indent-8  bg-[var(--color-background)] rounded-sm p-8 shadow-md">
					Currently, only login through one of the below services is available.
					Accounts with these services are free - feel free to sign up to try
					the app! Built with Next.js 15, TanStack Query, Tailwind CSS, NextAuth
					and TypeScript.
				</p>
				<p className="text-center p-4">
					Checkout our{" "}
					<Link className="underline" href="/termsOfService">
						terms of service
					</Link>{" "}
					and{" "}
					<Link className="underline" href="/privacy">
						privacy policy
					</Link>
					.
				</p>
				<Suspense>
					<HomePageButtons isLoggedInPromise={isAuthenticated()?.then(result => result)} />
				</Suspense>
			</div>
		</div>
	);
}
