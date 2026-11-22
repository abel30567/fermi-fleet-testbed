import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { andFuzzyRecursive } from './andFuzzyRecursive.js'

describe('andFuzzyRecursive', () => {
	describe('normal cases', () => {
		test('computes Zadeh AND (min) for two fuzzy membership values', () => {
			assert.strictEqual(andFuzzyRecursive(0.3, 0.7), 0.3)
			assert.strictEqual(andFuzzyRecursive(0.85, 0.42), 0.42)
			assert.strictEqual(andFuzzyRecursive(0.5, 0.5), 0.5)
		})

		test('computes Zadeh AND across many variadic arguments', () => {
			assert.strictEqual(andFuzzyRecursive(0.9, 0.4, 0.75, 0.25, 0.6), 0.25)
			assert.strictEqual(andFuzzyRecursive(0.12, 0.88, 0.34, 0.56, 0.78, 0.99), 0.12)
			assert.strictEqual(andFuzzyRecursive(0.99, 0.78, 0.56, 0.34, 0.88, 0.12), 0.12)
		})

		test('accepts a single array of membership values', () => {
			assert.strictEqual(andFuzzyRecursive([0.6, 0.2, 0.9, 0.4]), 0.2)
			assert.strictEqual(andFuzzyRecursive([0.33, 0.66]), 0.33)
		})

		test('is commutative, associative, and idempotent', () => {
			const a = 0.27
			const b = 0.73
			const c = 0.51

			assert.strictEqual(andFuzzyRecursive(a, b), andFuzzyRecursive(b, a))
			assert.strictEqual(
				andFuzzyRecursive(andFuzzyRecursive(a, b), c),
				andFuzzyRecursive(a, andFuzzyRecursive(b, c))
			)
			assert.strictEqual(andFuzzyRecursive(a, a), a)
		})
	})

	describe('edge cases', () => {
		test('handles single input (base case)', () => {
			assert.strictEqual(andFuzzyRecursive(0.65), 0.65)
			assert.strictEqual(andFuzzyRecursive(0), 0)
			assert.strictEqual(andFuzzyRecursive(1), 1)
			assert.strictEqual(andFuzzyRecursive([0.42]), 0.42)
		})

		test('handles 0 (annihilator) and 1 (identity) boundaries', () => {
			assert.strictEqual(andFuzzyRecursive(0, 0.5, 1), 0)
			assert.strictEqual(andFuzzyRecursive(1, 0.5, 0), 0)
			assert.strictEqual(andFuzzyRecursive(1, 0.75, 1), 0.75)
			assert.strictEqual(andFuzzyRecursive(1, 1, 1), 1)
			assert.strictEqual(andFuzzyRecursive(-0, 0.5), 0)
		})

		test('agrees with classical Boolean AND on crisp {0, 1} boundaries', () => {
			assert.strictEqual(andFuzzyRecursive(0, 0), 0)
			assert.strictEqual(andFuzzyRecursive(0, 1), 0)
			assert.strictEqual(andFuzzyRecursive(1, 0), 0)
			assert.strictEqual(andFuzzyRecursive(1, 1), 1)
		})

		test('handles large inputs without overflowing recursion stack', () => {
			const size = 10000
			const values = Array.from({ length: size }, (_, i) => (i === 7321 ? 0.00005 : (i + 1) / size))
			assert.strictEqual(andFuzzyRecursive(values), 0.00005)
		})
	})

	describe('input validation errors', () => {
		test('throws RangeError on empty inputs', () => {
			assert.throws(() => andFuzzyRecursive(), RangeError)
			assert.throws(() => andFuzzyRecursive([]), RangeError)
		})

		test('throws RangeError on out-of-range values', () => {
			assert.throws(() => andFuzzyRecursive(-0.0001), RangeError)
			assert.throws(() => andFuzzyRecursive(1.0001), RangeError)
			assert.throws(() => andFuzzyRecursive(0.5, -1), RangeError)
			assert.throws(() => andFuzzyRecursive(0, 2), RangeError)
			assert.throws(() => andFuzzyRecursive([0.2, 1.5]), RangeError)
		})

		test('throws RangeError on NaN and infinite values', () => {
			assert.throws(() => andFuzzyRecursive(Number.NaN), RangeError)
			assert.throws(() => andFuzzyRecursive(0, Number.NaN), RangeError)
			assert.throws(() => andFuzzyRecursive(Number.POSITIVE_INFINITY), RangeError)
			assert.throws(() => andFuzzyRecursive(0.5, Number.NEGATIVE_INFINITY), RangeError)
		})

		test('throws TypeError on non-number types and sparse arrays', () => {
			assert.throws(() => andFuzzyRecursive('0.5'), TypeError)
			assert.throws(() => andFuzzyRecursive(0.5, '0.2'), TypeError)
			assert.throws(() => andFuzzyRecursive(null), TypeError)
			assert.throws(() => andFuzzyRecursive(undefined), TypeError)
			assert.throws(() => andFuzzyRecursive(true, false), TypeError)
			assert.throws(() => andFuzzyRecursive({}), TypeError)
			assert.throws(() => andFuzzyRecursive(0.5, [0.2]), TypeError)
			assert.throws(() => andFuzzyRecursive([[0.5]]), TypeError)
			assert.throws(() => andFuzzyRecursive([0.5, null]), TypeError)

			const sparse = new Array(3)
			sparse[0] = 0.5
			sparse[2] = 0.2
			assert.throws(() => andFuzzyRecursive(sparse), TypeError)
		})
	})

	describe('cross-checks', () => {
		test('matches independent iterative min and De Morgan dual across datasets', () => {
			const iterativeAnd = (xs) => {
				let acc = 1
				for (const x of xs) {
					if (x < acc) acc = x
				}
				return acc
			}

			// Zadeh De Morgan law: AND(x_1, ..., x_n) = 1 - OR(1 - x_1, ..., 1 - x_n)
			const deMorganAnd = (xs) => {
				let maxComplement = 0
				for (const x of xs) {
					const complement = 1 - x
					if (complement > maxComplement) maxComplement = complement
				}
				return 1 - maxComplement
			}

			const cases = [
				[0.5],
				[0, 1],
				[0.1, 0.2, 0.3],
				[0.95, 0.82, 0.44, 0.67, 0.13, 0.59, 0.88],
				Array.from({ length: 127 }, (_, i) => ((i * 37 + 11) % 101) / 100),
				Array.from({ length: 256 }, (_, i) => Math.abs(Math.sin(i + 1)))
			]

			for (const xs of cases) {
				const actual = andFuzzyRecursive(xs)
				const actualVariadic = andFuzzyRecursive(...xs)
				const expectedIterative = iterativeAnd(xs)
				const expectedDeMorgan = deMorganAnd(xs)

				assert.strictEqual(actual, expectedIterative)
				assert.strictEqual(actualVariadic, expectedIterative)
				assert.ok(
					Math.abs(actual - expectedDeMorgan) <= 1e-15,
					`Expected ${actual} to match De Morgan result ${expectedDeMorgan}`
				)
			}
		})
	})
})
