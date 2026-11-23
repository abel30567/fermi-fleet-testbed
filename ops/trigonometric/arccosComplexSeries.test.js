import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { arccosComplexSeries } from './arccosComplexSeries.js'

/**
 * Independent helper: complex cosine cos(u + iv) = cos(u)cosh(v) - i*sin(u)sinh(v).
 */
function complexCos({ re: u, im: v }) {
	return {
		re: Math.cos(u) * Math.cosh(v),
		im: -Math.sin(u) * Math.sinh(v),
	}
}

/**
 * Independent helper: direct Maclaurin series for arccos(z) on |z| < 1:
 *   arccos(z) = pi/2 - sum_{n=0}^\infty ((2n)! / (4^n (n!)^2 (2n+1))) z^{2n+1}
 */
function arccosMaclaurinSeries({ re: x, im: y }, maxTerms = 200) {
	// z^2
	const z2Re = x * x - y * y
	const z2Im = 2 * x * y

	let powRe = x
	let powIm = y
	let coeff = 1 // (2n)! / (4^n (n!)^2)
	let sumRe = x
	let sumIm = y

	for (let n = 1; n < maxTerms; n++) {
		// Multiply pow by z^2
		const nextRe = powRe * z2Re - powIm * z2Im
		const nextIm = powRe * z2Im + powIm * z2Re
		powRe = nextRe
		powIm = nextIm

		coeff *= (2 * n - 1) / (2 * n)
		const denom = 2 * n + 1
		const termRe = (coeff / denom) * powRe
		const termIm = (coeff / denom) * powIm

		sumRe += termRe
		sumIm += termIm

		if (Math.hypot(termRe, termIm) < 1e-16) {
			break
		}
	}

	return {
		re: Math.PI / 2 - sumRe,
		im: -sumIm,
	}
}

/**
 * Independent helper: naive logarithmic formula -i * ln(z + i * sqrt(1 - z^2))
 * for cross-checking points away from cancellation/branch-cut singularities.
 */
function arccosLogIdentity({ re: x, im: y }) {
	// w = 1 - z^2
	const wRe = 1 - (x * x - y * y)
	const wIm = -2 * x * y
	// principal sqrt(w)
	const r = Math.hypot(wRe, wIm)
	const sRe = Math.sqrt(0.5 * (r + wRe))
	const sIm = (wIm < 0 ? -1 : 1) * Math.sqrt(0.5 * (r - wRe))
	// t = z + i * sqrt(w)
	const tRe = x - sIm
	const tIm = y + sRe
	// ln(t) = ln|t| + i * arg(t)
	const lnRe = Math.log(Math.hypot(tRe, tIm))
	const lnIm = Math.atan2(tIm, tRe)
	// -i * (lnRe + i * lnIm) = lnIm - i * lnRe
	return { re: lnIm, im: -lnRe }
}

function assertComplexClose(actual, expected, tol = 1e-12, msg = '') {
	const reDiff = Math.abs(actual.re - expected.re)
	const imDiff = Math.abs(actual.im - expected.im)
	assert.ok(
		reDiff <= tol && imDiff <= tol,
		`${msg ? msg + ': ' : ''}expected { re: ${expected.re}, im: ${expected.im} }, got { re: ${actual.re}, im: ${actual.im} } (diff: re=${reDiff}, im=${imDiff}, tol=${tol})`
	)
}

