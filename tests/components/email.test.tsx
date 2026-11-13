import { act, fireEvent, render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	emailTrip: vi.fn(),
	saveEmailSettings: vi.fn(),
	toast: { error: vi.fn(), success: vi.fn() },
}))
vi.mock('@/lib/actions/email', () => ({
	emailTrip: mocks.emailTrip,
	saveEmailSettings: mocks.saveEmailSettings,
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))

import { EmailSettingsForm } from '@/components/email/email-settings'
import { EmailTrip } from '@/components/email/email-trip'
import { browserTimeZone } from '@/components/email/time-zone'
import type { EmailAccess } from '@/lib/DAL/email'

const access = (over: Partial<EmailAccess> = {}): EmailAccess => ({
	allowed: true,
	settings: { recipients: ['a@x.com'], autoSend: false, timeZone: null },
	...over,
})

const renderAsync = async (ui: React.ReactNode) => {
	await act(async () => {
		render(<Suspense>{ui}</Suspense>)
	})
}

beforeEach(() => {
	vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
		() =>
			({
				resolvedOptions: () => ({ timeZone: 'America/Edmonton' }),
			}) as never,
	)
})

describe('browserTimeZone', () => {
	it("is the browser's zone, if it knows one", () => {
		expect(browserTimeZone()).toBe('America/Edmonton')
		vi.mocked(Intl.DateTimeFormat).mockImplementation(
			() => ({ resolvedOptions: () => ({ timeZone: '' }) }) as never,
		)
		expect(browserTimeZone()).toBeUndefined()
	})
})

describe('EmailTrip', () => {
	const show = (value = access()) =>
		renderAsync(
			<EmailTrip accessPromise={Promise.resolve(value)} tripId={7} />,
		)

	it('sends the trip to the saved recipients, or others', async () => {
		mocks.emailTrip.mockResolvedValue({ value: { sentTo: ['b@x.com'] } })
		await show()
		const input = screen.getByLabelText('Send to')
		expect(input).toHaveValue('a@x.com')
		fireEvent.change(input, { target: { value: 'b@x.com' } })
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Email PDF' }))
		})
		expect(mocks.emailTrip).toHaveBeenCalledWith({
			tripId: 7,
			recipients: 'b@x.com',
			timeZone: 'America/Edmonton',
		})
		expect(mocks.toast.success).toHaveBeenCalledWith(
			'Pre-trip emailed to b@x.com',
		)
	})

	it('shows why it could not send', async () => {
		mocks.emailTrip.mockResolvedValue({ errorMessage: 'SES down' })
		await show()
		await act(async () => {
			fireEvent.submit(screen.getByRole('button', { name: 'Email PDF' }))
		})
		expect(mocks.toast.error).toHaveBeenCalledWith(
			'Could not email this pre-trip',
			{ description: 'SES down' },
		)
	})

	it('needs someone to send to', async () => {
		await show(
			access({ settings: { ...access().settings, recipients: [] } }),
		)
		expect(screen.getByRole('button', { name: 'Email PDF' })).toBeDisabled()
	})

	it('points drivers without the feature to the plans', async () => {
		await show(access({ allowed: false }))
		expect(screen.queryByLabelText('Send to')).toBeNull()
		expect(screen.getByRole('link', { name: 'See plans' })).toHaveAttribute(
			'href',
			'/email',
		)
	})
})

describe('EmailSettingsForm', () => {
	const show = (value = access()) =>
		renderAsync(
			<EmailSettingsForm
				accessPromise={Promise.resolve(value)}
				pricing={<p>Plans</p>}
			/>,
		)

	it('saves the recipients and auto-send', async () => {
		mocks.saveEmailSettings.mockResolvedValue({
			value: { recipients: ['a@x.com', 'b@x.com'], autoSend: true },
		})
		await show()
		const input = screen.getByLabelText('Send pre-trips to')
		fireEvent.change(input, { target: { value: 'A@x.com b@x.com' } })
		fireEvent.click(screen.getByRole('checkbox'))
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save' }))
		})
		expect(mocks.saveEmailSettings).toHaveBeenCalledWith({
			recipients: 'A@x.com b@x.com',
			autoSend: true,
			timeZone: 'America/Edmonton',
		})
		expect(input).toHaveValue('a@x.com, b@x.com')
		expect(mocks.toast.success).toHaveBeenCalledWith('Email settings saved')
	})

	it('shows why it could not save', async () => {
		mocks.saveEmailSettings.mockResolvedValue({ errorMessage: 'Bad email' })
		await show()
		await act(async () => {
			fireEvent.submit(screen.getByRole('button', { name: 'Save' }))
		})
		expect(mocks.toast.error).toHaveBeenCalledWith('Could not save', {
			description: 'Bad email',
		})
	})

	it('shows the plans to drivers without the feature', async () => {
		await show(access({ allowed: false }))
		expect(screen.getByText('Plans')).toBeInTheDocument()
		expect(screen.queryByRole('checkbox')).toBeNull()
	})
})
