import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { orFuzzyRecursive } from './orFuzzyRecursive.js'

/**
 * Independent iterative Zadeh OR reference implementation.
 *
 * @param {number[]} values
 * @returns {number}
 */
function iterativeFuzzyOr(values) {
	let result = 0
	for (let i = 0; i < values.length; i++) {
		if (values[i] > result) {
			result = values[i]
		}
	}
	return result
}

/**
 * Independent De Morgan Zadeh OR reference implementation:
 * OR(x_1, ..., x_n) = 1 - min(1 - x_1, ..., 1 - x_n)
 *
 * @param {number[]} values
 * @returns {number}
 */
function deMorganFuzzyOr(values) {
	if (values.length === 0) return 0
	let minComplement = 1
	for (let i = 0; i < values.length; i++) {
		const complement = 1 - values[i]
		if (complement < minComplement) {
			minComplement = complement
		}
	}
	return 1 - minComplement
}

describe('orFuzzyRecursive', () => {
	test('computes Zadeh OR for binary and n-ary variadic fuzzy values', () => {
		assert.strictEqual(orFuzzyRecursive(0.2, 0.7), 0.7)
		assert.strictEqual(orFuzzyRecursive(0.85, 0.35), 0.85)
		assert.strictEqual(orFuzzyRecursive(0.4, 0.4), 0.4)
		assert.strictEqual(orFuzzyRecursive(0.1, 0.6, 0.3, 0.9, 0.5), 0.9)
		assert.strictEqual(orFuzzyRecursive(0.95, 0.2, 0.3, 0.4), 0.95)
		assert.strictEqual(orFuzzyRecursive(0.1, 0.2, 0.3, 0.88), 0.88)
	})

	test('computes Zadeh OR when given a single array of membership degrees', () => {
		assert.strictEqual(orFuzzyRecursive([0.2, 0.7]), 0.7)
		assert.strictEqual(orFuzzyRecursive([0.1, 0.45, 0.3, 0.72, 0.6]), 0.72)
		assert.strictEqual(orFuzzyRecursive([0.33]), 0.33)
	})

	test('handles crisp boolean boundaries (0 and 1)', () => {
		assert.strictEqual(orFuzzyRecursive(0, 0), 0)
		assert.strictEqual(orFuzzyRecursive(0, 1), 1)
		assert.strictEqual(orFuzzyRecursive(1, 0), 1)
		assert.strictEqual(orFuzzyRecursive(1, 1), 1)
		assert.strictEqual(orFuzzyRecursive([0, 0, 0, 0]), 0)
		assert.strictEqual(orFuzzyRecursive([0, 0, 1, 0]), 1)
	})

	test('handles edge cases: single value, empty array identity, -0, and extreme [0, 1] floats', () => {
		assert.strictEqual(orFuzzyRecursive(0), 0)
		assert.strictEqual(orFuzzyRecursive(1), 1)
		assert.strictEqual(orFuzzyRecursive(0.5), 0.5)
		assert.strictEqual(orFuzzyRecursive([]), 0)

		const zeroResult = orFuzzyRecursive(-0, -0)
		assert.strictEqual(Object.is(zeroResult, 0), true)

		assert.strictEqual(orFuzzyRecursive(0, Number.MIN_VALUE), Number.MIN_VALUE)
		assert.strictEqual(
			orFuzzyRecursive(1 - Number.EPSILON, 0.5),
			1 - Number.EPSILON,
		)
		assert.strictEqual(orFuzzyRecursive(1 - Number.EPSILON, 1), 1)
	})

	test('satisfies Zadeh OR algebraic laws (identity, domination, idempotence, commutativity, associativity)', () => {
		const samples = [0, 0.15, 0.5, 0.85, 1]
		for (const a of samples) {
			assert.strictEqual(orFuzzyRecursive(a, 0), a)
			assert.strictEqual(orFuzzyRecursive(a, 1), 1)
			assert.strictEqual(orFuzzyRecursive(a, a), a)
			for (const b of samples) {
				assert.strictEqual(orFuzzyRecursive(a, b), orFuzzyRecursive(b, a))
				for (const c of samples) {
					const leftAssoc = orFuzzyRecursive(orFuzzyRecursive(a, b), c)
					const rightAssoc = orFuzzyRecursive(a, orFuzzyRecursive(b, c))
					const ternary = orFuzzyRecursive(a, b, c)
					assert.strictEqual(leftAssoc, rightAssoc)
					assert.strictEqual(leftAssoc, ternary)
				}
			}
		}
	})

	test('rejects out-of-range and non-finite numbers with RangeError', () => {
		const invalidNumbers = [
			-0.0001,
			-1,
			1.0001,
			2,
			NaN,
			Infinity,
			-Infinity,
		]
		for (const bad of invalidNumbers) {
			assert.throws(() => orFuzzyRecursive(bad), RangeError)
			assert.throws(() => orFuzzyRecursive(0.5, bad), RangeError)
			assert.throws(() => orFuzzyRecursive(1, bad), RangeError)
			assert.throws(() => orFuzzyRecursive([0.2, 1, bad]), RangeError)
		}
	})

	test('rejects wrong types and missing arguments with TypeError', () => {
		assert.throws(() => orFuzzyRecursive(), TypeError)
		assert.throws(() => orFuzzyRecursive('0.5', 0.2), TypeError)
		assert.throws(() => orFuzzyRecursive(0.2, '0.5'), TypeError)
		assert.throws(() => orFuzzyRecursive(true, false), TypeError)
		assert.throws(() => orFuzzyRecursive(null), TypeError)
		assert.throws(() => orFuzzyRecursive(undefined), TypeError)
		assert.throws(() => orFuzzyRecursive({}), TypeError)
		assert.throws(() => orFuzzyRecursive([0.2, '0.5']), TypeError)
		assert.throws(() => orFuzzyRecursive([0.2, null]), TypeError)
		assert.throws(() => orFuzzyRecursive([0.2, [0.5]]), TypeError)
		assert.throws(() => orFuzzyRecursive([0.2], [0.5]), TypeError)

		// Sparse array contains a hole (undefined)
		// eslint-disable-next-line no-sparse-arrays
		const sparse = [0.2, , 0.5]
		assert.throws(() => orFuzzyRecursive(sparse), TypeError)
	})

	test('cross-checks against independent iterative Zadeh OR and De Morgan computation', () => {
		const datasets = [
			[0],
			[1],
			[0.12, 0.78],
			[0.91, 0.34, 0.56],
			[0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07],
			[0.5, 0.5, 0.5, 0.5, 0.5],
			[0, 0.25, 0.5, 0.75, 1],
			Array.from({ length: 1024 }, (_, i) => ((i * 7919) % 10001) / 10000),
		]

		for (const data of datasets) {
			const recursiveRes = orFuzzyRecursive(data)
			const iterativeRes = iterativeFuzzyOr(data)
			const deMorganRes = deMorganFuzzyOr(data)

			assert.strictEqual(recursiveRes, iterativeRes)
			assert.ok(
				Math.abs(recursiveRes - deMorganRes) <= 1e-15,
				`Expected ${recursiveRes} to match De Morgan result ${deMorganRes}`,
			)
		}
	})

	test('handles large arrays without stack overflow via O(log n) divide-and-conquer depth', () => {
		const size = 20000
		const large = Array.from({ length: size }, (_, i) =>
			i === 12345 ? 0.9999 : (i % 997) / 1000,
		)
		assert.strictEqual(orFuzzyRecursive(large), 0.9999)
		assert.strictEqual(orFuzzyRecursive(large), iterativeFuzzyOr(large))
	})
})
