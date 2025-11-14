import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'
import Footer from '@/components/footer/footer'
import Header from '@/components/header/header'
import Providers from '@/components/providers/Providers'
import { AuthProvider } from '@/components/providers/auth-provider'

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

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang="en">
			<Providers>
				<AuthProvider>
					<body
						className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
					>
						<Header />
						<main className="flex-grow">{children}</main>
						<Footer />
						<Toaster />
					</body>
				</AuthProvider>
			</Providers>
		</html>
	)
}
