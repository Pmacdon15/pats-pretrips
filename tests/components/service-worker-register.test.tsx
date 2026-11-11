import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ServiceWorkerRegister from '@/components/pwa/service-worker-register'

const original = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')

function stubServiceWorker(register: ReturnType<typeof vi.fn>) {
	Object.defineProperty(navigator, 'serviceWorker', {
		configurable: true,
		value: { register },
	})
}

afterEach(() => {
	if (original) Object.defineProperty(navigator, 'serviceWorker', original)
	else Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('ServiceWorkerRegister', () => {
	it('registers /sw.js in production', () => {
		vi.stubEnv('NODE_ENV', 'production')
		const register = vi.fn().mockResolvedValue({})
		stubServiceWorker(register)
		const { container } = render(<ServiceWorkerRegister />)
		expect(container).toBeEmptyDOMElement()
		expect(register).toHaveBeenCalledWith('/sw.js', {
			scope: '/',
			updateViaCache: 'none',
		})
	})

	it('logs when registration fails', async () => {
		vi.stubEnv('NODE_ENV', 'production')
		const error = new Error('nope')
		stubServiceWorker(vi.fn().mockRejectedValue(error))
		const log = vi.spyOn(console, 'error').mockImplementation(() => {})
		render(<ServiceWorkerRegister />)
		await waitFor(() =>
			expect(log).toHaveBeenCalledWith(
				'Service worker registration failed:',
				error,
			),
		)
	})

	it('does nothing outside production', () => {
		vi.stubEnv('NODE_ENV', 'development')
		const register = vi.fn()
		stubServiceWorker(register)
		render(<ServiceWorkerRegister />)
		expect(register).not.toHaveBeenCalled()
	})

	it('does nothing when the browser has no service worker support', () => {
		vi.stubEnv('NODE_ENV', 'production')
		Reflect.deleteProperty(navigator, 'serviceWorker')
		expect(() => render(<ServiceWorkerRegister />)).not.toThrow()
	})
})
