import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { laplaceTransformComplexSeries } from './laplaceTransformComplexSeries.js'

/**
 * Helper to construct a complex number `{ re, im }`.
 */
function c(re, im = 0) {
	return { re, im }
}

/**
 * Complex arithmetic helpers for independent test references.
 */
function cAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function cSub(a, b) {
	return { re: a.re - b.re, im: a.im - b.im }
}

function cMul(a, b) {
	return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
}

function cDiv(a, b) {
	const d = b.re * b.re + b.im * b.im
	return {
		re: (a.re * b.re + a.im * b.im) / d,
		im: (a.im * b.re - a.re * b.im) / d,
	}
}

function cExp(z) {
	const r = Math.exp(z.re)
	return { re: r * Math.cos(z.im), im: r * Math.sin(z.im) }
}

function cAbs(z) {
	return Math.hypot(z.re, z.im)
}

function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	const err = cAbs(cSub(actual, expected))
	const scale = Math.max(1, cAbs(expected))
	assert.ok(
		err <= tol * scale,
		`${label ? label + ': ' : ''}expected (${expected.re}, ${expected.im}), got (${actual.re}, ${actual.im}), relErr=${err / scale}`
	)
}

/**
 * Independent numerical integration via composite Simpson's rule for:
 *   integral_{a}^{b} integrand(t) dt
 * returning a complex `{ re, im }` approximation.
 */
function compositeSimpsonComplex(integrand, a, b, n) {
	const h = (b - a) / n
	let sumRe = 0
	let sumIm = 0
	for (let i = 0; i <= n; i++) {
		const t = a + i * h
		const w = i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2
		const val = integrand(t)
		sumRe += w * val.re
		sumIm += w * val.im
	}
	return { re: (sumRe * h) / 3, im: (sumIm * h) / 3 }
}

/**
 * Evaluates standard Laguerre polynomial L_n(x) and L_{n-1}(x) via three-term recurrence.
 */
function laguerrePair(n, x) {
	let lPrev = 1
	let lCurr = 1 - x
	for (let k = 2; k <= n; k++) {
		const lNext = ((2 * k - 1 - x) * lCurr - (k - 1) * lPrev) / k
		lPrev = lCurr
		lCurr = lNext
	}
	return { ln: lCurr, lPrev }
}

/**
 * Computes n-point Gauss-Laguerre quadrature nodes and weights for
 *   integral_0^infty g(u) * exp(-u) du ≈ sum_j w_j * g(x_j)
 * by finding all n roots of L_n(x) via bracketed Newton-Raphson.
 */
function gaussLaguerreRule(n) {
	// Bracket all roots of L_n(x) inside (0, 4n + 2) using fine sign-change scanning.
	const maxUpper = 4 * n + 2
	const steps = 4000
	const dx = maxUpper / steps
	const brackets = []
	let prevX = 1e-12
	let prevVal = laguerrePair(n, prevX).ln
	for (let i = 1; i <= steps; i++) {
		const currX = i * dx
		const currVal = laguerrePair(n, currX).ln
		if (prevVal * currVal <= 0) {
			brackets.push([prevX, currX])
			if (brackets.length === n) break
		}
		prevX = currX
		prevVal = currVal
	}
	assert.equal(brackets.length, n, 'should locate all n Laguerre roots')

	const nodes = []
	const weights = []
	for (const [loInit, hiInit] of brackets) {
		let lo = loInit
		let hi = hiInit
		let x = 0.5 * (lo + hi)
		const fLo = laguerrePair(n, lo).ln
		for (let iter = 0; iter < 50; iter++) {
			const { ln, lPrev } = laguerrePair(n, x)
			if (Math.abs(ln) < 1e-15) break
			// Update bracket
			if (fLo * ln <= 0) hi = x
			else lo = x
			// Derivative identity: L_n'(x) = n * (L_n(x) - L_{n-1}(x)) / x
			const deriv = (n * (ln - lPrev)) / x
			const nextX = x - ln / deriv
			x = nextX > lo && nextX < hi ? nextX : 0.5 * (lo + hi)
		}
		const lNext = laguerrePair(n + 1, x).ln
		const weight = x / ((n + 1) * (n + 1) * lNext * lNext)
		nodes.push(x)
		weights.push(weight)
	}
	return { nodes, weights }
}

/**
 * Evaluates polynomial f(t) = sum_k c_k t^k using Horner's rule.
 */
