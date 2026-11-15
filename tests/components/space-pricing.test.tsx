import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ inOrg: false }))
vi.mock('@/lib/hooks/space', () => ({
	useSpace: () => ({ inOrg: mocks.inOrg }),
}))
vi.mock('@clerk/nextjs', () => ({
	PricingTable: (p: { for: string; newSubscriptionRedirectUrl: string }) => (
		<p data-for={p.for} data-testid="pricing">
			{p.newSubscriptionRedirectUrl}
		</p>
	),
}))

import { SpacePricingTable } from '@/components/email/space-pricing'

describe('SpacePricingTable', () => {
	it("shows the driver's own plans in their personal space", () => {
		mocks.inOrg = false
		render(<SpacePricingTable />)
		expect(screen.getByTestId('pricing')).toHaveAttribute(
			'data-for',
			'user',
		)
		expect(screen.getByTestId('pricing')).toHaveTextContent('/email')
	})

	it("shows the organization's plans in an organization's space", () => {
		mocks.inOrg = true
		render(<SpacePricingTable />)
		expect(screen.getByTestId('pricing')).toHaveAttribute(
			'data-for',
			'organization',
		)
	})
})
