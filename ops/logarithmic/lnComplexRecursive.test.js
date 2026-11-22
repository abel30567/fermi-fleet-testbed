import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { lnComplexRecursive } from './lnComplexRecursive.js'

/**
 * Assert two complex numbers are approximately equal within `tol`.
 */
function assertComplexClose(actual, expected, tol = 1e-14, label = '') {
	assert.equal(typeof actual.re, 'number', `${label} re should be a number`)
	assert.equal(typeof actual.im, 'number', `${label} im should be a number`)
	assert.ok(Number.isFinite(actual.re), `${label} re should be finite, got ${actual.re}`)
	assert.ok(Number.isFinite(actual.im), `${label} im should be finite, got ${actual.im}`)

	const reScale = Math.max(1, Math.abs(expected.re))
	const imScale = Math.max(1, Math.abs(expected.im))
	const reErr = Math.abs(actual.re - expected.re)
	const imErr = Math.abs(actual.im - expected.im)

	assert.ok(
		reErr <= tol * reScale,
		`${label} re mismatch: actual=${actual.re}, expected=${expected.re}, err=${reErr}`
	)
	assert.ok(
		imErr <= tol * imScale,
		`${label} im mismatch: actual=${actual.im}, expected=${expected.im}, err=${imErr}`
	)
}

/**
 * Independent reference implementation of complex exponential exp(w).
 */
function complexExpRef(w) {
	const r = Math.exp(w.re)
	return {
		re: r * Math.cos(w.im),
		im: r * Math.sin(w.im),
	}
}

/**
 * Independent reference implementation of principal complex logarithm.
 */
function complexLnRef(z) {
	const im = z.im === 0 ? 0 : z.im
	const re = z.re === 0 ? 0 : z.re
	return {
		re: Math.log(Math.hypot(re, im)),
		im: Math.atan2(im, re),
	}
}

