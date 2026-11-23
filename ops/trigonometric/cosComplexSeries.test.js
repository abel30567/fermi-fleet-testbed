import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { cosComplexSeries } from './cosComplexSeries.js'

function assertComplexClose(actual, expected, tol = 1e-12, message = '') {
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${message} real part mismatch: got ${actual.re}, expected ${expected.re} (tol ${tol})`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${message} imaginary part mismatch: got ${actual.im}, expected ${expected.im} (tol ${tol})`,
	)
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function complexAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

/**
 * Independent Maclaurin series implementation of cos(z):
 *   cos(z) = sum_{k=0}^N (-1)^k * z^(2k) / (2k)!
 */
function cosViaPowerSeries(z, maxTerms = 60) {
	const z2 = complexMul(z, z)
	let term = { re: 1, im: 0 }
	let sum = { re: 1, im: 0 }

	for (let k = 1; k <= maxTerms; k++) {
		const denom = (2 * k - 1) * (2 * k)
		const next = complexMul(term, z2)
		term = { re: -next.re / denom, im: -next.im / denom }
		sum = complexAdd(sum, term)
		if (Math.hypot(term.re, term.im) <= 1e-16 * Math.hypot(sum.re, sum.im)) {
			break
		}
	}
	return sum
}

/**
 * Independent Euler exponential formula implementation of cos(z):
 *   cos(z) = (exp(i*z) + exp(-i*z)) / 2
 */
function cosViaEuler(z) {
	// i*z = -im + i*re  => exp(i*z) = exp(-im) * (cos(re) + i*sin(re))
	// -i*z = im - i*re  => exp(-i*z) = exp(im) * (cos(re) - i*sin(re))
	const eNegY = Math.exp(-z.im)
	const ePosY = Math.exp(z.im)
	const cosX = Math.cos(z.re)
	const sinX = Math.sin(z.re)
	return {
		re: 0.5 * (eNegY + ePosY) * cosX,
		im: 0.5 * (eNegY - ePosY) * sinX,
	}
}

