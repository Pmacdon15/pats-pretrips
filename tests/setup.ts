import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, vi } from 'vitest'

// next/link expects a mounted Next router; a plain anchor is enough for tests.
vi.mock('next/link', () => ({
	default: ({ href, children, ...rest }: Record<string, unknown>) =>
		createElement(
			'a',
			{ href: typeof href === 'string' ? href : String(href), ...rest },
			children as never,
		),
}))

process.env.TZ = 'UTC'

// The build project extends this config but runs in node, without a DOM.
if (typeof window !== 'undefined') {
	// next-themes and sonner read the colour-scheme media query.
	window.matchMedia ??= ((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	})) as typeof window.matchMedia
}

afterEach(() => {
	cleanup()
	vi.useRealTimers()
})
