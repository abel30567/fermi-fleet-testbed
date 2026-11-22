import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { orFuzzyIterative } from './orFuzzyIterative.js'

describe('orFuzzyIterative', () => {
	describe('normal cases', () => {
		it('computes Zadeh fuzzy OR for scalar memberships in [0, 1]', () => {
			assert.strictEqual(orFuzzyIterative(0.2, 0.7), 0.7)
			assert.strictEqual(orFuzzyIterative(0.85, 0.3), 0.85)
			assert.strictEqual(orFuzzyIterative(0.5, 0.5), 0.5)
			assert.strictEqual(orFuzzyIterative(0.125, 0.875), 0.875)
		})

		it('computes Zadeh fuzzy union for plain Arrays without mutating inputs', () => {
			const a = [0.0, 0.25, 0.6, 0.9, 1.0]
			const b = [0.4, 0.25, 0.1, 0.95, 0.0]
			const aSnap = [...a]
			const bSnap = [...b]

			const result = orFuzzyIterative(a, b)

			assert.ok(Array.isArray(result))
			assert.deepStrictEqual(result, [0.4, 0.25, 0.6, 0.95, 1.0])
			assert.deepStrictEqual(a, aSnap)
			assert.deepStrictEqual(b, bSnap)
		})

		it('computes Zadeh fuzzy union for Float64Array inputs and returns Float64Array', () => {
			const a = new Float64Array([0.1, 0.8, 0.33, 0.0, 0.75])
			const b = new Float64Array([0.4, 0.2, 0.33, 1.0, 0.74])
			const aSnap = new Float64Array(a)
			const bSnap = new Float64Array(b)

			const result = orFuzzyIterative(a, b)

			assert.ok(result instanceof Float64Array)
			assert.deepStrictEqual(result, new Float64Array([0.4, 0.8, 0.33, 1.0, 0.75]))
			assert.deepStrictEqual(a, aSnap)
			assert.deepStrictEqual(b, bSnap)
		})

		it('supports other numeric TypedArrays and mixed Array / TypedArray inputs', () => {
			const f32a = new Float32Array([0.25, 0.75])
			const f32b = new Float32Array([0.5, 0.5])
			const r1 = orFuzzyIterative(f32a, f32b)
			assert.ok(r1 instanceof Float64Array)
			assert.deepStrictEqual(r1, new Float64Array([0.5, 0.75]))

			const u8a = new Uint8Array([0, 0, 1, 1])
			const u8b = new Uint8Array([0, 1, 0, 1])
			const r2 = orFuzzyIterative(u8a, u8b)
			assert.ok(r2 instanceof Float64Array)
			assert.deepStrictEqual(r2, new Float64Array([0, 1, 1, 1]))

			const mixed = orFuzzyIterative([0.2, 0.9], new Float64Array([0.6, 0.3]))
			assert.ok(mixed instanceof Float64Array)
			assert.deepStrictEqual(mixed, new Float64Array([0.6, 0.9]))
		})
	})

	describe('edge cases', () => {
		it('matches the crisp Boolean OR truth table on {0, 1}', () => {
			assert.strictEqual(orFuzzyIterative(0, 0), 0)
			assert.strictEqual(orFuzzyIterative(0, 1), 1)
			assert.strictEqual(orFuzzyIterative(1, 0), 1)
			assert.strictEqual(orFuzzyIterative(1, 1), 1)

			assert.deepStrictEqual(
				orFuzzyIterative([0, 0, 1, 1], [0, 1, 0, 1]),
				[0, 1, 1, 1]
			)
			assert.deepStrictEqual(
				orFuzzyIterative(new Float64Array([0, 0, 1, 1]), new Float64Array([0, 1, 0, 1])),
				new Float64Array([0, 1, 1, 1])
			)
		})

		it('handles empty fuzzy sets cleanly', () => {
			const emptyArr = orFuzzyIterative([], [])
			assert.ok(Array.isArray(emptyArr))
			assert.deepStrictEqual(emptyArr, [])

			const emptyTyped = orFuzzyIterative(new Float64Array(0), new Float64Array(0))
			assert.ok(emptyTyped instanceof Float64Array)
			assert.strictEqual(emptyTyped.length, 0)
		})

		it('handles boundary values, -0 normalization, and singletons', () => {
			assert.ok(Object.is(orFuzzyIterative(-0, -0), 0))
			assert.ok(Object.is(orFuzzyIterative(-0, 0), 0))
			assert.ok(Object.is(orFuzzyIterative(0, -0), 0))

			const arrZero = orFuzzyIterative([-0], [-0])
			assert.ok(Object.is(arrZero[0], 0))

			assert.strictEqual(orFuzzyIterative(Number.MIN_VALUE, 0), Number.MIN_VALUE)
			assert.strictEqual(orFuzzyIterative(1 - Number.EPSILON / 2, 1), 1)
			assert.deepStrictEqual(orFuzzyIterative([0.42], [0.17]), [0.42])
		})

		it('handles large fuzzy sets iteratively without stack overflow', () => {
			const n = 20000
			const a = new Float64Array(n)
			const b = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				a[i] = i / (n - 1)
				b[i] = 1 - a[i]
			}
			const result = orFuzzyIterative(a, b)
			assert.strictEqual(result.length, n)
			assert.strictEqual(result[0], 1)
			assert.strictEqual(result[n - 1], 1)
			for (let i = 0; i < n; i++) {
				assert.ok(result[i] >= 0.5 - 1e-12 && result[i] <= 1)
			}
		})
	})

	describe('input validation', () => {
		it('throws RangeError for values outside [0, 1]', () => {
			assert.throws(() => orFuzzyIterative(-0.0001, 0.5), RangeError)
			assert.throws(() => orFuzzyIterative(0.5, -1), RangeError)
			assert.throws(() => orFuzzyIterative(1.0001, 0.5), RangeError)
			assert.throws(() => orFuzzyIterative(0.5, 2), RangeError)
			assert.throws(() => orFuzzyIterative(-Number.MIN_VALUE, 0), RangeError)
			assert.throws(() => orFuzzyIterative(1 + Number.EPSILON, 0), RangeError)

			assert.throws(() => orFuzzyIterative([0.2, -0.1], [0.2, 0.5]), RangeError)
			assert.throws(() => orFuzzyIterative([0.2, 0.5], [0.2, 1.1]), RangeError)
			assert.throws(
				() => orFuzzyIterative(new Float64Array([0.1, 1.5]), new Float64Array([0.1, 0.2])),
				RangeError
			)
			assert.throws(
				() => orFuzzyIterative(new Uint8Array([0, 2]), new Uint8Array([0, 1])),
				RangeError
			)
		})

		it('throws RangeError for NaN and non-finite numbers', () => {
			assert.throws(() => orFuzzyIterative(NaN, 0.5), RangeError)
			assert.throws(() => orFuzzyIterative(0.5, NaN), RangeError)
			assert.throws(() => orFuzzyIterative(Infinity, 0.5), RangeError)
			assert.throws(() => orFuzzyIterative(0.5, -Infinity), RangeError)

			assert.throws(() => orFuzzyIterative([0.1, NaN], [0.2, 0.3]), RangeError)
			assert.throws(() => orFuzzyIterative([0.1, 0.2], [0.2, Infinity]), RangeError)
			assert.throws(
				() => orFuzzyIterative(new Float64Array([NaN]), new Float64Array([0.5])),
				RangeError
			)
		})

		it('throws RangeError on collection length mismatch', () => {
			assert.throws(() => orFuzzyIterative([0.1, 0.2], [0.1]), RangeError)
			assert.throws(() => orFuzzyIterative([], [0]), RangeError)
			assert.throws(
				() => orFuzzyIterative(new Float64Array([0.1, 0.2, 0.3]), new Float64Array([0.1, 0.2])),
				RangeError
			)
		})

		it('throws TypeError for invalid types, mixed kinds, or non-numeric elements', () => {
			assert.throws(() => orFuzzyIterative('0.5', 0.5), TypeError)
			assert.throws(() => orFuzzyIterative(0.5, '0.5'), TypeError)
			assert.throws(() => orFuzzyIterative(null, 0.5), TypeError)
			assert.throws(() => orFuzzyIterative(undefined, 0.5), TypeError)
			assert.throws(() => orFuzzyIterative(true, false), TypeError)
			assert.throws(() => orFuzzyIterative(0.5), TypeError)
			assert.throws(() => orFuzzyIterative(), TypeError)

			// Mixed scalar and collection
			assert.throws(() => orFuzzyIterative(0.5, [0.5]), TypeError)
			assert.throws(() => orFuzzyIterative([0.5], 0.5), TypeError)
			assert.throws(() => orFuzzyIterative(0.5, new Float64Array([0.5])), TypeError)

			// Non-numeric elements or sparse array holes
			assert.throws(() => orFuzzyIterative([0.2, '0.5'], [0.2, 0.5]), TypeError)
			assert.throws(() => orFuzzyIterative([0.2, null], [0.2, 0.5]), TypeError)
			assert.throws(() => orFuzzyIterative(new Array(2), [0.2, 0.5]), TypeError)

			// Disallowed ArrayBufferViews
			const buf = new ArrayBuffer(16)
			assert.throws(() => orFuzzyIterative(new DataView(buf), new DataView(buf)), TypeError)
			assert.throws(
				() => orFuzzyIterative(new BigInt64Array([0n, 1n]), new BigInt64Array([0n, 1n])),
				TypeError
			)
			assert.throws(
				() => orFuzzyIterative(new BigUint64Array([0n, 1n]), new BigUint64Array([0n, 1n])),
				TypeError
			)
		})
	})

	describe('independent mathematical cross-checks', () => {
		it('agrees with De Morgan law: max(a, b) = 1 - min(1 - a, 1 - b)', () => {
			const grid = [0, 0.05, 0.1, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 0.9, 0.999, 1]
			for (const a of grid) {
				for (const b of grid) {
					const actual = orFuzzyIterative(a, b)
					const deMorgan = 1 - Math.min(1 - a, 1 - b)
					assert.ok(
						Math.abs(actual - deMorgan) <= 1e-15,
						`De Morgan mismatch for (${a}, ${b}): actual=${actual}, deMorgan=${deMorgan}`
					)
				}
			}

			// Vector form cross-check via Zadeh NOT and Zadeh AND
			const setA = new Float64Array([0.0, 0.12, 0.37, 0.5, 0.68, 0.91, 1.0])
			const setB = new Float64Array([0.84, 0.12, 0.09, 0.73, 0.68, 0.22, 0.0])
			const union = orFuzzyIterative(setA, setB)
			for (let i = 0; i < setA.length; i++) {
				const notA = 1 - setA[i]
				const notB = 1 - setB[i]
				const notAndNot = 1 - (notA <= notB ? notA : notB)
				assert.ok(Math.abs(union[i] - notAndNot) <= 1e-15)
			}
		})

		it('agrees with closed-form algebraic max formula: (a + b + |a - b|) / 2', () => {
			const setA = new Float64Array([0, 0.15, 0.42, 0.77, 1])
			const setB = new Float64Array([0.3, 0.15, 0.88, 0.21, 0.5])
			const result = orFuzzyIterative(setA, setB)
			for (let i = 0; i < setA.length; i++) {
				const closedForm = (setA[i] + setB[i] + Math.abs(setA[i] - setB[i])) / 2
				assert.ok(Math.abs(result[i] - closedForm) <= 1e-15)
			}
		})

		it('satisfies Zadeh S-norm axioms: commutativity, associativity, idempotence, identity, dominance, monotonicity', () => {
			const a = new Float64Array([0.0, 0.2, 0.55, 0.8, 1.0])
			const b = new Float64Array([0.3, 0.2, 0.15, 0.9, 0.4])
			const c = new Float64Array([0.7, 0.1, 0.95, 0.4, 0.6])
			const zeros = new Float64Array([0, 0, 0, 0, 0])
			const ones = new Float64Array([1, 1, 1, 1, 1])

			// Commutativity: A U B = B U A
			assert.deepStrictEqual(orFuzzyIterative(a, b), orFuzzyIterative(b, a))

			// Associativity: (A U B) U C = A U (B U C)
			assert.deepStrictEqual(
				orFuzzyIterative(orFuzzyIterative(a, b), c),
				orFuzzyIterative(a, orFuzzyIterative(b, c))
			)

			// Idempotence: A U A = A
			assert.deepStrictEqual(orFuzzyIterative(a, a), a)

			// Neutral element (identity): A U 0 = A
			assert.deepStrictEqual(orFuzzyIterative(a, zeros), a)

			// Absorbing element (dominance): A U 1 = 1
			assert.deepStrictEqual(orFuzzyIterative(a, ones), ones)

			// Monotonicity: if a <= a' and b <= b', then (a U b) <= (a' U b')
			const aPrime = new Float64Array([0.1, 0.35, 0.6, 0.85, 1.0])
			const bPrime = new Float64Array([0.3, 0.4, 0.25, 0.95, 0.7])
			const ab = orFuzzyIterative(a, b)
			const abPrime = orFuzzyIterative(aPrime, bPrime)
			for (let i = 0; i < a.length; i++) {
				assert.ok(ab[i] <= abPrime[i])
				assert.ok(ab[i] >= a[i] && ab[i] >= b[i])
				assert.ok(ab[i] >= 0 && ab[i] <= 1)
			}
		})
	})
})
