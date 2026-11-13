import { render, screen } from '@testing-library/react'
import { use } from 'react'
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

import SignInPage, {
	generateStaticParams as signInParams,
} from '@/app/sign-in/[[...sign-in]]/page'
import SignUpPage, {
	generateStaticParams as signUpParams,
} from '@/app/sign-up/[[...sign-up]]/page'
import AuthShell from '@/components/auth/auth-shell'
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

describe('AuthShell', () => {
	it("shows a loading card while Clerk's form is on its way", () => {
		const Pending = () => use(new Promise<never>(() => {}))
		render(
			<AuthShell subtitle="sub" title="title">
				<Pending />
			</AuthShell>,
		)
		expect(screen.getByText('Loading…')).toBeInTheDocument()
		expect(screen.getByText('Loading…').parentElement).toHaveAttribute(
			'aria-busy',
			'true',
		)
	})
})

describe('auth pages', () => {
	it('prerender their root path', () => {
		expect(signInParams()).toEqual([{ 'sign-in': [] }])
		expect(signUpParams()).toEqual([{ 'sign-up': [] }])
	})
})
