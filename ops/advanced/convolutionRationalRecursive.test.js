import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { convolutionRationalRecursive } from './convolutionRationalRecursive.js'

/**
 * Helper to construct a rational literal concisely in tests.
 * @param {bigint | number} num
 * @param {bigint | number} [den=1n]
 */
const r = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

/**
 * Independent reference implementation: direct O(m*n) schoolbook convolution
 * with BigInt Euclidean GCD normalization.
 */
function gcd(a, b) {
	a = a < 0n ? -a : a
	b = b < 0n ? -b : b
	while (b !== 0n) {
		const t = a % b
		a = b
		b = t
	}
	return a
}

function norm(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

function addRef(x, y) {
	return norm(x.num * y.den + y.num * x.den, x.den * y.den)
}

function mulRef(x, y) {
	return norm(x.num * y.num, x.den * y.den)
}

function naiveConvolution(a, b) {
	if (a.length === 0 || b.length === 0) return []
	const out = Array.from({ length: a.length + b.length - 1 }, () => r(0, 1))
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < b.length; j++) {
			out[i + j] = addRef(out[i + j], mulRef(a[i], b[j]))
		}
	}
	return out
}

/**
 * Evaluates polynomial P(x) = sum_i coeffs[i] * x^i at exact rational x using Horner's method.
 */
function evalPoly(coeffs, x) {
	let acc = r(0, 1)
	for (let i = coeffs.length - 1; i >= 0; i--) {
		acc = addRef(mulRef(acc, x), coeffs[i])
	}
	return acc
}

/**
 * Verifies every rational in an array is strictly normalized in lowest terms with den > 0n.
 */
function assertNormalizedArray(arr) {
	for (const el of arr) {
		assert.equal(typeof el.num, 'bigint')
		assert.equal(typeof el.den, 'bigint')
		assert.ok(el.den > 0n, `Expected den > 0n, got ${el.den}`)
		if (el.num === 0n) {
			assert.equal(el.den, 1n, `Zero must be represented as 0n/1n, got 0n/${el.den}`)
		} else {
			assert.equal(gcd(el.num, el.den), 1n, `Expected lowest terms for ${el.num}/${el.den}`)
		}
	}
}

