import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { andFuzzyIterative } from './andFuzzyIterative.js'

describe('andFuzzyIterative', () => {
	describe('normal cases', () => {
		it('computes Zadeh AND (min) for scalar fuzzy truth values', () => {
			assert.strictEqual(andFuzzyIterative(0.3, 0.7), 0.3)
			assert.strictEqual(andFuzzyIterative(0.85, 0.25), 0.25)
			assert.strictEqual(andFuzzyIterative(0.5, 0.5), 0.5)
			assert.strictEqual(andFuzzyIterative(0.123456, 0.987654), 0.123456)
		})

		it('computes element-wise fuzzy set intersection for plain arrays', () => {
			const a = [0.0, 0.25, 0.5, 0.75, 1.0]
			const b = [1.0, 0.6, 0.5, 0.2, 0.9]
			const res = andFuzzyIterative(a, b)
			assert.ok(res instanceof Float64Array)
			assert.deepStrictEqual(res, new Float64Array([0.0, 0.25, 0.5, 0.2, 0.9]))
		})

		it('computes element-wise fuzzy set intersection for Float64Array inputs', () => {
			const a = new Float64Array([0.1, 0.9, 0.4, 0.8])
			const b = new Float64Array([0.6, 0.3, 0.4, 0.2])
			const res = andFuzzyIterative(a, b)
			assert.ok(res instanceof Float64Array)
			assert.deepStrictEqual(res, new Float64Array([0.1, 0.3, 0.4, 0.2]))
		})

		it('supports mixed Array and TypedArray inputs', () => {
			const a = [0.2, 0.7, 0.9]
			const b = new Float64Array([0.5, 0.4, 0.95])
			const res = andFuzzyIterative(a, b)
			assert.ok(res instanceof Float64Array)
			assert.deepStrictEqual(res, new Float64Array([0.2, 0.4, 0.9]))

			const c = new Float32Array([0.25, 0.75])
			const d = new Uint8Array([1, 0])
			assert.deepStrictEqual(
				andFuzzyIterative(c, d),
				new Float64Array([0.25, 0]),
			)
		})

		it('does not mutate input arrays or typed arrays', () => {
			const a = [0.8, 0.2, 0.6]
			const b = new Float64Array([0.3, 0.9, 0.1])
			andFuzzyIterative(a, b)
			assert.deepStrictEqual(a, [0.8, 0.2, 0.6])
			assert.deepStrictEqual(b, new Float64Array([0.3, 0.9, 0.1]))
		})
	})

	describe('edge cases', () => {
		it('matches the crisp Boolean AND truth table on {0, 1}', () => {
			assert.strictEqual(andFuzzyIterative(0, 0), 0)
			assert.strictEqual(andFuzzyIterative(0, 1), 0)
			assert.strictEqual(andFuzzyIterative(1, 0), 0)
			assert.strictEqual(andFuzzyIterative(1, 1), 1)

			assert.deepStrictEqual(
				andFuzzyIterative([0, 0, 1, 1], [0, 1, 0, 1]),
				new Float64Array([0, 0, 0, 1]),
			)
		})

		it('handles empty fuzzy sets', () => {
			const emptyArr = andFuzzyIterative([], [])
			assert.ok(emptyArr instanceof Float64Array)
			assert.strictEqual(emptyArr.length, 0)

			const emptyTyped = andFuzzyIterative(
				new Float64Array(0),
				new Float64Array(0),
			)
			assert.ok(emptyTyped instanceof Float64Array)
			assert.strictEqual(emptyTyped.length, 0)
		})

		it('handles single-element fuzzy sets and extreme valid boundary values', () => {
			assert.deepStrictEqual(
				andFuzzyIterative([0.42], [0.17]),
				new Float64Array([0.17]),
			)
			assert.strictEqual(
				andFuzzyIterative(Number.MIN_VALUE, 1),
				Number.MIN_VALUE,
			)
			const nearOne = 1 - Number.EPSILON / 2
			assert.strictEqual(andFuzzyIterative(nearOne, 1), nearOne)
		})

		it('normalizes -0 to +0', () => {
			assert.ok(Object.is(andFuzzyIterative(-0, 0.5), 0))
			assert.ok(Object.is(andFuzzyIterative(0.5, -0), 0))
			assert.ok(Object.is(andFuzzyIterative(-0, -0), 0))
			const res = andFuzzyIterative([-0, 0.2], [0.3, -0])
			assert.ok(Object.is(res[0], 0))
			assert.ok(Object.is(res[1], 0))
		})

		it('throws RangeError for membership values < 0 or > 1', () => {
			assert.throws(() => andFuzzyIterative(-0.001, 0.5), RangeError)
			assert.throws(() => andFuzzyIterative(0.5, -1), RangeError)
			assert.throws(() => andFuzzyIterative(-Number.MIN_VALUE, 0.5), RangeError)
			assert.throws(() => andFuzzyIterative(1.001, 0.5), RangeError)
			assert.throws(() => andFuzzyIterative(0.5, 2), RangeError)
			assert.throws(
				() => andFuzzyIterative(1 + Number.EPSILON, 0.5),
				RangeError,
			)

			assert.throws(() => andFuzzyIterative([0.5, -0.1], [0.5, 0.5]), RangeError)
			assert.throws(() => andFuzzyIterative([0.5, 0.5], [0.5, 1.1]), RangeError)
			assert.throws(
				() =>
					andFuzzyIterative(
						new Float64Array([0.2, 1.5]),
						new Float64Array([0.2, 0.5]),
					),
				RangeError,
			)
			assert.throws(
				() => andFuzzyIterative(new Uint8Array([0, 2]), new Uint8Array([0, 1])),
				RangeError,
			)
		})

		it('throws RangeError for NaN and non-finite numbers', () => {
			assert.throws(() => andFuzzyIterative(NaN, 0.5), RangeError)
			assert.throws(() => andFuzzyIterative(0.5, NaN), RangeError)
			assert.throws(() => andFuzzyIterative(Infinity, 0.5), RangeError)
			assert.throws(() => andFuzzyIterative(0.5, -Infinity), RangeError)

			assert.throws(() => andFuzzyIterative([0.2, NaN], [0.3, 0.4]), RangeError)
			assert.throws(
				() => andFuzzyIterative([0.2, 0.4], [0.3, Infinity]),
				RangeError,
			)
			assert.throws(
				() =>
					andFuzzyIterative(
						new Float64Array([0.1, -Infinity]),
						new Float64Array([0.1, 0.5]),
					),
				RangeError,
			)
		})

		it('throws RangeError on fuzzy set length mismatch', () => {
			assert.throws(() => andFuzzyIterative([0.1, 0.2], [0.1]), RangeError)
			assert.throws(() => andFuzzyIterative([], [0.5]), RangeError)
			assert.throws(
				() =>
					andFuzzyIterative(
						new Float64Array([0.2, 0.4, 0.6]),
						new Float64Array([0.2, 0.4]),
					),
				RangeError,
			)
		})

		it('throws TypeError on invalid argument types or mixed scalar/collection', () => {
			assert.throws(() => andFuzzyIterative(0.5, [0.5]), TypeError)
			assert.throws(() => andFuzzyIterative([0.5], 0.5), TypeError)
			assert.throws(() => andFuzzyIterative('0.5', 0.5), TypeError)
			assert.throws(() => andFuzzyIterative(0.5, null), TypeError)
			assert.throws(() => andFuzzyIterative(undefined, 0.5), TypeError)
			assert.throws(() => andFuzzyIterative(true, false), TypeError)
			assert.throws(() => andFuzzyIterative({}, {}), TypeError)
			assert.throws(() => andFuzzyIterative(0.5), TypeError)
			assert.throws(
				() => andFuzzyIterative([0.5, '0.2'], [0.3, 0.4]),
				TypeError,
			)
			// Sparse array hole
			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => andFuzzyIterative([0.5, , 0.2], [0.3, 0.4, 0.5]), TypeError)
			assert.throws(
				() =>
					andFuzzyIterative(new BigInt64Array([0n]), new BigInt64Array([1n])),
				TypeError,
			)
			assert.throws(
				() =>
					andFuzzyIterative(
						new DataView(new ArrayBuffer(8)),
						new DataView(new ArrayBuffer(8)),
					),
				TypeError,
			)
		})
	})

	describe('independent mathematical cross-checks and Zadeh algebraic laws', () => {
		const grid = [0, 0.05, 0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 0.95, 1]

		it("satisfies De Morgan's law: min(a, b) = 1 - max(1 - a, 1 - b)", () => {
			for (const a of grid) {
				for (const b of grid) {
					const viaAnd = andFuzzyIterative(a, b)
					const notA = 1 - a
					const notB = 1 - b
					const viaDeMorgan = 1 - Math.max(notA, notB)
					assert.ok(
						Math.abs(viaAnd - viaDeMorgan) <= 1e-15,
						`De Morgan failed for (${a}, ${b}): ${viaAnd} vs ${viaDeMorgan}`,
					)
				}
			}

			// Vector form cross-check
			const setA = new Float64Array([0.0, 0.15, 0.37, 0.5, 0.72, 0.88, 1.0])
			const setB = new Float64Array([0.95, 0.42, 0.37, 0.12, 0.91, 0.25, 0.0])
			const res = andFuzzyIterative(setA, setB)
			for (let i = 0; i < setA.length; i++) {
				const deMorgan = 1 - Math.max(1 - setA[i], 1 - setB[i])
				assert.ok(Math.abs(res[i] - deMorgan) <= 1e-15)
			}
		})

		it('matches closed-form min identity: (a + b - |a - b|) / 2', () => {
			// Deterministic LCG samples in [0, 1]
			let seed = 123456789
			const nextUnit = () => {
				seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
				return seed / 0xffffffff
			}

			const n = 200
			const a = new Float64Array(n)
			const b = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				a[i] = nextUnit()
				b[i] = nextUnit()
			}

			const res = andFuzzyIterative(a, b)
			for (let i = 0; i < n; i++) {
				const closedForm = (a[i] + b[i] - Math.abs(a[i] - b[i])) / 2
				assert.ok(
					Math.abs(res[i] - closedForm) <= 1e-15,
					`Closed-form mismatch at ${i}: ${res[i]} vs ${closedForm}`,
				)
			}
		})

		it('satisfies commutativity, associativity, idempotence, identity, and annihilator laws', () => {
			const a = new Float64Array([0.0, 0.2, 0.55, 0.8, 1.0])
			const b = new Float64Array([0.9, 0.4, 0.55, 0.3, 0.1])
			const c = new Float64Array([0.5, 0.7, 0.15, 0.6, 0.95])
			const ones = new Float64Array(a.length).fill(1)
			const zeros = new Float64Array(a.length).fill(0)

			// Commutativity: a ∧ b = b ∧ a
			assert.deepStrictEqual(andFuzzyIterative(a, b), andFuzzyIterative(b, a))

			// Associativity: (a ∧ b) ∧ c = a ∧ (b ∧ c)
			assert.deepStrictEqual(
				andFuzzyIterative(andFuzzyIterative(a, b), c),
				andFuzzyIterative(a, andFuzzyIterative(b, c)),
			)

			// Idempotence: a ∧ a = a
			assert.deepStrictEqual(andFuzzyIterative(a, a), a)

			// Identity (unit): a ∧ 1 = a
			assert.deepStrictEqual(andFuzzyIterative(a, ones), a)
			for (const x of grid) {
				assert.strictEqual(andFuzzyIterative(x, 1), x)
			}

			// Annihilator (zero): a ∧ 0 = 0
			assert.deepStrictEqual(andFuzzyIterative(a, zeros), zeros)
			for (const x of grid) {
				assert.strictEqual(andFuzzyIterative(x, 0), 0)
			}
		})

		it('satisfies monotonicity and t-norm dominance over Product and Lukasiewicz t-norms', () => {
			for (const a of grid) {
				for (const b of grid) {
					const zadeh = andFuzzyIterative(a, b)
					const product = a * b
					const lukasiewicz = Math.max(0, a + b - 1)
					assert.ok(zadeh >= 0 && zadeh <= 1)
					assert.ok(zadeh <= a && zadeh <= b)
					assert.ok(lukasiewicz <= product + 1e-15)
					assert.ok(product <= zadeh + 1e-15)
				}
			}

			// Monotonicity check
			const a1 = new Float64Array([0.1, 0.2, 0.4, 0.6])
			const a2 = new Float64Array([0.2, 0.5, 0.4, 0.9])
			const b1 = new Float64Array([0.3, 0.1, 0.5, 0.2])
			const b2 = new Float64Array([0.3, 0.8, 0.7, 0.6])
			const low = andFuzzyIterative(a1, b1)
			const high = andFuzzyIterative(a2, b2)
			for (let i = 0; i < low.length; i++) {
				assert.ok(low[i] <= high[i])
			}
		})
	})
})