function evalPolyComplex(coeffs, t) {
	let acc = c(0, 0)
	for (let k = coeffs.length - 1; k >= 0; k--) {
		acc = { re: acc.re * t + coeffs[k].re, im: acc.im * t + coeffs[k].im }
	}
	return acc
}

describe('laplaceTransformComplexSeries', () => {
	describe('known analytic Laplace pairs', () => {
		test('constant 1 -> 1 / s for real and complex s', () => {
			for (const s of [c(1, 0), c(2.5, 0), c(3, 4), c(0.5, -2.25)]) {
				const got = laplaceTransformComplexSeries([c(1, 0)], s)
				const expected = cDiv(c(1, 0), s)
				assertComplexClose(got, expected, 1e-14, `1/s at (${s.re}, ${s.im})`)
			}
		})

		test('monomials t^k -> k! / s^{k+1}', () => {
			const s = c(2, -1.5)
			let factorial = 1
			let sPow = s
			for (let k = 0; k <= 8; k++) {
				if (k > 0) {
					factorial *= k
					sPow = cMul(sPow, s)
				}
				const coeffs = Array.from({ length: k + 1 }, (_, idx) => (idx === k ? c(1, 0) : c(0, 0)))
				const got = laplaceTransformComplexSeries(coeffs, s)
				const expected = cDiv(c(factorial, 0), sPow)
				assertComplexClose(got, expected, 1e-13, `t^${k}`)
			}
		})

		test('exponential e^{at} -> 1 / (s - a) via truncated Maclaurin power series', () => {
			const a = c(0.4, -0.7)
			const s = c(3.2, 1.5) // |s| >> |a|, series converges rapidly
			const N = 45
			const coeffs = []
			let aPow = c(1, 0)
			let fact = 1
			for (let k = 0; k < N; k++) {
				if (k > 0) {
					aPow = cMul(aPow, a)
					fact *= k
				}
				coeffs.push(c(aPow.re / fact, aPow.im / fact))
			}
			const got = laplaceTransformComplexSeries(coeffs, s)
			const expected = cDiv(c(1, 0), cSub(s, a))
			assertComplexClose(got, expected, 1e-13, 'e^{at} Maclaurin series')
		})

		test('exponential e^{at} and t^n e^{at} via options.shift exact identity', () => {
			const a = c(-1.2, 2.3)
			const s = c(0.8, -0.5) // Re(s - a) = 2.0 > 0, even though |s| < |a|
			const gotExp = laplaceTransformComplexSeries([c(1, 0)], s, { shift: a })
			assertComplexClose(gotExp, cDiv(c(1, 0), cSub(s, a)), 1e-14, 'e^{at} via shift')

			// L{t^3 * e^{at}}(s) = 6 / (s - a)^4
			const w = cSub(s, a)
			const w4 = cMul(cMul(w, w), cMul(w, w))
			const gotPolyExp = laplaceTransformComplexSeries(
				[c(0), c(0), c(0), c(1)],
				s,
				{ shift: a }
			)
			assertComplexClose(gotPolyExp, cDiv(c(6, 0), w4), 1e-13, 't^3 e^{at} via shift')
		})

		test('cos(omega * t) -> s / (s^2 + omega^2) via power series and Euler shift', () => {
			const omega = 1.3
			const s = c(4.1, 2.2) // |s| > omega
			const N = 50
			const coeffs = Array.from({ length: N }, () => c(0, 0))
			let sign = 1
			let omegaPow = 1
			let fact = 1
			for (let m = 0; 2 * m < N; m++) {
				if (m > 0) {
					sign = -sign
					omegaPow *= omega * omega
					fact *= (2 * m - 1) * (2 * m)
				}
				coeffs[2 * m] = c((sign * omegaPow) / fact, 0)
			}
			const expected = cDiv(s, cAdd(cMul(s, s), c(omega * omega, 0)))

			const gotSeries = laplaceTransformComplexSeries(coeffs, s)
			assertComplexClose(gotSeries, expected, 1e-13, 'cos(wt) via Maclaurin series')

			// Also via Euler identity cos(wt) = 0.5 * (e^{iwt} + e^{-iwt}) at smaller |s|
			const sSmall = c(0.5, 0.9)
			const pos = laplaceTransformComplexSeries([c(0.5, 0)], sSmall, { shift: c(0, omega) })
			const neg = laplaceTransformComplexSeries([c(0.5, 0)], sSmall, { shift: c(0, -omega) })
			const expectedSmall = cDiv(sSmall, cAdd(cMul(sSmall, sSmall), c(omega * omega, 0)))
			assertComplexClose(cAdd(pos, neg), expectedSmall, 1e-14, 'cos(wt) via Euler shifts')
		})

		test('sin(omega * t) -> omega / (s^2 + omega^2) via power series', () => {
			const omega = 0.9
			const s = c(3.5, -1.7)
			const N = 46
			const coeffs = Array.from({ length: N }, () => c(0, 0))
			let sign = 1
			let omegaPow = omega
			let fact = 1
			for (let m = 0; 2 * m + 1 < N; m++) {
				if (m > 0) {
					sign = -sign
					omegaPow *= omega * omega
					fact *= 2 * m * (2 * m + 1)
				}
				coeffs[2 * m + 1] = c((sign * omegaPow) / fact, 0)
			}
			const got = laplaceTransformComplexSeries(coeffs, s)
			const expected = cDiv(c(omega, 0), cAdd(cMul(s, s), c(omega * omega, 0)))
			assertComplexClose(got, expected, 1e-13, 'sin(wt) via Maclaurin series')
		})

		test('cosh(a * t) -> s / (s^2 - a^2) and sinh(a * t) -> a / (s^2 - a^2)', () => {
			const a = 0.8
			const s = c(3.0, 1.0)
			const coshCoeffs = Array.from({ length: 40 }, () => c(0, 0))
			const sinhCoeffs = Array.from({ length: 40 }, () => c(0, 0))
			let fact = 1
			let aPow = 1
			for (let k = 0; k < 40; k++) {
				if (k > 0) {
					fact *= k
					aPow *= a
				}
				if (k % 2 === 0) coshCoeffs[k] = c(aPow / fact, 0)
				else sinhCoeffs[k] = c(aPow / fact, 0)
			}
			const denom = cSub(cMul(s, s), c(a * a, 0))
			assertComplexClose(
				laplaceTransformComplexSeries(coshCoeffs, s),
				cDiv(s, denom),
				1e-13,
				'cosh(at)'
			)
			assertComplexClose(
				laplaceTransformComplexSeries(sinhCoeffs, s),
				cDiv(c(a, 0), denom),
				1e-13,
				'sinh(at)'
			)
		})
	})

	describe('fundamental mathematical identities', () => {
		test('linearity: L{alpha * f + beta * g}(s) = alpha * L{f}(s) + beta * L{g}(s)', () => {
			const f = [c(1, -2), c(0.5, 3), c(-1.5, 0.25)]
			const g = [c(-0.75, 1.25), c(2, -1), c(0.3, 0.9), c(-0.2, 0.4)]
			const alpha = c(2.5, -1.1)
			const beta = c(-0.8, 1.7)
			const s = c(2.3, 1.4)

			const combined = Array.from({ length: 4 }, (_, k) => {
				const fk = f[k] ?? c(0, 0)
				const gk = g[k] ?? c(0, 0)
				return cAdd(cMul(alpha, fk), cMul(beta, gk))
			})

			const lhs = laplaceTransformComplexSeries(combined, s)
			const rhs = cAdd(
				cMul(alpha, laplaceTransformComplexSeries(f, s)),
				cMul(beta, laplaceTransformComplexSeries(g, s))
			)
			assertComplexClose(lhs, rhs, 1e-13, 'linearity')
		})

		test('time scaling: L{f(lambda * t)}(s) = (1 / lambda) * F(s / lambda)', () => {
			const coeffs = [c(1.2, -0.5), c(-0.7, 2.1), c(0.3, -0.4), c(0.1, 0.2)]
			const lambda = 2.5
			const scaledCoeffs = coeffs.map((ck, k) => {
				const factor = lambda ** k
				return c(ck.re * factor, ck.im * factor)
			})
			const s = c(3.4, -1.8)
			const lhs = laplaceTransformComplexSeries(scaledCoeffs, s)
			const fScaled = laplaceTransformComplexSeries(coeffs, c(s.re / lambda, s.im / lambda))
			const rhs = c(fScaled.re / lambda, fScaled.im / lambda)
			assertComplexClose(lhs, rhs, 1e-13, 'time scaling')
		})

		test('first shifting theorem: L{e^{a t} f(t)}(s) = F(s - a)', () => {
			const coeffs = [c(2, 1), c(-1, 0.5), c(0.25, -0.75)]
			const a = c(0.7, -1.3)
			const s = c(2.9, 0.6)
			const lhs = laplaceTransformComplexSeries(coeffs, s, { shift: a })
			const rhs = laplaceTransformComplexSeries(coeffs, cSub(s, a))
			assertComplexClose(lhs, rhs, 1e-14, 'first shifting theorem')
		})

		test('second shifting theorem: L{u(t - t0) f(t - t0)}(s) = e^{-s t0} F(s)', () => {
			const coeffs = [c(1, -1), c(0.5, 2), c(-0.2, 0.3)]
			const s = c(1.8, 2.4)
			const delay = 1.25
			const lhs = laplaceTransformComplexSeries(coeffs, s, { delay })
			const f0 = laplaceTransformComplexSeries(coeffs, s)
			const rhs = cMul(cExp(c(-s.re * delay, -s.im * delay)), f0)
			assertComplexClose(lhs, rhs, 1e-14, 'second shifting theorem')
		})

		test('time differentiation: L{f\'(t)}(s) = s * F(s) - f(0)', () => {
			const coeffs = [c(1.5, -0.8), c(-2.1, 1.3), c(0.6, 0.9), c(-0.15, 0.25)]
			// Derivative coefficients: d_k = (k + 1) * c_{k+1}
			const derivCoeffs = coeffs.slice(1).map((ck, idx) => c(ck.re * (idx + 1), ck.im * (idx + 1)))
			const s = c(2.2, -1.9)
			const lhs = laplaceTransformComplexSeries(derivCoeffs, s)
			const rhs = cSub(cMul(s, laplaceTransformComplexSeries(coeffs, s)), coeffs[0])
			assertComplexClose(lhs, rhs, 1e-13, 'time differentiation')
		})

		test('conjugate symmetry for real coefficients: F(conj(s)) = conj(F(s))', () => {
			const coeffs = [c(1), c(-2), c(3.5), c(-0.5)]
			const s = c(1.9, 2.7)
			const fs = laplaceTransformComplexSeries(coeffs, s)
			const fsConj = laplaceTransformComplexSeries(coeffs, c(s.re, -s.im))
			assertComplexClose(fsConj, c(fs.re, -fs.im), 1e-14, 'conjugate symmetry')
		})
	})

	describe('independent numerical quadrature cross-checks', () => {
		test('matches Gauss-Laguerre quadrature to machine precision on complex polynomials at real s', () => {
			const { nodes, weights } = gaussLaguerreRule(8) // exact for polynomials up to degree 15
			const coeffs = [c(1.3, -0.7), c(-0.5, 2.1), c(0.8, 0.4), c(-0.2, 0.6), c(0.05, -0.09)]
			const sigma = 1.75
			// Substitute u = sigma * t => integral_0^inf f(t) e^{-sigma t} dt = (1/sigma) * sum w_j f(u_j / sigma)
			let quadRe = 0
			let quadIm = 0
			for (let j = 0; j < nodes.length; j++) {
				const t = nodes[j] / sigma
				const ft = evalPolyComplex(coeffs, t)
				quadRe += weights[j] * ft.re
				quadIm += weights[j] * ft.im
			}
			const quad = c(quadRe / sigma, quadIm / sigma)
			const exact = laplaceTransformComplexSeries(coeffs, c(sigma, 0))
			assertComplexClose(exact, quad, 1e-13, 'Gauss-Laguerre exact polynomial cross-check')
		})

		test('matches composite Simpson quadrature for complex polynomial at complex s', () => {
			const coeffs = [c(0.8, -1.1), c(1.5, 0.4), c(-0.35, 0.65), c(0.08, -0.12)]
			const s = c(1.6, 2.1)
			const T = 35 // exp(-1.6 * 35) < 5e-25
			const num = compositeSimpsonComplex(
				(t) => cMul(evalPolyComplex(coeffs, t), cExp(c(-s.re * t, -s.im * t))),
				0,
				T,
				10000
			)
			const exact = laplaceTransformComplexSeries(coeffs, s)
			assertComplexClose(exact, num, 1e-10, 'composite Simpson complex polynomial')
		})

		test('matches composite Simpson quadrature with complex shift and time delay', () => {
			const coeffs = [c(1.0, 0.5), c(-0.4, 0.9), c(0.15, -0.25)]
			const shift = c(-0.3, 1.1)
			const delay = 0.75
			const s = c(1.5, -0.8) // Re(s - shift) = 1.8 > 0
			const T = 35 // exp(-1.8 * (35 - 0.75)) < 1e-26
			const num = compositeSimpsonComplex(
				(t) => {
					const tau = t - delay
					const poly = evalPolyComplex(coeffs, tau)
					const expFactor = cExp(cSub(cMul(shift, c(tau, 0)), cMul(s, c(t, 0))))
					return cMul(poly, expFactor)
				},
				delay,
				T,
				10000
			)
			const exact = laplaceTransformComplexSeries(coeffs, s, { shift, delay })
			assertComplexClose(exact, num, 1e-10, 'composite Simpson shifted + delayed')
		})
	})

	describe('edge cases and numerical stability', () => {
		test('empty coefficients and all-zero coefficients return { re: 0, im: 0 } without -0', () => {
			const s = c(2, -3)
			const emptyRes = laplaceTransformComplexSeries([], s)
			assert.deepEqual(emptyRes, { re: 0, im: 0 })
			assert.equal(Object.is(emptyRes.re, -0), false)
			assert.equal(Object.is(emptyRes.im, -0), false)

			const zeroRes = laplaceTransformComplexSeries([c(0, 0), c(0, 0)], s)
			assert.deepEqual(zeroRes, { re: 0, im: 0 })
			assert.equal(Object.is(zeroRes.re, -0), false)
			assert.equal(Object.is(zeroRes.im, -0), false)
		})

		test('trailing zero coefficients do not alter the result', () => {
			const s = c(1.5, 2.5)
			const base = [c(1, -2), c(0.5, 0.25)]
			const padded = [...base, c(0, 0), c(0, 0), c(0, 0)]
			assert.deepEqual(
				laplaceTransformComplexSeries(padded, s),
				laplaceTransformComplexSeries(base, s)
			)
		})

		test('high-degree series beyond 170! does not overflow naive factorial', () => {
			// Maclaurin series of e^{2t} up to k = 175 (175! overflows float64, but backward Horner stays finite)
			const a = 2
			const coeffs = []
			let term = 1 // a^k / k!
			for (let k = 0; k <= 175; k++) {
				if (k > 0) term = (term * a) / k
				coeffs.push(c(term, 0))
			}
			const s = c(5, 1) // |s| > |a|
			const got = laplaceTransformComplexSeries(coeffs, s)
			const expected = cDiv(c(1, 0), cSub(s, c(a, 0)))
			assertComplexClose(got, expected, 1e-14, 'high-degree e^{2t} without factorial overflow')
		})

		test('very large |s| avoids overflow in |s|^2 via Smith reciprocal', () => {
			const s = c(1e200, 1e200)
			const got = laplaceTransformComplexSeries([c(2, 0)], s)
			// 2 / (1e200 * (1 + i)) = 1e-200 * (1 - i)
			assertComplexClose(got, c(1e-200, -1e-200), 1e-14, 'large |s| Smith reciprocal')
		})

		test('analyticContinuation evaluates meromorphic continuation in Re(s) <= 0 away from pole', () => {
			const coeffs = [c(1, 0), c(2, -1)]
			// Purely imaginary s = 2i: 1/(2i) + (2-i)/(2i)^2 = -0.5i + (2-i)/(-4) = -0.5 - 0.25i
			const onAxis = laplaceTransformComplexSeries(coeffs, c(0, 2), {
				analyticContinuation: true,
			})
			assertComplexClose(onAxis, c(-0.5, -0.25), 1e-14, 'analytic continuation on imaginary axis')

			// Left half-plane s = -2 + i
			const sLeft = c(-2, 1)
			const expectedLeft = cAdd(
				cDiv(c(1, 0), sLeft),
				cDiv(c(2, -1), cMul(sLeft, sLeft))
			)
			const gotLeft = laplaceTransformComplexSeries(coeffs, sLeft, {
				analyticContinuation: true,
			})
			assertComplexClose(gotLeft, expectedLeft, 1e-14, 'analytic continuation in left half-plane')
		})
	})

	describe('input validation', () => {
		test('rejects invalid coefficients array or elements', () => {
			assert.throws(() => laplaceTransformComplexSeries(null, c(1, 0)), TypeError)
			assert.throws(() => laplaceTransformComplexSeries('abc', c(1, 0)), TypeError)
			assert.throws(() => laplaceTransformComplexSeries([42], c(1, 0)), TypeError)
			assert.throws(() => laplaceTransformComplexSeries([null], c(1, 0)), TypeError)
			assert.throws(() => laplaceTransformComplexSeries([{ re: 1 }], c(1, 0)), TypeError)
			assert.throws(() => laplaceTransformComplexSeries([{ re: '1', im: 0 }], c(1, 0)), TypeError)

			// Sparse array hole
			const sparse = []
			sparse[1] = c(1, 0)
			assert.throws(() => laplaceTransformComplexSeries(sparse, c(1, 0)), TypeError)

			// Non-finite numbers
			assert.throws(() => laplaceTransformComplexSeries([c(NaN, 0)], c(1, 0)), RangeError)
			assert.throws(() => laplaceTransformComplexSeries([c(0, Infinity)], c(1, 0)), RangeError)
			assert.throws(() => laplaceTransformComplexSeries([c(-Infinity, 0)], c(1, 0)), RangeError)
		})

		test('rejects invalid or non-finite s', () => {
			assert.throws(() => laplaceTransformComplexSeries([c(1)], null), TypeError)
			assert.throws(() => laplaceTransformComplexSeries([c(1)], 2), TypeError)
			assert.throws(() => laplaceTransformComplexSeries([c(1)], [1, 0]), TypeError)
			assert.throws(() => laplaceTransformComplexSeries([c(1)], { re: 1 }), TypeError)
			assert.throws(() => laplaceTransformComplexSeries([c(1)], c(NaN, 0)), RangeError)
			assert.throws(() => laplaceTransformComplexSeries([c(1)], c(Infinity, 1)), RangeError)
		})

		test('rejects convergence violations and poles', () => {
			// Default mode requires Re(s - shift) > 0
			assert.throws(() => laplaceTransformComplexSeries([c(1)], c(0, 0)), RangeError)
			assert.throws(() => laplaceTransformComplexSeries([c(1)], c(0, 5)), RangeError)
			assert.throws(() => laplaceTransformComplexSeries([c(1)], c(-1, 2)), RangeError)
			assert.throws(
				() => laplaceTransformComplexSeries([c(1)], c(2, 0), { shift: c(2, 0) }),
				RangeError
			)
			assert.throws(
				() => laplaceTransformComplexSeries([c(1)], c(1, 3), { shift: c(2, 0) }),
				RangeError
			)
			// Even empty coefficients enforce valid s in ROC
			assert.throws(() => laplaceTransformComplexSeries([], c(0, 0)), RangeError)

			// Analytic continuation rejects exact pole s === shift
			assert.throws(
				() => laplaceTransformComplexSeries([c(1)], c(0, 0), { analyticContinuation: true }),
				RangeError
			)
			assert.throws(
				() =>
					laplaceTransformComplexSeries([c(1)], c(1.5, -2), {
						shift: c(1.5, -2),
						analyticContinuation: true,
					}),
				RangeError
			)
		})

		test('rejects invalid options and overflow', () => {
			assert.throws(() => laplaceTransformComplexSeries([c(1)], c(2, 0), null), TypeError)
			assert.throws(() => laplaceTransformComplexSeries([c(1)], c(2, 0), []), TypeError)
			assert.throws(
				() => laplaceTransformComplexSeries([c(1)], c(2, 0), { shift: 1 }),
				TypeError
			)
			assert.throws(
				() => laplaceTransformComplexSeries([c(1)], c(2, 0), { shift: c(NaN, 0) }),
				RangeError
			)
			assert.throws(
				() => laplaceTransformComplexSeries([c(1)], c(2, 0), { delay: '1' }),
				TypeError
			)
			assert.throws(
				() => laplaceTransformComplexSeries([c(1)], c(2, 0), { delay: -0.1 }),
				RangeError
			)
			assert.throws(
				() => laplaceTransformComplexSeries([c(1)], c(2, 0), { delay: Infinity }),
				RangeError
			)
			assert.throws(
				() => laplaceTransformComplexSeries([c(1)], c(2, 0), { analyticContinuation: 1 }),
				TypeError
			)
			// Overflow during evaluation: 1 / (1e-200)^3 = 1e600 -> Infinity
			assert.throws(
				() => laplaceTransformComplexSeries([c(0), c(0), c(1)], c(1e-200, 0)),
				RangeError
			)
		})
	})
})