describe('convolutionRationalRecursive', () => {
	it('computes exact convolution for simple rational sequences', () => {
		// (1/2 + 1/3 x) * (2/5 + 3/4 x) = 1/5 + (3/8 + 2/15) x + 1/4 x^2
		// 3/8 + 2/15 = (45 + 16)/120 = 61/120
		const a = [r(1, 2), r(1, 3)]
		const b = [r(2, 5), r(3, 4)]
		const res = convolutionRationalRecursive(a, b)
		assertNormalizedArray(res)
		assert.deepEqual(res, [r(1, 5), r(61, 120), r(1, 4)])
	})

	it('handles exact cancellation to zero and negative fractions', () => {
		// (1/2 - 1/2 x) * (1/3 + 1/3 x) = 1/6 + 0 x - 1/6 x^2
		const a = [r(1, 2), r(-1, 2)]
		const b = [r(1, 3), r(1, 3)]
		const res = convolutionRationalRecursive(a, b)
		assertNormalizedArray(res)
		assert.deepEqual(res, [r(1, 6), r(0, 1), r(-1, 6)])
	})

	it('normalizes unreduced inputs and negative denominators', () => {
		const a = [r(4, -8), r(0, -5), r(-6, -9)] // [-1/2, 0/1, 2/3]
		const b = [r(10, 15), r(-3, -6)] // [2/3, 1/2]
		const res = convolutionRationalRecursive(a, b)
		assertNormalizedArray(res)
		assert.deepEqual(res, naiveConvolution(a, b))
	})

	it('handles empty sequences', () => {
		assert.deepEqual(convolutionRationalRecursive([], []), [])
		assert.deepEqual(convolutionRationalRecursive([], [r(1, 2), r(3, 4)]), [])
		assert.deepEqual(convolutionRationalRecursive([r(1, 2), r(3, 4)], []), [])
	})

	it('handles single-element sequences (scalar multiplication and impulse)', () => {
		assert.deepEqual(convolutionRationalRecursive([r(3, 7)], [r(14, 9)]), [r(2, 3)])
		const seq = [r(1, 2), r(-2, 3), r(5, 6), r(0, 1)]
		assert.deepEqual(convolutionRationalRecursive([r(1, 1)], seq), seq)
		assert.deepEqual(convolutionRationalRecursive(seq, [r(1, 1)]), seq)
		assert.deepEqual(convolutionRationalRecursive([r(3, 2)], seq), [
			r(3, 4),
			r(-1, 1),
			r(5, 4),
			r(0, 1),
		])
		assert.deepEqual(convolutionRationalRecursive(seq, [r(0, 1)]), [
			r(0, 1),
			r(0, 1),
			r(0, 1),
			r(0, 1),
		])
	})

	it('handles highly unbalanced and odd/even sequence lengths', () => {
		const pairs = [
			[2, 5],
			[5, 2],
			[3, 3],
			[3, 7],
			[7, 3],
			[4, 9],
			[9, 4],
			[1, 11],
			[11, 1],
			[8, 8],
			[13, 17],
		]
		for (const [m, n] of pairs) {
			const a = Array.from({ length: m }, (_, i) => r((i % 2 === 0 ? 1 : -1) * (i + 1), i + 2))
			const b = Array.from({ length: n }, (_, j) => r(2 * j - 3, j + 3))
			const actual = convolutionRationalRecursive(a, b)
			const expected = naiveConvolution(a, b)
			assertNormalizedArray(actual)
			assert.deepEqual(actual, expected, `Mismatch for lengths (${m}, ${n})`)
		}
	})

	it('preserves exact arithmetic for huge BigInts beyond Number.MAX_SAFE_INTEGER', () => {
		const big1 = 1n << 120n
		const big2 = (1n << 120n) + 3n
		const a = [
			{ num: big1, den: 7n },
			{ num: -big2, den: 11n },
			{ num: 1n, den: big1 },
		]
		const b = [
			{ num: big2, den: 13n },
			{ num: big1, den: 17n },
			{ num: -3n, den: big2 },
		]
		const actual = convolutionRationalRecursive(a, b)
		const expected = naiveConvolution(a, b)
		assertNormalizedArray(actual)
		assert.deepEqual(actual, expected)
	})

	it('does not mutate input arrays or input rational objects', () => {
		const a = [r(2, -4), r(3, 6)]
		const b = [r(4, 8), r(-5, 10)]
		const aCopy = a.map((x) => ({ ...x }))
		const bCopy = b.map((x) => ({ ...x }))
		convolutionRationalRecursive(a, b)
		assert.deepEqual(a, aCopy)
		assert.deepEqual(b, bCopy)
	})

	it('matches independent naive convolution and polynomial evaluation across deterministic pseudo-random inputs', () => {
		// Linear congruential generator for reproducible test vectors
		let seed = 0x12345678n
		const nextInt = (mod) => {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
			return seed % BigInt(mod)
		}
		const makeSeq = (len) =>
			Array.from({ length: len }, () => {
				const num = nextInt(41) - 20n // [-20, 20]
				const den = nextInt(12) + 1n // [1, 12]
				return { num, den }
			})

		for (const [m, n] of [
			[6, 6],
			[15, 10],
			[10, 21],
			[32, 32],
		]) {
			const a = makeSeq(m)
			const b = makeSeq(n)
			const c = convolutionRationalRecursive(a, b)
			assertNormalizedArray(c)
			assert.equal(c.length, m + n - 1)
			assert.deepEqual(c, naiveConvolution(a, b))

			// Independent algebraic cross-check: (a * b)(x) === a(x) * b(x)
			for (const x of [r(1, 1), r(-1, 1), r(3, 5), r(-2, 7)]) {
				assert.deepEqual(evalPoly(c, x), mulRef(evalPoly(a, x), evalPoly(b, x)))
			}
		}
	})

	it('satisfies commutativity, associativity, and distributivity', () => {
		const a = [r(1, 2), r(-3, 4), r(5, 6), r(7, 8), r(-1, 3)]
		const b = [r(2, 5), r(0, 1), r(-4, 7), r(3, 11)]
		const c = [r(-1, 6), r(2, 3), r(1, 9), r(-5, 12)]

		// Commutativity: a * b = b * a
		assert.deepEqual(convolutionRationalRecursive(a, b), convolutionRationalRecursive(b, a))

		// Associativity: (a * b) * c = a * (b * c)
		const ab_c = convolutionRationalRecursive(convolutionRationalRecursive(a, b), c)
		const a_bc = convolutionRationalRecursive(a, convolutionRationalRecursive(b, c))
		assertNormalizedArray(ab_c)
		assert.deepEqual(ab_c, a_bc)

		// Distributivity: a * (b + c) = (a * b) + (a * c)
		const bPlusC = b.map((bi, i) => addRef(bi, c[i]))
		const lhs = convolutionRationalRecursive(a, bPlusC)
		const ab = convolutionRationalRecursive(a, b)
		const ac = convolutionRationalRecursive(a, c)
		const rhs = ab.map((v, i) => addRef(v, ac[i]))
		assert.deepEqual(lhs, rhs)
	})

	it('throws TypeError or RangeError on invalid inputs', () => {
		// Non-array inputs
		assert.throws(() => convolutionRationalRecursive(null, []), TypeError)
		assert.throws(() => convolutionRationalRecursive([], undefined), TypeError)
		assert.throws(() => convolutionRationalRecursive('123', [r(1, 1)]), TypeError)
		assert.throws(() => convolutionRationalRecursive([r(1, 1)], { num: 1n, den: 1n }), TypeError)

		// Invalid element shapes and types
		assert.throws(() => convolutionRationalRecursive([null], [r(1, 1)]), TypeError)
		assert.throws(() => convolutionRationalRecursive([r(1, 1)], [[1n, 2n]]), TypeError)
		assert.throws(() => convolutionRationalRecursive([{ num: 1, den: 2n }], [r(1, 1)]), TypeError)
		assert.throws(() => convolutionRationalRecursive([{ num: 1n, den: 2 }], [r(1, 1)]), TypeError)
		assert.throws(() => convolutionRationalRecursive([{ num: 1n }], [r(1, 1)]), TypeError)

		// Sparse array hole
		const sparse = new Array(2)
		sparse[0] = r(1, 1)
		assert.throws(() => convolutionRationalRecursive(sparse, [r(1, 1)]), TypeError)

		// Zero denominator (including when the other sequence is empty)
		assert.throws(() => convolutionRationalRecursive([r(1, 0)], [r(1, 1)]), RangeError)
		assert.throws(() => convolutionRationalRecursive([r(0, 0)], [r(1, 1)]), RangeError)
		assert.throws(() => convolutionRationalRecursive([], [r(1, 0)]), RangeError)
		assert.throws(() => convolutionRationalRecursive([r(1, 0)], []), RangeError)
	})
})
