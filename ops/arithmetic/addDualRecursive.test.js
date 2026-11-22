import { describe, test } from 'node:test'
import assert from 'node:assert'
import { addDualRecursive } from './addDualRecursive.js'

describe('addDualRecursive', () => {
	describe('normal cases', () => {
		test('adds two dual numbers', () => {
			const res = addDualRecursive({ v: 2, d: 3 }, { v: 5, d: 7 })
			assert.deepStrictEqual(res, { v: 7, d: 10 })
		})

		test('adds multiple dual numbers variadically (even and odd counts)', () => {
			const even = addDualRecursive(
				{ v: 1, d: 10 },
				{ v: 2, d: 20 },
				{ v: 3, d: 30 },
				{ v: 4, d: 40 },
			)
			assert.deepStrictEqual(even, { v: 10, d: 100 })

			const odd = addDualRecursive(
				{ v: 1.5, d: -2 },
				{ v: 2.5, d: 5 },
				{ v: 3.0, d: 1.25 },
				{ v: -1.0, d: 0.75 },
				{ v: 4.0, d: 3.0 },
			)
			assert.deepStrictEqual(odd, { v: 10, d: 8 })
		})

		test('adds an array of dual numbers', () => {
			const terms = [
				{ v: 1, d: 2 },
				{ v: 3, d: 4 },
				{ v: 5, d: 6 },
				{ v: 7, d: 8 },
				{ v: 9, d: 10 },
			]
			assert.deepStrictEqual(addDualRecursive(terms), { v: 25, d: 30 })
		})

		test('handles single dual number (direct and single-element array) without mutating input', () => {
			const input = { v: 4.5, d: -1.25 }
			const direct = addDualRecursive(input)
			const fromArray = addDualRecursive([input])

			assert.deepStrictEqual(direct, { v: 4.5, d: -1.25 })
			assert.deepStrictEqual(fromArray, { v: 4.5, d: -1.25 })
			assert.notStrictEqual(direct, input)
			assert.notStrictEqual(fromArray, input)
		})

		test('satisfies commutativity, associativity, identity, and inverse properties', () => {
			const a = { v: 3.25, d: -1.5 }
			const b = { v: -7.5, d: 4.25 }
			const c = { v: 2.0, d: 0.75 }
			const zero = { v: 0, d: 0 }

			assert.deepStrictEqual(addDualRecursive(a, b), addDualRecursive(b, a))
			assert.deepStrictEqual(
				addDualRecursive(addDualRecursive(a, b), c),
				addDualRecursive(a, addDualRecursive(b, c)),
			)
			assert.deepStrictEqual(addDualRecursive(a, zero), a)
			assert.deepStrictEqual(addDualRecursive(a, { v: -a.v, d: -a.d }), zero)
		})
	})

	describe('edge cases', () => {
		test('returns additive identity for empty array', () => {
			assert.deepStrictEqual(addDualRecursive([]), { v: 0, d: 0 })
		})

		test('handles zeros and negative values including cancellation', () => {
			assert.deepStrictEqual(addDualRecursive({ v: 0, d: 0 }, { v: 0, d: 0 }), { v: 0, d: 0 })
			assert.deepStrictEqual(
				addDualRecursive({ v: -12.5, d: -0.5 }, { v: -7.5, d: -1.5 }),
				{ v: -20, d: -2 },
			)
			assert.deepStrictEqual(
				addDualRecursive({ v: 42, d: -13 }, { v: -42, d: 13 }),
				{ v: 0, d: 0 },
			)
		})

		test('handles large and small magnitudes accurately', () => {
			const large = addDualRecursive({ v: 1e150, d: -2e150 }, { v: 3e150, d: 5e150 })
			assert.deepStrictEqual(large, { v: 4e150, d: 3e150 })

			const small = addDualRecursive({ v: 1e-150, d: 2e-150 }, { v: 3e-150, d: -1e-150 })
			assert.ok(Math.abs(small.v - 4e-150) <= 1e-165)
			assert.ok(Math.abs(small.d - 1e-150) <= 1e-165)
		})

		test('summing many terms uses O(log N) recursion depth and maintains pairwise precision', () => {
			const n = 1024
			const terms = Array.from({ length: n }, () => ({ v: 0.1, d: 0.3 }))
			const res = addDualRecursive(terms)

			assert.ok(Math.abs(res.v - n * 0.1) < 1e-12, `expected ~${n * 0.1}, got ${res.v}`)
			assert.ok(Math.abs(res.d - n * 0.3) < 1e-12, `expected ~${n * 0.3}, got ${res.d}`)
		})

		test('does not mutate input dual numbers or arrays', () => {
			const a = Object.freeze({ v: 1, d: 2 })
			const b = Object.freeze({ v: 3, d: 4 })
			const arr = Object.freeze([a, b])

			assert.deepStrictEqual(addDualRecursive(a, b), { v: 4, d: 6 })
			assert.deepStrictEqual(addDualRecursive(arr), { v: 4, d: 6 })
		})

		test('rejects invalid inputs with appropriate errors', () => {
			assert.throws(() => addDualRecursive(), TypeError)
			assert.throws(() => addDualRecursive(null, { v: 1, d: 1 }), TypeError)
			assert.throws(() => addDualRecursive(undefined), TypeError)
			assert.throws(() => addDualRecursive(1, 2), TypeError)
			assert.throws(() => addDualRecursive('dual'), TypeError)
			assert.throws(() => addDualRecursive({ v: 1 }, { v: 2, d: 3 }), TypeError)
			assert.throws(() => addDualRecursive({ d: 1 }, { v: 2, d: 3 }), TypeError)
			assert.throws(() => addDualRecursive({ v: '1', d: 0 }, { v: 2, d: 3 }), TypeError)
			assert.throws(() => addDualRecursive({ v: 1, d: null }, { v: 2, d: 3 }), TypeError)
			assert.throws(() => addDualRecursive([{ v: 1, d: 2 }], { v: 3, d: 4 }), TypeError)
			assert.throws(() => addDualRecursive({ v: 1, d: 2 }, [{ v: 3, d: 4 }]), TypeError)

			// Sparse array
			const sparse = [{ v: 1, d: 1 }, , { v: 2, d: 2 }]
			assert.throws(() => addDualRecursive(sparse), TypeError)

			// Non-finite numbers
			assert.throws(() => addDualRecursive({ v: NaN, d: 1 }, { v: 1, d: 1 }), RangeError)
			assert.throws(() => addDualRecursive({ v: 1, d: NaN }, { v: 1, d: 1 }), RangeError)
			assert.throws(() => addDualRecursive({ v: Infinity, d: 1 }, { v: 1, d: 1 }), RangeError)
			assert.throws(() => addDualRecursive({ v: 1, d: -Infinity }, { v: 1, d: 1 }), RangeError)
		})
	})

	describe('finite-difference cross-check', () => {
		test('matches independent central finite differences for f(x) = g(x) + h(x)', () => {
			const g = (x) => Math.sin(x) * x * x
			const gp = (x) => Math.cos(x) * x * x + 2 * x * Math.sin(x)

			const h = (x) => Math.exp(0.5 * x) + Math.log(x + 2)
			const hp = (x) => 0.5 * Math.exp(0.5 * x) + 1 / (x + 2)

			const f = (x) => g(x) + h(x)
			const eps = 1e-6

			for (const x of [-0.5, 0, 1.25, 3.7]) {
				const dualSum = addDualRecursive(
					{ v: g(x), d: gp(x) },
					{ v: h(x), d: hp(x) },
				)
				const fd = (f(x + eps) - f(x - eps)) / (2 * eps)

				assert.ok(
					Math.abs(dualSum.v - f(x)) < 1e-12,
					`value mismatch at x=${x}: dual=${dualSum.v}, exact=${f(x)}`,
				)
				assert.ok(
					Math.abs(dualSum.d - fd) < 1e-7,
					`derivative mismatch at x=${x}: dual=${dualSum.d}, fd=${fd}`,
				)
			}
		})

		test('matches independent central finite differences for multi-term sum f(x) = g(x) + h(x) + k(x)', () => {
			const g = (x) => Math.cos(2 * x)
			const gp = (x) => -2 * Math.sin(2 * x)

			const h = (x) => x ** 3 - 4 * x
			const hp = (x) => 3 * x ** 2 - 4

			const k = (x) => 1 / (1 + x * x)
			const kp = (x) => (-2 * x) / (1 + x * x) ** 2

			const f = (x) => g(x) + h(x) + k(x)
			const eps = 1e-6

			for (const x of [-1.5, 0.25, 2.0]) {
				const dualSum = addDualRecursive([
					{ v: g(x), d: gp(x) },
					{ v: h(x), d: hp(x) },
					{ v: k(x), d: kp(x) },
				])
				const fd = (f(x + eps) - f(x - eps)) / (2 * eps)

				assert.ok(
					Math.abs(dualSum.v - f(x)) < 1e-12,
					`value mismatch at x=${x}: dual=${dualSum.v}, exact=${f(x)}`,
				)
				assert.ok(
					Math.abs(dualSum.d - fd) < 1e-7,
					`derivative mismatch at x=${x}: dual=${dualSum.d}, fd=${fd}`,
				)
			}
		})
	})
})