describe('lnComplexRecursive', () => {
	describe('special and axis values', () => {
		it('computes Ln(1) = 0 + 0i exactly without -0', () => {
			const res = lnComplexRecursive({ re: 1, im: 0 })
			assert.ok(Object.is(res.re, 0))
			assert.ok(Object.is(res.im, 0))
		})

		it('handles positive real numbers', () => {
			assertComplexClose(lnComplexRecursive({ re: Math.E, im: 0 }), { re: 1, im: 0 })
			assertComplexClose(lnComplexRecursive({ re: 2, im: 0 }), { re: Math.LN2, im: 0 })
			assertComplexClose(lnComplexRecursive({ re: 0.25, im: 0 }), { re: -2 * Math.LN2, im: 0 })
			assertComplexClose(lnComplexRecursive({ re: 1000, im: 0 }), { re: Math.log(1000), im: 0 })

			const res = lnComplexRecursive({ re: Math.E, im: -0 })
			assert.ok(Object.is(res.im, 0))
		})

		it('handles negative real numbers on the principal branch (+pi)', () => {
			assertComplexClose(lnComplexRecursive({ re: -1, im: 0 }), { re: 0, im: Math.PI })
			assertComplexClose(lnComplexRecursive({ re: -Math.E, im: 0 }), { re: 1, im: Math.PI })
			assertComplexClose(lnComplexRecursive({ re: -8, im: 0 }), { re: 3 * Math.LN2, im: Math.PI })
			// -0 imaginary component is normalized to +0, keeping principal Arg = +pi
			assertComplexClose(lnComplexRecursive({ re: -5, im: -0 }), { re: Math.log(5), im: Math.PI })
		})

		it('handles pure imaginary numbers', () => {
			assertComplexClose(lnComplexRecursive({ re: 0, im: 1 }), { re: 0, im: Math.PI / 2 })
			assertComplexClose(lnComplexRecursive({ re: 0, im: -1 }), { re: 0, im: -Math.PI / 2 })
			assertComplexClose(lnComplexRecursive({ re: 0, im: 4 }), { re: 2 * Math.LN2, im: Math.PI / 2 })
			assertComplexClose(lnComplexRecursive({ re: 0, im: -0.5 }), { re: -Math.LN2, im: -Math.PI / 2 })
		})
	})

	describe('general complex numbers across all quadrants', () => {
		it('matches independent Math.log/Math.atan2 reference in all four quadrants', () => {
			const samples = [
				{ re: 3, im: 4 },
				{ re: -3, im: 4 },
				{ re: -3, im: -4 },
				{ re: 3, im: -4 },
				{ re: 1, im: 1 },
				{ re: -1, im: 1 },
				{ re: -1, im: -1 },
				{ re: 1, im: -1 },
				{ re: 0.123, im: 0.456 },
				{ re: -7.5, im: 0.25 },
				{ re: 0.01, im: -12.34 },
				{ re: -100.5, im: -200.25 },
			]

			for (const z of samples) {
				const actual = lnComplexRecursive(z)
				const expected = complexLnRef(z)
				assertComplexClose(actual, expected, 1e-14, `z=${z.re}+${z.im}i`)
			}
		})
	})

	describe('numerical precision and edge cases', () => {
		it('avoids catastrophic cancellation near z = 1', () => {
			// Use an exact dyadic perturbation so (1 + eps) is exact in IEEE-754 float64.
			const eps = 2 ** -40
			const z = { re: 1 + eps, im: eps }
			const actual = lnComplexRecursive(z)
			// Taylor expansion: Ln(1 + u) = u - u^2/2 + u^3/3 - ...
			// With u = eps*(1+i): u^2 = 2i*eps^2, u^3 = 2*(-1+i)*eps^3
			// => Re = eps - (2/3)*eps^3 + O(eps^4), Im = eps - eps^2 + (2/3)*eps^3 + O(eps^4)
			const expectedRe = eps - (2 / 3) * eps ** 3
			const expectedIm = eps - eps * eps + (2 / 3) * eps ** 3
			assert.ok(
				Math.abs(actual.re - expectedRe) <= 1e-15 * eps,
				`re=${actual.re}, expected=${expectedRe}`
			)
			assert.ok(
				Math.abs(actual.im - expectedIm) <= 1e-15 * eps,
				`im=${actual.im}, expected=${expectedIm}`
			)
		})

		it('handles tiny imaginary perturbation near 1', () => {
			const z = { re: 1, im: 1e-300 }
			const actual = lnComplexRecursive(z)
			assert.equal(actual.re, 0)
			assert.ok(Math.abs(actual.im - 1e-300) <= 1e-314)
		})

		it('handles points just above and below the negative real branch cut', () => {
			const above = lnComplexRecursive({ re: -1, im: 1e-12 })
			const below = lnComplexRecursive({ re: -1, im: -1e-12 })

			assertComplexClose(above, { re: 0, im: Math.PI - 1e-12 }, 1e-14, 'above branch cut')
			assertComplexClose(below, { re: 0, im: -Math.PI + 1e-12 }, 1e-14, 'below branch cut')
		})

		it('handles extreme large magnitudes without overflow', () => {
			const huge1 = lnComplexRecursive({ re: 1e300, im: 1e300 })
			const expectedRe1 = 300 * Math.LN10 + 0.5 * Math.LN2
			assertComplexClose(huge1, { re: expectedRe1, im: Math.PI / 4 }, 1e-13, '1e300+1e300i')

			const huge2 = lnComplexRecursive({ re: Number.MAX_VALUE, im: 0 })
			assertComplexClose(huge2, { re: Math.log(Number.MAX_VALUE), im: 0 }, 1e-13, 'MAX_VALUE')
		})

		it('handles extreme small and subnormal magnitudes without underflow', () => {
			const tiny = lnComplexRecursive({ re: 1e-300, im: -1e-300 })
			const expectedRe = -300 * Math.LN10 + 0.5 * Math.LN2
			assertComplexClose(tiny, { re: expectedRe, im: -Math.PI / 4 }, 1e-13, '1e-300-1e-300i')

			const subnormal = lnComplexRecursive({ re: Number.MIN_VALUE, im: Number.MIN_VALUE })
			// Number.MIN_VALUE = 2^-1074, so |z| = sqrt(2) * 2^-1074
			const expectedSubRe = (-1074 + 0.5) * Math.LN2
			assertComplexClose(subnormal, { re: expectedSubRe, im: Math.PI / 4 }, 1e-13, 'MIN_VALUE')
		})
	})

	describe('algebraic identities and inverse cross-checks', () => {
		it('satisfies exp(Ln(z)) === z', () => {
			const samples = [
				{ re: 2.5, im: 1.75 },
				{ re: -0.3, im: 4.2 },
				{ re: -6.1, im: -0.9 },
				{ re: 0.05, im: -0.02 },
				{ re: -1, im: 0 },
				{ re: 0, im: -3.5 },
			]

			for (const z of samples) {
				const w = lnComplexRecursive(z)
				const recovered = complexExpRef(w)
				assertComplexClose(recovered, z, 1e-13, `exp(Ln(${z.re}+${z.im}i))`)
			}
		})

		it('satisfies Ln(z1 * z2) === Ln(z1) + Ln(z2) when Arg(z1) + Arg(z2) in (-pi, pi]', () => {
			const z1 = { re: 1.5, im: 2.0 }
			const z2 = { re: 3.0, im: -1.0 }
			const prod = {
				re: z1.re * z2.re - z1.im * z2.im,
				im: z1.re * z2.im + z1.im * z2.re,
			}

			const lhs = lnComplexRecursive(prod)
			const l1 = lnComplexRecursive(z1)
			const l2 = lnComplexRecursive(z2)
			const rhs = { re: l1.re + l2.re, im: l1.im + l2.im }

			assertComplexClose(lhs, rhs, 1e-14, 'Ln(z1*z2) = Ln(z1)+Ln(z2)')
		})

		it('satisfies conjugate symmetry Ln(conj(z)) === conj(Ln(z)) off the negative real axis', () => {
			const z = { re: -2.4, im: 3.7 }
			const conjZ = { re: z.re, im: -z.im }
			const lnZ = lnComplexRecursive(z)
			const lnConjZ = lnComplexRecursive(conjZ)

			assertComplexClose(lnConjZ, { re: lnZ.re, im: -lnZ.im }, 1e-14, 'conjugate symmetry')
		})

		it('satisfies reciprocal identity Ln(1 / z) === -Ln(z) off the negative real axis', () => {
			const z = { re: -1.2, im: 2.8 }
			const denom = z.re * z.re + z.im * z.im
			const invZ = { re: z.re / denom, im: -z.im / denom }

			const lnZ = lnComplexRecursive(z)
			const lnInvZ = lnComplexRecursive(invZ)

			assertComplexClose(lnInvZ, { re: -lnZ.re, im: -lnZ.im }, 1e-14, 'reciprocal identity')
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-object, null, array, or non-numeric properties', () => {
			const invalidTypes = [
				null,
				undefined,
				42,
				'1+2i',
				true,
				[1, 2],
				{},
				{ re: 1 },
				{ im: 1 },
				{ re: '1', im: 0 },
				{ re: 1, im: null },
				{ re: 1, im: undefined },
			]

			for (const bad of invalidTypes) {
				assert.throws(() => lnComplexRecursive(bad), TypeError)
			}
		})

		it('throws RangeError for non-finite numbers', () => {
			const nonFinite = [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 1 },
				{ re: 1, im: Number.NEGATIVE_INFINITY },
				{ re: Number.NEGATIVE_INFINITY, im: Number.POSITIVE_INFINITY },
			]

			for (const bad of nonFinite) {
				assert.throws(() => lnComplexRecursive(bad), RangeError)
			}
		})

		it('throws RangeError for 0 + 0i (including -0)', () => {
			assert.throws(() => lnComplexRecursive({ re: 0, im: 0 }), RangeError)
			assert.throws(() => lnComplexRecursive({ re: -0, im: 0 }), RangeError)
			assert.throws(() => lnComplexRecursive({ re: 0, im: -0 }), RangeError)
			assert.throws(() => lnComplexRecursive({ re: -0, im: -0 }), RangeError)
		})
	})
})
