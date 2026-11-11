import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/utils'
import { defects } from '@/lib/utils-defects'

describe('cn', () => {
	it('joins classes and drops falsy ones', () => {
		expect(cn('a', false, undefined, 'b')).toBe('a b')
	})

	it('lets a later tailwind class win over a conflicting earlier one', () => {
		expect(cn('p-2', 'p-4')).toBe('p-4')
	})
})

describe('defects', () => {
	it('lists unique defect categories, ending with Other', () => {
		expect(new Set(defects).size).toBe(defects.length)
		expect(defects).toContain('Air Brake System')
		expect(defects.at(-1)).toBe('Other')
	})
})
