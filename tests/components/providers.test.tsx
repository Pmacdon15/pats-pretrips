import { useQueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@kinde-oss/kinde-auth-nextjs', () => ({
	KindeProvider: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="kinde">{children}</div>
	),
}))
vi.mock('@kinde-oss/kinde-auth-nextjs/components', () => ({
	LoginLink: ({ children }: { children: React.ReactNode }) => (
		<a href="/login">{children}</a>
	),
	LogoutLink: ({ children }: { children: React.ReactNode }) => (
		<a href="/logout">{children}</a>
	),
	RegisterLink: ({ children }: { children: React.ReactNode }) => (
		<a href="/register">{children}</a>
	),
}))

import HomePageButtons from '@/components/home/home-page-buttons'
import { AuthProvider } from '@/components/providers/auth-provider'
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

	it('AuthProvider wraps children in Kinde', () => {
		render(
			<AuthProvider>
				<p>hi</p>
			</AuthProvider>,
		)
		expect(screen.getByTestId('kinde')).toHaveTextContent('hi')
	})
})

describe('HomePageButtons', () => {
	it('offers logout and pre-trips when signed in', async () => {
		render(
			await HomePageButtons({ isLoggedInPromise: Promise.resolve(true) }),
		)
		expect(screen.getByRole('link', { name: 'Logout' })).toHaveAttribute(
			'href',
			'/logout',
		)
		expect(screen.getByRole('link', { name: 'PreTrips' })).toHaveAttribute(
			'href',
			'/pretrips',
		)
	})

	it('offers sign in and sign up otherwise', async () => {
		render(await HomePageButtons({}))
		expect(
			screen.getByRole('link', { name: 'Sign in' }),
		).toBeInTheDocument()
		expect(
			screen.getByRole('link', { name: 'Sign up' }),
		).toBeInTheDocument()
	})
})
