import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { log2ComplexIterative } from './log2ComplexIterative.js'

const EPS = 1e-12

function assertComplexClose(actual, expected, tol = EPS, label = '') {
	const prefix = label ? `${label}: ` : ''
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${prefix}real part mismatch: got ${actual.re}, expected ${expected.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${prefix}imaginary part mismatch: got ${actual.im}, expected ${expected.im}`
	)
}

/**
 * Independent complex base-2 exponential: 2^(u + iv) = 2^u * (cos(v*ln2) + i*sin(v*ln2)).
 */
function pow2Complex({ re, im }) {
	const mag = 2 ** re
	const angle = im * Math.LN2
	return {
		re: mag * Math.cos(angle),
		im: mag * Math.sin(angle),
	}
}

describe('log2ComplexIterative', () => {
	test('handles positive real powers of 2 exactly', () => {
		assert.deepStrictEqual(log2ComplexIterative({ re: 1, im: 0 }), { re: 0, im: 0 })
		assert.deepStrictEqual(log2ComplexIterative({ re: 2, im: 0 }), { re: 1, im: 0 })
		assert.deepStrictEqual(log2ComplexIterative({ re: 8, im: 0 }), { re: 3, im: 0 })
		assert.deepStrictEqual(log2ComplexIterative({ re: 0.25, im: 0 }), { re: -2, im: 0 })
	})

	test('handles general positive and negative real numbers', () => {
		assertComplexClose(log2ComplexIterative({ re: 10, im: 0 }), {
			re: Math.log2(10),
			im: 0,
		})
		assertComplexClose(log2ComplexIterative({ re: -1, im: 0 }), {
			re: 0,
			im: Math.PI / Math.LN2,
		})
		assertComplexClose(log2ComplexIterative({ re: -8, im: 0 }), {
			re: 3,
			im: Math.PI / Math.LN2,
		})
		assertComplexClose(log2ComplexIterative({ re: -0.5, im: 0 }), {
			re: -1,
			im: Math.PI / Math.LN2,
		})
	})

	test('handles pure imaginary numbers', () => {
		assertComplexClose(log2ComplexIterative({ re: 0, im: 1 }), {
			re: 0,
			im: Math.PI / (2 * Math.LN2),
		})
		assertComplexClose(log2ComplexIterative({ re: 0, im: -1 }), {
			re: 0,
			im: -Math.PI / (2 * Math.LN2),
		})
		assertComplexClose(log2ComplexIterative({ re: 0, im: 4 }), {
			re: 2,
			im: Math.PI / (2 * Math.LN2),
		})
		assertComplexClose(log2ComplexIterative({ re: 0, im: -0.5 }), {
			re: -1,
			im: -Math.PI / (2 * Math.LN2),
		})
	})

	test('handles complex numbers across all four quadrants', () => {
		const samples = [
			{ re: 1, im: 1 },
			{ re: -1, im: 1 },
			{ re: -1, im: -1 },
			{ re: 1, im: -1 },
			{ re: 3, im: 4 },
			{ re: -5, im: 12 },
			{ re: -7, im: -24 },
			{ re: 8, im: -15 },
		]

		for (const z of samples) {
			const res = log2ComplexIterative(z)
			const expected = {
				re: Math.log2(Math.hypot(z.re, z.im)),
				im: Math.atan2(z.im, z.re) / Math.LN2,
			}
			assertComplexClose(res, expected, EPS, `quadrant sample (${z.re}, ${z.im})`)
		}
	})

	test('edge cases: very large magnitudes without overflow', () => {
		// Math.hypot(1.5e308, 1.5e308) overflows to Infinity, but iterative scaling stays finite
		const z = { re: 1.5e308, im: 1.5e308 }
		const res = log2ComplexIterative(z)
		const expectedRe = Math.log2(1.5e308) + 0.5
		const expectedIm = Math.PI / (4 * Math.LN2)
		assertComplexClose(res, { re: expectedRe, im: expectedIm }, 1e-11, 'large magnitude')
	})

	test('edge cases: subnormal magnitudes and values near 1', () => {
		assert.deepStrictEqual(log2ComplexIterative({ re: Number.MIN_VALUE, im: 0 }), {
			re: -1074,
			im: 0,
		})
		assertComplexClose(
			log2ComplexIterative({ re: 0, im: Number.MIN_VALUE }),
			{ re: -1074, im: Math.PI / (2 * Math.LN2) },
			EPS,
			'subnormal imaginary'
		)

		const nearOne = { re: 1 + 1e-10, im: 1e-10 }
		const res = log2ComplexIterative(nearOne)
		assertComplexClose(
			res,
			{
				re: Math.log2(Math.hypot(nearOne.re, nearOne.im)),
				im: Math.atan2(nearOne.im, nearOne.re) / Math.LN2,
			},
			1e-14,
			'near 1'
		)
	})

	test('edge cases: signed zero on negative real axis and input immutability', () => {
		const negZeroBranch = log2ComplexIterative({ re: -1, im: -0 })
		assertComplexClose(negZeroBranch, { re: 0, im: -Math.PI / Math.LN2 })

		const input = Object.freeze({ re: 3, im: -4 })
		const res = log2ComplexIterative(input)
		assert.equal(input.re, 3)
		assert.equal(input.im, -4)
		assert.ok(Number.isFinite(res.re) && Number.isFinite(res.im))
	})

	test('independent cross-check: 2^(log2ComplexIterative(z)) === z', () => {
		const testPoints = [
			{ re: 1, im: 0 },
			{ re: -1, im: 0 },
			{ re: 0, im: 2.5 },
			{ re: 0, im: -0.125 },
			{ re: 2.718281828, im: 3.141592653 },
			{ re: -4.2, im: 1.7 },
			{ re: -0.03, im: -0.04 },
			{ re: 123.456, im: -789.012 },
			{ re: 1e-100, im: -2e-100 },
			{ re: -3e100, im: 4e100 },
		]

		for (const z of testPoints) {
			const w = log2ComplexIterative(z)
			const reconstructed = pow2Complex(w)
			const scale = Math.max(1, Math.hypot(z.re, z.im))
			assertComplexClose(reconstructed, z, scale * 1e-12, `round-trip (${z.re}, ${z.im})`)
		}
	})

	test('independent cross-check: algebraic identities (conjugate, reciprocal, scaling, product)', () => {
		const z = { re: 2.5, im: -1.75 }
		const logZ = log2ComplexIterative(z)

		// Conjugate: log2(conj(z)) === conj(log2(z))
		const logConj = log2ComplexIterative({ re: z.re, im: -z.im })
		assertComplexClose(logConj, { re: logZ.re, im: -logZ.im }, EPS, 'conjugate')

		// Reciprocal: log2(1/z) === -log2(z)
		const denom = z.re * z.re + z.im * z.im
		const invZ = { re: z.re / denom, im: -z.im / denom }
		assertComplexClose(log2ComplexIterative(invZ), { re: -logZ.re, im: -logZ.im }, EPS, 'reciprocal')

		// Power-of-2 scaling: log2(2^k * z) === k + log2(z)
		const k = 17
		const scaled = { re: z.re * 2 ** k, im: z.im * 2 ** k }
		assertComplexClose(log2ComplexIterative(scaled), { re: logZ.re + k, im: logZ.im }, EPS, 'scaling')

		// Product: log2(z1 * z2) === log2(z1) + log2(z2) when arg sum stays in (-pi, pi]
		const z1 = { re: 2, im: 1 }
		const z2 = { re: 3, im: 2 }
		const prod = { re: z1.re * z2.re - z1.im * z2.im, im: z1.re * z2.im + z1.im * z2.re }
		const log1 = log2ComplexIterative(z1)
		const log2 = log2ComplexIterative(z2)
		assertComplexClose(
			log2ComplexIterative(prod),
			{ re: log1.re + log2.re, im: log1.im + log2.im },
			EPS,
			'product'
		)
	})

	test('rejects invalid inputs with TypeError or RangeError', () => {
		const typeErrors = [
			null,
			undefined,
			42,
			'1+i',
			true,
			[1, 2],
			{},
			{ re: 1 },
			{ im: 1 },
			{ re: '1', im: 0 },
			{ re: 1, im: null },
		]
		for (const bad of typeErrors) {
			assert.throws(() => log2ComplexIterative(bad), TypeError)
		}

		const rangeErrors = [
			{ re: 0, im: 0 },
			{ re: -0, im: 0 },
			{ re: 0, im: -0 },
			{ re: NaN, im: 0 },
			{ re: 1, im: NaN },
			{ re: Infinity, im: 0 },
			{ re: 1, im: -Infinity },
		]
		for (const bad of rangeErrors) {
			assert.throws(() => log2ComplexIterative(bad), RangeError)
		}
	})
})
