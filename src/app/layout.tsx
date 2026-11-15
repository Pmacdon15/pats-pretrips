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
import {
	SITE_DESCRIPTION,
	SITE_KEYWORDS,
	SITE_NAME,
	SITE_TAGLINE,
	SITE_URL,
} from '@/lib/site'

const geistSans = Geist({
	variable: '--font-geist-sans',
	subsets: ['latin'],
})

const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
	subsets: ['latin'],
})

export const metadata: Metadata = {
	metadataBase: new URL(SITE_URL),
	title: {
		default: `${SITE_NAME} — ${SITE_TAGLINE}`,
		template: `%s · ${SITE_NAME}`,
	},
	description: SITE_DESCRIPTION,
	applicationName: SITE_NAME,
	keywords: SITE_KEYWORDS,
	authors: [{ name: SITE_NAME, url: SITE_URL }],
	creator: SITE_NAME,
	publisher: SITE_NAME,
	category: 'business',
	alternates: { canonical: '/' },
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			'max-image-preview': 'large',
			'max-snippet': -1,
		},
	},
	appleWebApp: {
		capable: true,
		title: 'PreTrips',
		statusBarStyle: 'black-translucent',
	},
	formatDetection: { telephone: false },
	openGraph: {
		type: 'website',
		siteName: SITE_NAME,
		locale: 'en_CA',
		title: `${SITE_NAME} — ${SITE_TAGLINE}`,
		description: SITE_DESCRIPTION,
		url: '/',
	},
	twitter: {
		card: 'summary_large_image',
		title: `${SITE_NAME} — ${SITE_TAGLINE}`,
		description: SITE_DESCRIPTION,
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
