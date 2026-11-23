import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { arcsinComplexSeries } from './arcsinComplexSeries.js'

/**
 * Helper: complex sine sin(u + i*v) = sin(u)*cosh(v) + i*cos(u)*sinh(v)
 * used as an independent inverse cross-check.
 */
function complexSin({ re: u, im: v }) {
	return {
		re: Math.sin(u) * Math.cosh(v),
		im: Math.cos(u) * Math.sinh(v),
	}
}

/**
 * Helper: direct Maclaurin power series for arcsin(z) valid for |z| < 1:
 *   arcsin(z) = sum_{n=0}^{N} ((2n)! / (4^n * (n!)^2 * (2n+1))) * z^(2n+1)
 * Used as an independent series cross-check inside the open unit disk.
 */
function arcsinPowerSeries({ re: x, im: y }, maxTerms = 200) {
	// z^2 = (x^2 - y^2) + i*(2*x*y)
	const z2Re = x * x - y * y
	const z2Im = 2 * x * y

	// Term 0: c_0 * z = z
	let powRe = x
	let powIm = y
	let coeff = 1 // (2n)! / (4^n * (n!)^2)

	let sumRe = powRe
	let sumIm = powIm

	for (let n = 1; n <= maxTerms; n++) {
		// pow *= z^2
		const nextPowRe = powRe * z2Re - powIm * z2Im
		const nextPowIm = powRe * z2Im + powIm * z2Re
		powRe = nextPowRe
		powIm = nextPowIm

		// coeff *= (2n - 1) / (2n)
		coeff *= (2 * n - 1) / (2 * n)
		const factor = coeff / (2 * n + 1)

		const termRe = factor * powRe
		const termIm = factor * powIm
		sumRe += termRe
		sumIm += termIm

		if (Math.hypot(termRe, termIm) <= 1e-17 * Math.hypot(sumRe, sumIm)) {
			break
		}
	}

	return { re: sumRe, im: sumIm }
}

/**
 * Helper: direct logarithmic identity -i * ln(i*z + sqrt(1 - z^2))
 * valid off the branch cuts.
 */
function arcsinLogIdentity({ re: x, im: y }) {
	// 1 - z^2 = (1 - x^2 + y^2) + i*(-2*x*y)
	const wRe = 1 - x * x + y * y
	const wIm = -2 * x * y
	const wMod = Math.hypot(wRe, wIm)
	const wArg = Math.atan2(wIm, wRe)
	const sqrtRe = Math.sqrt(wMod) * Math.cos(wArg / 2)
	const sqrtIm = Math.sqrt(wMod) * Math.sin(wArg / 2)

	// i*z + sqrt(1 - z^2) = (-y + sqrtRe) + i*(x + sqrtIm)
	const argRe = -y + sqrtRe
	const argIm = x + sqrtIm
	const lnRe = Math.log(Math.hypot(argRe, argIm))
	const lnIm = Math.atan2(argIm, argRe)

	// -i * (lnRe + i*lnIm) = lnIm - i*lnRe
	return { re: lnIm, im: -lnRe }
}

function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	const prefix = label ? `${label}: ` : ''
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${prefix}real part mismatch: got ${actual.re}, expected ${expected.re} (diff ${Math.abs(actual.re - expected.re)})`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${prefix}imag part mismatch: got ${actual.im}, expected ${expected.im} (diff ${Math.abs(actual.im - expected.im)})`
	)
}

