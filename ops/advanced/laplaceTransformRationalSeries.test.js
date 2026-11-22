import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { laplaceTransformRationalSeries } from './laplaceTransformRationalSeries.js'

function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

function rat(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) }
}

function normRat(num, den) {
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

function rAdd(a, b) {
	return normRat(a.num * b.den + b.num * a.den, a.den * b.den)
}

function rSub(a, b) {
	return normRat(a.num * b.den - b.num * a.den, a.den * b.den)
}

function rMul(a, b) {
	return normRat(a.num * b.num, a.den * b.den)
}

function rDiv(a, b) {
	return normRat(a.num * b.den, a.den * b.num)
}

function assertReduced(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n, 'zero must be represented as { num: 0n, den: 1n }')
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `expected reduced fraction, got ${r.num}/${r.den}`)
	}
}

function ratToNumber(r) {
	return Number(r.num) / Number(r.den)
}

/**
 * Independent naive reference: computes sum_{k=0}^{n} a_k * k! / (s - a)^(k + 1)
 * directly using explicit BigInt factorials and exponentiation.
 */
function naiveLaplace(coeffs, s, shift = { num: 0n, den: 1n }) {
	const u = rSub(normRat(s.num, s.den), normRat(shift.num, shift.den))
	let sum = { num: 0n, den: 1n }
	let fact = 1n
	let uPowNum = u.num
	let uPowDen = u.den
	for (let k = 0; k < coeffs.length; k++) {
		if (k > 0) {
			fact *= BigInt(k)
			uPowNum *= u.num
			uPowDen *= u.den
		}
		const ak = normRat(coeffs[k].num, coeffs[k].den)
		// a_k * k! / u^(k+1) = (ak.num * fact * uPowDen) / (ak.den * uPowNum)
		const term = normRat(ak.num * fact * uPowDen, ak.den * uPowNum)
		sum = rAdd(sum, term)
	}
	return sum
}

/**
 * Evaluate polynomial f(t) = sum a_k t^k in floating point via Horner's method.
 */
function evalPolyFloat(coeffs, t) {
	let acc = 0
	for (let k = coeffs.length - 1; k >= 0; k--) {
		acc = acc * t + ratToNumber(coeffs[k])
	}
	return acc
}

/**
 * Independent direct numerical integration via composite Simpson's rule on [0, T]:
 * integral_0^T exp(-(s - shift) * t) * f(t) dt, choosing T = 40 / (s - shift)
 * so the neglected tail is O(e^-40).
 */
function simpsonLaplace(coeffs, sVal, shiftVal = 0, panels = 10000) {
	const rate = sVal - shiftVal
	const upper = 40 / rate
	const h = upper / panels
	const integrand = (t) => Math.exp(-rate * t) * evalPolyFloat(coeffs, t)
	let sum = integrand(0) + integrand(upper)
	for (let i = 1; i < panels; i++) {
		const t = i * h
		sum += (i % 2 === 0 ? 2 : 4) * integrand(t)
	}
	return (sum * h) / 3
}

/**
 * Evaluate Laguerre polynomial L_m(x) and L_{m-1}(x) via the three-term recurrence.
 */
function laguerrePair(m, x) {
	if (m === 0) return [1, 0]
	let lPrev = 1
	let lCurr = 1 - x
	for (let k = 1; k < m; k++) {
		const lNext = ((2 * k + 1 - x) * lCurr - k * lPrev) / (k + 1)
		lPrev = lCurr
		lCurr = lNext
	}
	return [lCurr, lPrev]
}

/**
 * Compute m-point Gauss-Laguerre quadrature nodes and weights directly from
 * roots of L_m(x) using sign-change bracketing and Newton-Raphson refinement.
 */
