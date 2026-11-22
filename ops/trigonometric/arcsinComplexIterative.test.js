import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { arcsinComplexIterative } from './arcsinComplexIterative.js'

/**
 * Independent complex sine: sin(u + i*v) = sin(u)*cosh(v) + i*cos(u)*sinh(v).
 */
function sinComplex({ re, im }) {
	return {
		re: Math.sin(re) * Math.cosh(im),
		im: Math.cos(re) * Math.sinh(im),
	}
}

/**
 * Independent closed-form Abramowitz & Stegun 4.4.37 reference for complex arcsin:
 * alpha = (|z + 1| + |z - 1|) / 2, beta = (|z + 1| - |z - 1|) / 2
 * arcsin(z) = asin(beta) + i * sign * acosh(alpha)
 */
function arcsinAbramowitzReference({ re, im }) {
	const r1 = Math.hypot(re + 1, im)
	const r2 = Math.hypot(re - 1, im)
	const alpha = Math.max(1, 0.5 * (r1 + r2))
	const beta = Math.max(-1, Math.min(1, 0.5 * (r1 - r2)))
	const outRe = Math.asin(beta)
	const outImMag = Math.acosh(alpha)
	const outIm = outImMag === 0 ? 0 : (im < 0 ? -outImMag : outImMag)
	return { re: outRe === 0 ? 0 : outRe, im: outIm }
}

/**
 * Assert two complex numbers are close within absolute + relative tolerance.
 */
function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	const scaleRe = Math.max(1, Math.abs(expected.re))
	const scaleIm = Math.max(1, Math.abs(expected.im))
	const errRe = Math.abs(actual.re - expected.re)
	const errIm = Math.abs(actual.im - expected.im)
	assert.ok(
		errRe <= tol * scaleRe,
		`${label} real part mismatch: got ${actual.re}, expected ${expected.re} (err=${errRe})`
	)
	assert.ok(
		errIm <= tol * scaleIm,
		`${label} imag part mismatch: got ${actual.im}, expected ${expected.im} (err=${errIm})`
	)
}

