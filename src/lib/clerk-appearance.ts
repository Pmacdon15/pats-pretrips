import type { ClerkProvider } from '@clerk/nextjs'
import type { ComponentProps } from 'react'

type Appearance = NonNullable<
	ComponentProps<typeof ClerkProvider>['appearance']
>

/*
 * Clerk's components, themed with the app's own colour tokens (globals.css),
 * so they follow light and dark mode with the rest of the app. Clerk's styles
 * go in the `clerk` CSS layer, under Tailwind's utilities, so the classes in
 * `elements` win.
 */
export const clerkAppearance: Appearance = {
	cssLayerName: 'clerk',
	variables: {
		colorPrimary: 'var(--primary)',
		colorPrimaryForeground: 'var(--primary-foreground)',
		colorBackground: 'var(--card)',
		colorForeground: 'var(--card-foreground)',
		colorMuted: 'var(--muted)',
		colorMutedForeground: 'var(--muted-foreground)',
		colorInput: 'var(--background)',
		colorInputForeground: 'var(--foreground)',
		colorBorder: 'var(--border)',
		colorRing: 'var(--ring)',
		colorDanger: 'var(--destructive)',
		fontFamily: 'var(--font-geist-sans)',
		borderRadius: 'var(--radius)',
	},
}

/** Extra styling for the full-page sign-in and sign-up cards. */
export const authPageAppearance: Appearance = {
	elements: {
		rootBox: 'w-full',
		cardBox: 'w-full max-w-none rounded-2xl border shadow-xl',
		card: 'px-6 py-8 sm:px-8',
		logoBox: 'hidden',
		headerTitle: 'text-2xl font-bold tracking-tight',
		headerSubtitle: 'text-muted-foreground',
		socialButtonsBlockButton: 'h-11',
		formFieldInput: 'h-11 text-base',
		formButtonPrimary: 'h-11 text-base font-semibold shadow-none',
		footer: 'bg-muted/60',
		footerActionLink: 'font-semibold text-primary hover:text-primary/80',
	},
}