function gaussLaguerreRule(m) {
	const nodes = []
	const step = 0.05
	const maxX = 4 * m + 10
	let prevX = 1e-9
	let prevVal = laguerrePair(m, prevX)[0]

	for (let x = step; x <= maxX && nodes.length < m; x += step) {
		const val = laguerrePair(m, x)[0]
		if (prevVal * val <= 0) {
			let r = 0.5 * (prevX + x)
			for (let iter = 0; iter < 50; iter++) {
				const [lm, lm1] = laguerrePair(m, r)
				const dlm = (m / r) * (lm - lm1)
				const next = r - lm / dlm
				if (Math.abs(next - r) < 1e-15) {
					r = next
					break
				}
				r = next
			}
			nodes.push(r)
		}
		prevX = x
		prevVal = val
	}

	const weights = nodes.map((xi) => {
		const [lNext] = laguerrePair(m + 1, xi)
		return xi / ((m + 1) * (m + 1) * lNext * lNext)
	})
	return { nodes, weights }
}

/**
 * Gauss-Laguerre quadrature for integral_0^infinity exp(-(s - a)*t) * f(t) dt
 * via substitution u = (s - a)*t. Exact for polynomials of degree <= 2m - 1.
 */
function gaussLaguerreLaplace(coeffs, sVal, shiftVal = 0, rule) {
	const rate = sVal - shiftVal
	let total = 0
	for (let i = 0; i < rule.nodes.length; i++) {
		const u = rule.nodes[i]
		total += rule.weights[i] * evalPolyFloat(coeffs, u / rate)
	}
	return total / rate
}

