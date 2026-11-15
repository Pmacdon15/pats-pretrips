import { NeonDbError } from '@neondatabase/serverless'
import { describe, expect, it } from 'vitest'
import { errorForLog } from '@/lib/log'

describe('errorForLog', () => {
	it("keeps a database error's code and message but not the row it refused", () => {
		const error = Object.assign(
			new NeonDbError(
				'new row for relation "pt_defect_repairs" violates check constraint "pt_defect_repairs_who_check"',
			),
			{
				code: '23514',
				detail: 'Failing row contains (7, 3, pat@x.com, Horn, ABC 123, Notes about the truck).',
				table: 'pt_defect_repairs',
			},
		)
		const logged = errorForLog(error)
		expect(logged).toMatch(/^\[23514\] /)
		expect(logged).toContain('violates check constraint')
		expect(logged).toContain('at ') // the stack
		expect(logged).not.toContain('Failing row')
		expect(logged).not.toContain('pat@x.com')
		expect(logged).not.toContain('ABC 123')
	})

	it('takes email addresses out of the message', () => {
		const logged = errorForLog(
			new Error(
				'Email address is not verified. The following identities failed the check in region CA-CENTRAL-1: pat.driver+1@x.co.uk, Boss <boss@fleet.com>',
			),
		)
		expect(logged).not.toMatch(/pat\.driver|boss@/)
		expect(logged).toContain('CA-CENTRAL-1: [email], Boss <[email]>')
	})

	it('leaves package paths like node_modules/@scope/name alone', () => {
		const error = new Error('down')
		error.stack =
			'Error: down\n    at x (/var/task/node_modules/@neondatabase/serverless/index.mjs:1:2)'
		expect(errorForLog(error)).toBe(error.stack)
	})

	it("hides a connection string's password", () => {
		// Put together here so no connection string with a password sits in
		// the source, where a secret scanner would report it.
		const password = ['not', 'a', 'real', 'password'].join('-')
		const url = `postgresql://owner:${password}@db.example.invalid/db?sslmode=require`
		const logged = errorForLog(
			new Error(
				`Database connection string provided to \`neon()\` is not a valid URL. Connection string: ${url}`,
			),
		)
		expect(logged).not.toContain(password)
		expect(logged).toContain(
			'postgresql://owner:[hidden]@db.example.invalid/db',
		)
	})

	it('uses the name and message without a stack, and a numeric code', () => {
		const error = Object.assign(new Error('Too Many Requests'), {
			code: 429,
		})
		error.stack = undefined
		expect(errorForLog(error)).toBe('[429] Error: Too Many Requests')
	})

	it('ignores a code that is not a string or number', () => {
		const error = Object.assign(new Error('odd'), { code: { a: 1 } })
		error.stack = undefined
		expect(errorForLog(error)).toBe('Error: odd')
	})

	it('turns anything else thrown into text', () => {
		expect(errorForLog('failed for pat@x.com')).toBe('failed for [email]')
		expect(errorForLog(undefined)).toBe('undefined')
		expect(errorForLog({ detail: 'pat@x.com' })).toBe('[object Object]')
	})
})
