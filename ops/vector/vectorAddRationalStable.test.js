import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { vectorAddRationalStable } from './vectorAddRationalStable.js'

/**
 * Helper to construct a rational object concisely.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
const r = (num, den = 1n) => ({ num, den })

/**
 * Independent reference GCD for verification in tests.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function refGcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Independent naive rational addition via direct cross-multiplication
 * followed by full reduction, used as an independent oracle.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function naiveRationalAdd(a, b) {
	let num = a.num * b.den + b.num * a.den
	let den = a.den * b.den
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = refGcd(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Asserts canonical lowest-terms invariants on every element of a rational vector.
 *
 * @param {Array<{ num: bigint, den: bigint }>} vec
 */
function assertCanonicalVector(vec) {
	for (const item of vec) {
		assert.equal(typeof item.num, 'bigint')
		assert.equal(typeof item.den, 'bigint')
		assert.ok(item.den > 0n, `expected positive denominator, got ${item.den}`)
		if (item.num === 0n) {
			assert.equal(item.den, 1n, `expected 0/1 for zero, got 0/${item.den}`)
		} else {
			assert.equal(refGcd(item.num, item.den), 1n, `not in lowest terms: ${item.num}/${item.den}`)
		}
	}
}

describe('vectorAddRationalStable', () => {
	test('adds normal rational vectors with coprime and shared denominators', () => {
		const a = [r(1n, 2n), r(1n, 3n), r(-5n, 6n), r(7n, 30n), r(1n, 10n)]
		const b = [r(1n, 4n), r(1n, 6n), r(1n, 6n), r(11n, 42n), r(2n, 10n)]

		const out = vectorAddRationalStable(a, b)
		assertCanonicalVector(out)
		assert.deepEqual(out, [
			r(3n, 4n),
			r(1n, 2n),
			r(-2n, 3n),
			r(52n, 105n),
			r(3n, 10n),
		])
	})

	test('normalizes unreduced inputs and negative denominators', () => {
		const a = [r(4n, -6n), r(-6n, -9n), r(0n, -17n), r(15n, 25n)]
		const b = [r(-2n, -3n), r(3n, -9n), r(0n, 42n), r(-9n, -15n)]

		const out = vectorAddRationalStable(a, b)
		assertCanonicalVector(out)
		assert.deepEqual(out, [
			r(0n, 1n),
			r(1n, 3n),
			r(0n, 1n),
			r(6n, 5n),
		])
	})

	test('does not mutate inputs and returns fresh rational objects', () => {
		const a0 = r(0n, 1n)
		const b0 = r(5n, 7n)
		const a1 = r(3n, 4n)
		const b1 = r(0n, 1n)
		const a = [a0, a1]
		const b = [b0, b1]

		const out = vectorAddRationalStable(a, b)
		assert.deepEqual(out, [r(5n, 7n), r(3n, 4n)])
		assert.notEqual(out[0], b0)
		assert.notEqual(out[1], a1)
		assert.deepEqual(a, [r(0n, 1n), r(3n, 4n)])
		assert.deepEqual(b, [r(5n, 7n), r(0n, 1n)])
	})

	test('handles edge cases: empty vectors, single element, and exact cancellation to zero', () => {
		assert.deepEqual(vectorAddRationalStable([], []), [])

		const single = vectorAddRationalStable([r(5n, 12n)], [r(7n, 12n)])
		assertCanonicalVector(single)
		assert.deepEqual(single, [r(1n, 1n)])

		const cancel = vectorAddRationalStable(
			[r(3n, 7n), r(-11n, 13n), r(1n, 1n)],
			[r(-3n, 7n), r(11n, 13n), r(-1n, 1n)],
		)
		assertCanonicalVector(cancel)
		assert.deepEqual(cancel, [r(0n, 1n), r(0n, 1n), r(0n, 1n)])
	})

	test('remains exact under extreme dynamic range and catastrophic cancellation', () => {
		const huge = 10n ** 150n
		// (10^150 + 1/3) + (-10^150) === 1/3 (would lose all fractional digits in IEEE-754 float64)
		const a = [
			r(huge * 3n + 1n, 3n),
			r(huge * huge + 1n, huge),
		]
		const b = [
			r(-huge, 1n),
			r(-huge, 1n),
		]

		const out = vectorAddRationalStable(a, b)
		assertCanonicalVector(out)
		assert.deepEqual(out, [
			r(1n, 3n),
			r(1n, huge),
		])
	})

	test('handles huge shared denominator factors and large Fibonacci denominators cleanly', () => {
		const shared = (2n ** 200n) * (3n ** 100n)
		// Construct Fibonacci numbers F(300), F(301) (coprime, worst-case for Euclidean GCD)
		let fPrev = 0n
		let fCurr = 1n
		for (let i = 0; i < 300; i++) {
			const next = fPrev + fCurr
			fPrev = fCurr
			fCurr = next
		}
		const f300 = fPrev
		const f301 = fCurr

		const a = [r(5n, shared * 7n), r(1n, f300)]
		const b = [r(9n, shared * 11n), r(1n, f301)]

		const out = vectorAddRationalStable(a, b)
		assertCanonicalVector(out)
		assert.deepEqual(out, [
			naiveRationalAdd(a[0], b[0]),
			naiveRationalAdd(a[1], b[1]),
		])
		// Check second element explicitly: 1/F300 + 1/F301 = (F300 + F301) / (F300 * F301) = F302 / (F300 * F301)
		assert.deepEqual(out[1], r(f300 + f301, f300 * f301))
	})

	test('rejects invalid vector arguments and length mismatches', () => {
		assert.throws(() => vectorAddRationalStable(null, []), TypeError)
		assert.throws(() => vectorAddRationalStable([], undefined), TypeError)
		assert.throws(() => vectorAddRationalStable('abc', []), TypeError)
		assert.throws(() => vectorAddRationalStable({}, []), TypeError)
		assert.throws(() => vectorAddRationalStable(new Float64Array([1]), [r(1n, 1n)]), TypeError)

		assert.throws(() => vectorAddRationalStable([r(1n, 1n)], []), RangeError)
		assert.throws(() => vectorAddRationalStable([r(1n, 1n)], [r(1n, 1n), r(2n, 1n)]), RangeError)
	})

	test('rejects invalid rational elements and zero denominators', () => {
		assert.throws(() => vectorAddRationalStable([null], [r(1n, 1n)]), TypeError)
		assert.throws(() => vectorAddRationalStable([r(1n, 1n)], [undefined]), TypeError)
		assert.throws(() => vectorAddRationalStable([42], [r(1n, 1n)]), TypeError)
		assert.throws(() => vectorAddRationalStable([[1n, 2n]], [r(1n, 1n)]), TypeError)
		assert.throws(() => vectorAddRationalStable([{ num: 1, den: 2 }], [r(1n, 1n)]), TypeError)
		assert.throws(() => vectorAddRationalStable([{ num: 1n }], [r(1n, 1n)]), TypeError)
		assert.throws(() => vectorAddRationalStable([{ num: 1n, den: '2' }], [r(1n, 1n)]), TypeError)

		// Sparse array hole
		const sparse = new Array(2)
		sparse[0] = r(1n, 2n)
		assert.throws(() => vectorAddRationalStable(sparse, [r(1n, 2n), r(1n, 2n)]), TypeError)

		// Zero denominators
		assert.throws(() => vectorAddRationalStable([r(1n, 0n)], [r(1n, 1n)]), RangeError)
		assert.throws(() => vectorAddRationalStable([r(0n, 0n)], [r(1n, 1n)]), RangeError)
		assert.throws(() => vectorAddRationalStable([r(1n, 1n)], [r(5n, 0n)]), RangeError)
	})

	test('cross-checks against naive exact oracle, cross-multiplication identity, and algebraic laws', () => {
		// Deterministic LCG generator for reproducible pseudo-random rational vectors
		let seed = 0x123456789abcdef1n
		const nextBig = (mod) => {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
			return seed % mod
		}
		const randRational = () => {
			const signNum = nextBig(2n) === 0n ? 1n : -1n
			const signDen = nextBig(3n) === 0n ? -1n : 1n
			const factor = nextBig(12n) + 1n
			const num = signNum * nextBig(500n) * factor
			const den = signDen * (nextBig(120n) + 1n) * factor
			return r(num, den)
		}

		const len = 100
		const a = Array.from({ length: len }, randRational)
		const b = Array.from({ length: len }, randRational)
		const c = Array.from({ length: len }, randRational)

		const ab = vectorAddRationalStable(a, b)
		assertCanonicalVector(ab)

		// 1. Cross-check every entry against independent naive oracle AND algebraic cross-multiplication identity
		for (let i = 0; i < len; i++) {
			const expected = naiveRationalAdd(a[i], b[i])
			assert.deepEqual(ab[i], expected)

			// Independent algebraic identity: ab.num * (a.den * b.den) === ab.den * (a.num * b.den + b.num * a.den)
			const lhs = ab[i].num * a[i].den * b[i].den
			const rhs = ab[i].den * (a[i].num * b[i].den + b[i].num * a[i].den)
			assert.equal(lhs, rhs)
		}

		// 2. Commutativity: a + b === b + a
		const ba = vectorAddRationalStable(b, a)
		assert.deepEqual(ab, ba)

		// 3. Associativity: (a + b) + c === a + (b + c)
		const ab_c = vectorAddRationalStable(ab, c)
		const a_bc = vectorAddRationalStable(a, vectorAddRationalStable(b, c))
		assertCanonicalVector(ab_c)
		assert.deepEqual(ab_c, a_bc)

		// 4. Additive inverse: a + (-a) === 0
		const negA = a.map((x) => r(-x.num, x.den))
		const zero = vectorAddRationalStable(a, negA)
		assert.deepEqual(zero, Array.from({ length: len }, () => r(0n, 1n)))

		// 5. Floating-point agreement within machine epsilon for small rationals
		for (let i = 0; i < len; i++) {
			const exactAsFloat = Number(ab[i].num) / Number(ab[i].den)
			const floatSum = Number(a[i].num) / Number(a[i].den) + Number(b[i].num) / Number(b[i].den)
			const tol = 1e-11 * (Math.abs(floatSum) + 1)
			assert.ok(Math.abs(exactAsFloat - floatSum) <= tol, `float mismatch at ${i}: ${exactAsFloat} vs ${floatSum}`)
		}
	})
})