describe('laplaceTransformRationalSeries', () => {
	describe('known closed-form transforms', () => {
		it('computes L{c}(s) = c / s for constant functions', () => {
			const res = laplaceTransformRationalSeries([rat(5, 3)], rat(2, 1))
			assertReduced(res)
			assert.deepEqual(res, rat(5, 6))

			const neg = laplaceTransformRationalSeries([rat(-7, 4)], rat(3, 5))
			assertReduced(neg)
			assert.deepEqual(neg, rat(-35, 12))
		})

		it('computes L{t^k}(s) = k! / s^(k+1) for monomials including large degree', () => {
			// k = 1: L{t}(s) = 1 / s^2
			assert.deepEqual(
				laplaceTransformRationalSeries([rat(0), rat(1)], rat(3, 2)),
				rat(4, 9),
			)

			// k = 3: L{t^3}(s) = 6 / s^4
			assert.deepEqual(
				laplaceTransformRationalSeries([rat(0), rat(0), rat(0), rat(1)], rat(2, 1)),
				rat(3, 8),
			)

			// k = 20: L{t^20}(3) = 20! / 3^21
			const coeffs20 = Array.from({ length: 21 }, (_, i) => (i === 20 ? rat(1) : rat(0)))
			const res20 = laplaceTransformRationalSeries(coeffs20, rat(3, 1))
			assertReduced(res20)
			const fact20 = 2432902008176640000n
			const pow3_21 = 3n ** 21n
			assert.deepEqual(res20, normRat(fact20, pow3_21))
		})

		it('computes hand-verified mixed-sign fractional polynomials', () => {
			// f(t) = 1/2 - (3/4)t + (5/6)t^2 at s = 3/2
			// = (1/2)/(3/2) - (3/4)*1!/(9/4) + (5/6)*2!/(27/8)
			// = 1/3 - 1/3 + (5/3)*(8/27) = 40/81
			const coeffs = [rat(1, 2), rat(-3, 4), rat(5, 6)]
			const res = laplaceTransformRationalSeries(coeffs, rat(3, 2))
			assertReduced(res)
			assert.deepEqual(res, rat(40, 81))
		})

		it('handles unreduced inputs and negative denominators cleanly', () => {
			// 4 / -6 = -2/3, 6 / 9 = 2/3, evaluated at s = -10 / -4 = 5/2
			const coeffs = [rat(4, -6), rat(6, 9)]
			const res = laplaceTransformRationalSeries(coeffs, rat(-10, -4))
			assertReduced(res)
			// (-2/3)/(5/2) + (2/3)/(25/4) = -4/15 + 8/75 = -12/75 = -4/25
			assert.deepEqual(res, rat(-4, 25))
		})

		it('supports exponential shift (First Shifting Theorem) L{e^(at) f(t)}(s) = F(s - a)', () => {
			// L{e^(2t)}(5) = 1 / (5 - 2) = 1/3
			assert.deepEqual(
				laplaceTransformRationalSeries([rat(1)], rat(5), rat(2)),
				rat(1, 3),
			)

			// L{e^(-3/2 t) * (1 + 2t - t^2)}(1/2) = F(1/2 - (-3/2)) = F(2)
			const coeffs = [rat(1), rat(2), rat(-1)]
			const shifted = laplaceTransformRationalSeries(coeffs, rat(1, 2), rat(-3, 2))
			const direct = laplaceTransformRationalSeries(coeffs, rat(2, 1))
			assertReduced(shifted)
			assert.deepEqual(shifted, direct)
			// 1/2 + 2/4 - 2/8 = 1/2 + 1/2 - 1/4 = 3/4
			assert.deepEqual(shifted, rat(3, 4))
		})
	})

	describe('edge cases', () => {
		it('returns canonical zero { num: 0n, den: 1n } for empty or zero series', () => {
			assert.deepEqual(laplaceTransformRationalSeries([], rat(2, 1)), { num: 0n, den: 1n })
			assert.deepEqual(
				laplaceTransformRationalSeries([rat(0, 1), rat(0, 7), rat(0, -3)], rat(5, 2)),
				{ num: 0n, den: 1n },
			)
		})

		it('ignores trailing zero coefficients without altering the result', () => {
			const base = [rat(3, 5), rat(-1, 2), rat(7, 4)]
			const padded = [...base, rat(0, 1), rat(0, 9), rat(0, -4)]
			const s = rat(7, 3)
			assert.deepEqual(
				laplaceTransformRationalSeries(padded, s),
				laplaceTransformRationalSeries(base, s),
			)
		})

		it('returns canonical zero when non-zero terms cancel exactly', () => {
			// f(t) = 1 - s0 * t at s = s0 => 1/s0 - s0 / s0^2 = 0
			const s0 = rat(11, 7)
			const res = laplaceTransformRationalSeries([rat(1, 1), rat(-11, 7)], s0)
			assertReduced(res)
			assert.deepEqual(res, { num: 0n, den: 1n })
		})

		it('evaluates analytic continuation for negative s (s < shift)', () => {
			// f(t) = 1 + t + t^2 at s = -2 => -1/2 + 1/4 - 2/8 = -1/2
			const coeffs = [rat(1), rat(1), rat(1)]
			const res = laplaceTransformRationalSeries(coeffs, rat(-2, 1))
			assertReduced(res)
			assert.deepEqual(res, rat(-1, 2))

			// Matches naive sum at negative s with shift
			const resShifted = laplaceTransformRationalSeries(coeffs, rat(1, 2), rat(3, 2))
			assert.deepEqual(resShifted, naiveLaplace(coeffs, rat(1, 2), rat(3, 2)))
		})

		it('preserves exact precision at high polynomial degree (k = 30)', () => {
			// Truncated e^t: a_k = 1 / k! => L{sum_{k=0}^30 t^k / k!}(2) = sum_{k=0}^30 1 / 2^(k+1) = (2^31 - 1) / 2^31
			const coeffs = []
			let fact = 1n
			for (let k = 0; k <= 30; k++) {
				if (k > 0) fact *= BigInt(k)
				coeffs.push({ num: 1n, den: fact })
			}
			const res = laplaceTransformRationalSeries(coeffs, rat(2, 1))
			assertReduced(res)
			assert.deepEqual(res, { num: (1n << 31n) - 1n, den: 1n << 31n })
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-Array coeffs', () => {
			for (const bad of [null, undefined, 42, '123', { num: 1n, den: 1n }]) {
				assert.throws(
					() => laplaceTransformRationalSeries(bad, rat(1)),
					TypeError,
				)
			}
		})

		it('throws TypeError for malformed rational coefficients, s, or shift', () => {
			assert.throws(() => laplaceTransformRationalSeries([null], rat(1)), TypeError)
			assert.throws(() => laplaceTransformRationalSeries([{ num: 1, den: 1n }], rat(1)), TypeError)
			assert.throws(() => laplaceTransformRationalSeries([{ num: 1n, den: 1 }], rat(1)), TypeError)
			assert.throws(() => laplaceTransformRationalSeries([rat(1)], null), TypeError)
			assert.throws(() => laplaceTransformRationalSeries([rat(1)], { num: 1, den: 2 }), TypeError)
			assert.throws(() => laplaceTransformRationalSeries([rat(1)], rat(2), null), TypeError)
			assert.throws(() => laplaceTransformRationalSeries([rat(1)], rat(2), { num: 0n }), TypeError)
			// Sparse array hole
			const sparse = new Array(2)
			sparse[1] = rat(1)
			assert.throws(() => laplaceTransformRationalSeries(sparse, rat(2)), TypeError)
		})

		it('throws RangeError for zero denominators', () => {
			assert.throws(() => laplaceTransformRationalSeries([{ num: 1n, den: 0n }], rat(2)), RangeError)
			assert.throws(() => laplaceTransformRationalSeries([rat(1)], { num: 1n, den: 0n }), RangeError)
			assert.throws(
				() => laplaceTransformRationalSeries([rat(1)], rat(2), { num: 1n, den: 0n }),
				RangeError,
			)
		})

		it('throws RangeError at poles where s === shift (including s === 0)', () => {
			assert.throws(() => laplaceTransformRationalSeries([rat(1)], rat(0, 1)), RangeError)
			assert.throws(() => laplaceTransformRationalSeries([], rat(0, 5)), RangeError)
			// Unreduced equivalent rationals: s = 2/4, shift = 1/2
			assert.throws(
				() => laplaceTransformRationalSeries([rat(1), rat(2)], rat(2, 4), rat(1, 2)),
				RangeError,
			)
		})
	})

	describe('cross-checks against independent computations and identities', () => {
		it('matches naive term-by-term factorial/power reference across diverse cases', () => {
			const cases = [
				{ coeffs: [rat(3, 7), rat(-5, 11), rat(13, 4), rat(-2, 9), rat(1, 6)], s: rat(5, 3), shift: rat(0) },
				{ coeffs: [rat(-1, 2), rat(0), rat(4, 5), rat(0), rat(-7, 3), rat(11, 13)], s: rat(9, 4), shift: rat(1, 2) },
				{ coeffs: [rat(100, 3), rat(-50, 7), rat(25, 11)], s: rat(-3, 5), shift: rat(2, 5) },
				{ coeffs: [rat(1, 1), rat(-1, 2), rat(1, 6), rat(-1, 24), rat(1, 120)], s: rat(4, 3), shift: rat(-2, 3) },
			]

			for (const { coeffs, s, shift } of cases) {
				const got = laplaceTransformRationalSeries(coeffs, s, shift)
				const expected = naiveLaplace(coeffs, s, shift)
				assertReduced(got)
				assert.deepEqual(got, expected)
			}
		})

		it('matches direct numerical integration via composite Simpson rule and Gauss-Laguerre quadrature', () => {
			const glRule = gaussLaguerreRule(6)
			assert.equal(glRule.nodes.length, 6)
			// Sanity check Gauss-Laguerre integrates t^k e^{-t} = k! for k = 0..10
			let fact = 1
			for (let k = 0; k <= 10; k++) {
				if (k > 0) fact *= k
				const approx = glRule.nodes.reduce((acc, x, i) => acc + glRule.weights[i] * x ** k, 0)
				assert.ok(Math.abs(approx - fact) / fact < 1e-12, `GL sanity failed at k=${k}`)
			}

			const testCases = [
				{ coeffs: [rat(1, 2), rat(-3, 4), rat(5, 6), rat(-1, 8)], s: rat(5, 2), shift: rat(0) },
				{ coeffs: [rat(2, 1), rat(1, 3), rat(-2, 5), rat(1, 7), rat(1, 12)], s: rat(3, 1), shift: rat(1, 2) },
				{ coeffs: [rat(-3, 2), rat(4, 3), rat(-1, 2), rat(1, 6), rat(-1, 24), rat(1, 60)], s: rat(2, 1), shift: rat(-1, 1) },
			]

			for (const { coeffs, s, shift } of testCases) {
				const exact = laplaceTransformRationalSeries(coeffs, s, shift)
				const exactFloat = ratToNumber(exact)
				const sVal = ratToNumber(s)
				const shiftVal = ratToNumber(shift)

				// Gauss-Laguerre is exact for degree <= 11 (2*6 - 1)
				const glApprox = gaussLaguerreLaplace(coeffs, sVal, shiftVal, glRule)
				assert.ok(
					Math.abs(glApprox - exactFloat) < 1e-11 * Math.max(1, Math.abs(exactFloat)),
					`Gauss-Laguerre mismatch: exact=${exactFloat}, gl=${glApprox}`,
				)

				// Composite Simpson's rule directly integrates exp(-(s-a)t) f(t) on [0, 40/(s-a)]
				const simpsonApprox = simpsonLaplace(coeffs, sVal, shiftVal, 10000)
				assert.ok(
					Math.abs(simpsonApprox - exactFloat) < 1e-10 * Math.max(1, Math.abs(exactFloat)),
					`Simpson mismatch: exact=${exactFloat}, simpson=${simpsonApprox}`,
				)
			}
		})

		it('satisfies exact linearity: L{alpha*f + beta*g}(s) = alpha*L{f}(s) + beta*L{g}(s)', () => {
			const f = [rat(2, 3), rat(-5, 4), rat(1, 6), rat(7, 2)]
			const g = [rat(-1, 5), rat(3, 2), rat(-4, 7), rat(0), rat(5, 9)]
			const alpha = rat(7, 11)
			const beta = rat(-13, 5)
			const s = rat(17, 6)

			const maxLen = Math.max(f.length, g.length)
			const combined = Array.from({ length: maxLen }, (_, k) => {
				const fk = k < f.length ? f[k] : rat(0)
				const gk = k < g.length ? g[k] : rat(0)
				return rAdd(rMul(alpha, fk), rMul(beta, gk))
			})

			const lhs = laplaceTransformRationalSeries(combined, s)
			const rhs = rAdd(
				rMul(alpha, laplaceTransformRationalSeries(f, s)),
				rMul(beta, laplaceTransformRationalSeries(g, s)),
			)
			assert.deepEqual(lhs, rhs)
		})

		it('satisfies exact derivative properties: L{f\'}(s) = s*L{f}(s) - f(0) and L{f\'\'}(s) = s^2*L{f}(s) - s*f(0) - f\'(0)', () => {
			const f = [rat(5, 7), rat(-3, 2), rat(4, 9), rat(-1, 5), rat(2, 3)]
			const fPrime = f.slice(1).map((ak, i) => rMul(ak, rat(i + 1)))
			const fDoublePrime = fPrime.slice(1).map((ak, i) => rMul(ak, rat(i + 1)))

			for (const s of [rat(3, 2), rat(7, 4), rat(-5, 3)]) {
				const Lf = laplaceTransformRationalSeries(f, s)
				const Lf1 = laplaceTransformRationalSeries(fPrime, s)
				const Lf2 = laplaceTransformRationalSeries(fDoublePrime, s)

				// L{f'}(s) = s * L{f}(s) - f(0)
				assert.deepEqual(Lf1, rSub(rMul(s, Lf), f[0]))

				// L{f''}(s) = s^2 * L{f}(s) - s * f(0) - f'(0)
				const sSq = rMul(s, s)
				const expectedLf2 = rSub(rSub(rMul(sSq, Lf), rMul(s, f[0])), fPrime[0])
				assert.deepEqual(Lf2, expectedLf2)
			}
		})

		it('satisfies exact integration property: L{integral_0^t f(tau) dtau}(s) = L{f}(s) / s', () => {
			const f = [rat(3, 4), rat(-2, 5), rat(7, 3), rat(-1, 8)]
			// Antiderivative F(t) = sum_{k=0}^n (a_k / (k+1)) t^(k+1)
			const antideriv = [rat(0), ...f.map((ak, k) => rDiv(ak, rat(k + 1)))]

			for (const s of [rat(5, 2), rat(4, 7), rat(-3, 2)]) {
				const lhs = laplaceTransformRationalSeries(antideriv, s)
				const rhs = rDiv(laplaceTransformRationalSeries(f, s), s)
				assert.deepEqual(lhs, rhs)
			}
		})

		it('satisfies exact time-scaling property: L{f(c*t)}(s) = (1/c) * L{f}(s / c)', () => {
			const f = [rat(1, 3), rat(-2, 7), rat(5, 2), rat(-3, 4)]
			const c = rat(3, 5)
			const s = rat(11, 4)

			// f(c*t) has coefficients a_k * c^k
			let cPow = rat(1)
			const scaled = f.map((ak, k) => {
				if (k > 0) cPow = rMul(cPow, c)
				return rMul(ak, cPow)
			})

			const lhs = laplaceTransformRationalSeries(scaled, s)
			const rhs = rDiv(laplaceTransformRationalSeries(f, rDiv(s, c)), c)
			assert.deepEqual(lhs, rhs)
		})

		it('satisfies exact frequency-differentiation property: L{t * f(t)}(s) = -d/ds L{f}(s)', () => {
			const f = [rat(2, 5), rat(-3, 7), rat(4, 3), rat(-1, 2)]
			const tTimesF = [rat(0), ...f]
			const s = rat(5, 2)

			// Exact symbolic derivative of F(s) = sum a_k k! / s^(k+1) is
			// F'(s) = sum -(k+1) a_k k! / s^(k+2), so -F'(s) = sum a_k (k+1)! / s^(k+2)
			const lhs = laplaceTransformRationalSeries(tTimesF, s)

			// Independent exact check via central rational difference of F(s + h) - F(s - h) / (2h)
			// using tiny rational h = 1 / 10^9 so truncation error is O(h^2) ~ 10^-18
			const h = rat(1n, 1000000000n)
			const fPlus = laplaceTransformRationalSeries(f, rAdd(s, h))
			const fMinus = laplaceTransformRationalSeries(f, rSub(s, h))
			const negDerivApprox = ratToNumber(rDiv(rSub(fMinus, fPlus), rMul(rat(2), h)))

			assert.ok(
				Math.abs(ratToNumber(lhs) - negDerivApprox) < 1e-12,
				`frequency-differentiation mismatch: exact=${ratToNumber(lhs)}, approx=${negDerivApprox}`,
			)
		})

		it('matches exact geometric series closed form for truncated cos(t) Taylor series', () => {
			// Truncated cos(t) = sum_{m=0}^{N} (-1)^m t^(2m) / (2m)!
			// L{trunc cos}(s) = sum_{m=0}^{N} (-1)^m / s^(2m+1) = (1/s) * (1 - (-1/s^2)^(N+1)) / (1 + 1/s^2)
			const N = 8
			const coeffs = []
			let fact = 1n
			for (let k = 0; k <= 2 * N; k++) {
				if (k > 0) fact *= BigInt(k)
				if (k % 2 === 0) {
					const m = k / 2
					coeffs.push({ num: m % 2 === 0 ? 1n : -1n, den: fact })
				} else {
					coeffs.push(rat(0))
				}
			}

			const s = rat(2, 1) // s^2 = 4, ratio r = -1/4
			const got = laplaceTransformRationalSeries(coeffs, s)
			// Closed form: (1/2) * (1 - (-1/4)^9) / (5/4) = (2/5) * (1 + 1/4^9) = (2 * (4^9 + 1)) / (5 * 4^9)
			const pow4_9 = 4n ** 9n
			const expected = normRat(2n * (pow4_9 + 1n), 5n * pow4_9)
			assertReduced(got)
			assert.deepEqual(got, expected)
		})
	})
})
