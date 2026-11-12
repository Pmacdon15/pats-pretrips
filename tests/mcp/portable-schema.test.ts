import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { portable, toPortableJsonSchema } from '@/mcp/portable-schema'

const input = (schema: z.ZodType) =>
	portable(schema)['~standard'].jsonSchema.input({ target: 'draft-2020-12' })

describe('portable tool schemas', () => {
	it('drops keywords strict clients reject', () => {
		expect(
			toPortableJsonSchema({
				$schema: 'https://json-schema.org/draft/2020-12/schema',
				type: 'object',
				additionalProperties: false,
				properties: {
					id: { type: 'string', format: 'uuid', pattern: '^x$' },
				},
			}),
		).toEqual({
			type: 'object',
			properties: { id: { type: 'string', pattern: '^x$' } },
		})
	})

	it('keeps the formats Gemini knows', () => {
		expect(
			toPortableJsonSchema({ type: 'string', format: 'date-time' }),
		).toEqual({ type: 'string', format: 'date-time' })
	})

	it('turns exclusive bounds into inclusive ones', () => {
		expect(input(z.object({ a: z.number().positive().max(10) }))).toEqual({
			type: 'object',
			properties: { a: { type: 'number', minimum: 0, maximum: 10 } },
			required: ['a'],
		})
	})

	it('turns const into a typed one-value enum', () => {
		expect(
			input(
				z.object({ s: z.union([z.boolean(), z.literal('unknown')]) }),
			),
		).toEqual({
			type: 'object',
			properties: {
				s: {
					anyOf: [
						{ type: 'boolean' },
						{ type: 'string', enum: ['unknown'] },
					],
				},
			},
			required: ['s'],
		})
	})

	it('turns X | null into a nullable X', () => {
		expect(input(z.object({ d: z.number().int().nullable() }))).toEqual({
			type: 'object',
			properties: {
				d: {
					type: 'integer',
					minimum: Number.MIN_SAFE_INTEGER,
					maximum: Number.MAX_SAFE_INTEGER,
					nullable: true,
				},
			},
			required: ['d'],
		})
		expect(toPortableJsonSchema({ type: ['string', 'null'] })).toEqual({
			type: 'string',
			nullable: true,
		})
	})

	it('rewrites nested objects and array items', () => {
		expect(
			input(
				z.object({
					r: z.object({ total: z.number().positive() }).optional(),
					k: z.array(z.string().min(1)).max(3),
				}),
			),
		).toEqual({
			type: 'object',
			properties: {
				r: {
					type: 'object',
					properties: { total: { type: 'number', minimum: 0 } },
					required: ['total'],
				},
				k: {
					type: 'array',
					items: { type: 'string', minLength: 1 },
					maxItems: 3,
				},
			},
			required: ['k'],
		})
	})

	it('validates with the original schema, exclusive bounds and all', async () => {
		const schema = portable(z.object({ a: z.number().positive() }))
		const validate = schema['~standard'].validate
		expect(await validate({ a: 1 })).toEqual({ value: { a: 1 } })
		expect(await validate({ a: 0 })).toHaveProperty('issues')
	})
})

describe('toPortableJsonSchema edge cases', () => {
	it.each([
		['a non-object', 'x', {}],
		['an array', [1], {}],
		[
			'properties that are not an object',
			{ type: 'object', properties: 5 },
			{ type: 'object', properties: {} },
		],
		['anyOf that is not an array', { anyOf: 5 }, {}],
		[
			'oneOf as anyOf',
			{ oneOf: [{ type: 'string' }] },
			{ anyOf: [{ type: 'string' }] },
		],
		[
			'const with a known type',
			{ type: 'string', const: 'x' },
			{ type: 'string', enum: ['x'] },
		],
		['a boolean const', { const: true }, { type: 'boolean', enum: [true] }],
		['an integer const', { const: 2 }, { type: 'integer', enum: [2] }],
		['a number const', { const: 2.5 }, { type: 'number', enum: [2.5] }],
		['an untyped const', { const: null }, { enum: [null] }],
		['a mixed enum', { enum: ['a', 1] }, { enum: ['a', 1] }],
		[
			'an untyped enum',
			{ enum: ['a', 'b'] },
			{ type: 'string', enum: ['a', 'b'] },
		],
		[
			'an enum under anyOf',
			{ enum: ['a'], anyOf: [{ type: 'string' }, { type: 'number' }] },
			{ enum: ['a'], anyOf: [{ type: 'string' }, { type: 'number' }] },
		],
		[
			'exclusive bounds next to inclusive ones',
			{
				minimum: 5,
				exclusiveMinimum: 3,
				maximum: 1,
				exclusiveMaximum: 4,
			},
			{ minimum: 5, maximum: 1 },
		],
		[
			'exclusive bounds that are not numbers',
			{ exclusiveMinimum: true, exclusiveMaximum: true },
			{},
		],
		['an exclusive maximum alone', { exclusiveMaximum: 4 }, { maximum: 4 }],
		[
			'inclusive bounds after exclusive ones',
			{
				exclusiveMinimum: 3,
				minimum: 1,
				exclusiveMaximum: 4,
				maximum: 9,
			},
			{ minimum: 3, maximum: 4 },
		],
		[
			'non-numeric bounds after exclusive ones',
			{
				exclusiveMinimum: 3,
				minimum: 'x',
				exclusiveMaximum: 4,
				maximum: 'y',
			},
			{ minimum: 'x', maximum: 'y' },
		],
		[
			'an unknown format',
			{ type: 'string', format: 'uuid' },
			{ type: 'string' },
		],
		[
			'several types',
			{ type: ['string', 'number', 'null'] },
			{
				anyOf: [{ type: 'string' }, { type: 'number' }],
				nullable: true,
			},
		],
		[
			'several non-null types',
			{ type: ['string', 'number'] },
			{
				anyOf: [{ type: 'string' }, { type: 'number' }],
			},
		],
		[
			'X | null keeping existing keys',
			{
				description: 'd',
				anyOf: [{ type: 'string', description: 'x' }, { type: 'null' }],
			},
			{ description: 'd', type: 'string', nullable: true },
		],
		[
			'a union with null and several others',
			{
				anyOf: [
					{ type: 'string' },
					{ type: 'number' },
					{ type: 'null' },
				],
			},
			{ anyOf: [{ type: 'string' }, { type: 'number' }], nullable: true },
		],
		[
			'a union without null',
			{ anyOf: [{ type: 'string' }, { type: 'number' }] },
			{ anyOf: [{ type: 'string' }, { type: 'number' }] },
		],
	])('handles %s', (_name, schema, expected) => {
		expect(toPortableJsonSchema(schema)).toEqual(expected)
	})

	it('rewrites output schemas too', () => {
		const schema = portable(z.object({ a: z.number().positive() }))
		expect(
			schema['~standard'].jsonSchema.output({ target: 'draft-2020-12' }),
		).toMatchObject({ properties: { a: { minimum: 0 } } })
	})
})
