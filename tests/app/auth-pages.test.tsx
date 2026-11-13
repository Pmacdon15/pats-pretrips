import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@clerk/nextjs', () => ({
	SignIn: (p: Record<string, unknown>) => (
		<div data-props={JSON.stringify(p)} data-testid="clerk-sign-in" />
	),
	SignUp: (p: Record<string, unknown>) => (
		<div data-props={JSON.stringify(p)} data-testid="clerk-sign-up" />
	),
}))
vi.mock('next/image', () => ({
	default: ({ alt, src }: { alt: string; src: string }) => (
		// biome-ignore lint/performance/noImgElement: test stand-in for next/image
		<img alt={alt} src={src} />
	),
}))

import SignInPage from '@/app/sign-in/[[...sign-in]]/page'
import SignUpPage from '@/app/sign-up/[[...sign-up]]/page'
import { authPageAppearance } from '@/lib/clerk-appearance'

const propsOf = (testId: string) =>
	JSON.parse(screen.getByTestId(testId).getAttribute('data-props') ?? '{}')

describe('/sign-in', () => {
	it("renders Clerk's sign-in in the branded frame", () => {
		render(<SignInPage />)
		expect(
			screen.getByRole('heading', { level: 1, name: 'Welcome back' }),
		).toBeInTheDocument()
		expect(propsOf('clerk-sign-in')).toEqual({
			appearance: authPageAppearance,
			fallbackRedirectUrl: '/pretrips',
			path: '/sign-in',
			routing: 'path',
			signUpUrl: '/sign-up',
		})
		expect(
			screen.getByRole('link', { name: 'Terms of Service' }),
		).toHaveAttribute('href', '/termsOfService')
		expect(
			screen.getByRole('link', { name: 'Privacy Policy' }),
		).toHaveAttribute('href', '/privacy')
	})
})

describe('/sign-up', () => {
	it("renders Clerk's sign-up in the branded frame", () => {
		render(<SignUpPage />)
		expect(
			screen.getByRole('heading', {
				level: 1,
				name: 'Create your account',
			}),
		).toBeInTheDocument()
		expect(propsOf('clerk-sign-up')).toEqual({
			appearance: authPageAppearance,
			fallbackRedirectUrl: '/pretrips',
			path: '/sign-up',
			routing: 'path',
			signInUrl: '/sign-in',
		})
	})
})
