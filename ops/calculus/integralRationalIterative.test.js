import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { integralRationalIterative } from './integralRationalIterative.js'

/**
 * Helper to create a rational literal concisely in tests.
 * @param {bigint | number} num
 * @param {bigint | number} [den=1n]
 */
function q(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) }
}

function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Assert that a value is a canonical lowest-terms rational { num: bigint, den: bigint }.
 */
function assertCanonicalRational(r) {
	assert.equal(typeof r, 'object')
	assert.notEqual(r, null)
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n, `expected 0n/1n, got 0n/${r.den}`)
	} else {
		assert.equal(gcdBigInt(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`)
	}
}

function normalize(r) {
	if (r.num === 0n) return { num: 0n, den: 1n }
	let n = r.num
	let d = r.den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

function addQ(a, b) {
	return normalize({ num: a.num * b.den + b.num * a.den, den: a.den * b.den })
}

function mulQ(a, b) {
	return normalize({ num: a.num * b.num, den: a.den * b.den })
}

/**
 * Independent polynomial differentiation for FTC cross-checking.
 */
function differentiatePoly(coeffs) {
	if (coeffs.length <= 1) return []
	const out = []
	for (let i = 1; i < coeffs.length; i += 1) {
		out.push(normalize({ num: coeffs[i].num * BigInt(i), den: coeffs[i].den }))
	}
	return out
}

/**
 * Independent composite Simpson's 1/3 rule in floating point for numerical cross-checking.
 */
function simpsonIntegral(coeffs, a, b, intervals = 200) {
	const evalFloat = (x) => {
		let sum = 0
		let pow = 1
		for (const c of coeffs) {
			sum += (Number(c.num) / Number(c.den)) * pow
			pow *= x
		}
		return sum
	}
	const h = (b - a) / intervals
	let acc = evalFloat(a) + evalFloat(b)
	for (let i = 1; i < intervals; i += 1) {
		const weight = i % 2 === 0 ? 2 : 4
		acc += weight * evalFloat(a + i * h)
	}
	return (h / 3) * acc
}

describe('integralRationalIterative', () => {
	describe('indefinite integrals (antiderivatives)', () => {
		it('integrates constant, linear, and higher-degree polynomials in lowest terms', () => {
			// P(x) = 5 -> F(x) = 5x
			const fConst = integralRationalIterative([q(5)])
			assert.deepEqual(fConst, [q(0), q(5)])
			fConst.forEach(assertCanonicalRational)

			// P(x) = 2/3 + (4/5)x + (6/7)x^2 -> F(x) = 0 + (2/3)x + (2/5)x^2 + (2/7)x^3
			const fPoly = integralRationalIterative([q(2, 3), q(4, 5), q(6, 7)])
			assert.deepEqual(fPoly, [q(0, 1), q(2, 3), q(2, 5), q(2, 7)])
			fPoly.forEach(assertCanonicalRational)
		})

		it('supports an explicit integration constant C and normalizes unreduced inputs', () => {
			// P(x) = (-6/4) + (9/-3)x^1 + (0/-5)x^2, C = 10/-4 = -5/2
			const result = integralRationalIterative(
				[q(-6, 4), q(9, -3), q(0, -5)],
				q(10, -4)
			)
			assert.deepEqual(result, [q(-5, 2), q(-3, 2), q(-3, 2), q(0, 1)])
			result.forEach(assertCanonicalRational)
		})

		it('handles empty and zero polynomials', () => {
			const emptyDefault = integralRationalIterative([])
			assert.deepEqual(emptyDefault, [q(0, 1)])
			emptyDefault.forEach(assertCanonicalRational)

			const emptyWithC = integralRationalIterative([], q(14, 21))
			assert.deepEqual(emptyWithC, [q(2, 3)])
			emptyWithC.forEach(assertCanonicalRational)

			const zeroPoly = integralRationalIterative([q(0, -3), q(0, 9)])
			assert.deepEqual(zeroPoly, [q(0, 1), q(0, 1), q(0, 1)])
			zeroPoly.forEach(assertCanonicalRational)
		})
	})

	describe('definite integrals', () => {
		it('computes exact power integrals ∫_0^1 x^k dx = 1/(k+1)', () => {
			for (let k = 0; k <= 10; k += 1) {
				const coeffs = Array.from({ length: k + 1 }, (_, i) => (i === k ? q(1) : q(0)))
				const val = integralRationalIterative(coeffs, q(0), q(1))
				assertCanonicalRational(val)
				assert.deepEqual(val, q(1, k + 1))
			}
		})

		it('computes definite integrals over rational bounds including negative and reversed bounds', () => {
			// P(x) = 1 - 2x + 3x^2, F(x) = x - x^2 + x^3
			// F(3/2) = 3/2 - 9/4 + 27/8 = 21/8
			// F(-1/2) = -1/2 - 1/4 - 1/8 = -7/8
			// F(3/2) - F(-1/2) = 28/8 = 7/2
			const coeffs = [q(1), q(-2), q(3)]
			const forward = integralRationalIterative(coeffs, q(-1, 2), q(3, 2))
			assertCanonicalRational(forward)
			assert.deepEqual(forward, q(7, 2))

			// Reversed bounds negate the result
			const reversed = integralRationalIterative(coeffs, q(3, 2), q(-1, 2))
			assertCanonicalRational(reversed)
			assert.deepEqual(reversed, q(-7, 2))

			// Equal bounds yield 0/1
			const zeroSpan = integralRationalIterative(coeffs, q(3, 2), q(6, 4))
			assertCanonicalRational(zeroSpan)
			assert.deepEqual(zeroSpan, q(0, 1))
		})

		it('handles empty polynomial definite integral as 0/1', () => {
			const val = integralRationalIterative([], q(-5, 3), q(7, 4))
			assertCanonicalRational(val)
			assert.deepEqual(val, q(0, 1))
		})

		it('preserves exact BigInt precision beyond Number.MAX_SAFE_INTEGER', () => {
			// P(x) = 1 + 2x on [0, B] => F(B) - F(0) = B + B^2
			const B = 10n ** 25n + 3n
			const val = integralRationalIterative([q(1), q(2)], q(0), { num: B, den: 1n })
			assertCanonicalRational(val)
			assert.deepEqual(val, { num: B + B * B, den: 1n })

			// Fractional large BigInt: ∫_0^{1/B} x dx = 1 / (2 * B^2)
			const fracVal = integralRationalIterative([q(0), q(1)], q(0), { num: 1n, den: B })
			assertCanonicalRational(fracVal)
			assert.deepEqual(fracVal, { num: 1n, den: 2n * B * B })
		})

		it('does not mutate input arrays or rational objects', () => {
			const c0 = { num: 6n, den: -4n }
			const c1 = { num: 4n, den: 8n }
			const coeffs = [c0, c1]
			const a = { num: 2n, den: 4n }
			const b = { num: 6n, den: 4n }

			integralRationalIterative(coeffs, a, b)

			assert.deepEqual(c0, { num: 6n, den: -4n })
			assert.deepEqual(c1, { num: 4n, den: 8n })
			assert.deepEqual(a, { num: 2n, den: 4n })
			assert.deepEqual(b, { num: 6n, den: 4n })
			assert.equal(coeffs.length, 2)
		})
	})

	describe('independent mathematical cross-checks', () => {
		it('satisfies Fundamental Theorem of Calculus: d/dx (∫ P(x) dx) === P(x)', () => {
			const polynomials = [
				[q(7, 11)],
				[q(-3, 5), q(0, 1), q(17, 13), q(-8, 9), q(25, 4)],
				[q(1, 2), q(-1, 3), q(1, 4), q(-1, 5), q(1, 6), q(-1, 7)],
			]

			for (const poly of polynomials) {
				const antiDefault = integralRationalIterative(poly)
				const antiWithC = integralRationalIterative(poly, q(-42, 17))
				antiDefault.forEach(assertCanonicalRational)
				antiWithC.forEach(assertCanonicalRational)

				assert.deepEqual(differentiatePoly(antiDefault), poly.map(normalize))
				assert.deepEqual(differentiatePoly(antiWithC), poly.map(normalize))
			}
		})

		it('satisfies interval additivity: ∫_a^b P + ∫_b^c P === ∫_a^c P', () => {
			const poly = [q(5, 7), q(-3, 2), q(4, 9), q(-11, 6), q(2, 5)]
			const triples = [
				[q(-2, 3), q(1, 5), q(7, 4)],
				[q(3, 2), q(-4, 5), q(1, 7)],
				[q(0, 1), q(5, 3), q(5, 3)],
			]

			for (const [a, b, c] of triples) {
				const ab = integralRationalIterative(poly, a, b)
				const bc = integralRationalIterative(poly, b, c)
				const ac = integralRationalIterative(poly, a, c)
				assertCanonicalRational(ab)
				assertCanonicalRational(bc)
				assertCanonicalRational(ac)
				assert.deepEqual(addQ(ab, bc), ac)
			}
		})

		it('satisfies linearity: ∫_a^b (αP + βQ) === α∫_a^b P + β∫_a^b Q', () => {
			const P = [q(1, 2), q(-3, 4), q(5, 6), q(-7, 8)]
			const Q = [q(2, 3), q(4, 5), q(-1, 7), q(9, 11)]
			const alpha = q(-5, 3)
			const beta = q(7, 4)
			const a = q(-3, 5)
			const b = q(8, 7)

			const combined = P.map((p, i) => addQ(mulQ(alpha, p), mulQ(beta, Q[i])))
			const lhs = integralRationalIterative(combined, a, b)
			const rhs = addQ(
				mulQ(alpha, integralRationalIterative(P, a, b)),
				mulQ(beta, integralRationalIterative(Q, a, b))
			)
			assertCanonicalRational(lhs)
			assert.deepEqual(lhs, rhs)
		})

		it('agrees with independent numerical Simpson integration', () => {
			const poly = [q(1, 3), q(-5, 4), q(7, 5), q(-2, 3), q(1, 6), q(-1, 10)]
			const a = q(-3, 4)
			const b = q(5, 3)

			const exact = integralRationalIterative(poly, a, b)
			assertCanonicalRational(exact)
			const exactFloat = Number(exact.num) / Number(exact.den)
			const approxFloat = simpsonIntegral(
				poly,
				Number(a.num) / Number(a.den),
				Number(b.num) / Number(b.den),
				2000
			)

			assert.ok(
				Math.abs(exactFloat - approxFloat) < 1e-11,
				`expected exact (${exactFloat}) to match Simpson (${approxFloat})`
			)
		})
	})

	describe('input validation', () => {
		it('rejects non-array coeffs and sparse arrays', () => {
			for (const bad of [null, undefined, 42, '123', { num: 1n, den: 1n }]) {
				assert.throws(() => integralRationalIterative(bad), TypeError)
			}
			const sparse = new Array(2)
			sparse[0] = q(1)
			assert.throws(() => integralRationalIterative(sparse), TypeError)
		})

		it('rejects invalid rational objects in coeffs, constant, and bounds', () => {
			assert.throws(() => integralRationalIterative([null]), TypeError)
			assert.throws(() => integralRationalIterative([[1n, 2n]]), TypeError)
			assert.throws(() => integralRationalIterative([{ num: 1, den: 2n }]), TypeError)
			assert.throws(() => integralRationalIterative([{ num: 1n, den: 2 }]), TypeError)
			assert.throws(() => integralRationalIterative([{ num: 1n }]), TypeError)

			assert.throws(() => integralRationalIterative([q(1)], { num: 1, den: 1n }), TypeError)
			assert.throws(() => integralRationalIterative([q(1)], q(0), { num: 1n, den: '2' }), TypeError)
			assert.throws(() => integralRationalIterative([q(1)], undefined, q(1)), TypeError)
		})

		it('rejects zero denominators with RangeError', () => {
			assert.throws(() => integralRationalIterative([{ num: 1n, den: 0n }]), RangeError)
			assert.throws(() => integralRationalIterative([q(1)], { num: 0n, den: 0n }), RangeError)
			assert.throws(() => integralRationalIterative([q(1)], { num: 1n, den: 0n }, q(2)), RangeError)
			assert.throws(() => integralRationalIterative([q(1)], q(0), { num: 3n, den: 0n }), RangeError)
		})
	})
})
