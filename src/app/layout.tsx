import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner'
import Footer from '@/components/footer/footer'
import Header from '@/components/header/header'
import Providers from '@/components/providers/Providers'
import ServiceWorkerRegister from '@/components/pwa/service-worker-register'
import { clerkAppearance } from '@/lib/clerk-appearance'

const geistSans = Geist({
	variable: '--font-geist-sans',
	subsets: ['latin'],
})

const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
	subsets: ['latin'],
})

const description =
	'Record pre-trip inspections, flag defects and keep a clean history of every trip — right from your phone.'

export const metadata: Metadata = {
	metadataBase: new URL('https://patspretrips.ca'),
	title: "Pat's PreTrips",
	description,
	applicationName: "Pat's PreTrips",
	appleWebApp: {
		capable: true,
		title: 'PreTrips',
		statusBarStyle: 'black-translucent',
	},
	formatDetection: { telephone: false },
	openGraph: {
		type: 'website',
		siteName: "Pat's PreTrips",
		title: "Pat's PreTrips — Pre-trips done in minutes",
		description,
		url: '/',
	},
	twitter: {
		card: 'summary_large_image',
		title: "Pat's PreTrips — Pre-trips done in minutes",
		description,
	},
}

export const viewport: Viewport = {
	themeColor: [
		{ media: '(prefers-color-scheme: light)', color: '#f8fafc' },
		{ media: '(prefers-color-scheme: dark)', color: '#0b1020' },
	],
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang="en">
			<body
				className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col font-sans antialiased`}
			>
				<ClerkProvider
					appearance={clerkAppearance}
					signInFallbackRedirectUrl="/pretrips"
					signInUrl="/sign-in"
					signUpFallbackRedirectUrl="/pretrips"
					signUpUrl="/sign-up"
				>
					<Providers>
						<Header />
						<main className="flex-grow">{children}</main>
						<Footer />
						<Toaster position="top-center" richColors />
					</Providers>
				</ClerkProvider>
				<Analytics />
				<ServiceWorkerRegister />
			</body>
		</html>
	)
}
