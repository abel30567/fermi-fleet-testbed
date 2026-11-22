import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { cosComplexIterative } from './cosComplexIterative.js'

/**
 * Helper to assert two complex numbers are close within a combined
 * absolute + relative tolerance.
 */
function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	assert.equal(typeof actual.re, 'number', `${label} re should be a number`)
	assert.equal(typeof actual.im, 'number', `${label} im should be a number`)

	const reScale = Math.max(1, Math.abs(expected.re), Math.abs(actual.re))
	const imScale = Math.max(1, Math.abs(expected.im), Math.abs(actual.im))

	assert.ok(
		Math.abs(actual.re - expected.re) <= tol * reScale,
		`${label} re mismatch: got ${actual.re}, expected ${expected.re} (diff=${Math.abs(actual.re - expected.re)})`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol * imScale,
		`${label} im mismatch: got ${actual.im}, expected ${expected.im} (diff=${Math.abs(actual.im - expected.im)})`,
	)
}

/**
 * Independent reference using Euler's exponential definition:
 *   cos(z) = (exp(i*z) + exp(-i*z)) / 2
 * where i*(x + i*y) = -y + i*x and -i*(x + i*y) = y - i*x.
 */
function cosComplexViaExp({ re: x, im: y }) {
	// exp(i*z) = exp(-y + i*x) = exp(-y) * (cos(x) + i*sin(x))
	const expNegY = Math.exp(-y)
	const ePlusRe = expNegY * Math.cos(x)
	const ePlusIm = expNegY * Math.sin(x)

	// exp(-i*z) = exp(y - i*x) = exp(y) * (cos(-x) + i*sin(-x))
	const expPosY = Math.exp(y)
	const eMinusRe = expPosY * Math.cos(-x)
	const eMinusIm = expPosY * Math.sin(-x)

	return {
		re: 0.5 * (ePlusRe + eMinusRe),
		im: 0.5 * (ePlusIm + eMinusIm),
	}
}

/**
 * Independent naive direct complex Taylor series reference for moderate |z|:
 *   cos(z) = sum_{n=0}^{N} (-1)^n * z^{2n} / (2n)!
 */
function cosComplexDirectSeries(z, terms = 40) {
	const z2Re = z.re * z.re - z.im * z.im
	const z2Im = 2 * z.re * z.im

	let sumRe = 1
	let sumIm = 0
	let termRe = 1
	let termIm = 0

	for (let n = 1; n <= terms; n++) {
		const denom = (2 * n - 1) * (2 * n)
		const nextRe = -(termRe * z2Re - termIm * z2Im) / denom
		const nextIm = -(termRe * z2Im + termIm * z2Re) / denom
		termRe = nextRe
		termIm = nextIm
		sumRe += termRe
		sumIm += termIm
	}

	return { re: sumRe, im: sumIm }
}

