import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { notBoolIterative } from './notBoolIterative.js'

describe('notBoolIterative', () => {
	test('negates plain booleans (true -> false, false -> true)', () => {
		assert.strictEqual(notBoolIterative(true), false)
		assert.strictEqual(notBoolIterative(false), true)
	})

	test('satisfies double negation involution for booleans and arrays', () => {
		assert.strictEqual(notBoolIterative(notBoolIterative(true)), true)
		assert.strictEqual(notBoolIterative(notBoolIterative(false)), false)

		const arr = [true, false, false, true, true]
		assert.deepStrictEqual(notBoolIterative(notBoolIterative(arr)), arr)
	})

	test('iteratively negates arrays of booleans including empty and single-element arrays', () => {
		assert.deepStrictEqual(notBoolIterative([]), [])
		assert.deepStrictEqual(notBoolIterative([true]), [false])
		assert.deepStrictEqual(notBoolIterative([false]), [true])
		assert.deepStrictEqual(
			notBoolIterative([true, false, true, true, false]),
			[false, true, false, false, true]
		)
	})

	test('does not mutate input array and returns a new array instance', () => {
		const input = [true, false, true]
		const snapshot = [...input]
		const output = notBoolIterative(input)

		assert.deepStrictEqual(input, snapshot)
		assert.notStrictEqual(output, input)
		assert.deepStrictEqual(output, [false, true, false])

		const empty = []
		const emptyOut = notBoolIterative(empty)
		assert.notStrictEqual(emptyOut, empty)
		assert.deepStrictEqual(emptyOut, [])
	})

	test('handles larger boolean arrays iteratively', () => {
		const size = 1000
		const input = Array.from({ length: size }, (_, i) => i % 2 === 0)
		const expected = Array.from({ length: size }, (_, i) => i % 2 !== 0)
		assert.deepStrictEqual(notBoolIterative(input), expected)
	})

	test('rejects invalid non-boolean inputs including truthy and falsy values', () => {
		const invalidValues = [
			0,
			1,
			-1,
			NaN,
			'',
			'true',
			'false',
			null,
			undefined,
			{},
			new Set([true]),
			new Boolean(true),
			new Boolean(false),
			Symbol('bool'),
			() => true,
		]

		for (const invalid of invalidValues) {
			assert.throws(() => notBoolIterative(invalid), { name: 'TypeError' })
		}
	})

	test('rejects arrays containing non-boolean elements or sparse holes', () => {
		const invalidArrays = [
			[true, 0],
			[false, 1],
			[''],
			[true, null],
			[undefined],
			[true, 'false'],
			[new Boolean(true)],
			[true, [false]],
		]

		for (const arr of invalidArrays) {
			assert.throws(() => notBoolIterative(arr), { name: 'TypeError' })
		}

		// Sparse array with a hole
		const sparse = [true, , false]
		assert.throws(() => notBoolIterative(sparse), { name: 'TypeError' })
	})

	test('cross-checks against independent truth-table and De Morgan laws', () => {
		const domain = [true, false]

		// Independent truth-table cross-check: NOT(x) === (x === false)
		for (const x of domain) {
			assert.strictEqual(notBoolIterative(x), x === false)
		}

		// Exhaustive truth-table cross-check for De Morgan's laws:
		// NOT(a && b) === (NOT(a) || NOT(b))
		// NOT(a || b) === (NOT(a) && NOT(b))
		for (const a of domain) {
			for (const b of domain) {
				assert.strictEqual(
					notBoolIterative(a && b),
					notBoolIterative(a) || notBoolIterative(b)
				)
				assert.strictEqual(
					notBoolIterative(a || b),
					notBoolIterative(a) && notBoolIterative(b)
				)
			}
		}

		// Cross-check array negation element-wise against `x === false`
		const sample = [false, true, true, false, false, true]
		const independent = sample.map((x) => x === false)
		assert.deepStrictEqual(notBoolIterative(sample), independent)
	})
})
