import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { orBoolRecursive } from './orBoolRecursive.js'

describe('orBoolRecursive', () => {
	test('2-argument truth table (variadic and array forms)', () => {
		const cases = [
			[false, false, false],
			[false, true, true],
			[true, false, true],
			[true, true, true],
		]

		for (const [a, b, expected] of cases) {
			assert.equal(orBoolRecursive(a, b), expected)
			assert.equal(orBoolRecursive([a, b]), expected)
		}
	})

	test('multi-argument normal cases', () => {
		assert.equal(orBoolRecursive(false, false, false), false)
		assert.equal(orBoolRecursive(false, true, false), true)
		assert.equal(orBoolRecursive(true, true, true, true), true)
		assert.equal(orBoolRecursive(false, false, false, false, true), true)
		assert.equal(orBoolRecursive([false, false, false, false, false]), false)
		assert.equal(orBoolRecursive([false, false, true, false, false]), true)
	})

	test('edge cases: single boolean, all false, first/middle/last true', () => {
		// Single boolean
		assert.equal(orBoolRecursive(true), true)
		assert.equal(orBoolRecursive(false), false)
		assert.equal(orBoolRecursive([true]), true)
		assert.equal(orBoolRecursive([false]), false)

		// All false across odd and even lengths
		for (const len of [1, 2, 3, 4, 7, 8, 15, 16, 64]) {
			const allFalse = Array(len).fill(false)
			assert.equal(orBoolRecursive(allFalse), false)
			assert.equal(orBoolRecursive(...allFalse), false)
		}

		// First, middle, and last true across odd and even lengths
		for (const len of [3, 4, 5, 8, 9, 17]) {
			const positions = [0, Math.floor(len / 2), len - 1]
			for (const pos of positions) {
				const arr = Array(len).fill(false)
				arr[pos] = true
				assert.equal(orBoolRecursive(arr), true)
				assert.equal(orBoolRecursive(...arr), true)
			}
		}
	})

	test('handles large arrays without stack overflow and without mutating input', () => {
		const size = 10_000
		const allFalse = Array(size).fill(false)
		assert.equal(orBoolRecursive(allFalse), false)
		assert.equal(allFalse.length, size)
		assert.equal(allFalse[size - 1], false)

		const lastTrue = Array(size).fill(false)
		lastTrue[size - 1] = true
		const snapshot = lastTrue.slice()
		assert.equal(orBoolRecursive(lastTrue), true)
		assert.deepEqual(lastTrue, snapshot)
	})

	test('throws TypeError for invalid inputs', () => {
		// Missing / empty inputs
		assert.throws(() => orBoolRecursive(), TypeError)
		assert.throws(() => orBoolRecursive([]), TypeError)

		// Non-boolean single values (variadic and array)
		const nonBooleans = [
			0,
			1,
			NaN,
			'',
			'true',
			'false',
			null,
			undefined,
			Symbol('bool'),
			1n,
			{},
			new Set([true]),
			new Boolean(true),
			new Boolean(false),
		]

		for (const invalid of nonBooleans) {
			assert.throws(() => orBoolRecursive(invalid), TypeError)
			assert.throws(() => orBoolRecursive([invalid]), TypeError)
		}

		// Strict validation must still reject invalid elements after a leading true
		assert.throws(() => orBoolRecursive(true, 1), TypeError)
		assert.throws(() => orBoolRecursive(true, 'false'), TypeError)
		assert.throws(() => orBoolRecursive(true, null), TypeError)
		assert.throws(() => orBoolRecursive([true, undefined]), TypeError)
		assert.throws(() => orBoolRecursive([true, false, new Boolean(false)]), TypeError)

		// Multiple array arguments, mixed array + boolean, nested arrays, sparse arrays
		assert.throws(() => orBoolRecursive([true], false), TypeError)
		assert.throws(() => orBoolRecursive([true], [false]), TypeError)
		assert.throws(() => orBoolRecursive([[true]]), TypeError)
		// eslint-disable-next-line no-sparse-arrays
		assert.throws(() => orBoolRecursive([, true]), TypeError)
		assert.throws(() => orBoolRecursive(new Array(3)), TypeError)
	})

	test('cross-check against Array.prototype.some and De Morgan law over exhaustive truth tables (n = 1..8)', () => {
		for (let n = 1; n <= 8; n++) {
			const total = 1 << n
			for (let mask = 0; mask < total; mask++) {
				const bits = Array.from({ length: n }, (_, i) => Boolean((mask >> i) & 1))

				const expectedSome = bits.some(Boolean)
				const expectedDeMorgan = !bits.every((b) => !b)
				assert.equal(expectedSome, expectedDeMorgan)

				assert.equal(orBoolRecursive(...bits), expectedSome)
				assert.equal(orBoolRecursive(bits), expectedSome)
			}
		}
	})

	test('satisfies boolean algebra laws (commutativity, associativity, idempotence, identity, annihilator)', () => {
		const bools = [false, true]
		for (const a of bools) {
			assert.equal(orBoolRecursive(a, a), a)
			assert.equal(orBoolRecursive(a, false), a)
			assert.equal(orBoolRecursive(a, true), true)

			for (const b of bools) {
				assert.equal(orBoolRecursive(a, b), orBoolRecursive(b, a))
				for (const c of bools) {
					assert.equal(
						orBoolRecursive(orBoolRecursive(a, b), c),
						orBoolRecursive(a, orBoolRecursive(b, c))
					)
				}
			}
		}
	})
})
