import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ConnectAi, MCP_URL } from '@/components/connect/connect-ai'

describe('Connect your AI', () => {
	it('shows the connector URL and the steps, and copies the URL', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined)
		Object.assign(navigator, { clipboard: { writeText } })
		render(<ConnectAi />)
		expect(screen.getByText(MCP_URL)).toBeInTheDocument()
		expect(screen.getAllByRole('listitem')).toHaveLength(3)
		await act(async () => {
			fireEvent.click(
				screen.getByRole('button', { name: 'Copy connector URL' }),
			)
		})
		expect(writeText).toHaveBeenCalledWith(MCP_URL)
	})
})
