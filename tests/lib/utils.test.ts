import { describe, expect, it } from 'vitest'
import { cn, formatTripDate } from '@/lib/utils'
import { defects, joinDefects, parseDefects } from '@/lib/utils-defects'

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

describe('parseDefects / joinDefects', () => {
	it('splits, trims and drops blanks and "None"', () => {
		expect(parseDefects(' Cab, ,Horn , none')).toEqual(['Cab', 'Horn'])
	})

	it('returns an empty list for nothing', () => {
		expect(parseDefects(null)).toEqual([])
		expect(parseDefects(undefined)).toEqual([])
		expect(parseDefects('')).toEqual([])
	})

	it('joins with a comma and space', () => {
		expect(joinDefects(['Cab', 'Horn'])).toBe('Cab, Horn')
	})
})

describe('formatTripDate', () => {
	it('formats a date or ISO string in en-CA', () => {
		const iso = '2026-01-02T03:04:00Z'
		expect(formatTripDate(iso)).toBe('Jan 2, 2026, 3:04 a.m.')
		expect(formatTripDate(new Date(iso))).toBe(formatTripDate(iso))
	})
})
