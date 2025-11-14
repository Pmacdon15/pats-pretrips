import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import Providers from '@/lib/components/Providers'
import { AuthProvider } from '@/lib/components/providers/auth-provider'
import Footer from '@/lib/components/ui/footer/footer'
import Header from '@/lib/components/ui/header/header'

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
					</body>
				</AuthProvider>
			</Providers>
		</html>
	)
}