describe('cosComplexSeries', () => {
	test('computes cosine on real axis (im = 0)', () => {
		const zero = cosComplexSeries({ re: 0, im: 0 })
		assert.equal(zero.re, 1)
		assert.equal(zero.im, 0)
		assert.ok(!Object.is(zero.im, -0))

		assertComplexClose(cosComplexSeries({ re: Math.PI / 2, im: 0 }), { re: 0, im: 0 })
		assertComplexClose(cosComplexSeries({ re: Math.PI, im: 0 }), { re: -1, im: 0 })
		assertComplexClose(cosComplexSeries({ re: Math.PI / 3, im: 0 }), { re: 0.5, im: 0 })
		assertComplexClose(cosComplexSeries({ re: -Math.PI / 4, im: 0 }), {
			re: Math.SQRT1_2,
			im: 0,
		})
	})

	test('computes cosine on imaginary axis (re = 0) as cosh(y)', () => {
		for (const y of [-3, -1, 0, 0.5, 1, 2.5, 5]) {
			const res = cosComplexSeries({ re: 0, im: y })
			assertComplexClose(res, { re: Math.cosh(y), im: 0 })
			assert.equal(res.im, 0)
			assert.ok(!Object.is(res.im, -0))
		}
	})

	test('computes cosine for general complex inputs', () => {
		// cos(1 + i) = cos(1)*cosh(1) - i*sin(1)*sinh(1)
		assertComplexClose(cosComplexSeries({ re: 1, im: 1 }), {
			re: 0.8337300251311491,
			im: -0.9888977057628651,
		})

		// cos(-2 + 3i)
		assertComplexClose(cosComplexSeries({ re: -2, im: 3 }), {
			re: -4.189625690968807,
			im: 9.109227893755337,
		})

		// cos(pi/2 + i*y) = -i*sinh(y)
		assertComplexClose(cosComplexSeries({ re: Math.PI / 2, im: 2 }), {
			re: 0,
			im: -Math.sinh(2),
		})
	})

	test('satisfies algebraic and symmetry identities', () => {
		const samples = [
			{ re: 0.3, im: 0.7 },
			{ re: -1.4, im: 2.1 },
			{ re: 2.7, im: -0.9 },
			{ re: -0.8, im: -1.6 },
		]

		for (const z of samples) {
			const cz = cosComplexSeries(z)

			// Even function: cos(-z) = cos(z)
			assertComplexClose(cosComplexSeries({ re: -z.re, im: -z.im }), cz)

			// Conjugate symmetry: cos(conj(z)) = conj(cos(z))
			assertComplexClose(cosComplexSeries({ re: z.re, im: -z.im }), {
				re: cz.re,
				im: -cz.im,
			})

			// 2*pi periodicity: cos(z + 2*pi) = cos(z)
			assertComplexClose(cosComplexSeries({ re: z.re + 2 * Math.PI, im: z.im }), cz, 1e-11)

			// Half-period sign flip: cos(z + pi) = -cos(z)
			assertComplexClose(
				cosComplexSeries({ re: z.re + Math.PI, im: z.im }),
				{ re: -cz.re, im: -cz.im },
				1e-11,
			)

			// Double-angle identity: cos(2z) = 2*cos(z)^2 - 1
			const cz2 = complexMul(cz, cz)
			const doubleAngleRhs = { re: 2 * cz2.re - 1, im: 2 * cz2.im }
			assertComplexClose(
				cosComplexSeries({ re: 2 * z.re, im: 2 * z.im }),
				doubleAngleRhs,
				1e-11,
			)

			// Pythagorean identity: cos(z)^2 + sin(z)^2 = 1 where sin(z) = cos(pi/2 - z)
			const sz = cosComplexSeries({ re: Math.PI / 2 - z.re, im: -z.im })
			const pyth = complexAdd(complexMul(cz, cz), complexMul(sz, sz))
			assertComplexClose(pyth, { re: 1, im: 0 }, 1e-11)
		}
	})

	test('cross-checks against independent Maclaurin power series and Euler formula', () => {
		const points = [
			{ re: 0, im: 0 },
			{ re: 0.1, im: -0.2 },
			{ re: 0.7, im: 0.9 },
			{ re: -1.2, im: 1.5 },
			{ re: 2.3, im: -1.8 },
			{ re: -2.5, im: -2.5 },
			{ re: 3.1, im: 0.4 },
		]

		for (const z of points) {
			const actual = cosComplexSeries(z)
			const viaSeries = cosViaPowerSeries(z)
			const viaEuler = cosViaEuler(z)

			assertComplexClose(actual, viaSeries, 1e-12, `series cross-check for (${z.re}, ${z.im})`)
			assertComplexClose(actual, viaEuler, 1e-12, `Euler cross-check for (${z.re}, ${z.im})`)
		}
	})

	test('handles negative zero, tiny values, and overflow edge cases cleanly', () => {
		// Negative zeros in inputs should not produce -0 outputs
		const negZero = cosComplexSeries({ re: -0, im: -0 })
		assert.equal(negZero.re, 1)
		assert.equal(negZero.im, 0)
		assert.ok(!Object.is(negZero.im, -0))

		// Very small values: cos(z) ≈ 1 - z^2 / 2
		const eps = { re: 1e-7, im: -2e-7 }
		const eps2 = complexMul(eps, eps)
		assertComplexClose(
			cosComplexSeries(eps),
			{ re: 1 - 0.5 * eps2.re, im: -0.5 * eps2.im },
			1e-15,
		)

		// Purely imaginary overflow should keep imaginary part 0 (not NaN)
		const bigImag = cosComplexSeries({ re: 0, im: 1000 })
		assert.equal(bigImag.re, Infinity)
		assert.equal(bigImag.im, 0)
	})

	test('validates input types and finite values', () => {
		assert.throws(() => cosComplexSeries(), TypeError)
		assert.throws(() => cosComplexSeries(null), TypeError)
		assert.throws(() => cosComplexSeries(1), TypeError)
		assert.throws(() => cosComplexSeries('1+2i'), TypeError)
		assert.throws(() => cosComplexSeries([1, 2]), TypeError)
		assert.throws(() => cosComplexSeries({ re: 1 }), TypeError)
		assert.throws(() => cosComplexSeries({ im: 2 }), TypeError)
		assert.throws(() => cosComplexSeries({ re: '1', im: 2 }), TypeError)
		assert.throws(() => cosComplexSeries({ re: 1, im: null }), TypeError)

		assert.throws(() => cosComplexSeries({ re: Number.NaN, im: 0 }), RangeError)
		assert.throws(() => cosComplexSeries({ re: 0, im: Number.NaN }), RangeError)
		assert.throws(() => cosComplexSeries({ re: Infinity, im: 0 }), RangeError)
		assert.throws(() => cosComplexSeries({ re: 0, im: -Infinity }), RangeError)
	})
})
