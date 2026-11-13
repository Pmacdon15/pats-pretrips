import { useQueryClient } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ isSignedIn: vi.fn() }))
vi.mock('@/lib/auth', () => auth)
const clerk = vi.hoisted(() => ({ useAuth: vi.fn() }))
vi.mock('@clerk/nextjs', () => {
	// Clerk's buttons wrap the child button; the stand-in records where
	// they'd send the driver.
	const wrap =
		(action: string) =>
		({
			children,
			forceRedirectUrl,
			redirectUrl,
		}: {
			children: React.ReactNode
			forceRedirectUrl?: string
			redirectUrl?: string
		}) => (
			<span
				data-action={action}
				data-redirect={forceRedirectUrl ?? redirectUrl}
			>
				{children}
			</span>
		)
	return {
		SignInButton: wrap('sign-in'),
		SignOutButton: wrap('sign-out'),
		SignUpButton: wrap('sign-up'),
		UserButton: () => <span data-testid="user-button" />,
		useAuth: clerk.useAuth,
	}
})

import Header from '@/components/header/header'
import HomePageButtons from '@/components/home/home-page-buttons'
import Providers from '@/components/providers/Providers'

describe('Providers', () => {
	it('reuses one query client in the browser', () => {
		const clients: unknown[] = []
		const Grab = () => {
			clients.push(useQueryClient())
			return null
		}
		render(
			<Providers>
				<Grab />
			</Providers>,
		)
		render(
			<Providers>
				<Grab />
			</Providers>,
		)
		expect(clients[0]).toBe(clients[1])
		expect(
			(
				clients[0] as {
					getDefaultOptions: () => { queries: { staleTime: number } }
				}
			).getDefaultOptions().queries.staleTime,
		).toBe(60_000)
	})

	it('makes a new client for each server render', async () => {
		vi.resetModules()
		vi.doMock('@tanstack/react-query', async (orig) => ({
			...(await orig<typeof import('@tanstack/react-query')>()),
			isServer: true,
		}))
		const { default: ServerProviders } = await import(
			'@/components/providers/Providers'
		)
		const { useQueryClient: useServerClient } = await import(
			'@tanstack/react-query'
		)
		const clients: unknown[] = []
		const Grab = () => {
			clients.push(useServerClient())
			return null
		}
		renderToStaticMarkup(
			<ServerProviders>
				<Grab />
			</ServerProviders>,
		)
		renderToStaticMarkup(
			<ServerProviders>
				<Grab />
			</ServerProviders>,
		)
		expect(clients[0]).not.toBe(clients[1])
		vi.doUnmock('@tanstack/react-query')
	})
})

describe('HomePageButtons', () => {
	it('links a signed-in driver to their trips', async () => {
		render(
			await HomePageButtons({ isLoggedInPromise: Promise.resolve(true) }),
		)
		expect(
			screen.getByRole('link', { name: 'Go to my trips' }),
		).toHaveAttribute('href', '/pretrips')
	})

	it('offers sign up and sign in otherwise, landing on the trips page', async () => {
		render(await HomePageButtons({}))
		for (const [name, action] of [
			['Create free account', 'sign-up'],
			['Sign in', 'sign-in'],
		]) {
			const wrapper = screen.getByRole('button', { name }).parentElement
			expect(wrapper).toHaveAttribute('data-action', action)
			expect(wrapper).toHaveAttribute('data-redirect', '/pretrips')
		}
	})
})

describe('Header', () => {
	const renderHeader = async () => {
		await act(async () => {
			render(<Header />)
		})
	}

	it('links home and offers sign in when signed out', async () => {
		clerk.useAuth.mockReturnValue({ isLoaded: true, isSignedIn: false })
		await renderHeader()
		expect(
			screen.getByRole('link', { name: "Pat's PreTrips" }),
		).toHaveAttribute('href', '/')
		const signIn = screen.getByRole('button', { name: 'Sign in' })
		expect(signIn.parentElement).toHaveAttribute('data-action', 'sign-in')
		expect(signIn.parentElement).toHaveAttribute(
			'data-redirect',
			'/pretrips',
		)
	})

	it('shows trips, Connect AI, sign out and the user button when signed in', async () => {
		clerk.useAuth.mockReturnValue({ isLoaded: true, isSignedIn: true })
		await renderHeader()
		expect(screen.getByRole('link', { name: 'My Trips' })).toHaveAttribute(
			'href',
			'/pretrips',
		)
		expect(
			screen.getByRole('link', { name: 'Connect your AI' }),
		).toHaveAttribute('href', '/connect')
		expect(
			screen.getByRole('link', { name: 'Email pre-trips' }),
		).toHaveAttribute('href', '/email')
		const signOut = screen.getByRole('button', { name: 'Sign out' })
		expect(signOut.parentElement).toHaveAttribute('data-action', 'sign-out')
		expect(signOut.parentElement).toHaveAttribute('data-redirect', '/')
		expect(screen.getByTestId('user-button')).toBeInTheDocument()
	})
})
