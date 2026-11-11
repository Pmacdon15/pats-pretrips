import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner'
import Footer from '@/components/footer/footer'
import Header from '@/components/header/header'
import { AuthProvider } from '@/components/providers/auth-provider'
import Providers from '@/components/providers/Providers'

const geistSans = Geist({
	variable: '--font-geist-sans',
	subsets: ['latin'],
})

const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
	subsets: ['latin'],
})

export const metadata: Metadata = {
	title: "Pat's PreTrips",
	description: 'An application to help track commercial vehicle inspections',
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
				<Providers>
					<AuthProvider>
						<Header />
						<main className="flex-grow">{children}</main>
						<Footer />
						<Toaster position="top-center" richColors />
					</AuthProvider>
				</Providers>
				<Analytics />
			</body>
		</html>
	)
}
