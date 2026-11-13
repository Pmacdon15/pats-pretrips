import { SignIn } from '@clerk/nextjs'
import type { Metadata } from 'next'
import AuthShell from '@/components/auth/auth-shell'
import { authPageAppearance } from '@/lib/clerk-appearance'

export const metadata: Metadata = {
	title: "Sign in — Pat's PreTrips",
}

/** Prerenders /sign-in itself; Clerk's own sub-paths render on demand. */
export function generateStaticParams() {
	return [{ 'sign-in': [] }]
}

export default function SignInPage() {
	return (
		<AuthShell
			subtitle="Sign in to log today's pre-trip and see your history."
			title="Welcome back"
		>
			<SignIn
				appearance={authPageAppearance}
				fallbackRedirectUrl="/pretrips"
				path="/sign-in"
				routing="path"
				signUpUrl="/sign-up"
			/>
		</AuthShell>
	)
}
