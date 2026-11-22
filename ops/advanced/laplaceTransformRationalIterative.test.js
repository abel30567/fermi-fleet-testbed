import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { laplaceTransformRationalIterative } from './laplaceTransformRationalIterative.js'

/**
 * Helper to construct exact rational objects cleanly in tests.
 */
function rat(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) }
}

function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function normalizeRat(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

function addRat(a, b) {
	return normalizeRat(a.num * b.den + b.num * a.den, a.den * b.den)
}

function subRat(a, b) {
	return normalizeRat(a.num * b.den - b.num * a.den, a.den * b.den)
}

function mulRat(a, b) {
	return normalizeRat(a.num * b.num, a.den * b.den)
}

function divRat(a, b) {
	return normalizeRat(a.num * b.den, a.den * b.num)
}

function assertLowestTerms(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	} else {
		assert.equal(gcdBigInt(r.num, r.den), 1n)
	}
}

describe('laplaceTransformRationalIterative', () => {
	describe('normal cases', () => {
		test('constant polynomial L{c}(s) = c / s', () => {
			assert.deepEqual(laplaceTransformRationalIterative([rat(1)], rat(1)), rat(1, 1))
			assert.deepEqual(laplaceTransformRationalIterative([rat(5)], rat(2)), rat(5, 2))
			assert.deepEqual(laplaceTransformRationalIterative([rat(-7, 3)], rat(4, 5)), rat(-35, 12))
		})

		test('monomials L{t^k}(s) = k! / s^{k+1}', () => {
			// L{t}(2) = 1! / 2^2 = 1/4
			assert.deepEqual(laplaceTransformRationalIterative([rat(0), rat(1)], rat(2)), rat(1, 4))
			// L{t^2}(3) = 2! / 3^3 = 2/27
			assert.deepEqual(
				laplaceTransformRationalIterative([rat(0), rat(0), rat(1)], rat(3)),
				rat(2, 27),
			)
			// L{t^4}(2/3) = 24 / (2/3)^5 = 24 * 243 / 32 = 3 * 243 / 4 = 729/4
			assert.deepEqual(
				laplaceTransformRationalIterative([rat(0), rat(0), rat(0), rat(0), rat(1)], rat(2, 3)),
				rat(729, 4),
			)
		})

		test('multi-term rational polynomial evaluated at fractional s', () => {
			// p(t) = 1/2 - (3/4)t + (5/6)t^2 + (7/8)t^3 at s = 2/3
			// Term 0: (1/2) * 1 / (2/3) = 3/4
			// Term 1: (-3/4) * 1 / (4/9) = -27/16
			// Term 2: (5/6) * 2 / (8/27) = (5/3) * (27/8) = 45/8
			// Term 3: (7/8) * 6 / (16/81) = (21/4) * (81/16) = 1701/64
			// Sum = (48 - 108 + 360 + 1701) / 64 = 2001 / 64
			const coeffs = [rat(1, 2), rat(-3, 4), rat(5, 6), rat(7, 8)]
			const result = laplaceTransformRationalIterative(coeffs, rat(2, 3))
			assert.deepEqual(result, rat(2001, 64))
			assertLowestTerms(result)
		})

		test('normalizes unreduced and negative-denominator inputs', () => {
			// c0 = 4 / -6 = -2/3, c1 = -10 / -15 = 2/3, s = -6 / -4 = 3/2
			// L = (-2/3)/(3/2) + (2/3)/(9/4) = -4/9 + 8/27 = -4/27
			const result = laplaceTransformRationalIterative([rat(4, -6), rat(-10, -15)], rat(-6, -4))
			assert.deepEqual(result, rat(-4, 27))
			assertLowestTerms(result)
		})

		test('handles high-degree polynomials beyond Number.MAX_SAFE_INTEGER exactly', () => {
			// p(t) = t^25 at s = 1 => 25! = 15511210043330985984000000n
			const coeffs = Array.from({ length: 26 }, (_, k) => (k === 25 ? rat(1) : rat(0)))
			const result = laplaceTransformRationalIterative(coeffs, rat(1))
			assert.deepEqual(result, { num: 15511210043330985984000000n, den: 1n })
			assertLowestTerms(result)
		})
	})

	describe('edge cases', () => {
		test('empty polynomial returns exact zero { num: 0n, den: 1n }', () => {
			const result = laplaceTransformRationalIterative([], rat(3, 7))
			assert.deepEqual(result, { num: 0n, den: 1n })
			assertLowestTerms(result)
		})

		test('all-zero polynomial returns exact zero { num: 0n, den: 1n }', () => {
			const result = laplaceTransformRationalIterative([rat(0, 1), rat(0, -5), rat(0, 9)], rat(2))
			assert.deepEqual(result, { num: 0n, den: 1n })
			assertLowestTerms(result)
		})

		test('trailing zero coefficients do not alter the result', () => {
			const base = [rat(2, 3), rat(-5, 7), rat(11, 13)]
			const padded = [...base, rat(0), rat(0, 4), rat(0, -9)]
			assert.deepEqual(
				laplaceTransformRationalIterative(padded, rat(5, 4)),
				laplaceTransformRationalIterative(base, rat(5, 4)),
			)
		})

		test('exact cancellation of terms yields canonical zero { num: 0n, den: 1n }', () => {
			// p(t) = 1 - (5/3) t evaluated at s = 5/3:
			// L{p}(5/3) = 1/(5/3) - (5/3)/(5/3)^2 = 3/5 - 3/5 = 0
			const result = laplaceTransformRationalIterative([rat(1), rat(-5, 3)], rat(5, 3))
			assert.deepEqual(result, { num: 0n, den: 1n })
			assertLowestTerms(result)
		})

		test('very small and very large positive s remain exact', () => {
			// L{1 + t}(1 / 10^9) = 10^9 + 10^18
			const smallS = laplaceTransformRationalIterative([rat(1), rat(1)], rat(1, 10n ** 9n))
			assert.deepEqual(smallS, rat(10n ** 9n + 10n ** 18n, 1n))
			assertLowestTerms(smallS)

			// L{1 + t}(10^9) = 1/10^9 + 1/10^18 = (10^9 + 1) / 10^18
			const largeS = laplaceTransformRationalIterative([rat(1), rat(1)], rat(10n ** 9n, 1n))
			assert.deepEqual(largeS, rat(10n ** 9n + 1n, 10n ** 18n))
			assertLowestTerms(largeS)
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-array coefficients', () => {
			for (const bad of [null, undefined, 42, '123', {}, rat(1)]) {
				assert.throws(() => laplaceTransformRationalIterative(bad, rat(1)), TypeError)
			}
		})

		test('throws TypeError for sparse arrays or invalid coefficient elements', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [, rat(1)]
			assert.throws(() => laplaceTransformRationalIterative(sparse, rat(1)), TypeError)

			for (const badElem of [
				null,
				undefined,
				1,
				1n,
				'1/2',
				[1n, 2n],
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: 1n },
				{ den: 1n },
			]) {
				assert.throws(() => laplaceTransformRationalIterative([badElem], rat(1)), TypeError)
			}
		})

		test('throws RangeError for zero denominator in coefficients', () => {
			assert.throws(
				() => laplaceTransformRationalIterative([rat(1), { num: 3n, den: 0n }], rat(2)),
				RangeError,
			)
			assert.throws(
				() => laplaceTransformRationalIterative([{ num: 0n, den: 0n }], rat(2)),
				RangeError,
			)
		})

		test('throws TypeError for invalid s', () => {
			for (const badS of [
				null,
				undefined,
				2,
				2n,
				'2',
				[2n, 1n],
				{ num: 2, den: 1n },
				{ num: 2n, den: 1 },
				{ num: 2n },
				{ den: 1n },
			]) {
				assert.throws(() => laplaceTransformRationalIterative([rat(1)], badS), TypeError)
				// Also validates s even when coefficients is empty
				assert.throws(() => laplaceTransformRationalIterative([], badS), TypeError)
			}
		})

		test('throws RangeError for zero denominator in s or non-positive s <= 0', () => {
			assert.throws(
				() => laplaceTransformRationalIterative([rat(1)], { num: 1n, den: 0n }),
				RangeError,
			)
			assert.throws(() => laplaceTransformRationalIterative([rat(1)], rat(0, 1)), RangeError)
			assert.throws(() => laplaceTransformRationalIterative([rat(1)], rat(-1, 2)), RangeError)
			assert.throws(() => laplaceTransformRationalIterative([rat(1)], rat(3, -4)), RangeError)
			// Also validates s > 0 even for empty polynomial
			assert.throws(() => laplaceTransformRationalIterative([], rat(0, 1)), RangeError)
			assert.throws(() => laplaceTransformRationalIterative([], rat(-5, 1)), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		test('linearity: L{alpha*p + beta*q}(s) === alpha*L{p}(s) + beta*L{q}(s)', () => {
			const p = [rat(3, 5), rat(-2, 7), rat(4, 9), rat(1, 2)]
			const q = [rat(-1, 4), rat(5, 3), rat(0), rat(-7, 11), rat(2, 5)]
			const alpha = rat(7, 13)
			const beta = rat(-11, 6)
			const s = rat(5, 3)

			const maxLen = Math.max(p.length, q.length)
			const combined = Array.from({ length: maxLen }, (_, k) => {
				const pk = p[k] ?? rat(0)
				const qk = q[k] ?? rat(0)
				return addRat(mulRat(alpha, pk), mulRat(beta, qk))
			})

			const lhs = laplaceTransformRationalIterative(combined, s)
			const rhs = addRat(
				mulRat(alpha, laplaceTransformRationalIterative(p, s)),
				mulRat(beta, laplaceTransformRationalIterative(q, s)),
			)
			assert.deepEqual(lhs, rhs)
			assertLowestTerms(lhs)
		})

		test('derivative identity: L{p\'}(s) === s * L{p}(s) - p(0)', () => {
			const p = [rat(5, 6), rat(-3, 4), rat(7, 2), rat(-1, 3), rat(2, 9), rat(11, 12)]
			const pPrime = p.slice(1).map((c, idx) => mulRat(c, rat(idx + 1)))

			for (const s of [rat(1, 2), rat(1), rat(7, 4), rat(13, 5)]) {
				const lhs = laplaceTransformRationalIterative(pPrime, s)
				const rhs = subRat(mulRat(s, laplaceTransformRationalIterative(p, s)), p[0])
				assert.deepEqual(lhs, rhs)
				assertLowestTerms(lhs)
			}
		})

		test('integration identity: L{integral_0^t p(u) du}(s) === L{p}(s) / s', () => {
			const p = [rat(2, 3), rat(-5, 8), rat(1, 7), rat(9, 10)]
			// Integral of sum c_k t^k is sum (c_k / (k+1)) t^{k+1}
			const integrated = [rat(0), ...p.map((c, k) => divRat(c, rat(k + 1)))]

			for (const s of [rat(3, 5), rat(2), rat(11, 3)]) {
				const lhs = laplaceTransformRationalIterative(integrated, s)
				const rhs = divRat(laplaceTransformRationalIterative(p, s), s)
				assert.deepEqual(lhs, rhs)
				assertLowestTerms(lhs)
			}
		})

		test('matches independent backward Horner recurrence', () => {
			// L{p}(s) = (1/s) * (c_0 + (1/s) * (c_1 + (2/s) * (c_2 + ... + (n/s) * c_n)))
			function hornerLaplace(coeffs, s) {
				if (coeffs.length === 0) return rat(0)
				let acc = coeffs[coeffs.length - 1]
				for (let k = coeffs.length - 1; k >= 1; k--) {
					acc = addRat(coeffs[k - 1], mulRat(divRat(rat(k), s), acc))
				}
				return divRat(acc, s)
			}

			const polynomials = [
				[rat(1)],
				[rat(3, 2), rat(-4, 5), rat(7, 11), rat(-1, 13), rat(2, 3), rat(5, 7)],
				[rat(0), rat(0), rat(-9, 4), rat(0), rat(3, 8), rat(-1, 2), rat(4, 9)],
			]
			const sValues = [rat(1, 3), rat(3, 2), rat(7, 4)]

			for (const poly of polynomials) {
				for (const s of sValues) {
					const actual = laplaceTransformRationalIterative(poly, s)
					const expected = hornerLaplace(poly, s)
					assert.deepEqual(actual, expected)
					assertLowestTerms(actual)
				}
			}
		})

		test('matches numerical quadrature (composite Simpson rule) for integral_0^inf p(t) e^{-st} dt', () => {
			// p(t) = 1/2 - (3/4) t + (2/3) t^2 - (1/5) t^3 + (1/12) t^4
			const coeffs = [rat(1, 2), rat(-3, 4), rat(2, 3), rat(-1, 5), rat(1, 12)]
			const floatCoeffs = coeffs.map((c) => Number(c.num) / Number(c.den))

			function evalPoly(t) {
				let val = 0
				for (let k = floatCoeffs.length - 1; k >= 0; k--) {
					val = val * t + floatCoeffs[k]
				}
				return val
			}

			function simpsonLaplace(sFloat, upperBound, intervals) {
				const h = upperBound / intervals
				const f = (t) => evalPoly(t) * Math.exp(-sFloat * t)
				let sum = f(0) + f(upperBound)
				for (let i = 1; i < intervals; i++) {
					const t = i * h
					sum += (i % 2 === 0 ? 2 : 4) * f(t)
				}
				return (sum * h) / 3
			}

			for (const s of [rat(3, 2), rat(2), rat(7, 3)]) {
				const exact = laplaceTransformRationalIterative(coeffs, s)
				const exactFloat = Number(exact.num) / Number(exact.den)
				const sFloat = Number(s.num) / Number(s.den)
				// Choose upper bound so exp(-s * T) < 1e-18 (T = 50 / s)
				const approx = simpsonLaplace(sFloat, 50 / sFloat, 20000)
				assert.ok(
					Math.abs(exactFloat - approx) < 1e-9,
					`s=${sFloat}: exact=${exactFloat}, approx=${approx}`,
				)
			}
		})
	})
})
