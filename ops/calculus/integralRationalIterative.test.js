import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { integralRationalIterative } from './integralRationalIterative.js'

/** Helper to construct a rational literal concisely. */
const q = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

/** Independent exact rational arithmetic helpers for cross-checking. */
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

function refNorm(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = refGcd(num, den)
	return { num: num / g, den: den / g }
}

const refAdd = (a, b) => refNorm(a.num * b.den + b.num * a.den, a.den * b.den)
const refSub = (a, b) => refNorm(a.num * b.den - b.num * a.den, a.den * b.den)
const refMul = (a, b) => refNorm(a.num * b.num, a.den * b.den)
const refDiv = (a, b) => refNorm(a.num * b.den, a.den * b.num)

function refPow(x, exp) {
	let res = q(1, 1)
	for (let i = 0; i < exp; i++) {
		res = refMul(res, x)
	}
	return res
}

/** Independent polynomial evaluation via explicit powers (not Horner). */
function refEvalPoly(coeffs, x) {
	let sum = q(0, 1)
	for (let i = 0; i < coeffs.length; i++) {
		sum = refAdd(sum, refMul(coeffs[i], refPow(x, i)))
	}
	return sum
}

/** Independent exact symbolic differentiation of a polynomial. */
function refDifferentiate(poly) {
	const deriv = []
	for (let i = 1; i < poly.length; i++) {
		deriv.push(refMul(poly[i], q(i, 1)))
	}
	return deriv
}

/** Independent exact Simpson's rule (exact for all polynomials of degree <= 3). */
function refSimpson(coeffs, a, b) {
	const mid = refDiv(refAdd(a, b), q(2, 1))
	const widthOver6 = refDiv(refSub(b, a), q(6, 1))
	const fa = refEvalPoly(coeffs, a)
	const fm = refEvalPoly(coeffs, mid)
	const fb = refEvalPoly(coeffs, b)
	return refMul(widthOver6, refAdd(refAdd(fa, refMul(q(4, 1), fm)), fb))
}

