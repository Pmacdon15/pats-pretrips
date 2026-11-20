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
	space: 'personal',
	canEdit: true,
	settings: { recipients: ['a@x.com'], autoSend: false, timeZone: null },
	driverEmail: 'pat@x.com',
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
			copyToMe: false,
			timeZone: 'America/Edmonton',
		})
		expect(mocks.toast.success).toHaveBeenCalledWith(
			'Pre-trip emailed to b@x.com',
		)
	})

	it("can send a copy to the driver's own email, with or without others", async () => {
		mocks.emailTrip.mockClear()
		mocks.emailTrip.mockResolvedValue({ value: { sentTo: ['pat@x.com'] } })
		await show()
		const button = screen.getByRole('button', { name: 'Email PDF' })
		fireEvent.change(screen.getByLabelText('Send to'), {
			target: { value: '' },
		})
		expect(button).toBeDisabled()
		const copy = screen.getByRole('checkbox', { name: /Email me a copy/ })
		expect(copy).not.toBeChecked()
		expect(screen.getByText('Also sends it to pat@x.com')).toBeTruthy()
		fireEvent.click(copy)
		expect(button).not.toBeDisabled()
		await act(async () => {
			fireEvent.click(button)
		})
		expect(mocks.emailTrip).toHaveBeenCalledWith({
			tripId: 7,
			recipients: '',
			copyToMe: true,
			timeZone: 'America/Edmonton',
		})
		expect(mocks.toast.success).toHaveBeenCalledWith(
			'Pre-trip emailed to pat@x.com',
		)
	})

	it('asks for an address when there is none and no copy', async () => {
		mocks.emailTrip.mockClear()
		await show()
		fireEvent.change(screen.getByLabelText('Send to'), {
			target: { value: '  ' },
		})
		await act(async () => {
			fireEvent.submit(
				screen
					.getByLabelText('Send to')
					.closest('form') as HTMLFormElement,
			)
		})
		expect(mocks.emailTrip).not.toHaveBeenCalled()
		expect(mocks.toast.error).toHaveBeenCalledWith(
			'Could not email this pre-trip',
			{ description: 'Add an email address, or check “Email me a copy”' },
		)
	})

	it('shows why it could not send', async () => {
		mocks.emailTrip.mockResolvedValue({ errorMessage: 'SES down' })
		await show()
		await act(async () => {
			fireEvent.submit(
				screen
					.getByLabelText('Send to')
					.closest('form') as HTMLFormElement,
			)
		})
		expect(mocks.toast.error).toHaveBeenCalledWith(
			'Could not email this pre-trip',
			{ description: 'SES down' },
		)
	})

	it('checks the addresses before sending', async () => {
		mocks.emailTrip.mockClear()
		await show()
		fireEvent.change(screen.getByLabelText('Send to'), {
			target: { value: 'not-an-email' },
		})
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Email PDF' }))
		})
		expect(mocks.emailTrip).not.toHaveBeenCalled()
		expect(mocks.toast.error).toHaveBeenCalledWith(
			'Could not email this pre-trip',
			{ description: '"not-an-email" is not an email address' },
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

	it("shows an organization's settings read-only to a member who isn't an admin", async () => {
		await show(
			access({
				space: 'org',
				canEdit: false,
				settings: {
					recipients: ['dispatch@x.com', 'safety@x.com'],
					autoSend: true,
					timeZone: null,
				},
			}),
		)
		expect(
			screen.getByText(/organization's admins choose who/),
		).toBeInTheDocument()
		expect(
			screen.getByText('dispatch@x.com, safety@x.com'),
		).toBeInTheDocument()
		expect(screen.getByText('yes')).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
		expect(screen.queryByLabelText('Send pre-trips to')).toBeNull()
	})

	it("says when an organization's admins haven't set anyone up yet", async () => {
		await show(
			access({
				space: 'org',
				canEdit: false,
				settings: { recipients: [], autoSend: false, timeZone: null },
			}),
		)
		expect(screen.getByText('nobody yet')).toBeInTheDocument()
		expect(screen.getByText('no')).toBeInTheDocument()
	})

	it("lets an organization's admin edit its settings for every driver", async () => {
		await show(access({ space: 'org', canEdit: true }))
		expect(
			screen.getByText(/Used for everyone in your organization/),
		).toBeInTheDocument()
		expect(
			screen.getByText('Email each pre-trip when a driver completes it'),
		).toBeInTheDocument()
	})

	it('shows why it could not save', async () => {
		mocks.saveEmailSettings.mockResolvedValue({ errorMessage: 'Bad email' })
		await show()
		await act(async () => {
			fireEvent.submit(
				screen.getByRole('checkbox').closest('form') as HTMLFormElement,
			)
		})
		expect(mocks.toast.error).toHaveBeenCalledWith('Could not save', {
			description: 'Bad email',
		})
	})

	const submit = () =>
		act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save' }))
		})

	it('checks the addresses before saving', async () => {
		mocks.saveEmailSettings.mockClear()
		await show()
		fireEvent.change(screen.getByLabelText('Send pre-trips to'), {
			target: { value: 'nope' },
		})
		await submit()
		expect(mocks.saveEmailSettings).not.toHaveBeenCalled()
		expect(mocks.toast.error).toHaveBeenCalledWith('Could not save', {
			description: '"nope" is not an email address',
		})
	})

	it('needs an address when auto-send is on', async () => {
		mocks.saveEmailSettings.mockClear()
		await show()
		fireEvent.change(screen.getByLabelText('Send pre-trips to'), {
			target: { value: '  ' },
		})
		fireEvent.click(screen.getByRole('checkbox'))
		await submit()
		expect(mocks.saveEmailSettings).not.toHaveBeenCalled()
		expect(mocks.toast.error).toHaveBeenCalledWith('Could not save', {
			description: 'Add an email address to send new pre-trips to',
		})
	})

	it('saves an empty list when auto-send is off', async () => {
		mocks.saveEmailSettings.mockResolvedValue({
			value: { recipients: [], autoSend: false },
		})
		await show()
		fireEvent.change(screen.getByLabelText('Send pre-trips to'), {
			target: { value: '' },
		})
		await submit()
		expect(mocks.saveEmailSettings).toHaveBeenCalledWith({
			recipients: '',
			autoSend: false,
			timeZone: 'America/Edmonton',
		})
	})

	it('shows the plans to drivers without the feature', async () => {
		await show(access({ allowed: false }))
		expect(screen.getByText('Plans')).toBeInTheDocument()
		expect(screen.queryByRole('checkbox')).toBeNull()
	})
})
