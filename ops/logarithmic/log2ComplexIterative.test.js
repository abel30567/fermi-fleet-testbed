import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { log2ComplexIterative } from './log2ComplexIterative.js'

/**
 * Helper to assert two numbers are within an absolute/relative tolerance.
 */
function assertClose(actual, expected, tol = 1e-12, message = '') {
	assert.equal(typeof actual, 'number', `${message}: actual must be a number`)
	assert.ok(Number.isFinite(actual), `${message}: actual must be finite, got ${actual}`)
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		Math.abs(actual - expected) <= tol * scale,
		`${message}: expected ${actual} to be close to ${expected} (diff=${Math.abs(actual - expected)}, tol=${tol * scale})`,
	)
}

/**
 * Independent reference computation of 2^w for complex w = { re, im }:
 * 2^(a + bi) = 2^a * (cos(b * ln(2)) + i * sin(b * ln(2))).
 */
function pow2ComplexRef(w) {
	const r = 2 ** w.re
	const angle = w.im * Math.LN2
	return {
		re: r * Math.cos(angle),
		im: r * Math.sin(angle),
	}
}

/**
 * Independent reference computation of principal log2(z) using JS Math builtins.
 */
function log2ComplexRef(z) {
	const mag = Math.hypot(z.re, z.im)
	const arg = Math.atan2(z.im, z.re)
	return {
		re: Math.log2(mag),
		im: arg / Math.LN2,
	}
}

