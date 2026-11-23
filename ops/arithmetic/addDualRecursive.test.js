import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { addDualRecursive } from './addDualRecursive.js'

describe('addDualRecursive', () => {
	describe('normal cases', () => {
		test('adds two dual numbers', () => {
			assert.deepStrictEqual(
				addDualRecursive({ v: 2, d: 3 }, { v: 5, d: 7 }),
				{ v: 7, d: 10 },
			)
		})

		test('adds negative and fractional dual numbers', () => {
			const res = addDualRecursive({ v: -1.5, d: 0.25 }, { v: 4.25, d: -2.75 })
			assert.deepStrictEqual(res, { v: 2.75, d: -2.5 })
		})

		test('adds variadic dual numbers via divide-and-conquer recursion', () => {
			const res = addDualRecursive(
				{ v: 1, d: 10 },
				{ v: 2, d: 20 },
				{ v: 3, d: 30 },
				{ v: 4, d: 40 },
				{ v: 5, d: 50 },
			)
			assert.deepStrictEqual(res, { v: 15, d: 150 })
		})

		test('sums an array of dual numbers for odd and even lengths', () => {
			const even = [
				{ v: 1, d: -1 },
				{ v: 2, d: 4 },
				{ v: -3, d: 2 },
				{ v: 10, d: -5 },
			]
			assert.deepStrictEqual(addDualRecursive(even), { v: 10, d: 0 })

			const odd = [
				{ v: 1.5, d: 0.5 },
				{ v: 2.5, d: 1.5 },
				{ v: 3.0, d: 2.0 },
				{ v: -1.0, d: -0.5 },
				{ v: 4.0, d: 6.5 },
				{ v: 0.0, d: 1.0 },
				{ v: 2.0, d: -3.0 },
			]
			assert.deepStrictEqual(addDualRecursive(odd), { v: 12, d: 8 })
		})

		test('handles a single dual number and returns a fresh object without mutating inputs', () => {
			const input = { v: 3.5, d: -1.25 }
			const direct = addDualRecursive(input)
			const fromArray = addDualRecursive([input])

			assert.deepStrictEqual(direct, { v: 3.5, d: -1.25 })
			assert.deepStrictEqual(fromArray, { v: 3.5, d: -1.25 })
			assert.notStrictEqual(direct, input)
			assert.notStrictEqual(fromArray, input)
		})

		test('does not mutate input objects or arrays', () => {
			const a = Object.freeze({ v: 1, d: 2 })
			const b = Object.freeze({ v: 3, d: 4 })
			const list = Object.freeze([a, b])

			assert.deepStrictEqual(addDualRecursive(a, b), { v: 4, d: 6 })
			assert.deepStrictEqual(addDualRecursive(list), { v: 4, d: 6 })
		})
	})

	describe('edge cases', () => {
		test('returns additive identity { v: 0, d: 0 } for an empty array', () => {
			assert.deepStrictEqual(addDualRecursive([]), { v: 0, d: 0 })
		})

		test('handles zeros and exact cancellation', () => {
			assert.deepStrictEqual(
				addDualRecursive({ v: 0, d: 0 }, { v: 0, d: 0 }),
				{ v: 0, d: 0 },
			)
			assert.deepStrictEqual(
				addDualRecursive({ v: 42.5, d: -9.75 }, { v: -42.5, d: 9.75 }),
				{ v: 0, d: 0 },
			)
		})

		test('handles very large and very small finite magnitudes', () => {
			const tiny = { v: 1e-300, d: -1e-300 }
			assert.deepStrictEqual(addDualRecursive(tiny, tiny), { v: 2e-300, d: -2e-300 })

			const huge = { v: 1e150, d: 2e150 }
			assert.deepStrictEqual(addDualRecursive(huge, { v: -1e150, d: 3e150 }), {
				v: 0,
				d: 5e150,
			})
		})

		test('sums large arrays safely with O(log n) recursion depth and pairwise accuracy', () => {
			const n = 10000
			const items = Array.from({ length: n }, (_, i) => ({
				v: 0.1,
				d: i + 1,
			}))
			const result = addDualRecursive(items)
			assert.ok(Math.abs(result.v - 1000) < 1e-11, `expected v ≈ 1000, got ${result.v}`)
			assert.strictEqual(result.d, (n * (n + 1)) / 2)
		})
	})

	describe('input validation', () => {
		test('throws TypeError when called with no arguments', () => {
			assert.throws(() => addDualRecursive(), TypeError)
		})

		test('throws TypeError for non-object inputs', () => {
			for (const bad of [null, undefined, 42, '1', true, Symbol('x'), () => {}]) {
				assert.throws(() => addDualRecursive(bad, { v: 1, d: 1 }), TypeError)
				assert.throws(() => addDualRecursive({ v: 1, d: 1 }, bad), TypeError)
				assert.throws(() => addDualRecursive([bad]), TypeError)
			}
		})

		test('throws TypeError for objects missing v or d or with non-numeric fields', () => {
			const invalidObjects = [
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 0 },
				{ v: 1, d: '0' },
				{ v: null, d: 0 },
				{ v: 1, d: undefined },
				{ v: true, d: 0 },
				{ v: 1n, d: 0 },
			]
			for (const bad of invalidObjects) {
				assert.throws(() => addDualRecursive(bad), TypeError)
				assert.throws(() => addDualRecursive({ v: 0, d: 0 }, bad), TypeError)
				assert.throws(() => addDualRecursive([{ v: 0, d: 0 }, bad]), TypeError)
			}
		})

		test('throws RangeError for non-finite v or d values', () => {
			const nonFinite = [
				{ v: NaN, d: 0 },
				{ v: 0, d: NaN },
				{ v: Infinity, d: 0 },
				{ v: 0, d: -Infinity },
				{ v: -Infinity, d: Infinity },
			]
			for (const bad of nonFinite) {
				assert.throws(() => addDualRecursive(bad), RangeError)
				assert.throws(() => addDualRecursive({ v: 1, d: 1 }, bad), RangeError)
				assert.throws(() => addDualRecursive([bad, { v: 1, d: 1 }]), RangeError)
			}
		})

		test('throws TypeError for sparse arrays, nested arrays, or mixed array/dual arguments', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [{ v: 1, d: 1 }, , { v: 2, d: 2 }]
			assert.throws(() => addDualRecursive(sparse), TypeError)
			assert.throws(() => addDualRecursive([[{ v: 1, d: 1 }]]), TypeError)
			assert.throws(() => addDualRecursive([{ v: 1, d: 1 }], { v: 2, d: 2 }), TypeError)
		})
	})

	describe('independent cross-checks', () => {
		test('matches central finite-difference derivative for a sum of smooth functions', () => {
			const funcs = [
				{ f: (x) => x ** 3 - 2 * x + 1, df: (x) => 3 * x ** 2 - 2 },
				{ f: (x) => Math.sin(x), df: (x) => Math.cos(x) },
				{ f: (x) => Math.exp(0.5 * x), df: (x) => 0.5 * Math.exp(0.5 * x) },
				{ f: (x) => Math.log(x + 5), df: (x) => 1 / (x + 5) },
				{ f: (x) => Math.cos(2 * x), df: (x) => -2 * Math.sin(2 * x) },
			]

			const sumF = (x) => funcs.reduce((acc, fn) => acc + fn.f(x), 0)
			const h = 1e-6

			for (const x of [-2.3, 0, 0.75, 1.8, 3.5]) {
				const dualTerms = funcs.map(({ f, df }) => ({ v: f(x), d: df(x) }))
				const dualSum = addDualRecursive(dualTerms)

				const expectedValue = sumF(x)
				const finiteDiffDerivative = (sumF(x + h) - sumF(x - h)) / (2 * h)

				assert.ok(
					Math.abs(dualSum.v - expectedValue) < 1e-12,
					`value mismatch at x=${x}: got ${dualSum.v}, expected ${expectedValue}`,
				)
				assert.ok(
					Math.abs(dualSum.d - finiteDiffDerivative) < 1e-7,
					`derivative mismatch at x=${x}: dual=${dualSum.d}, fd=${finiteDiffDerivative}`,
				)
			}
		})

		test('satisfies abelian group and linearity algebraic identities', () => {
			const a = { v: 3.25, d: -1.5 }
			const b = { v: -7.5, d: 4.125 }
			const c = { v: 2.75, d: 0.875 }
			const zero = { v: 0, d: 0 }

			// Commutativity: a + b = b + a
			assert.deepStrictEqual(addDualRecursive(a, b), addDualRecursive(b, a))

			// Associativity: (a + b) + c = a + (b + c) = add(a, b, c) = add([a, b, c])
			const leftAssoc = addDualRecursive(addDualRecursive(a, b), c)
			const rightAssoc = addDualRecursive(a, addDualRecursive(b, c))
			const variadic = addDualRecursive(a, b, c)
			const arrayForm = addDualRecursive([a, b, c])
			assert.deepStrictEqual(leftAssoc, rightAssoc)
			assert.deepStrictEqual(variadic, leftAssoc)
			assert.deepStrictEqual(arrayForm, leftAssoc)

			// Additive identity: a + 0 = a
			assert.deepStrictEqual(addDualRecursive(a, zero), a)
			assert.deepStrictEqual(addDualRecursive(zero, a), a)

			// Additive inverse: a + (-a) = 0
			const negA = { v: -a.v, d: -a.d }
			assert.deepStrictEqual(addDualRecursive(a, negA), zero)

			// Linearity with scalar multiplication: k * (a + b) = (k * a) + (k * b)
			const k = 4
			const scale = (s, x) => ({ v: s * x.v, d: s * x.d })
			assert.deepStrictEqual(
				scale(k, addDualRecursive(a, b)),
				addDualRecursive(scale(k, a), scale(k, b)),
			)
		})
	})
})
