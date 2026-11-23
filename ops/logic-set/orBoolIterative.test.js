import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { orBoolIterative } from './orBoolIterative.js'

describe('orBoolIterative', () => {
	test('binary truth table (variadic booleans)', () => {
		assert.equal(orBoolIterative(false, false), false)
		assert.equal(orBoolIterative(false, true), true)
		assert.equal(orBoolIterative(true, false), true)
		assert.equal(orBoolIterative(true, true), true)
	})

	test('single boolean and multi-argument variadic booleans', () => {
		assert.equal(orBoolIterative(false), false)
		assert.equal(orBoolIterative(true), true)
		assert.equal(orBoolIterative(false, false, false, false), false)
		assert.equal(orBoolIterative(false, false, true, false), true)
		assert.equal(orBoolIterative(true, false, false, false), true)
		assert.equal(orBoolIterative(false, false, false, true), true)
	})

	test('array of booleans', () => {
		assert.equal(orBoolIterative([false, false, false]), false)
		assert.equal(orBoolIterative([false, true, false]), true)
		assert.equal(orBoolIterative([true]), true)
		assert.equal(orBoolIterative([false]), false)
		assert.equal(orBoolIterative([true, true, true]), true)
	})

	test('Set of booleans', () => {
		assert.equal(orBoolIterative(new Set([false])), false)
		assert.equal(orBoolIterative(new Set([true])), true)
		assert.equal(orBoolIterative(new Set([false, true])), true)
		assert.equal(orBoolIterative(new Set([true, false])), true)
	})

	test('empty inputs return identity element (false)', () => {
		assert.equal(orBoolIterative(), false)
		assert.equal(orBoolIterative([]), false)
		assert.equal(orBoolIterative(new Set()), false)
	})

	test('handles large arrays iteratively without stack overflow', () => {
		const size = 100_000
		const allFalse = new Array(size).fill(false)
		assert.equal(orBoolIterative(allFalse), false)

		const lastTrue = new Array(size).fill(false)
		lastTrue[size - 1] = true
		assert.equal(orBoolIterative(lastTrue), true)
	})

	test('invalid single argument throws TypeError', () => {
		const invalidValues = [
			null,
			undefined,
			0,
			1,
			NaN,
			'',
			'true',
			'false',
			{},
			{ valueOf: () => true },
			new Boolean(true),
			Symbol('bool'),
			() => true,
		]

		for (const bad of invalidValues) {
			assert.throws(() => orBoolIterative(bad), TypeError)
		}
	})

	test('invalid elements in variadic args, arrays, Sets, and sparse arrays throw TypeError', () => {
		// Must validate even after seeing true (no unchecked short-circuit)
		assert.throws(() => orBoolIterative(true, 1), TypeError)
		assert.throws(() => orBoolIterative(true, null), TypeError)
		assert.throws(() => orBoolIterative(false, 'false'), TypeError)
		assert.throws(() => orBoolIterative([true], [false]), TypeError)

		assert.throws(() => orBoolIterative([true, 0]), TypeError)
		assert.throws(() => orBoolIterative([false, undefined]), TypeError)
		assert.throws(() => orBoolIterative(['true']), TypeError)

		assert.throws(() => orBoolIterative(new Set([true, 1])), TypeError)
		assert.throws(() => orBoolIterative(new Set([false, null])), TypeError)

		const sparse = []
		sparse[1] = true
		assert.throws(() => orBoolIterative(sparse), TypeError)
	})

	test('cross-check via De Morgan law over all truth tables for n = 0..5', () => {
		// De Morgan's law: OR(x_1, ..., x_n) === NOT(AND(NOT x_1, ..., NOT x_n))
		const orViaDeMorgan = (bits) => {
			let allNegatedTrue = true
			for (let i = 0; i < bits.length; i += 1) {
				allNegatedTrue = allNegatedTrue && !bits[i]
			}
			return !allNegatedTrue
		}

		for (let n = 0; n <= 5; n += 1) {
			const total = 1 << n
			for (let mask = 0; mask < total; mask += 1) {
				const bits = []
				for (let bit = 0; bit < n; bit += 1) {
					bits.push(Boolean((mask >> bit) & 1))
				}

				const expected = orViaDeMorgan(bits)
				assert.equal(orBoolIterative(bits), expected)
				assert.equal(orBoolIterative(...bits), expected)
				assert.equal(orBoolIterative(new Set(bits)), expected)
			}
		}
	})

	test('algebraic laws: commutativity, associativity, idempotence, identity, dominance', () => {
		const bools = [false, true]
		for (const a of bools) {
			// Identity & dominance & idempotence
			assert.equal(orBoolIterative(a, false), a)
			assert.equal(orBoolIterative(false, a), a)
			assert.equal(orBoolIterative(a, true), true)
			assert.equal(orBoolIterative(true, a), true)
			assert.equal(orBoolIterative(a, a), a)

			for (const b of bools) {
				// Commutativity
				assert.equal(orBoolIterative(a, b), orBoolIterative(b, a))

				for (const c of bools) {
					// Associativity
					assert.equal(
						orBoolIterative(orBoolIterative(a, b), c),
						orBoolIterative(a, orBoolIterative(b, c)),
					)
				}
			}
		}
	})
})