describe('arcsinComplexIterative', () => {
	describe('normal cases', () => {
		test('standard real values in [-1, 1]', () => {
			const cases = [
				{ z: { re: 0.5, im: 0 }, expected: { re: Math.PI / 6, im: 0 } },
				{ z: { re: -0.5, im: 0 }, expected: { re: -Math.PI / 6, im: 0 } },
				{ z: { re: Math.SQRT1_2, im: 0 }, expected: { re: Math.PI / 4, im: 0 } },
				{ z: { re: -Math.SQRT1_2, im: 0 }, expected: { re: -Math.PI / 4, im: 0 } },
				{ z: { re: Math.sqrt(3) / 2, im: 0 }, expected: { re: Math.PI / 3, im: 0 } },
				{ z: { re: -Math.sqrt(3) / 2, im: 0 }, expected: { re: -Math.PI / 3, im: 0 } },
			]
			for (const { z, expected } of cases) {
				assertComplexClose(arcsinComplexIterative(z), expected, 1e-14, `z=${z.re}`)
			}
		})

		test('general complex numbers in all four quadrants', () => {
			// Exact constructed pairs: z = sin(w) for known w with Re(w) in (-pi/2, pi/2)
			const targets = [
				{ re: 0.4, im: 0.7 },
				{ re: -0.4, im: 0.7 },
				{ re: -0.4, im: -0.7 },
				{ re: 0.4, im: -0.7 },
				{ re: 1.1, im: 2.3 },
				{ re: -1.1, im: 2.3 },
				{ re: -1.1, im: -2.3 },
				{ re: 1.1, im: -2.3 },
			]
			for (const w of targets) {
				const z = sinComplex(w)
				const result = arcsinComplexIterative(z)
				assertComplexClose(result, w, 1e-13, `w=(${w.re}, ${w.im})`)
			}
		})
	})

	describe('edge cases', () => {
		test('origin (0 + 0i) and negative zeros', () => {
			assert.deepStrictEqual(arcsinComplexIterative({ re: 0, im: 0 }), { re: 0, im: 0 })
			assert.deepStrictEqual(arcsinComplexIterative({ re: -0, im: -0 }), { re: 0, im: 0 })
		})

		test('branch points ±1', () => {
			assertComplexClose(
				arcsinComplexIterative({ re: 1, im: 0 }),
				{ re: Math.PI / 2, im: 0 },
				1e-15,
				'z=1'
			)
			assertComplexClose(
				arcsinComplexIterative({ re: -1, im: 0 }),
				{ re: -Math.PI / 2, im: 0 },
				1e-15,
				'z=-1'
			)
			assert.equal(arcsinComplexIterative({ re: 1, im: 0 }).im, 0)
			assert.equal(arcsinComplexIterative({ re: -1, im: 0 }).im, 0)
		})

		test('real |x| > 1 along both branch cuts and upper/lower continuity', () => {
			for (const x of [1.0001, 2, 10, 1e6]) {
				const pos = arcsinComplexIterative({ re: x, im: 0 })
				assertComplexClose(pos, { re: Math.PI / 2, im: Math.acosh(x) }, 1e-13, `z=${x}`)

				const neg = arcsinComplexIterative({ re: -x, im: 0 })
				assertComplexClose(neg, { re: -Math.PI / 2, im: Math.acosh(x) }, 1e-13, `z=${-x}`)
			}

			// Upper half-plane approaches branch cut continuously; lower half-plane has negative imag
			const abovePos = arcsinComplexIterative({ re: 2, im: 1e-9 })
			const belowPos = arcsinComplexIterative({ re: 2, im: -1e-9 })
			assertComplexClose(abovePos, { re: Math.PI / 2, im: Math.acosh(2) }, 1e-7, '2+1e-9i')
			assertComplexClose(belowPos, { re: Math.PI / 2, im: -Math.acosh(2) }, 1e-7, '2-1e-9i')

			const aboveNeg = arcsinComplexIterative({ re: -2, im: 1e-9 })
			const belowNeg = arcsinComplexIterative({ re: -2, im: -1e-9 })
			assertComplexClose(aboveNeg, { re: -Math.PI / 2, im: Math.acosh(2) }, 1e-7, '-2+1e-9i')
			assertComplexClose(belowNeg, { re: -Math.PI / 2, im: -Math.acosh(2) }, 1e-7, '-2-1e-9i')
		})

		test('pure imaginary inputs (0 + iy) equal i * asinh(y)', () => {
			for (const y of [-1e8, -100, -5, -1, -1e-12, 1e-12, 1, 5, 100, 1e8]) {
				const res = arcsinComplexIterative({ re: 0, im: y })
				assert.equal(res.re, 0, `expected exact re=0 for z=${y}i`)
				assertComplexClose(res, { re: 0, im: Math.asinh(y) }, 1e-13, `z=${y}i`)
			}
		})

		test('near-singular, tiny, and extreme magnitude inputs', () => {
			// Near z = 1 with tiny imaginary offset
			const near1 = arcsinComplexIterative({ re: 1, im: 1e-12 })
			assertComplexClose(sinComplex(near1), { re: 1, im: 1e-12 }, 1e-12, 'near 1')

			// Real in (0, 1) with extremely tiny imaginary part (tests cancellation-free ln1p)
			const tinyIm = arcsinComplexIterative({ re: 0.5, im: 1e-15 })
			const expectedTinyIm = 1e-15 / Math.sqrt(1 - 0.25)
			assert.ok(
				Math.abs(tinyIm.im - expectedTinyIm) <= 1e-13 * expectedTinyIm,
				`tinyIm mismatch: got ${tinyIm.im}, expected ${expectedTinyIm}`
			)

			// Very small complex input: arcsin(z) ~ z
			const tiny = arcsinComplexIterative({ re: 1e-12, im: -2e-12 })
			assertComplexClose(tiny, { re: 1e-12, im: -2e-12 }, 1e-14, 'tiny z')

			// Large magnitude where naive 1 - z^2 would cancel or overflow
			const large = arcsinComplexIterative({ re: 1e8, im: 1e8 })
			assertComplexClose(
				large,
				{ re: Math.PI / 4, im: Math.log(2 * Math.SQRT2 * 1e8) },
				1e-13,
				'1e8 + 1e8i'
			)

			// Extreme magnitude > 1e150 (tests asymptotic overflow-free branch)
			const huge = arcsinComplexIterative({ re: 1e200, im: -1e200 })
			assertComplexClose(
				huge,
				{ re: Math.PI / 4, im: -(Math.log(2 * Math.SQRT2) + 200 * Math.LN10) },
				1e-13,
				'1e200 - 1e200i'
			)
		})
	})

	describe('invalid input validation', () => {
		test('throws TypeError for non-object or malformed inputs', () => {
			const invalidTypes = [
				undefined,
				null,
				0,
				1,
				'0.5',
				true,
				[0.5, 0],
				() => ({ re: 0, im: 0 }),
				{},
				{ re: 0.5 },
				{ im: 0.5 },
				{ re: '0.5', im: 0 },
				{ re: 0, im: '0.5' },
				{ re: null, im: 0 },
				{ re: 0, im: undefined },
				{ re: 1n, im: 0 },
			]
			for (const bad of invalidTypes) {
				assert.throws(
					() => arcsinComplexIterative(bad),
					TypeError,
					`expected TypeError for ${String(bad)}`
				)
			}
		})

		test('throws RangeError for NaN or non-finite components', () => {
			const nonFinite = [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 0 },
				{ re: Number.NEGATIVE_INFINITY, im: 0 },
				{ re: 0, im: Number.POSITIVE_INFINITY },
				{ re: 0, im: Number.NEGATIVE_INFINITY },
				{ re: Number.POSITIVE_INFINITY, im: Number.NEGATIVE_INFINITY },
			]
			for (const bad of nonFinite) {
				assert.throws(
					() => arcsinComplexIterative(bad),
					RangeError,
					`expected RangeError for (${bad.re}, ${bad.im})`
				)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('sin(arcsin(z)) === z across all quadrants, axes, and branch cuts', () => {
			const coords = [-5, -2, -1.5, -1, -0.7, -0.1, 0, 0.1, 0.7, 1, 1.5, 2, 5]
			for (const re of coords) {
				for (const im of coords) {
					const z = { re, im }
					const w = arcsinComplexIterative(z)

					// Principal value real part must lie in [-pi/2, pi/2]
					assert.ok(
						w.re >= -Math.PI / 2 - 1e-15 && w.re <= Math.PI / 2 + 1e-15,
						`principal range violated for (${re}, ${im}): re=${w.re}`
					)

					// Round-trip inverse check: sin(arcsin(z)) === z
					const roundTrip = sinComplex(w)
					assertComplexClose(roundTrip, z, 1e-12, `sin(arcsin(${re}+${im}i))`)
				}
			}
		})

		test('matches independent Abramowitz & Stegun closed-form reference across quadrants', () => {
			const testPoints = [
				{ re: 0.3, im: 0.4 },
				{ re: -0.3, im: 0.4 },
				{ re: -0.3, im: -0.4 },
				{ re: 0.3, im: -0.4 },
				{ re: 2.5, im: 1.5 },
				{ re: -2.5, im: 1.5 },
				{ re: -2.5, im: -1.5 },
				{ re: 2.5, im: -1.5 },
				{ re: 0.99, im: 0.02 },
				{ re: -1.01, im: -0.02 },
				{ re: 3, im: 0 },
				{ re: -3, im: 0 },
			]
			for (const z of testPoints) {
				const actual = arcsinComplexIterative(z)
				const ref = arcsinAbramowitzReference(z)
				assertComplexClose(actual, ref, 1e-13, `A&S ref at (${z.re}, ${z.im})`)
			}
		})

		test('satisfies odd symmetry arcsin(-z) = -arcsin(z) and conjugate symmetry off branch cuts', () => {
			const offCutPoints = [
				{ re: 0.3, im: 0.8 },
				{ re: 2.1, im: 1.4 },
				{ re: -1.7, im: 0.5 },
				{ re: 0.6, im: -3.2 },
			]
			for (const z of offCutPoints) {
				const w = arcsinComplexIterative(z)
				const wNeg = arcsinComplexIterative({ re: -z.re, im: -z.im })
				assertComplexClose(wNeg, { re: -w.re, im: -w.im }, 1e-14, `odd (${z.re}, ${z.im})`)

				const wConj = arcsinComplexIterative({ re: z.re, im: -z.im })
				assertComplexClose(wConj, { re: w.re, im: -w.im }, 1e-14, `conj (${z.re}, ${z.im})`)
			}
		})

		test('matches Maclaurin power series for small |z|', () => {
			// arcsin(z) = sum_{n=0}^N ((2n)! / (4^n (n!)^2 (2n+1))) z^(2n+1)
			function arcsinSeries(z, terms = 25) {
				const z2Re = z.re * z.re - z.im * z.im
				const z2Im = 2 * z.re * z.im
				let powRe = z.re
				let powIm = z.im
				let coeff = 1
				let sumRe = z.re
				let sumIm = z.im
				for (let n = 1; n < terms; n++) {
					coeff *= ((2 * n - 1) * (2 * n - 1)) / ((2 * n) * (2 * n + 1))
					const nextRe = powRe * z2Re - powIm * z2Im
					const nextIm = powRe * z2Im + powIm * z2Re
					powRe = nextRe
					powIm = nextIm
					sumRe += coeff * powRe
					sumIm += coeff * powIm
				}
				return { re: sumRe, im: sumIm }
			}

			for (const z of [
				{ re: 0.15, im: 0.12 },
				{ re: -0.2, im: 0.1 },
				{ re: -0.1, im: -0.18 },
				{ re: 0.12, im: -0.15 },
			]) {
				const actual = arcsinComplexIterative(z)
				const series = arcsinSeries(z)
				assertComplexClose(actual, series, 1e-14, `series (${z.re}, ${z.im})`)
			}
		})
	})
})