describe('log2ComplexIterative', () => {
	describe('normal cases across all four quadrants', () => {
		test('computes principal base-2 logarithm for general complex inputs', () => {
			const cases = [
				{ re: 3, im: 4 },
				{ re: -3, im: 4 },
				{ re: -3, im: -4 },
				{ re: 3, im: -4 },
				{ re: 1, im: 1 },
				{ re: -1, im: 1 },
				{ re: -1, im: -1 },
				{ re: 1, im: -1 },
				{ re: 0.25, im: 0.75 },
				{ re: -12.5, im: 0.01 },
				{ re: 100, im: -0.001 },
			]

			for (const z of cases) {
				const w = log2ComplexIterative(z)
				const ref = log2ComplexRef(z)
				assertClose(w.re, ref.re, 1e-13, `re for (${z.re}, ${z.im})`)
				assertClose(w.im, ref.im, 1e-13, `im for (${z.re}, ${z.im})`)
			}
		})

		test('does not mutate the input object', () => {
			const input = { re: 3, im: -4 }
			const result = log2ComplexIterative(input)
			assert.deepStrictEqual(input, { re: 3, im: -4 })
			assert.notEqual(result, input)
		})
	})

	describe('edge cases', () => {
		test('positive powers of 2 yield exact integer real parts and 0 imaginary part', () => {
			const exponents = [-1074, -100, -10, -2, -1, 0, 1, 2, 3, 10, 50, 500, 1023]
			for (const k of exponents) {
				const x = 2 ** k
				const res = log2ComplexIterative({ re: x, im: 0 })
				assert.equal(res.re, k, `expected exact log2(2^${k}) === ${k}`)
				assert.ok(Object.is(res.im, 0), `expected +0 imaginary part for 2^${k}`)
			}
		})

		test('negative real numbers lie on the principal branch (+pi / ln(2))', () => {
			const piOverLn2 = Math.PI / Math.LN2
			const cases = [
				{ re: -1, expectedRe: 0 },
				{ re: -2, expectedRe: 1 },
				{ re: -8, expectedRe: 3 },
				{ re: -0.5, expectedRe: -1 },
				{ re: -0.125, expectedRe: -3 },
			]
			for (const { re, expectedRe } of cases) {
				const res = log2ComplexIterative({ re, im: 0 })
				assert.equal(res.re, expectedRe)
				assertClose(res.im, piOverLn2, 1e-14, `im for ${re}`)
			}
		})

		test('handles signed zero (-0) in real or imaginary parts cleanly', () => {
			const posReal = log2ComplexIterative({ re: 1, im: -0 })
			assert.ok(Object.is(posReal.re, 0))
			assert.ok(Object.is(posReal.im, 0))

			const negReal = log2ComplexIterative({ re: -1, im: -0 })
			assert.ok(Object.is(negReal.re, 0))
			assertClose(negReal.im, Math.PI / Math.LN2, 1e-14)

			const posImag = log2ComplexIterative({ re: -0, im: 1 })
			assert.ok(Object.is(posImag.re, 0))
			assertClose(posImag.im, (Math.PI / 2) / Math.LN2, 1e-14)
		})

		test('pure imaginary numbers have imaginary part +/-(pi/2)/ln(2)', () => {
			const halfPiOverLn2 = (Math.PI / 2) / Math.LN2

			const posI = log2ComplexIterative({ re: 0, im: 1 })
			assert.equal(posI.re, 0)
			assertClose(posI.im, halfPiOverLn2, 1e-14)

			const negI = log2ComplexIterative({ re: 0, im: -1 })
			assert.equal(negI.re, 0)
			assertClose(negI.im, -halfPiOverLn2, 1e-14)

			const pos4I = log2ComplexIterative({ re: 0, im: 4 })
			assert.equal(pos4I.re, 2)
			assertClose(pos4I.im, halfPiOverLn2, 1e-14)

			const negQuarterI = log2ComplexIterative({ re: 0, im: -0.25 })
			assert.equal(negQuarterI.re, -2)
			assertClose(negQuarterI.im, -halfPiOverLn2, 1e-14)
		})

		test('handles extreme magnitudes without overflow or underflow', () => {
			// Near Number.MAX_VALUE where re^2 + im^2 and even hypot would overflow
			const huge = log2ComplexIterative({ re: Number.MAX_VALUE, im: Number.MAX_VALUE })
			assertClose(huge.re, 1024.5, 1e-12)
			assertClose(huge.im, (Math.PI / 4) / Math.LN2, 1e-14)

			// Very small subnormal-adjacent magnitudes
			const tiny = log2ComplexIterative({ re: 1e-300, im: -1e-300 })
			assertClose(tiny.re, Math.log2(1e-300) + 0.5, 1e-12)
			assertClose(tiny.im, -(Math.PI / 4) / Math.LN2, 1e-14)

			// Extreme aspect ratio (tiny im compared to re)
			const flat = log2ComplexIterative({ re: 1, im: 1e-300 })
			assert.equal(flat.re, 0)
			assertClose(flat.im, 1e-300 / Math.LN2, 1e-13)
		})

		test('throws RangeError at zero (0 + 0i and signed-zero variants)', () => {
			assert.throws(() => log2ComplexIterative({ re: 0, im: 0 }), RangeError)
			assert.throws(() => log2ComplexIterative({ re: -0, im: 0 }), RangeError)
			assert.throws(() => log2ComplexIterative({ re: 0, im: -0 }), RangeError)
			assert.throws(() => log2ComplexIterative({ re: -0, im: -0 }), RangeError)
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-object or invalid-container inputs', () => {
			const invalidContainers = [
				null,
				undefined,
				0,
				1,
				'1+2i',
				true,
				false,
				[1, 2],
				() => ({ re: 1, im: 0 }),
			]
			for (const bad of invalidContainers) {
				assert.throws(() => log2ComplexIterative(bad), TypeError)
			}
		})

		test('throws TypeError when re or im is missing or not a number', () => {
			const invalidProps = [
				{},
				{ re: 1 },
				{ im: 1 },
				{ re: '1', im: 0 },
				{ re: 1, im: '0' },
				{ re: null, im: 1 },
				{ re: 1, im: undefined },
				{ re: 1n, im: 0 },
				{ re: true, im: 0 },
				{ re: {}, im: 1 },
			]
			for (const bad of invalidProps) {
				assert.throws(() => log2ComplexIterative(bad), TypeError)
			}
		})

		test('throws RangeError when re or im is NaN or +/-Infinity', () => {
			const nonFinite = [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.NaN, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 0 },
				{ re: Number.NEGATIVE_INFINITY, im: 0 },
				{ re: 1, im: Number.POSITIVE_INFINITY },
				{ re: 1, im: Number.NEGATIVE_INFINITY },
				{ re: Number.POSITIVE_INFINITY, im: Number.NEGATIVE_INFINITY },
			]
			for (const bad of nonFinite) {
				assert.throws(() => log2ComplexIterative(bad), RangeError)
			}
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		test('inverse identity 2^w === z holds across a grid of complex numbers', () => {
			const coords = [-7.5, -2, -1, -0.3, 0, 0.3, 1, 2, 7.5]
			for (const re of coords) {
				for (const im of coords) {
					if (re === 0 && im === 0) {
						continue
					}
					const z = { re, im }
					const w = log2ComplexIterative(z)
					const reconstructed = pow2ComplexRef(w)
					const scale = Math.hypot(re, im)
					assert.ok(
						Math.abs(reconstructed.re - z.re) <= 1e-12 * scale,
						`2^log2(${re}+${im}i).re: got ${reconstructed.re}, expected ${z.re}`,
					)
					assert.ok(
						Math.abs(reconstructed.im - z.im) <= 1e-12 * scale,
						`2^log2(${re}+${im}i).im: got ${reconstructed.im}, expected ${z.im}`,
					)
				}
			}
		})

		test('matches independent Math.log2(|z|) + i * Math.atan2(im, re) / Math.LN2 formula', () => {
			// Test angles around the full unit circle and varying radii
			const radii = [0.001, 0.37, 1, 2.718281828459045, 42.5, 1e6]
			const steps = 36
			for (const r of radii) {
				for (let k = 0; k < steps; k++) {
					const angle = -Math.PI + ((k + 0.37) / steps) * 2 * Math.PI
					const z = { re: r * Math.cos(angle), im: r * Math.sin(angle) }
					const actual = log2ComplexIterative(z)
					const expected = log2ComplexRef(z)
					assertClose(actual.re, expected.re, 1e-13, `re at r=${r}, angle=${angle}`)
					assertClose(actual.im, expected.im, 1e-13, `im at r=${r}, angle=${angle}`)
				}
			}
		})

		test('satisfies conjugate symmetry and reciprocal negation off the negative real axis', () => {
			const samples = [
				{ re: 2.5, im: 1.75 },
				{ re: -1.2, im: 3.4 },
				{ re: 0.4, im: -0.9 },
				{ re: -5.1, im: -2.3 },
			]

			for (const z of samples) {
				const w = log2ComplexIterative(z)

				// Conjugate symmetry: log2(conj(z)) = conj(log2(z))
				const wConj = log2ComplexIterative({ re: z.re, im: -z.im })
				assertClose(wConj.re, w.re, 1e-13)
				assertClose(wConj.im, -w.im, 1e-13)

				// Reciprocal identity: log2(1/z) = -log2(z)
				const denom = z.re * z.re + z.im * z.im
				const wInv = log2ComplexIterative({ re: z.re / denom, im: -z.im / denom })
				assertClose(wInv.re, -w.re, 1e-13)
				assertClose(wInv.im, -w.im, 1e-13)
			}
		})

		test('satisfies product identity log2(z1 * z2) === log2(z1) + log2(z2) mod (2*pi*i / ln(2))', () => {
			const period = (2 * Math.PI) / Math.LN2
			const pairs = [
				[{ re: 1, im: 2 }, { re: 3, im: 4 }],
				[{ re: -2, im: 3 }, { re: -1, im: 5 }],
				[{ re: -4, im: -1 }, { re: 2, im: -3 }],
				[{ re: 0.5, im: -0.5 }, { re: -0.25, im: -0.75 }],
			]

			for (const [z1, z2] of pairs) {
				const prod = {
					re: z1.re * z2.re - z1.im * z2.im,
					im: z1.re * z2.im + z1.im * z2.re,
				}
				const wProd = log2ComplexIterative(prod)
				const w1 = log2ComplexIterative(z1)
				const w2 = log2ComplexIterative(z2)

				assertClose(wProd.re, w1.re + w2.re, 1e-13)

				// Imaginary parts agree modulo 2*pi / ln(2)
				let diffIm = wProd.im - (w1.im + w2.im)
				diffIm -= Math.round(diffIm / period) * period
				assert.ok(Math.abs(diffIm) <= 1e-12, `expected imaginary diff mod period ~ 0, got ${diffIm}`)
			}
		})
	})
})
