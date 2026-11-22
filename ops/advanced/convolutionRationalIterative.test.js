import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { convolutionRationalIterative } from './convolutionRationalIterative.js'

/** Helper to create a rational object concisely. */
const r = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

/** Independent GCD helper for test invariants and reference calculations. */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/** Independent rational normalization for reference checks. */
function reduce(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

/** Independent rational arithmetic for polynomial evaluation cross-check. */
function ratAdd(x, y) {
	return reduce(x.num * y.den + y.num * x.den, x.den * y.den)
}

function ratMul(x, y) {
	return reduce(x.num * y.num, x.den * y.den)
}

/** Evaluates polynomial with coefficients `coeffs[k] * x^k` via Horner's method. */
function evalPoly(coeffs, x) {
	let acc = r(0, 1)
	for (let i = coeffs.length - 1; i >= 0; i--) {
		acc = ratAdd(ratMul(acc, x), coeffs[i])
	}
	return acc
}

/**
 * Independent reference convolution via clearing denominators to pure BigInt
 * polynomial multiplication, then dividing by the product of common denominators.
 */
function naiveCommonDenConvolution(a, b) {
	if (a.length === 0 || b.length === 0) return []
	let denA = 1n
	for (const x of a) denA *= x.den < 0n ? -x.den : x.den
	let denB = 1n
	for (const y of b) denB *= y.den < 0n ? -y.den : y.den

	const intA = a.map((x) => (x.num * denA) / x.den)
	const intB = b.map((y) => (y.num * denB) / y.den)

	const out = new Array(a.length + b.length - 1).fill(0n)
	for (let i = 0; i < intA.length; i++) {
		for (let j = 0; j < intB.length; j++) {
			out[i + j] += intA[i] * intB[j]
		}
	}

	const totalDen = denA * denB
	return out.map((num) => reduce(num, totalDen))
}

/** Asserts every rational in `seq` is in canonical lowest terms. */
function assertCanonical(seq) {
	for (const item of seq) {
		assert.equal(typeof item.num, 'bigint')
		assert.equal(typeof item.den, 'bigint')
		assert.ok(item.den > 0n, `expected positive den, got ${item.den}`)
		if (item.num === 0n) {
			assert.equal(item.den, 1n)
		} else {
			assert.equal(gcd(item.num, item.den), 1n)
		}
	}
}

describe('convolutionRationalIterative', () => {
	describe('normal cases', () => {
		test('convolves integer-valued rationals', () => {
			const a = [r(1), r(2), r(3)]
			const b = [r(4), r(5)]
			const out = convolutionRationalIterative(a, b)
			assert.deepEqual(out, [r(4), r(13), r(22), r(15)])
			assertCanonical(out)
		})

		test('convolves fractional rationals and reduces results to lowest terms', () => {
			const a = [r(1, 2), r(1, 3)]
			const b = [r(1, 4), r(1, 6)]
			// c0 = 1/8, c1 = 1/12 + 1/12 = 1/6, c2 = 1/18
			const out = convolutionRationalIterative(a, b)
			assert.deepEqual(out, [r(1, 8), r(1, 6), r(1, 18)])
			assertCanonical(out)
		})

		test('convolves sequences of unequal lengths in both orders', () => {
			const a = [r(2, 3)]
			const b = [r(3, 4), r(-5, 6), r(7, 8), r(9, 10)]
			const expected = [r(1, 2), r(-5, 9), r(7, 12), r(3, 5)]
			assert.deepEqual(convolutionRationalIterative(a, b), expected)
			assert.deepEqual(convolutionRationalIterative(b, a), expected)
		})

		test('preserves exact precision for large BigInt numerators and denominators', () => {
			const big = 10n ** 30n
			const a = [
				{ num: big + 1n, den: big },
				{ num: 1n, den: big + 3n },
			]
			const b = [
				{ num: big, den: big + 1n },
				{ num: -(big + 3n), den: 2n },
			]
			const out = convolutionRationalIterative(a, b)
			assertCanonical(out)
			// c0 = ((big+1)/big) * (big/(big+1)) = 1/1
			assert.deepEqual(out[0], { num: 1n, den: 1n })
			// c2 = (1/(big+3)) * (-(big+3)/2) = -1/2
			assert.deepEqual(out[2], { num: -1n, den: 2n })
			// Cross-check full output against independent common-denominator reference
			assert.deepEqual(out, naiveCommonDenConvolution(a, b))
		})
	})

	describe('edge cases', () => {
		test('returns empty array when either or both inputs are empty', () => {
			assert.deepEqual(convolutionRationalIterative([], []), [])
			assert.deepEqual(convolutionRationalIterative([], [r(1, 2), r(3, 4)]), [])
			assert.deepEqual(convolutionRationalIterative([r(1, 2), r(3, 4)], []), [])
		})

		test('handles single-element sequences', () => {
			const out = convolutionRationalIterative([r(3, 4)], [r(2, 5)])
			assert.deepEqual(out, [r(3, 10)])
			assertCanonical(out)
		})

		test('identity element [1/1] normalizes and preserves sequence', () => {
			const a = [r(6, -9), r(0, -5), r(-4, -8), r(15, 25)]
			const out = convolutionRationalIterative(a, [r(1, 1)])
			assert.deepEqual(out, [r(-2, 3), r(0, 1), r(1, 2), r(3, 5)])
			assertCanonical(out)
		})

		test('handles zeros and exact cancellations to canonical { num: 0n, den: 1n }', () => {
			// (1/2 - 1/2 x) * (1/3 + 1/3 x) = 1/6 + 0*x - 1/6 x^2
			const out = convolutionRationalIterative(
				[r(1, 2), r(-1, 2)],
				[r(1, 3), r(1, 3)]
			)
			assert.deepEqual(out, [r(1, 6), r(0, 1), r(-1, 6)])
			assertCanonical(out)

			const zeros = convolutionRationalIterative(
				[r(0, 5), r(0, -3)],
				[r(0, 7), r(0, -11)]
			)
			assert.deepEqual(zeros, [r(0, 1), r(0, 1), r(0, 1)])
			assertCanonical(zeros)
		})

		test('normalizes negative denominators and unreduced inputs without mutating inputs', () => {
			const a = [
				{ num: 6n, den: -9n },
				{ num: -10n, den: -15n },
			]
			const b = [
				{ num: -12n, den: 16n },
				{ num: 8n, den: -12n },
			]
			const aSnapshot = a.map((x) => ({ ...x }))
			const bSnapshot = b.map((y) => ({ ...y }))

			const out = convolutionRationalIterative(a, b)
			// a = [-2/3, 2/3], b = [-3/4, -2/3]
			// c0 = 1/2
			// c1 = (-2/3)(-2/3) + (2/3)(-3/4) = 4/9 - 1/2 = -1/18
			// c2 = (2/3)(-2/3) = -4/9
			assert.deepEqual(out, [r(1, 2), r(-1, 18), r(-4, 9)])
			assertCanonical(out)
			assert.deepEqual(a, aSnapshot)
			assert.deepEqual(b, bSnapshot)
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-array arguments', () => {
			for (const bad of [null, undefined, 42, 'abc', {}, new Int32Array(2)]) {
				assert.throws(() => convolutionRationalIterative(bad, []), TypeError)
				assert.throws(() => convolutionRationalIterative([], bad), TypeError)
			}
		})

		test('throws TypeError for malformed rational elements', () => {
			const badElements = [
				null,
				undefined,
				1,
				'1/2',
				[],
				{},
				{ num: 1n },
				{ den: 1n },
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: NaN, den: 1n },
				{ num: 1n, den: Infinity },
				{ num: '1', den: '2' },
			]
			for (const bad of badElements) {
				assert.throws(
					() => convolutionRationalIterative([bad], [r(1)]),
					TypeError
				)
				assert.throws(
					() => convolutionRationalIterative([r(1)], [bad]),
					TypeError
				)
				// Also validates even when the other sequence is empty
				assert.throws(() => convolutionRationalIterative([bad], []), TypeError)
				assert.throws(() => convolutionRationalIterative([], [bad]), TypeError)
			}
		})

		test('throws RangeError for zero denominator', () => {
			assert.throws(
				() => convolutionRationalIterative([{ num: 1n, den: 0n }], [r(1)]),
				RangeError
			)
			assert.throws(
				() => convolutionRationalIterative([r(1)], [{ num: 0n, den: 0n }]),
				RangeError
			)
			// Even when the other array is empty
			assert.throws(
				() => convolutionRationalIterative([], [{ num: 5n, den: 0n }]),
				RangeError
			)
			assert.throws(
				() => convolutionRationalIterative([{ num: -3n, den: 0n }], []),
				RangeError
			)
		})
	})

	describe('independent mathematical cross-checks', () => {
		test('satisfies polynomial evaluation identity (A * B)(x) === A(x) * B(x)', () => {
			const A = [r(3, 7), r(-5, 12), r(0, 1), r(11, 6), r(-2, 9)]
			const B = [r(-4, 5), r(7, 15), r(13, 18), r(-1, 4)]
			const C = convolutionRationalIterative(A, B)
			assertCanonical(C)

			const evalPoints = [
				r(-3, 2),
				r(-1, 1),
				r(0, 1),
				r(1, 2),
				r(2, 3),
				r(1, 1),
				r(5, 7),
				r(3, 1),
			]
			for (const x of evalPoints) {
				const lhs = evalPoly(C, x)
				const rhs = ratMul(evalPoly(A, x), evalPoly(B, x))
				assert.deepEqual(lhs, rhs)
			}
		})

		test('matches independent common-denominator integer convolution reference', () => {
			const pairs = [
				[
					[r(1, 6), r(-5, 14), r(7, 15), r(11, -21)],
					[r(-3, 10), r(4, 9), r(0, -8), r(-13, 35), r(2, 3)],
				],
				[
					[r(12, 18), r(-25, 35), r(49, -63)],
					[r(14, -21), r(27, 45)],
				],
			]
			for (const [A, B] of pairs) {
				const actual = convolutionRationalIterative(A, B)
				const expected = naiveCommonDenConvolution(A, B)
				assert.deepEqual(actual, expected)
				assertCanonical(actual)
			}
		})

		test('satisfies commutativity, associativity, and distributivity', () => {
			const A = [r(2, 5), r(-3, 7), r(5, 11)]
			const B = [r(-1, 3), r(4, 9), r(-7, 12), r(1, 2)]
			const C = [r(3, 4), r(0, 1), r(-5, 6), r(2, 15)]

			// Commutativity: A * B === B * A
			assert.deepEqual(
				convolutionRationalIterative(A, B),
				convolutionRationalIterative(B, A)
			)

			// Associativity: (A * B) * C === A * (B * C)
			const leftAssoc = convolutionRationalIterative(
				convolutionRationalIterative(A, B),
				C
			)
			const rightAssoc = convolutionRationalIterative(
				A,
				convolutionRationalIterative(B, C)
			)
			assert.deepEqual(leftAssoc, rightAssoc)
			assertCanonical(leftAssoc)

			// Distributivity: A * (B + C) === (A * B) + (A * C)
			const BplusC = B.map((bi, idx) => ratAdd(bi, C[idx]))
			const lhs = convolutionRationalIterative(A, BplusC)
			const AB = convolutionRationalIterative(A, B)
			const AC = convolutionRationalIterative(A, C)
			const rhs = AB.map((v, idx) => ratAdd(v, AC[idx]))
			assert.deepEqual(lhs, rhs)
		})
	})
})
