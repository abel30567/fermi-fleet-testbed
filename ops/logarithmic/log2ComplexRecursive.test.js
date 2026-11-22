import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { log2ComplexRecursive } from './log2ComplexRecursive.js'

const PI_OVER_LN2 = Math.PI / Math.LN2

/**
 * Assert two numbers are within an absolute/relative tolerance.
 */
function assertClose(actual, expected, tol = 1e-12, label = '') {
	const scale = Math.max(1, Math.abs(expected))
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol * scale,
		`${label ? label + ': ' : ''}expected ${actual} to be close to ${expected} (diff=${diff}, allowed=${tol * scale})`,
	)
}

/**
 * Assert two complex numbers { re, im } are close component-wise.
 */
function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	assertClose(actual.re, expected.re, tol, `${label} re`)
	assertClose(actual.im, expected.im, tol, `${label} im`)
}

/**
 * Independent reference implementation of 2^w for complex w = { re, im }:
 *   2^(a + bi) = 2^a * (cos(b * ln 2) + i * sin(b * ln 2))
 */
function pow2ComplexRef(w) {
	const r = 2 ** w.re
	const theta = w.im * Math.LN2
	return {
		re: r * Math.cos(theta),
		im: r * Math.sin(theta),
	}
}

/**
 * Independent direct reference formula for log2(z) on moderate-scale inputs.
 */
function log2ComplexDirectRef(z) {
	return {
		re: Math.log2(Math.hypot(z.re, z.im)),
		im: Math.atan2(z.im, z.re) / Math.LN2,
	}
}

