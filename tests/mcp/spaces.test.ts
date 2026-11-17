import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getOrganizationMembershipList: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({
	clerkClient: async () => ({
		users: {
			getOrganizationMembershipList: mocks.getOrganizationMembershipList,
		},
	}),
}))

import {
	inOrg,
	isToolResult,
	listCallerOrgs,
	listOrganizations,
	resolveSpace,
	spaceOwner,
	spaceView,
} from '@/mcp/spaces'

const caller = { email: 'pat@x.com', client: 'Claude', userId: 'user_1' }
const membership = (
	id: string,
	name: string,
	role: string,
	slug: string | null = null,
) => ({ role, organization: { id, name, slug } })

beforeEach(() => {
	mocks.getOrganizationMembershipList.mockResolvedValue({
		data: [
			membership('org_1', 'Acme', 'org:admin', 'acme'),
			membership('org_2', 'Beta', 'org:member'),
		],
	})
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('listCallerOrgs', () => {
	it("reads the caller's memberships from Clerk", async () => {
		expect(await listCallerOrgs(caller)).toEqual([
			{
				id: 'org_1',
				name: 'Acme',
				slug: 'acme',
				role: 'org:admin',
				isAdmin: true,
			},
			{
				id: 'org_2',
				name: 'Beta',
				slug: null,
				role: 'org:member',
				isAdmin: false,
			},
		])
		expect(mocks.getOrganizationMembershipList).toHaveBeenCalledWith({
			userId: 'user_1',
			limit: 100,
		})
	})

	it('has none without a Clerk user ID', async () => {
		expect(await listCallerOrgs({ ...caller, userId: null })).toEqual([])
		expect(mocks.getOrganizationMembershipList).not.toHaveBeenCalled()
	})
})

describe('resolveSpace', () => {
	it('is the personal space without an organization', async () => {
		expect(await resolveSpace(caller, undefined)).toEqual({
			kind: 'personal',
		})
		expect(mocks.getOrganizationMembershipList).not.toHaveBeenCalled()
	})

	it('lets members read and only admins write', async () => {
		expect(await resolveSpace(caller, 'org_2')).toEqual({
			kind: 'org',
			orgId: 'org_2',
			name: 'Beta',
			isAdmin: false,
		})
		expect(
			await resolveSpace(caller, 'org_2', {
				write: true,
				what: 'trailers',
			}),
		).toEqual({
			summary:
				'Only an admin of Beta can change its trailers; the driver is a member there. Nothing was changed.',
			data: { status: 'not_org_admin', organization_id: 'org_2' },
			isError: true,
		})
		expect(await resolveSpace(caller, 'org_1', { write: true })).toEqual({
			kind: 'org',
			orgId: 'org_1',
			name: 'Acme',
			isAdmin: true,
		})
	})

	it("refuses an organization the caller isn't in", async () => {
		const result = await resolveSpace(caller, 'org_9')
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'not_a_member' },
		})
	})

	it("says when Clerk can't be read", async () => {
		mocks.getOrganizationMembershipList.mockRejectedValue(new Error('down'))
		const result = await resolveSpace(caller, 'org_1')
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'organizations_unavailable' },
		})
		expect(console.error).toHaveBeenCalled()
	})
})

describe('helpers', () => {
	const org = {
		kind: 'org' as const,
		orgId: 'org_1',
		name: 'Acme',
		isAdmin: true,
	}
	it('describe a space', () => {
		expect(isToolResult({ kind: 'personal' })).toBe(false)
		expect(isToolResult({ summary: 'x', data: {} })).toBe(true)
		expect(spaceOwner({ kind: 'personal' })).toBe("the driver's")
		expect(spaceOwner(org)).toBe("Acme's")
		expect(spaceView({ kind: 'personal' })).toEqual({ space: 'personal' })
		expect(spaceView(org)).toEqual({
			space: 'organization',
			organization_id: 'org_1',
			organization_name: 'Acme',
			is_admin: true,
		})
		expect(inOrg({ kind: 'personal' })).toEqual({})
		expect(inOrg(org)).toEqual({ org_id: 'org_1' })
	})
})

describe('listOrganizations', () => {
	it('lists them with whether the driver is an admin', async () => {
		const result = await listOrganizations(caller)
		expect(result.data).toEqual({
			organizations: [
				{
					organization_id: 'org_1',
					name: 'Acme',
					slug: 'acme',
					role: 'org:admin',
					is_admin: true,
				},
				{
					organization_id: 'org_2',
					name: 'Beta',
					slug: null,
					role: 'org:member',
					is_admin: false,
				},
			],
		})
		expect(result.summary).toContain(
			'The driver belongs to 2 organizations: Acme (admin); Beta (member).',
		)
		expect(result.summary).toContain(
			'only organizations where they are admin can be changed',
		)
	})

	it('says when they are only a member', async () => {
		mocks.getOrganizationMembershipList.mockResolvedValue({
			data: [membership('org_2', 'Beta', 'org:member')],
		})
		const result = await listOrganizations(caller)
		expect(result.summary).toContain('1 organization: Beta (member)')
		expect(result.summary).toContain('only admins change it')
	})

	it('says when they belong to none', async () => {
		mocks.getOrganizationMembershipList.mockResolvedValue({ data: [] })
		const result = await listOrganizations(caller)
		expect(result.summary).toMatch(/doesn't belong to any organization/)
		expect(result.data).toEqual({ organizations: [] })
	})
})
