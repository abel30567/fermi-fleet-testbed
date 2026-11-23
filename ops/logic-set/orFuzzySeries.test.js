import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { orFuzzySeries } from './orFuzzySeries.js'

/**
 * Independent cross-check #1: Zadeh OR via De Morgan's Law
 * using Zadeh negation (¬x = 1 - x) and Zadeh AND (min):
 *   a ∨ b = ¬(¬a ∧ ¬b) = 1 - min(1 - a, 1 - b)
 */
function zadehOrDeMorgan(a, b) {
	return 1 - Math.min(1 - a, 1 - b)
}

/**
 * Independent cross-check #2: Binomial series for |d| = √(1 - (1 - d²))
 * used to evaluate (a + b + |a - b|) / 2 directly from power series terms
 * (convergent for d ∈ [-1, 1], fast for |d| away from 0).
 */
function zadehOrBinomialSeries(a, b, terms = 200) {
	const d = a - b
	const u = 1 - d * d
	// √(1 - u) = 1 - ∑_{k=1}^∞ c_k u^k, where c_1 = 1/2, c_{k+1} = c_k * (2k - 1) / (2k + 2)
	let sum = 0
	let coeff = 0.5
	let uPow = u
	for (let k = 1; k <= terms; k++) {
		sum += coeff * uPow
		coeff *= (2 * k - 1) / (2 * k + 2)
		uPow *= u
	}
	const absD = 1 - sum
	return (a + b + absD) / 2
}

/**
 * Independent cross-check #3: Yager t-conorm S_w(a, b) = min(1, (a^w + b^w)^(1/w))
 * which converges monotonically to Zadeh OR max(a, b) as w -> ∞.
 */
function yagerTConorm(a, b, w) {
	return Math.min(1, (a ** w + b ** w) ** (1 / w))
}

