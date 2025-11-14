import { LoginLink, LogoutLink, RegisterLink } from "@kinde-oss/kinde-auth-nextjs/components";
import Link from "next/link";

export default async function HomePageButtons({
	isLoggedInPromise,
}: {
	  isLoggedInPromise?:Promise<boolean> | null;
}) {
	const isLoggedIn = await isLoggedInPromise
	return isLoggedIn ? (
		<div>
			<LogoutLink>Logout</LogoutLink>
			<Link href={"/pretrips"}>PreTrips</Link>
		</div>
	) : (
		<div className="flex gap-4">		
			<LoginLink postLoginRedirectURL="/">Sign in</LoginLink>
			<RegisterLink postLoginRedirectURL="/">Sign up</RegisterLink>
		</div>
	);
}