describe('log2ComplexRecursive', () => {
	describe('normal cases', () => {
		it('computes exact integer results for positive powers of 2', () => {
			for (const k of [-40, -10, -2, -1, 0, 1, 2, 3, 10, 40]) {
				const res = log2ComplexRecursive({ re: 2 ** k, im: 0 })
				assert.equal(res.re, k)
				assert.equal(res.im, 0)
				assert.equal(Object.is(res.re, -0), false)
				assert.equal(Object.is(res.im, -0), false)
			}
		})

		it('computes accurate results for positive non-power-of-2 reals', () => {
			for (const x of [0.3, 1.5, 3, Math.E, Math.PI, 10, 1000]) {
				const res = log2ComplexRecursive({ re: x, im: 0 })
				assertClose(res.re, Math.log2(x), 1e-14, `log2(${x}).re`)
				assert.equal(res.im, 0)
			}
		})

		it('computes accurate results across all four quadrants', () => {
			const samples = [
				{ re: 3, im: 4 },
				{ re: -3, im: 4 },
				{ re: -3, im: -4 },
				{ re: 3, im: -4 },
				{ re: 1, im: 1 },
				{ re: -1, im: 1 },
				{ re: -1, im: -1 },
				{ re: 1, im: -1 },
				{ re: 7.5, im: -2.25 },
				{ re: -0.125, im: 6.75 },
			]
			for (const z of samples) {
				const res = log2ComplexRecursive(z)
				const ref = log2ComplexDirectRef(z)
				assertComplexClose(res, ref, 1e-14, `z=${z.re}+${z.im}i`)
			}
		})
	})

	describe('edge cases', () => {
		it('handles pure negative reals along the principal branch cut (Arg = +pi)', () => {
			assertComplexClose(
				log2ComplexRecursive({ re: -1, im: 0 }),
				{ re: 0, im: PI_OVER_LN2 },
				1e-14,
				'log2(-1)',
			)
			assertComplexClose(
				log2ComplexRecursive({ re: -8, im: 0 }),
				{ re: 3, im: PI_OVER_LN2 },
				1e-14,
				'log2(-8)',
			)
			assertComplexClose(
				log2ComplexRecursive({ re: -0.25, im: 0 }),
				{ re: -2, im: PI_OVER_LN2 },
				1e-14,
				'log2(-0.25)',
			)
		})

		it('handles pure imaginary inputs', () => {
			assertComplexClose(
				log2ComplexRecursive({ re: 0, im: 1 }),
				{ re: 0, im: PI_OVER_LN2 / 2 },
				1e-14,
				'log2(i)',
			)
			assertComplexClose(
				log2ComplexRecursive({ re: 0, im: -1 }),
				{ re: 0, im: -PI_OVER_LN2 / 2 },
				1e-14,
				'log2(-i)',
			)
			assertComplexClose(
				log2ComplexRecursive({ re: 0, im: 16 }),
				{ re: 4, im: PI_OVER_LN2 / 2 },
				1e-14,
				'log2(16i)',
			)
			assertComplexClose(
				log2ComplexRecursive({ re: 0, im: -0.5 }),
				{ re: -1, im: -PI_OVER_LN2 / 2 },
				1e-14,
				'log2(-0.5i)',
			)
		})

		it('normalizes signed zeros (-0) on inputs and outputs', () => {
			const r1 = log2ComplexRecursive({ re: 1, im: -0 })
			assert.equal(Object.is(r1.re, 0), true)
			assert.equal(Object.is(r1.im, 0), true)

			// -1 + (-0)i normalizes im to +0 -> principal branch Arg = +pi
			const r2 = log2ComplexRecursive({ re: -1, im: -0 })
			assertComplexClose(r2, { re: 0, im: PI_OVER_LN2 }, 1e-14, 'log2(-1 - 0i)')

			const r3 = log2ComplexRecursive({ re: -0, im: 1 })
			assertComplexClose(r3, { re: 0, im: PI_OVER_LN2 / 2 }, 1e-14, 'log2(-0 + i)')
		})

		it('distinguishes values just above and below the negative real branch cut', () => {
			const above = log2ComplexRecursive({ re: -1, im: 1e-12 })
			const below = log2ComplexRecursive({ re: -1, im: -1e-12 })
			assertClose(above.re, 0, 1e-14, 'above re')
			assertClose(below.re, 0, 1e-14, 'below re')
			assert.ok(above.im > 0, 'just above branch cut should have positive imaginary part')
			assert.ok(below.im < 0, 'just below branch cut should have negative imaginary part')
			assertClose(above.im, PI_OVER_LN2 - 1e-12 / Math.LN2, 1e-14, 'above im')
			assertClose(below.im, -(PI_OVER_LN2 - 1e-12 / Math.LN2), 1e-14, 'below im')
		})

		it('preserves high precision near z = 1 without catastrophic cancellation', () => {
			const eps = 1e-12
			// log2(1 + eps) = ln(1 + eps) / ln(2)
			const rPlus = log2ComplexRecursive({ re: 1 + eps, im: 0 })
			assertClose(rPlus.re, Math.log1p(eps) / Math.LN2, 1e-14, 'log2(1 + 1e-12)')
			assert.equal(rPlus.im, 0)

			const rMinus = log2ComplexRecursive({ re: 1 - eps, im: 0 })
			assertClose(rMinus.re, Math.log1p(-eps) / Math.LN2, 1e-14, 'log2(1 - 1e-12)')
			assert.equal(rMinus.im, 0)

			// For z = 1 + i*eps, Re(log2(z)) = 0.5 * ln(1 + eps^2) / ln(2) ≈ eps^2 / (2 * ln(2))
			const rImag = log2ComplexRecursive({ re: 1, im: eps })
			const expectedRe = (0.5 * eps * eps) / Math.LN2
			assertClose(rImag.re, expectedRe, 1e-12, 'log2(1 + 1e-12i) re (cancellation-free)')
			assertClose(rImag.im, eps / Math.LN2, 1e-14, 'log2(1 + 1e-12i) im')
		})

		it('handles values on the unit circle accurately', () => {
			const r = log2ComplexRecursive({ re: 0.6, im: 0.8 })
			assertClose(r.re, 0, 1e-14, 'unit circle 0.6+0.8i re')
			assertClose(r.im, Math.atan2(0.8, 0.6) / Math.LN2, 1e-14, 'unit circle 0.6+0.8i im')
		})

		it('handles extreme large, tiny, subnormal, and mixed scales without overflow/underflow', () => {
			// Near MAX_VALUE where Math.hypot(MAX_VALUE, MAX_VALUE) would overflow to Infinity
			const huge = log2ComplexRecursive({ re: Number.MAX_VALUE, im: Number.MAX_VALUE })
			// MAX_VALUE = (2 - 2^-52) * 2^1023, so |z| = sqrt(2) * MAX_VALUE => log2(|z|) = 1024.5
			assertClose(huge.re, 1024.5, 1e-14, 'MAX_VALUE + i*MAX_VALUE re')
			assertClose(huge.im, PI_OVER_LN2 / 4, 1e-14, 'MAX_VALUE + i*MAX_VALUE im')

			// Subnormal MIN_VALUE = 2^-1074
			const minReal = log2ComplexRecursive({ re: Number.MIN_VALUE, im: 0 })
			assert.equal(minReal.re, -1074)
			assert.equal(minReal.im, 0)

			const minDiag = log2ComplexRecursive({ re: Number.MIN_VALUE, im: Number.MIN_VALUE })
			assertClose(minDiag.re, -1073.5, 1e-14, 'MIN_VALUE + i*MIN_VALUE re')
			assertClose(minDiag.im, PI_OVER_LN2 / 4, 1e-14, 'MIN_VALUE + i*MIN_VALUE im')

			// Mixed extreme scales
			const mixedHuge = log2ComplexRecursive({ re: 1e200, im: 1e-100 })
			assertClose(mixedHuge.re, 200 * Math.log2(10), 1e-14, '1e200 + 1e-100i re')
			assertClose(mixedHuge.im, 1e-300 / Math.LN2, 1e-13, '1e200 + 1e-100i im')

			const mixedTiny = log2ComplexRecursive({ re: 1e-200, im: 1e-300 })
			assertClose(mixedTiny.re, -200 * Math.log2(10), 1e-14, '1e-200 + 1e-300i re')
			assertClose(mixedTiny.im, 1e-100 / Math.LN2, 1e-13, '1e-200 + 1e-300i im')
		})
	})

	describe('input validation', () => {
		it('throws RangeError for zero (0 + 0i and signed zeros)', () => {
			assert.throws(() => log2ComplexRecursive({ re: 0, im: 0 }), RangeError)
			assert.throws(() => log2ComplexRecursive({ re: -0, im: 0 }), RangeError)
			assert.throws(() => log2ComplexRecursive({ re: 0, im: -0 }), RangeError)
			assert.throws(() => log2ComplexRecursive({ re: -0, im: -0 }), RangeError)
		})

		it('throws RangeError for non-finite components (NaN, Infinity, -Infinity)', () => {
			assert.throws(() => log2ComplexRecursive({ re: Number.NaN, im: 1 }), RangeError)
			assert.throws(() => log2ComplexRecursive({ re: 1, im: Number.NaN }), RangeError)
			assert.throws(() => log2ComplexRecursive({ re: Infinity, im: 0 }), RangeError)
			assert.throws(() => log2ComplexRecursive({ re: -Infinity, im: 1 }), RangeError)
			assert.throws(() => log2ComplexRecursive({ re: 1, im: Infinity }), RangeError)
			assert.throws(() => log2ComplexRecursive({ re: 1, im: -Infinity }), RangeError)
		})

		it('throws TypeError for invalid input types or malformed objects', () => {
			assert.throws(() => log2ComplexRecursive(), TypeError)
			assert.throws(() => log2ComplexRecursive(null), TypeError)
			assert.throws(() => log2ComplexRecursive(4), TypeError)
			assert.throws(() => log2ComplexRecursive('4'), TypeError)
			assert.throws(() => log2ComplexRecursive(true), TypeError)
			assert.throws(() => log2ComplexRecursive([1, 2]), TypeError)
			assert.throws(() => log2ComplexRecursive({}), TypeError)
			assert.throws(() => log2ComplexRecursive({ re: 1 }), TypeError)
			assert.throws(() => log2ComplexRecursive({ im: 1 }), TypeError)
			assert.throws(() => log2ComplexRecursive({ re: '1', im: 0 }), TypeError)
			assert.throws(() => log2ComplexRecursive({ re: 1, im: null }), TypeError)
		})
	})

	describe('cross-checks against independent formulas and algebraic identities', () => {
		const testGrid = [
			{ re: 2.5, im: 1.75 },
			{ re: -4.2, im: 3.1 },
			{ re: -0.7, im: -2.9 },
			{ re: 5.5, im: -0.8 },
			{ re: 0.01, im: 0.02 },
			{ re: 123.456, im: -789.012 },
			{ re: -0.001, im: 100.5 },
			{ re: Math.cos(2.3), im: Math.sin(2.3) },
		]

		it('matches independent direct formula log2(hypot(re, im)) + i * atan2(im, re) / ln(2)', () => {
			for (const z of testGrid) {
				assertComplexClose(
					log2ComplexRecursive(z),
					log2ComplexDirectRef(z),
					1e-13,
					`direct ref (${z.re}, ${z.im})`,
				)
			}
		})

		it('satisfies the inverse identity 2^(log2(z)) = z', () => {
			for (const z of testGrid) {
				const w = log2ComplexRecursive(z)
				const reconstructed = pow2ComplexRef(w)
				assertComplexClose(reconstructed, z, 1e-12, `2^log2(${z.re}+${z.im}i)`)
			}
		})

		it('satisfies the product identity log2(z1 * z2) = log2(z1) + log2(z2) when args do not wrap', () => {
			const pairs = [
				[
					{ re: 2, im: 1 },
					{ re: 3, im: 2 },
				],
				[
					{ re: 1.5, im: -0.5 },
					{ re: 0.8, im: 1.2 },
				],
				[
					{ re: 4, im: 3 },
					{ re: 0.25, im: -0.5 },
				],
			]
			for (const [z1, z2] of pairs) {
				const prod = {
					re: z1.re * z2.re - z1.im * z2.im,
					im: z1.re * z2.im + z1.im * z2.re,
				}
				const lhs = log2ComplexRecursive(prod)
				const l1 = log2ComplexRecursive(z1)
				const l2 = log2ComplexRecursive(z2)
				const rhs = { re: l1.re + l2.re, im: l1.im + l2.im }
				assertComplexClose(lhs, rhs, 1e-13, 'product identity')
			}
		})

		it('satisfies conjugate symmetry log2(conj(z)) = conj(log2(z)) off the negative real axis', () => {
			for (const z of testGrid) {
				const conjZ = { re: z.re, im: -z.im }
				const lhs = log2ComplexRecursive(conjZ)
				const lz = log2ComplexRecursive(z)
				assertComplexClose(lhs, { re: lz.re, im: -lz.im }, 1e-14, 'conjugate symmetry')
			}
		})

		it('satisfies reciprocal identity log2(1 / z) = -log2(z) off the negative real axis', () => {
			for (const z of testGrid) {
				const denom = z.re * z.re + z.im * z.im
				const invZ = { re: z.re / denom, im: -z.im / denom }
				const lhs = log2ComplexRecursive(invZ)
				const lz = log2ComplexRecursive(z)
				assertComplexClose(lhs, { re: -lz.re, im: -lz.im }, 1e-13, 'reciprocal identity')
			}
		})

		it('satisfies squaring identity log2(z^2) = 2 * log2(z) in the right half-plane', () => {
			const rightHalf = [
				{ re: 1.5, im: 2.5 },
				{ re: 3, im: -4 },
				{ re: 0.4, im: 0.3 },
			]
			for (const z of rightHalf) {
				const z2 = { re: z.re * z.re - z.im * z.im, im: 2 * z.re * z.im }
				const lhs = log2ComplexRecursive(z2)
				const lz = log2ComplexRecursive(z)
				assertComplexClose(lhs, { re: 2 * lz.re, im: 2 * lz.im }, 1e-13, 'squaring identity')
			}
		})
	})
})