describe('arcsinComplexSeries', () => {
	it('matches real Math.asin on [-1, 1]', () => {
		const values = [-1, -0.75, -0.5, -0.1, 0, 0.1, 0.5, 0.75, 1]
		for (const x of values) {
			const res = arcsinComplexSeries({ re: x, im: 0 })
			assertComplexClose(res, { re: Math.asin(x), im: 0 }, 1e-15, `x=${x}`)
			assert.equal(Object.is(res.im, -0), false)
		}
		assert.equal(Object.is(arcsinComplexSeries({ re: 0, im: 0 }).re, -0), false)
	})

	it('matches purely imaginary identity arcsin(i*y) = i*asinh(y)', () => {
		const values = [-1e6, -10, -1, -0.5, -1e-12, 1e-12, 0.5, 1, 10, 1e6]
		for (const y of values) {
			const res = arcsinComplexSeries({ re: 0, im: y })
			assertComplexClose(res, { re: 0, im: Math.asinh(y) }, 1e-14, `y=${y}`)
		}
	})

	it('handles real-axis branch cuts |x| > 1 with standard continuity', () => {
		for (const x of [1.5, 2, 10, 100]) {
			// Upper side (im = +0)
			assertComplexClose(
				arcsinComplexSeries({ re: x, im: 0 }),
				{ re: Math.PI / 2, im: Math.acosh(x) },
				1e-14,
				`x=${x}, +0`
			)
			assertComplexClose(
				arcsinComplexSeries({ re: -x, im: 0 }),
				{ re: -Math.PI / 2, im: Math.acosh(x) },
				1e-14,
				`x=${-x}, +0`
			)
			// Lower side (im = -0)
			assertComplexClose(
				arcsinComplexSeries({ re: x, im: -0 }),
				{ re: Math.PI / 2, im: -Math.acosh(x) },
				1e-14,
				`x=${x}, -0`
			)
			assertComplexClose(
				arcsinComplexSeries({ re: -x, im: -0 }),
				{ re: -Math.PI / 2, im: -Math.acosh(x) },
				1e-14,
				`x=${-x}, -0`
			)
			// Continuity from upper half-plane near branch cut
			const upper = arcsinComplexSeries({ re: x, im: 1e-12 })
			assertComplexClose(upper, { re: Math.PI / 2, im: Math.acosh(x) }, 1e-9, `near cut +${x}`)
			const lower = arcsinComplexSeries({ re: x, im: -1e-12 })
			assertComplexClose(lower, { re: Math.PI / 2, im: -Math.acosh(x) }, 1e-9, `near cut -${x}`)
		}
	})

	it('cross-checks against Maclaurin power series inside the open unit disk', () => {
		const samples = [
			{ re: 0.1, im: 0.2 },
			{ re: -0.3, im: 0.4 },
			{ re: 0.5, im: -0.5 },
			{ re: -0.6, im: -0.3 },
			{ re: 0.7, im: 0.2 },
			{ re: 1e-8, im: -2e-8 },
		]
		for (const z of samples) {
			const actual = arcsinComplexSeries(z)
			const expected = arcsinPowerSeries(z)
			assertComplexClose(actual, expected, 1e-14, `series z=${z.re}+${z.im}i`)
		}
	})

	it('cross-checks via round-trip sin(arcsin(z)) === z across all quadrants', () => {
		const samples = [
			{ re: 0.5, im: 0.5 },
			{ re: -0.5, im: 0.5 },
			{ re: 0.5, im: -0.5 },
			{ re: -0.5, im: -0.5 },
			{ re: 2.3, im: 1.7 },
			{ re: -3.1, im: 0.4 },
			{ re: 1.0, im: 1e-6 },
			{ re: -1.0, im: -1e-6 },
			{ re: 1 + 1e-9, im: 1e-9 },
			{ re: 1 - 1e-9, im: 1e-9 },
			{ re: 10, im: -7 },
			{ re: 0.001, im: 5 },
		]
		for (const z of samples) {
			const w = arcsinComplexSeries(z)
			assert.ok(w.re >= -Math.PI / 2 && w.re <= Math.PI / 2, 'real part in principal strip')
			const roundTrip = complexSin(w)
			const scale = Math.max(1, Math.hypot(z.re, z.im))
			assertComplexClose(roundTrip, z, 1e-12 * scale, `sin(arcsin(${z.re}+${z.im}i))`)
		}
	})

	it('cross-checks against direct logarithmic identity off the branch cuts', () => {
		const samples = [
			{ re: 0.4, im: 0.7 },
			{ re: -0.8, im: 1.2 },
			{ re: 2.5, im: -1.5 },
			{ re: -1.8, im: -2.2 },
			{ re: 0.99, im: 0.05 },
		]
		for (const z of samples) {
			const actual = arcsinComplexSeries(z)
			const expected = arcsinLogIdentity(z)
			assertComplexClose(actual, expected, 1e-13, `log identity z=${z.re}+${z.im}i`)
		}
	})

	it('satisfies odd symmetry and conjugate symmetry off the branch cuts', () => {
		const samples = [
			{ re: 0.6, im: 0.8 },
			{ re: 2.0, im: 3.0 },
			{ re: 0.2, im: 1.5 },
		]
		for (const z of samples) {
			const w = arcsinComplexSeries(z)
			const wNeg = arcsinComplexSeries({ re: -z.re, im: -z.im })
			const wConj = arcsinComplexSeries({ re: z.re, im: -z.im })

			assertComplexClose(wNeg, { re: -w.re, im: -w.im }, 1e-14, 'odd symmetry')
			assertComplexClose(wConj, { re: w.re, im: -w.im }, 1e-14, 'conjugate symmetry')
		}
	})

	it('maintains precision for tiny and very large magnitudes without overflow/underflow', () => {
		// Tiny imaginary part inside [-1, 1]: Im(arcsin(x + i*eps)) ~ eps / sqrt(1 - x^2)
		const eps = 1e-200
		const nearReal = arcsinComplexSeries({ re: 0.5, im: eps })
		assert.ok(Math.abs(nearReal.re - Math.asin(0.5)) <= 1e-15)
		const expectedIm = eps / Math.sqrt(1 - 0.25)
		assert.ok(Math.abs(nearReal.im - expectedIm) <= 1e-15 * expectedIm)

		// Near branch point z = 1 + i*1e-200: arcsin(1 + i*eps) ~ (pi/2 - sqrt(eps)) + i*sqrt(eps)
		const nearBranch = arcsinComplexSeries({ re: 1, im: eps })
		const sqrtEps = Math.sqrt(eps)
		assert.ok(Math.abs(nearBranch.re - (Math.PI / 2 - sqrtEps)) <= 1e-15)
		assert.ok(Math.abs(nearBranch.im - sqrtEps) <= 1e-14 * sqrtEps)

		// Very large magnitudes (avoiding overflow in hypot / squares)
		const huge = arcsinComplexSeries({ re: 1e200, im: 1e200 })
		assertComplexClose(
			huge,
			{ re: Math.PI / 4, im: Math.LN2 + Math.log(1e200) + 0.5 * Math.LN2 },
			1e-12,
			'huge z'
		)

		const hugeReal = arcsinComplexSeries({ re: -1e300, im: 1 })
		assertComplexClose(
			hugeReal,
			{ re: -Math.PI / 2, im: Math.LN2 + Math.log(1e300) },
			1e-12,
			'huge real z'
		)
	})

	it('validates inputs and throws TypeError / RangeError on invalid arguments', () => {
		assert.throws(() => arcsinComplexSeries(null), TypeError)
		assert.throws(() => arcsinComplexSeries(undefined), TypeError)
		assert.throws(() => arcsinComplexSeries(0.5), TypeError)
		assert.throws(() => arcsinComplexSeries([1, 2]), TypeError)
		assert.throws(() => arcsinComplexSeries({ re: '0.5', im: 0 }), TypeError)
		assert.throws(() => arcsinComplexSeries({ re: 0.5 }), TypeError)

		assert.throws(() => arcsinComplexSeries({ re: Number.NaN, im: 0 }), RangeError)
		assert.throws(() => arcsinComplexSeries({ re: 0, im: Number.NaN }), RangeError)
		assert.throws(() => arcsinComplexSeries({ re: Number.POSITIVE_INFINITY, im: 0 }), RangeError)
		assert.throws(() => arcsinComplexSeries({ re: 0, im: Number.NEGATIVE_INFINITY }), RangeError)
	})
})
