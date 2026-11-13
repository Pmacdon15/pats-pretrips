import { SignUp } from '@clerk/nextjs'
import type { Metadata } from 'next'
import AuthShell from '@/components/auth/auth-shell'
import { authPageAppearance } from '@/lib/clerk-appearance'

export const metadata: Metadata = {
	title: "Create account — Pat's PreTrips",
}

/** Prerenders /sign-up itself; Clerk's own sub-paths render on demand. */
export function generateStaticParams() {
	return [{ 'sign-up': [] }]
}

export default function SignUpPage() {
	return (
		<AuthShell
			subtitle="Free to start. Your first pre-trip takes a couple of minutes."
			title="Create your account"
		>
			<SignUp
				appearance={authPageAppearance}
				fallbackRedirectUrl="/pretrips"
				path="/sign-up"
				routing="path"
				signInUrl="/sign-in"
			/>
		</AuthShell>
	)
}
