import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	createApiKey: vi.fn(),
	listApiKeys: vi.fn(),
	revokeApiKey: vi.fn(),
	toast: { error: vi.fn(), success: vi.fn() },
	writeText: vi.fn(),
}))
vi.mock('@/lib/actions/api-keys', () => ({
	createApiKey: mocks.createApiKey,
	listApiKeys: mocks.listApiKeys,
	revokeApiKey: mocks.revokeApiKey,
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))

import { ConnectAi, MCP_URL } from '@/components/connect/connect-ai'
import type { ApiKey } from '@/lib/api-keys'

const key = (over: Partial<ApiKey> = {}): ApiKey => ({
	id: 1,
	name: 'Muse',
	prefix: 'ppt_abcdef',
	createdAt: '2026-11-01T00:00:00.000Z',
	lastUsedAt: null,
	...over,
})

beforeEach(() => {
	Object.assign(navigator, { clipboard: { writeText: mocks.writeText } })
	mocks.writeText.mockResolvedValue(undefined)
})

/** Renders the card, then asks for the keys, as a driver would. */
async function renderConnect(keys: ApiKey[]) {
	mocks.listApiKeys.mockResolvedValue({ value: keys })
	render(<ConnectAi />)
	await act(async () => {
		fireEvent.click(
			screen.getByRole('button', { name: /Show my API keys/ }),
		)
	})
}

describe('Connect your AI', () => {
	it('loads no keys until the driver asks', async () => {
		render(<ConnectAi />)
		expect(mocks.listApiKeys).not.toHaveBeenCalled()
		mocks.listApiKeys.mockResolvedValue({ errorMessage: 'Down' })
		await act(async () => {
			fireEvent.click(
				screen.getByRole('button', { name: /Show my API keys/ }),
			)
		})
		expect(mocks.toast.error).toHaveBeenCalledWith('Down')
	})

	it('says when there are no keys', async () => {
		await renderConnect([])
		expect(screen.getByText('You have no API keys.')).toBeInTheDocument()
	})

	it('shows the connector URL and copies it', async () => {
		await renderConnect([])
		expect(screen.getByText(MCP_URL)).toBeInTheDocument()
		await act(async () => {
			fireEvent.click(
				screen.getByRole('button', { name: 'Copy connector URL' }),
			)
		})
		expect(mocks.writeText).toHaveBeenCalledWith(MCP_URL)
		expect(screen.queryByRole('list', { name: /keys/i })).toBeNull()
	})

	it('lists keys with when they were used', async () => {
		await renderConnect([
			key(),
			key({
				id: 2,
				name: 'Gemini',
				lastUsedAt: '2026-11-05T00:00:00.000Z',
			}),
		])
		expect(screen.getByText(/never used/)).toBeInTheDocument()
		expect(screen.getByText(/last used Nov 5, 2026/)).toBeInTheDocument()
	})

	it('creates a key and shows it once', async () => {
		mocks.createApiKey.mockResolvedValue({
			value: {
				apiKey: key({ id: 3, name: 'Claude' }),
				key: 'ppt_secret',
			},
		})
		await renderConnect([])
		const create = screen.getByRole('button', { name: /Create API key/ })
		expect(create).toBeDisabled()
		fireEvent.change(screen.getByLabelText('Key name'), {
			target: { value: 'Claude' },
		})
		await act(async () => {
			fireEvent.click(create)
		})
		expect(mocks.createApiKey).toHaveBeenCalledWith({ name: 'Claude' })
		expect(screen.getByText('ppt_secret')).toBeInTheDocument()
		expect(screen.getByText('Claude')).toBeInTheDocument()
		expect(screen.getByLabelText('Key name')).toHaveValue('')
	})

	it('says why a key could not be created', async () => {
		mocks.createApiKey.mockResolvedValue({ errorMessage: 'Too long' })
		await renderConnect([])
		fireEvent.change(screen.getByLabelText('Key name'), {
			target: { value: 'x' },
		})
		await act(async () => {
			fireEvent.submit(
				screen
					.getByLabelText('Key name')
					.closest('form') as HTMLFormElement,
			)
		})
		expect(mocks.toast.error).toHaveBeenCalledWith('Too long')
	})

	it('revokes a key', async () => {
		mocks.revokeApiKey.mockResolvedValueOnce({ errorMessage: 'Nope' })
		mocks.revokeApiKey.mockResolvedValueOnce({ value: { id: 1 } })
		await renderConnect([key()])
		const revoke = screen.getByRole('button', { name: 'Revoke Muse' })
		await act(async () => {
			fireEvent.click(revoke)
		})
		expect(mocks.toast.error).toHaveBeenCalledWith('Nope')
		await act(async () => {
			fireEvent.click(revoke)
		})
		expect(mocks.revokeApiKey).toHaveBeenCalledWith(1)
		expect(mocks.toast.success).toHaveBeenCalledWith('Revoked Muse')
		expect(screen.queryByText('Muse')).toBeNull()
	})
})