describe('cosComplexIterative', () => {
	describe('normal cases', () => {
		test('evaluates general complex numbers accurately', () => {
			const samples = [
				{ re: 1, im: 1 },
				{ re: 0.5, im: -2 },
				{ re: -1.2, im: 0.7 },
				{ re: 3, im: 4 },
				{ re: -2.5, im: -3.5 },
				{ re: 10, im: -5 },
				{ re: 123.456, im: 7.89 },
			]

			for (const z of samples) {
				const actual = cosComplexIterative(z)
				const expected = {
					re: Math.cos(z.re) * Math.cosh(z.im),
					im: -Math.sin(z.re) * Math.sinh(z.im),
				}
				assertComplexClose(actual, expected, 1e-13, `z=${z.re}+${z.im}i`)
			}
		})

		test('matches real cosine on the real axis across all quadrants', () => {
			const angles = [
				-1000,
				-2 * Math.PI,
				-1.5 * Math.PI,
				-Math.PI,
				-Math.PI / 2,
				-Math.PI / 3,
				-Math.PI / 4,
				-Math.PI / 6,
				Math.PI / 6,
				Math.PI / 4,
				Math.PI / 3,
				Math.PI / 2,
				Math.PI,
				1.5 * Math.PI,
				2 * Math.PI,
				1000,
				1e6,
			]

			for (const a of angles) {
				const actual = cosComplexIterative({ re: a, im: 0 })
				assertComplexClose(actual, { re: Math.cos(a), im: 0 }, 1e-13, `a=${a}`)
				assert.ok(Object.is(actual.im, 0), `expected +0 imaginary part for real input a=${a}`)
			}
		})
	})

	describe('edge cases and symmetries', () => {
		test('handles zero and signed zero cleanly without -0', () => {
			const resZero = cosComplexIterative({ re: 0, im: 0 })
			assert.deepStrictEqual(resZero, { re: 1, im: 0 })
			assert.ok(Object.is(resZero.im, 0))

			const resNegZero = cosComplexIterative({ re: -0, im: -0 })
			assert.deepStrictEqual(resNegZero, { re: 1, im: 0 })
			assert.ok(Object.is(resNegZero.im, 0))
		})

		test('handles pi and pi/2 accurately', () => {
			const atPi = cosComplexIterative({ re: Math.PI, im: 0 })
			assertComplexClose(atPi, { re: -1, im: 0 }, 1e-15, 'cos(pi)')

			const atPiHalf = cosComplexIterative({ re: Math.PI / 2, im: 0 })
			assertComplexClose(atPiHalf, { re: 0, im: 0 }, 1e-15, 'cos(pi/2)')
		})

		test('reduces to cosh(b) on the pure imaginary axis', () => {
			const values = [0, 0.25, -0.25, 1, -1, 5, -10, 50, -100]
			for (const b of values) {
				const actual = cosComplexIterative({ re: 0, im: b })
				assertComplexClose(actual, { re: Math.cosh(b), im: 0 }, 1e-13, `z=${b}i`)
				assert.ok(Object.is(actual.im, 0), `expected +0 imaginary part for z=${b}i`)
			}
		})

		test('satisfies even symmetry: cos(-z) === cos(z)', () => {
			const points = [
				{ re: 0.7, im: 1.3 },
				{ re: -2.4, im: 5.1 },
				{ re: 4.2, im: -0.9 },
				{ re: 0, im: 3.7 },
				{ re: 2.1, im: 0 },
			]

			for (const z of points) {
				const pos = cosComplexIterative(z)
				const neg = cosComplexIterative({ re: -z.re, im: -z.im })
				assertComplexClose(neg, pos, 1e-15, `even symmetry at ${z.re}+${z.im}i`)
			}
		})

		test('satisfies conjugate symmetry: cos(conj(z)) === conj(cos(z))', () => {
			const points = [
				{ re: 0.8, im: 1.9 },
				{ re: -3.1, im: 2.2 },
				{ re: 5.5, im: -4.4 },
			]

			for (const z of points) {
				const cosConj = cosComplexIterative({ re: z.re, im: -z.im })
				const cosZ = cosComplexIterative(z)
				assertComplexClose(
					cosConj,
					{ re: cosZ.re, im: -cosZ.im },
					1e-15,
					`conjugate symmetry at ${z.re}+${z.im}i`,
				)
			}
		})

		test('satisfies 2*pi periodicity and pi half-period negation', () => {
			const z = { re: 1.23, im: -2.34 }
			const base = cosComplexIterative(z)
			const shifted2Pi = cosComplexIterative({ re: z.re + 2 * Math.PI, im: z.im })
			const shiftedPi = cosComplexIterative({ re: z.re + Math.PI, im: z.im })

			assertComplexClose(shifted2Pi, base, 1e-13, 'cos(z + 2pi) == cos(z)')
			assertComplexClose(shiftedPi, { re: -base.re, im: -base.im }, 1e-13, 'cos(z + pi) == -cos(z)')
		})

		test('matches quadratic approximation for tiny |z|', () => {
			const z = { re: 1e-7, im: -2e-7 }
			// cos(z) = 1 - z^2/2 + O(|z|^4)
			const z2Re = z.re * z.re - z.im * z.im
			const z2Im = 2 * z.re * z.im
			const expected = { re: 1 - 0.5 * z2Re, im: -0.5 * z2Im }
			const actual = cosComplexIterative(z)
			assertComplexClose(actual, expected, 1e-15, 'tiny z')
		})

		test('handles large real parts and large imaginary parts gracefully', () => {
			const largeReal = cosComplexIterative({ re: 1e9, im: 0.5 })
			assert.ok(Number.isFinite(largeReal.re))
			assert.ok(Number.isFinite(largeReal.im))

			const largeImag = cosComplexIterative({ re: 1.2, im: 700 })
			assertComplexClose(
				largeImag,
				{
					re: Math.cos(1.2) * Math.cosh(700),
					im: -Math.sin(1.2) * Math.sinh(700),
				},
				1e-12,
				'im=700',
			)

			// Pure imaginary overflow should not produce NaN from 0 * Infinity
			const overflowPureImag = cosComplexIterative({ re: 0, im: 1000 })
			assert.equal(overflowPureImag.re, Infinity)
			assert.ok(Object.is(overflowPureImag.im, 0))
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-object or invalid container inputs', () => {
			for (const bad of [null, undefined, 0, 42, '1+2i', true, false, [1, 2], () => {}]) {
				assert.throws(() => cosComplexIterative(bad), TypeError)
			}
		})

		test('throws TypeError when re or im is missing or not a number', () => {
			const badObjects = [
				{},
				{ re: 1 },
				{ im: 1 },
				{ re: '1', im: 0 },
				{ re: 0, im: '1' },
				{ re: null, im: 0 },
				{ re: 0, im: undefined },
				{ re: 1n, im: 0 },
				{ re: true, im: 0 },
			]
			for (const bad of badObjects) {
				assert.throws(() => cosComplexIterative(bad), TypeError)
			}
		})

		test('throws RangeError for NaN, Infinity, or -Infinity components', () => {
			const nonFinite = [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 0 },
				{ re: Number.NEGATIVE_INFINITY, im: 0 },
				{ re: 0, im: Number.POSITIVE_INFINITY },
				{ re: 0, im: Number.NEGATIVE_INFINITY },
				{ re: Number.NaN, im: Number.POSITIVE_INFINITY },
			]
			for (const bad of nonFinite) {
				assert.throws(() => cosComplexIterative(bad), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('matches exponential definition (e^{i(x+iy)} + e^{-i(x+iy)}) / 2 across a complex grid', () => {
			const xs = [-10, -Math.PI, -1.5, -0.3, 0, 0.3, 1.5, Math.PI, 10]
			const ys = [-12, -3.5, -1, -0.2, 0, 0.2, 1, 3.5, 12]

			for (const re of xs) {
				for (const im of ys) {
					const z = { re, im }
					const actual = cosComplexIterative(z)
					const expected = cosComplexViaExp(z)
					assertComplexClose(actual, expected, 1e-12, `exp check at ${re}+${im}i`)
				}
			}
		})

		test('matches direct complex Taylor series for moderate |z|', () => {
			const points = [
				{ re: 0.5, im: 0.5 },
				{ re: -1.1, im: 0.9 },
				{ re: 1.7, im: -1.3 },
				{ re: -2.0, im: -1.5 },
			]

			for (const z of points) {
				const actual = cosComplexIterative(z)
				const expected = cosComplexDirectSeries(z)
				assertComplexClose(actual, expected, 1e-13, `direct series at ${z.re}+${z.im}i`)
			}
		})

		test('satisfies complex double-angle identity: cos(2z) === 2*cos(z)^2 - 1', () => {
			const points = [
				{ re: 0.4, im: 0.6 },
				{ re: -1.3, im: 2.1 },
				{ re: 2.7, im: -1.8 },
				{ re: 0.1, im: 4.5 },
			]

			for (const z of points) {
				const cosZ = cosComplexIterative(z)
				const cos2Z = cosComplexIterative({ re: 2 * z.re, im: 2 * z.im })
				// 2 * cos(z)^2 - 1
				const rhs = {
					re: 2 * (cosZ.re * cosZ.re - cosZ.im * cosZ.im) - 1,
					im: 4 * cosZ.re * cosZ.im,
				}
				assertComplexClose(cos2Z, rhs, 1e-12, `double-angle at ${z.re}+${z.im}i`)
			}
		})
	})
})