describe('orFuzzySeries', () => {
	describe('scalar fuzzy logic values', () => {
		it('reduces to classical Boolean OR on {0, 1}', () => {
			assert.equal(orFuzzySeries(0, 0), 0)
			assert.equal(orFuzzySeries(0, 1), 1)
			assert.equal(orFuzzySeries(1, 0), 1)
			assert.equal(orFuzzySeries(1, 1), 1)
		})

		it('computes Zadeh OR for normal membership values in [0, 1]', () => {
			assert.equal(orFuzzySeries(0.2, 0.7), 0.7)
			assert.equal(orFuzzySeries(0.85, 0.35), 0.85)
			assert.equal(orFuzzySeries(0.5, 0.5), 0.5)
			assert.equal(orFuzzySeries(0.1, 0.2), 0.2)
			assert.equal(orFuzzySeries(0.3, 0.7), 0.7)
		})

		it('supports variadic n-ary disjunction', () => {
			assert.equal(orFuzzySeries(0.1, 0.6, 0.3), 0.6)
			assert.equal(orFuzzySeries(0.0, 0.25, 0.9, 0.4, 0.85), 0.9)
			assert.equal(orFuzzySeries(0, 0, 0, 0), 0)
		})

		it('handles edge values: -0, subnormals, and floats near powers of two', () => {
			assert.equal(Object.is(orFuzzySeries(-0, -0), 0), true)
			assert.equal(Object.is(orFuzzySeries(-0, 0), 0), true)
			assert.equal(orFuzzySeries(0, Number.MIN_VALUE), Number.MIN_VALUE)
			assert.equal(orFuzzySeries(Number.MIN_VALUE, 0), Number.MIN_VALUE)
			assert.equal(orFuzzySeries(0, 1e-200), 1e-200)
			assert.equal(orFuzzySeries(1e-200, 1e-300), 1e-200)

			// Adversarial IEEE 754 pairs around 0.5 and 1.0 where naive (a+b+|a-b|)/2 loses precision
			const adversarial = [
				[0.5, 3e-17],
				[0.5 + Number.EPSILON / 2, 0.5],
				[0.5, 0.5 - Number.EPSILON / 4],
				[1 - Number.EPSILON / 2, 1 - Number.EPSILON],
				[1, 1 - Number.EPSILON / 2],
				[0.25, 1e-17],
				[0.5 + 2 ** -53, 2 ** -54],
			]
			for (const [x, y] of adversarial) {
				assert.equal(orFuzzySeries(x, y), Math.max(x, y))
				assert.equal(orFuzzySeries(y, x), Math.max(x, y))
			}
		})
	})

	describe('fuzzy sets (Array, plain Object, Map)', () => {
		it('computes elementwise union of equal-length fuzzy set arrays', () => {
			assert.deepEqual(
				orFuzzySeries([0, 0.2, 0.9, 1], [0.5, 0.2, 0.3, 0.4]),
				[0.5, 0.2, 0.9, 1]
			)
			assert.deepEqual(
				orFuzzySeries([0.1, 0.4], [0.5, 0.2], [0.3, 0.8]),
				[0.5, 0.8]
			)
			assert.deepEqual(orFuzzySeries([], []), [])
		})

		it('computes union of plain-object fuzzy sets with implicit 0 for missing elements', () => {
			assert.deepEqual(
				orFuzzySeries({ a: 0.2, b: 0.8 }, { b: 0.4, c: 0.6 }),
				{ a: 0.2, b: 0.8, c: 0.6 }
			)
			assert.deepEqual(
				orFuzzySeries({ x: 0.1 }, { y: 0.5 }, { x: 0.7, z: 0 }),
				{ x: 0.7, y: 0.5, z: 0 }
			)
			assert.deepEqual(orFuzzySeries({}, {}), {})

			const nullProtoA = Object.assign(Object.create(null), { p: 0.3 })
			const nullProtoB = Object.assign(Object.create(null), { p: 0.9, q: 0.4 })
			assert.deepEqual(orFuzzySeries(nullProtoA, nullProtoB), { p: 0.9, q: 0.4 })
		})

		it('computes union of Map fuzzy sets with implicit 0 for missing keys', () => {
			const m1 = new Map([
				['cold', 0.2],
				['warm', 0.7],
			])
			const m2 = new Map([
				['warm', 0.3],
				['hot', 0.9],
			])
			const union = orFuzzySeries(m1, m2)
			assert.ok(union instanceof Map)
			assert.deepEqual([...union.entries()], [
				['cold', 0.2],
				['warm', 0.7],
				['hot', 0.9],
			])
			assert.equal(orFuzzySeries(new Map(), new Map()).size, 0)
		})
	})

	describe('algebraic axioms and independent cross-checks', () => {
		it('satisfies Zadeh t-conorm / lattice axioms across a grid', () => {
			const grid = [0, 0.01, 0.1, 0.25, 0.5, 0.73, 0.99, 1]
			for (const a of grid) {
				// Identity & annihilator & idempotence
				assert.equal(orFuzzySeries(a, 0), a)
				assert.equal(orFuzzySeries(0, a), a)
				assert.equal(orFuzzySeries(a, 1), 1)
				assert.equal(orFuzzySeries(1, a), 1)
				assert.equal(orFuzzySeries(a, a), a)

				for (const b of grid) {
					// Commutativity
					assert.equal(orFuzzySeries(a, b), orFuzzySeries(b, a))

					for (const c of grid) {
						// Associativity
						assert.equal(
							orFuzzySeries(orFuzzySeries(a, b), c),
							orFuzzySeries(a, orFuzzySeries(b, c))
						)
						// Monotonicity: if a <= c, then (a ∨ b) <= (c ∨ b)
						if (a <= c) {
							assert.ok(orFuzzySeries(a, b) <= orFuzzySeries(c, b))
						}
					}
				}
			}
		})

		it('matches Math.max and De Morgan Zadeh identity on 1,000 deterministic pseudo-random pairs', () => {
			// Deterministic Mulberry32 PRNG
			let state = 0x5f3759df
			const nextRand = () => {
				state |= 0
				state = (state + 0x6d2b79f5) | 0
				let t = Math.imul(state ^ (state >>> 15), 1 | state)
				t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
				return ((t ^ (t >>> 14)) >>> 0) / 4294967296
			}

			for (let i = 0; i < 1000; i++) {
				const a = nextRand()
				const b = nextRand()
				const actual = orFuzzySeries(a, b)

				// Exact cross-check against Math.max
				assert.equal(actual, Math.max(a, b))

				// Cross-check against De Morgan's Law: 1 - min(1 - a, 1 - b)
				const deMorgan = zadehOrDeMorgan(a, b)
				assert.ok(
					Math.abs(actual - deMorgan) <= Number.EPSILON,
					`De Morgan mismatch for (${a}, ${b}): ${actual} vs ${deMorgan}`
				)
			}
		})

		it('matches binomial series expansion for |a - b| and high-order Yager t-conorm limit', () => {
			const pairs = [
				[0.1, 0.9],
				[0.2, 0.7],
				[0.8, 0.3],
				[0.05, 0.65],
				[0.95, 0.25],
			]
			for (const [a, b] of pairs) {
				const actual = orFuzzySeries(a, b)

				// Cross-check against binomial series expansion of √(1 - (1 - (a - b)²))
				const seriesVal = zadehOrBinomialSeries(a, b, 200)
				assert.ok(
					Math.abs(actual - seriesVal) < 1e-10,
					`Series mismatch for (${a}, ${b}): ${actual} vs ${seriesVal}`
				)

				// Cross-check against Yager t-conorm as w -> ∞ (Zadeh OR is the lower bound of all t-conorms)
				const yagerVal = yagerTConorm(a, b, 200)
				assert.ok(actual <= yagerVal + 1e-15)
				assert.ok(
					Math.abs(actual - yagerVal) < 1e-6,
					`Yager limit mismatch for (${a}, ${b}): ${actual} vs ${yagerVal}`
				)
			}
		})
	})

	describe('input validation', () => {
		it('throws TypeError for fewer than 2 operands', () => {
			assert.throws(() => orFuzzySeries(), TypeError)
			assert.throws(() => orFuzzySeries(0.5), TypeError)
		})

		it('throws TypeError for non-number memberships or mismatched operand kinds', () => {
			assert.throws(() => orFuzzySeries('0.5', 0.5), TypeError)
			assert.throws(() => orFuzzySeries(0.5, true), TypeError)
			assert.throws(() => orFuzzySeries(null, 0.5), TypeError)
			assert.throws(() => orFuzzySeries(undefined, 0.5), TypeError)
			assert.throws(() => orFuzzySeries(0.5, [0.5]), TypeError)
			assert.throws(() => orFuzzySeries([0.5], { a: 0.5 }), TypeError)
			assert.throws(() => orFuzzySeries({ a: 0.5 }, new Map([['a', 0.5]])), TypeError)
			assert.throws(() => orFuzzySeries(new Map([['a', 0.5]]), { a: 0.5 }), TypeError)
			assert.throws(() => orFuzzySeries(new Set([0.5]), new Set([0.5])), TypeError)
			assert.throws(() => orFuzzySeries([0.5, 'bad'], [0.5, 0.5]), TypeError)
			assert.throws(() => orFuzzySeries({ a: 'bad' }, { a: 0.5 }), TypeError)
			assert.throws(() => orFuzzySeries(new Map([['a', null]]), new Map()), TypeError)

			// Sparse arrays should be rejected
			const sparse = new Array(2)
			sparse[0] = 0.5
			assert.throws(() => orFuzzySeries(sparse, [0.5, 0.5]), TypeError)
			assert.throws(() => orFuzzySeries([0.5, 0.5], sparse), TypeError)
		})

		it('throws RangeError for non-finite or out-of-[0, 1] memberships and mismatched array lengths', () => {
			assert.throws(() => orFuzzySeries(-0.001, 0.5), RangeError)
			assert.throws(() => orFuzzySeries(0.5, 1.001), RangeError)
			assert.throws(() => orFuzzySeries(NaN, 0.5), RangeError)
			assert.throws(() => orFuzzySeries(Infinity, 0.5), RangeError)
			assert.throws(() => orFuzzySeries(-Infinity, 0.5), RangeError)
			assert.throws(() => orFuzzySeries([0.2], [0.2, 0.3]), RangeError)
			assert.throws(() => orFuzzySeries([0.2, 1.5], [0.2, 0.3]), RangeError)
			assert.throws(() => orFuzzySeries({ a: -0.1 }, { a: 0.5 }), RangeError)
			assert.throws(() => orFuzzySeries(new Map([['a', 2]]), new Map()), RangeError)
		})
	})
})