describe('arccosComplexSeries', () => {
	it('computes exact values on the real interval [-1, 1]', () => {
		const cases = [
			{ z: { re: 1, im: 0 }, expected: { re: 0, im: 0 } },
			{ z: { re: 0.5, im: 0 }, expected: { re: Math.PI / 3, im: 0 } },
			{ z: { re: 0, im: 0 }, expected: { re: Math.PI / 2, im: 0 } },
			{ z: { re: -0.5, im: 0 }, expected: { re: (2 * Math.PI) / 3, im: 0 } },
			{ z: { re: -1, im: 0 }, expected: { re: Math.PI, im: 0 } },
			{ z: { re: Math.SQRT1_2, im: 0 }, expected: { re: Math.PI / 4, im: 0 } },
		]

		for (const { z, expected } of cases) {
			const res = arccosComplexSeries(z)
			assertComplexClose(res, expected, 1e-15, `z=(${z.re}, ${z.im})`)
			assert.equal(Object.is(res.im, -0), false, 'imaginary part on [-1, 1] should be +0')
		}
	})

	it('computes principal values along the real branch cuts (|x| > 1)', () => {
		// Upper side of branch cut (im = +0)
		assertComplexClose(
			arccosComplexSeries({ re: 2, im: 0 }),
			{ re: 0, im: -Math.acosh(2) },
			1e-15,
			'z = 2 + 0i'
		)
		assertComplexClose(
			arccosComplexSeries({ re: -2, im: 0 }),
			{ re: Math.PI, im: -Math.acosh(2) },
			1e-15,
			'z = -2 + 0i'
		)

		// Lower side of branch cut (im = -0)
		assertComplexClose(
			arccosComplexSeries({ re: 2, im: -0 }),
			{ re: 0, im: Math.acosh(2) },
			1e-15,
			'z = 2 - 0i'
		)
		assertComplexClose(
			arccosComplexSeries({ re: -2, im: -0 }),
			{ re: Math.PI, im: Math.acosh(2) },
			1e-15,
			'z = -2 - 0i'
		)
	})

	it('computes values on the pure imaginary axis: arccos(iy) = pi/2 - i * asinh(y)', () => {
		for (const y of [-10, -1, -0.25, 0.25, 1, 10]) {
			const res = arccosComplexSeries({ re: 0, im: y })
			assertComplexClose(
				res,
				{ re: Math.PI / 2, im: -Math.asinh(y) },
				1e-14,
				`z = ${y}i`
			)
		}
	})

	it('satisfies symmetry identities: arccos(-z) = pi - arccos(z) and arccos(conj(z)) = conj(arccos(z))', () => {
		const samples = [
			{ re: 0.3, im: 0.4 },
			{ re: 1.5, im: 2.2 },
			{ re: -0.7, im: 1.8 },
			{ re: 3.1, im: -0.6 },
		]

		for (const z of samples) {
			const w = arccosComplexSeries(z)
			const wNeg = arccosComplexSeries({ re: -z.re, im: -z.im })
			assertComplexClose(
				{ re: w.re + wNeg.re, im: w.im + wNeg.im },
				{ re: Math.PI, im: 0 },
				1e-14,
				`arccos(z) + arccos(-z) for z=(${z.re}, ${z.im})`
			)

			const wConj = arccosComplexSeries({ re: z.re, im: -z.im })
			assertComplexClose(
				wConj,
				{ re: w.re, im: -w.im },
				1e-14,
				`conjugate symmetry for z=(${z.re}, ${z.im})`
			)
		}
	})

	it('independent cross-check 1: round-trip cos(arccos(z)) = z across all quadrants', () => {
		const grid = [
			{ re: 0.25, im: 0.5 },
			{ re: -0.25, im: 0.5 },
			{ re: -0.25, im: -0.5 },
			{ re: 0.25, im: -0.5 },
			{ re: 2.5, im: 1.3 },
			{ re: -2.5, im: 1.3 },
			{ re: -2.5, im: -1.3 },
			{ re: 2.5, im: -1.3 },
			{ re: 1, im: 1e-6 },
			{ re: -1, im: -1e-6 },
			{ re: 5, im: 0.01 },
			{ re: 0.01, im: 5 },
		]

		for (const z of grid) {
			const w = arccosComplexSeries(z)
			// Verify principal branch range Re(w) in [0, pi]
			assert.ok(w.re >= 0 && w.re <= Math.PI, `Re(w)=${w.re} out of [0, pi]`)
			const back = complexCos(w)
			assertComplexClose(back, z, 1e-12, `cos(arccos(${z.re} + ${z.im}i))`)
		}
	})

	it('independent cross-check 2: matches Maclaurin power series inside the unit disk |z| < 1', () => {
		const interiorPoints = [
			{ re: 0.1, im: 0.2 },
			{ re: -0.3, im: 0.4 },
			{ re: 0.4, im: -0.3 },
			{ re: -0.2, im: -0.5 },
			{ re: 0.6, im: 0.2 },
			{ re: 0, im: 0.5 },
		]

		for (const z of interiorPoints) {
			const actual = arccosComplexSeries(z)
			const expected = arccosMaclaurinSeries(z)
			assertComplexClose(actual, expected, 1e-14, `series check at (${z.re}, ${z.im})`)
		}
	})

	it('independent cross-check 3: matches direct logarithmic formula -i * ln(z + i * sqrt(1 - z^2))', () => {
		const points = [
			{ re: 0.5, im: 0.5 },
			{ re: -0.8, im: 1.2 },
			{ re: 1.7, im: -0.9 },
			{ re: -2.3, im: -1.4 },
			{ re: 4.0, im: 3.0 },
		]

		for (const z of points) {
			const actual = arccosComplexSeries(z)
			const expected = arccosLogIdentity(z)
			assertComplexClose(actual, expected, 1e-13, `log-identity check at (${z.re}, ${z.im})`)
		}
	})

	it('maintains accuracy near branch points z = +/-1 and for extreme magnitudes', () => {
		// Near z = 1 + i*eps: arccos(1 + i*eps) ~ sqrt(eps) - i*sqrt(eps)
		const eps = 1e-16
		const nearOne = arccosComplexSeries({ re: 1, im: eps })
		assertComplexClose(nearOne, { re: Math.sqrt(eps), im: -Math.sqrt(eps) }, 1e-15, 'near +1')

		// Near z = -1 + i*eps: arccos(-1 + i*eps) ~ (pi - sqrt(eps)) - i*sqrt(eps)
		const nearNegOne = arccosComplexSeries({ re: -1, im: eps })
		assertComplexClose(
			nearNegOne,
			{ re: Math.PI - Math.sqrt(eps), im: -Math.sqrt(eps) },
			1e-15,
			'near -1'
		)

		// Tiny imaginary part strictly inside (-1, 1): arccos(0.5 + i*1e-200)
		const tinyIm = arccosComplexSeries({ re: 0.5, im: 1e-200 })
		assert.ok(Math.abs(tinyIm.re - Math.PI / 3) < 1e-15)
		const expectedTinyIm = -1e-200 / Math.sqrt(0.75)
		assert.ok(Math.abs((tinyIm.im - expectedTinyIm) / expectedTinyIm) < 1e-14)

		// Very large magnitude (must not overflow)
		const huge = arccosComplexSeries({ re: 1e200, im: 1e200 })
		assert.ok(Number.isFinite(huge.re) && Number.isFinite(huge.im))
		assertComplexClose(
			huge,
			{ re: Math.PI / 4, im: -(Math.LN2 + Math.log(1e200) + 0.5 * Math.LN2) },
			1e-12,
			'huge z = 1e200 + 1e200i'
		)

		// Near Number.MAX_VALUE (must not overflow)
		const nearMax = arccosComplexSeries({ re: -1e308, im: 0 })
		assert.equal(nearMax.re, Math.PI)
		assert.ok(Number.isFinite(nearMax.im))
		assert.ok(Math.abs(nearMax.im - -(Math.LN2 + Math.log(1e308))) < 1e-12)
	})

	it('validates inputs and throws TypeError / RangeError on invalid values', () => {
		for (const bad of [null, undefined, 0.5, '1+2i', true, [], {}]) {
			assert.throws(() => arccosComplexSeries(bad), TypeError)
		}

		assert.throws(() => arccosComplexSeries({ re: '1', im: 0 }), TypeError)
		assert.throws(() => arccosComplexSeries({ re: 0, im: null }), TypeError)

		assert.throws(() => arccosComplexSeries({ re: Number.NaN, im: 0 }), RangeError)
		assert.throws(() => arccosComplexSeries({ re: 0, im: Number.NaN }), RangeError)
		assert.throws(() => arccosComplexSeries({ re: Infinity, im: 0 }), RangeError)
		assert.throws(() => arccosComplexSeries({ re: 0, im: -Infinity }), RangeError)
	})
})