describe('integralRationalIterative', () => {
	describe('indefinite integrals', () => {
		it('integrates zero and constant polynomials', () => {
			assert.deepEqual(integralRationalIterative([q(0)]), [q(0), q(0)])
			assert.deepEqual(integralRationalIterative([q(5)]), [q(0), q(5)])
			assert.deepEqual(integralRationalIterative([q(-3, 7)]), [q(0), q(-3, 7)])
		})

		it('integrates linear, quadratic, and higher-degree polynomials in lowest terms', () => {
			// p(x) = 1 + 2x + 3x^2 -> F(x) = 0 + x + x^2 + x^3
			assert.deepEqual(integralRationalIterative([q(1), q(2), q(3)]), [
				q(0),
				q(1),
				q(1),
				q(1),
			])

			// p(x) = 1/2 - 2/3 x + 3/5 x^2 - 4/7 x^3
			// F(x) = 0 + 1/2 x - 1/3 x^2 + 1/5 x^3 - 1/7 x^4
			assert.deepEqual(
				integralRationalIterative([q(1, 2), q(-2, 3), q(3, 5), q(-4, 7)]),
				[q(0), q(1, 2), q(-1, 3), q(1, 5), q(-1, 7)],
			)
		})

		it('normalizes non-canonical input rationals with negative denominators or common factors', () => {
			const result = integralRationalIterative([
				{ num: 4n, den: -6n },
				{ num: 0n, den: -9n },
				{ num: -6n, den: -4n },
			])
			assert.deepEqual(result, [q(0), q(-2, 3), q(0), q(1, 2)])
			for (const r of result) {
				assert.ok(r.den > 0n)
				assert.equal(refGcd(r.num, r.den), 1n)
			}
		})

		it('preserves exact BigInt precision beyond Number.MAX_SAFE_INTEGER', () => {
			const huge = 10n ** 30n
			const result = integralRationalIterative([
				{ num: huge, den: 1n },
				{ num: huge, den: 1n },
				{ num: huge, den: 1n },
			])
			assert.deepEqual(result, [
				{ num: 0n, den: 1n },
				{ num: huge, den: 1n },
				{ num: huge / 2n, den: 1n },
				{ num: huge, den: 3n },
			])
		})
	})

	describe('definite integrals', () => {
		it('evaluates definite integrals of zero and constant polynomials', () => {
			assert.deepEqual(integralRationalIterative([q(0)], q(-5, 3), q(11, 4)), q(0))
			// integral of 7/2 from -1/3 to 5/6 = (7/2) * (7/6) = 49/12
			assert.deepEqual(integralRationalIterative([q(7, 2)], q(-1, 3), q(5, 6)), q(49, 12))
		})

		it('evaluates standard definite integrals with integer and fractional bounds', () => {
			// integral_0^1 x^2 dx = 1/3
			assert.deepEqual(integralRationalIterative([q(0), q(0), q(1)], q(0), q(1)), q(1, 3))

			// integral_0^2 (1 + 2x + 3x^2) dx = [x + x^2 + x^3]_0^2 = 14
			assert.deepEqual(integralRationalIterative([q(1), q(2), q(3)], q(0), q(2)), q(14))

			// integral_{-1/2}^{3/4} (1/3 + 2/5 x - 3/7 x^2) dx
			const coeffs = [q(1, 3), q(2, 5), q(-3, 7)]
			const a = q(-1, 2)
			const b = q(3, 4)
			const actual = integralRationalIterative(coeffs, a, b)
			// Direct manual computation:
			// F(x) = 1/3 x + 1/5 x^2 - 1/7 x^3
			// F(3/4) = 1/4 + 9/80 - 27/448 = (1120 + 504 - 270)/4480 = 1354/4480 = 677/2240
			// F(-1/2) = -1/6 + 1/20 + 1/56 = (-280 + 84 + 30)/1680 = -166/1680 = -83/840
			// F(3/4) - F(-1/2) = 677/2240 + 83/840 = (2031 + 664)/6720 = 2695/6720 = 77/192
			assert.deepEqual(actual, q(77, 192))
		})

		it('returns 0/1 when lower equals upper', () => {
			const coeffs = [q(3, 4), q(-5, 2), q(7, 3), q(11, 5)]
			assert.deepEqual(integralRationalIterative(coeffs, q(2, 3), q(2, 3)), q(0))
			assert.deepEqual(
				integralRationalIterative(coeffs, { num: 4n, den: 6n }, { num: -2n, den: -3n }),
				q(0),
			)
		})

		it('negates the result when bounds are reversed (lower > upper)', () => {
			const coeffs = [q(1, 2), q(-3, 4), q(5, 6), q(-7, 8)]
			const forward = integralRationalIterative(coeffs, q(-2, 3), q(5, 4))
			const reversed = integralRationalIterative(coeffs, q(5, 4), q(-2, 3))
			assert.deepEqual(reversed, { num: -forward.num, den: forward.den })
		})

		it('satisfies interval additivity and symmetry properties', () => {
			const coeffs = [q(2, 3), q(-1, 4), q(3, 5), q(-2, 7), q(1, 2)]
			const a = q(-3, 2)
			const b = q(1, 3)
			const c = q(7, 4)

			const ab = integralRationalIterative(coeffs, a, b)
			const bc = integralRationalIterative(coeffs, b, c)
			const ac = integralRationalIterative(coeffs, a, c)
			assert.deepEqual(refAdd(ab, bc), ac)

			// Odd polynomial integrated over [-k, k] equals 0/1
			const oddPoly = [q(0), q(3, 5), q(0), q(-7, 2), q(0), q(11, 3)]
			assert.deepEqual(integralRationalIterative(oddPoly, q(-5, 3), q(5, 3)), q(0))

			// Even polynomial integrated over [-k, k] equals 2 * integral over [0, k]
			const evenPoly = [q(2, 3), q(0), q(-4, 5), q(0), q(7, 6)]
			const full = integralRationalIterative(evenPoly, q(-4, 3), q(4, 3))
			const half = integralRationalIterative(evenPoly, q(0), q(4, 3))
			assert.deepEqual(full, refMul(q(2), half))
		})

		it('does not mutate input arguments', () => {
			const coeffs = [q(2, 4), q(-3, 6)]
			const lower = { num: 2n, den: -4n }
			const upper = { num: 6n, den: 4n }
			const coeffsSnap = coeffs.map((c) => ({ ...c }))
			const lowerSnap = { ...lower }
			const upperSnap = { ...upper }

			integralRationalIterative(coeffs, lower, upper)

			assert.deepEqual(coeffs, coeffsSnap)
			assert.deepEqual(lower, lowerSnap)
			assert.deepEqual(upper, upperSnap)
		})
	})

	describe('mathematical cross-checks', () => {
		it('Fundamental Theorem of Calculus (Part 1): differentiating antiderivative recovers p(x)', () => {
			const polynomials = [
				[q(0)],
				[q(7, 3)],
				[q(1), q(-2), q(3), q(-4), q(5)],
				[q(-5, 11), q(13, 17), q(0), q(-19, 23), q(29, 31), q(-37, 41)],
			]

			for (const p of polynomials) {
				const F = integralRationalIterative(p)
				assert.deepEqual(F[0], q(0))
				assert.equal(F.length, p.length + 1)
				const recovered = refDifferentiate(F)
				assert.deepEqual(recovered, p)
			}
		})

		it('Fundamental Theorem of Calculus (Part 2): matches direct term-by-term power sum', () => {
			const p = [q(3, 5), q(-7, 2), q(11, 3), q(-13, 4), q(17, 6), q(-19, 7)]
			const a = q(-4, 5)
			const b = q(7, 3)

			// Independent calculation without Horner's method: sum c_i / (i+1) * (b^{i+1} - a^{i+1})
			let expected = q(0)
			for (let i = 0; i < p.length; i++) {
				const coeffOverK = refDiv(p[i], q(i + 1))
				const diffPow = refSub(refPow(b, i + 1), refPow(a, i + 1))
				expected = refAdd(expected, refMul(coeffOverK, diffPow))
			}

			assert.deepEqual(integralRationalIterative(p, a, b), expected)
		})

		it('matches exact Simpson rule on arbitrary cubic polynomials', () => {
			const cases = [
				{
					coeffs: [q(1), q(2), q(3), q(4)],
					a: q(0),
					b: q(2),
				},
				{
					coeffs: [q(-3, 5), q(7, 4), q(-11, 6), q(13, 7)],
					a: q(-5, 3),
					b: q(8, 5),
				},
				{
					coeffs: [q(101, 13), q(-47, 19), q(23, 29), q(-31, 37)],
					a: q(7, 4),
					b: q(-3, 8), // reversed bounds
				},
				{
					coeffs: [q(0), q(0), q(0), q(1)],
					a: q(-2, 3),
					b: q(5, 7),
				},
			]

			for (const { coeffs, a, b } of cases) {
				const integral = integralRationalIterative(coeffs, a, b)
				const simpson = refSimpson(coeffs, a, b)
				assert.deepEqual(integral, simpson)
			}
		})
	})

	describe('input validation', () => {
		it('throws TypeError when coeffs is not an array', () => {
			for (const bad of [null, undefined, 42, '1,2', {}, { num: 1n, den: 1n }]) {
				assert.throws(() => integralRationalIterative(bad), TypeError)
			}
		})

		it('throws RangeError when coeffs is empty', () => {
			assert.throws(() => integralRationalIterative([]), RangeError)
			assert.throws(() => integralRationalIterative([], q(0), q(1)), RangeError)
		})

		it('throws TypeError when only one bound is provided', () => {
			const p = [q(1), q(2)]
			assert.throws(() => integralRationalIterative(p, q(0)), TypeError)
			assert.throws(() => integralRationalIterative(p, q(0), undefined), TypeError)
			assert.throws(() => integralRationalIterative(p, undefined, q(1)), TypeError)
			assert.throws(() => integralRationalIterative(p, null, undefined), TypeError)
		})

		it('throws TypeError for invalid rational objects or non-BigInt fields', () => {
			const badRationals = [
				null,
				undefined,
				1,
				1n,
				'1/2',
				[1n, 2n],
				{},
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: 1n },
				{ den: 1n },
			]

			for (const bad of badRationals) {
				assert.throws(() => integralRationalIterative([bad]), TypeError)
				assert.throws(() => integralRationalIterative([q(1), bad]), TypeError)
				if (bad !== undefined) {
					assert.throws(() => integralRationalIterative([q(1)], bad, q(1)), TypeError)
					assert.throws(() => integralRationalIterative([q(1)], q(0), bad), TypeError)
				}
			}

			// Sparse array with hole
			const sparse = new Array(2)
			sparse[0] = q(1)
			assert.throws(() => integralRationalIterative(sparse), TypeError)
		})

		it('throws RangeError when any denominator is zero', () => {
			assert.throws(
				() => integralRationalIterative([{ num: 1n, den: 0n }]),
				RangeError,
			)
			assert.throws(
				() => integralRationalIterative([q(1), { num: 0n, den: 0n }]),
				RangeError,
			)
			assert.throws(
				() => integralRationalIterative([q(1)], { num: 1n, den: 0n }, q(1)),
				RangeError,
			)
			assert.throws(
				() => integralRationalIterative([q(1)], q(0), { num: -3n, den: 0n }),
				RangeError,
			)
		})
	})
})
