import { useQueryClient } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ isAuthenticated: vi.fn() }))
vi.mock('@kinde-oss/kinde-auth-nextjs/server', () => ({
	getKindeServerSession: () => auth,
}))
vi.mock('@kinde-oss/kinde-auth-nextjs/components', () => {
	const link =
		(href: string) =>
		({
			children,
			postLoginRedirectURL,
			...rest
		}: {
			children: React.ReactNode
			postLoginRedirectURL?: string
		}) => (
			<a data-redirect={postLoginRedirectURL} href={href} {...rest}>
				{children}
			</a>
		)
	return {
		LoginLink: link('/login'),
		LogoutLink: link('/logout'),
		RegisterLink: link('/register'),
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
		for (const name of ['Create free account', 'Sign in']) {
			expect(screen.getByRole('link', { name })).toHaveAttribute(
				'data-redirect',
				'/pretrips',
			)
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
		auth.isAuthenticated.mockResolvedValue(false)
		await renderHeader()
		expect(
			screen.getByRole('link', { name: "Pat's PreTrips" }),
		).toHaveAttribute('href', '/')
		expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
			'href',
			'/login',
		)
	})

	it('shows trips and sign out when signed in', async () => {
		auth.isAuthenticated.mockResolvedValue(true)
		await renderHeader()
		expect(screen.getByRole('link', { name: 'My Trips' })).toHaveAttribute(
			'href',
			'/pretrips',
		)
		expect(screen.getByRole('link', { name: 'Sign out' })).toHaveAttribute(
			'href',
			'/logout',
		)
	})
})
