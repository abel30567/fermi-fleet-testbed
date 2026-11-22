import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cbrtComplexRecursive } from './cbrtComplexRecursive.js'

/**
 * Helper: exact complex cube w^3 for inverse identity checks.
 */
function cubeComplex(w) {
	const w2Re = w.re * w.re - w.im * w.im
	const w2Im = 2 * w.re * w.im
	return {
		re: w2Re * w.re - w2Im * w.im,
		im: w2Re * w.im + w2Im * w.re,
	}
}

/**
 * Helper: independent polar reference formula r^(1/3) * exp(i * theta / 3).
 */
function polarCbrtReference(z) {
	const re = z.re === 0 ? 0 : z.re
	const im = z.im === 0 ? 0 : z.im
	if (re === 0 && im === 0) {
		return { re: 0, im: 0 }
	}
	const r = Math.hypot(re, im)
	const theta = Math.atan2(im, re)
	const rootR = Math.cbrt(r)
	return {
		re: rootR * Math.cos(theta / 3),
		im: rootR * Math.sin(theta / 3),
	}
}

/**
 * Helper: asserts two complex numbers are close within absolute + relative tolerance.
 */
function assertComplexClose(actual, expected, relTol = 1e-13, absTol = 1e-14, label = '') {
	const scale = Math.max(Math.hypot(expected.re, expected.im), 1)
	const err = Math.hypot(actual.re - expected.re, actual.im - expected.im)
	const bound = absTol + relTol * scale
	assert.ok(
		err <= bound,
		`${label ? label + ': ' : ''}expected (${expected.re}, ${expected.im}), got (${actual.re}, ${actual.im}), err=${err} > bound=${bound}`,
	)
}

describe('cbrtComplexRecursive', () => {
	describe('normal complex cases', () => {
		it('computes exact known complex cube roots with principal argument', () => {
			// (2 + i)^3 = 2 + 11i, arg(2 + i) = atan(0.5) < pi/3
			assertComplexClose(cbrtComplexRecursive({ re: 2, im: 11 }), { re: 2, im: 1 })
			// (2 - i)^3 = 2 - 11i
			assertComplexClose(cbrtComplexRecursive({ re: 2, im: -11 }), { re: 2, im: -1 })
			// (3 + i)^3 = 18 + 26i
			assertComplexClose(cbrtComplexRecursive({ re: 18, im: 26 }), { re: 3, im: 1 })
			// (3 - 2i)^3 = -9 - 46i, arg(3 - 2i) = -atan(2/3) > -pi/3
			assertComplexClose(cbrtComplexRecursive({ re: -9, im: -46 }), { re: 3, im: -2 })
		})

		it('handles complex numbers across all four quadrants', () => {
			const inputs = [
				{ re: 1, im: 1 },
				{ re: -1, im: 1 },
				{ re: -1, im: -1 },
				{ re: 1, im: -1 },
				{ re: 3, im: 4 },
				{ re: -3, im: 4 },
				{ re: -5, im: -12 },
				{ re: 7, im: -24 },
			]
			for (const z of inputs) {
				const w = cbrtComplexRecursive(z)
				const ref = polarCbrtReference(z)
				assertComplexClose(w, ref, 1e-14, 1e-15, `z=(${z.re},${z.im})`)
				assertComplexClose(cubeComplex(w), z, 1e-13, 1e-14, `cube(cbrt(${z.re},${z.im}))`)
			}
		})

		it('does not mutate the input object', () => {
			const z = { re: -3, im: 4 }
			const snapshot = { ...z }
			cbrtComplexRecursive(z)
			assert.deepEqual(z, snapshot)
		})
	})

	describe('edge cases', () => {
		it('handles zero and signed zeros without producing -0', () => {
			const zeros = [
				{ re: 0, im: 0 },
				{ re: -0, im: 0 },
				{ re: 0, im: -0 },
				{ re: -0, im: -0 },
			]
			for (const z of zeros) {
				const w = cbrtComplexRecursive(z)
				assert.ok(Object.is(w.re, 0), `expected +0 real part, got ${w.re}`)
				assert.ok(Object.is(w.im, 0), `expected +0 imag part, got ${w.im}`)
			}
		})

		it('handles pure positive real numbers with exact zero imaginary part', () => {
			const cases = [
				[1, 1],
				[8, 2],
				[27, 3],
				[0.125, 0.5],
				[1000, 10],
				[2, Math.cbrt(2)],
			]
			for (const [x, expectedRe] of cases) {
				const w = cbrtComplexRecursive({ re: x, im: 0 })
				assertComplexClose(w, { re: expectedRe, im: 0 }, 1e-14, 1e-15)
				assert.ok(Object.is(w.im, 0), `expected exact +0 imag part for positive real ${x}`)
			}
		})

		it('handles pure negative real numbers along the principal branch cut', () => {
			const sqrt3 = Math.sqrt(3)
			// cbrt(-1) = exp(i * pi / 3) = 1/2 + i * sqrt(3)/2
			assertComplexClose(cbrtComplexRecursive({ re: -1, im: 0 }), { re: 0.5, im: sqrt3 / 2 })
			// cbrt(-8) = 1 + i * sqrt(3)
			assertComplexClose(cbrtComplexRecursive({ re: -8, im: 0 }), { re: 1, im: sqrt3 })
			// -0 imaginary part is normalized to +0, yielding consistent principal branch value
			assertComplexClose(cbrtComplexRecursive({ re: -8, im: -0 }), { re: 1, im: sqrt3 })
			// cbrt(-27) = 1.5 + i * 1.5 * sqrt(3)
			assertComplexClose(cbrtComplexRecursive({ re: -27, im: 0 }), {
				re: 1.5,
				im: 1.5 * sqrt3,
			})
		})

		it('handles pure imaginary numbers', () => {
			const sqrt3 = Math.sqrt(3)
			// cbrt(i) = exp(i * pi / 6) = sqrt(3)/2 + 0.5i
			assertComplexClose(cbrtComplexRecursive({ re: 0, im: 1 }), { re: sqrt3 / 2, im: 0.5 })
			// cbrt(-i) = exp(-i * pi / 6) = sqrt(3)/2 - 0.5i
			assertComplexClose(cbrtComplexRecursive({ re: 0, im: -1 }), { re: sqrt3 / 2, im: -0.5 })
			// cbrt(8i) = sqrt(3) + i
			assertComplexClose(cbrtComplexRecursive({ re: 0, im: 8 }), { re: sqrt3, im: 1 })
			// cbrt(-8i) = sqrt(3) - i
			assertComplexClose(cbrtComplexRecursive({ re: 0, im: -8 }), { re: sqrt3, im: -1 })
		})

		it('behaves consistently just above and just below the negative real branch cut', () => {
			const sqrt3 = Math.sqrt(3)
			const above = cbrtComplexRecursive({ re: -8, im: 1e-12 })
			const below = cbrtComplexRecursive({ re: -8, im: -1e-12 })
			assertComplexClose(above, { re: 1, im: sqrt3 }, 1e-10, 1e-10, 'just above cut')
			assertComplexClose(below, { re: 1, im: -sqrt3 }, 1e-10, 1e-10, 'just below cut')

			// Extreme aspect ratio below negative real axis preserves lower-half-plane branch
			const extremeBelow = cbrtComplexRecursive({ re: -1e308, im: -1e-308 })
			const r = Math.cbrt(1e308)
			assertComplexClose(
				extremeBelow,
				{ re: r * 0.5, im: -r * (sqrt3 / 2) },
				1e-13,
				1e-14,
				'extreme below cut',
			)
		})

		it('handles very large and very small / subnormal magnitudes without overflow or underflow', () => {
			const extremeCases = [
				{ re: 1e300, im: 1e300 },
				{ re: Number.MAX_VALUE, im: 0 },
				{ re: -1e305, im: 1e304 },
				{ re: 0, im: -1e306 },
				{ re: 1e-300, im: 1e-300 },
				{ re: -1e-300, im: -1e-300 },
				{ re: Number.MIN_VALUE, im: 0 },
				{ re: 0, im: Number.MIN_VALUE },
				{ re: -5e-322, im: 5e-322 },
			]
			for (const z of extremeCases) {
				const w = cbrtComplexRecursive(z)
				assert.ok(Number.isFinite(w.re) && Number.isFinite(w.im), `non-finite output for (${z.re},${z.im})`)
				// Verify by scaling down/up so cubeComplex does not overflow/underflow
				const scaleExp = Math.floor(Math.log2(Math.max(Math.abs(z.re), Math.abs(z.im))) / 3)
				const wScaled = {
					re: w.re * 2 ** -scaleExp,
					im: w.im * 2 ** -scaleExp,
				}
				const zScaled = {
					re: z.re * 2 ** (-scaleExp) * 2 ** (-scaleExp) * 2 ** (-scaleExp),
					im: z.im * 2 ** (-scaleExp) * 2 ** (-scaleExp) * 2 ** (-scaleExp),
				}
				assertComplexClose(
					cubeComplex(wScaled),
					zScaled,
					1e-12,
					1e-13,
					`scaled cube check for (${z.re},${z.im})`,
				)
			}
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-object inputs or arrays', () => {
			for (const invalid of [null, undefined, 42, '1+i', true, [], [1, 2], () => {}]) {
				assert.throws(() => cbrtComplexRecursive(invalid), TypeError)
			}
		})

		it('throws TypeError when re or im is missing or not a number', () => {
			for (const invalid of [
				{},
				{ re: 1 },
				{ im: 1 },
				{ re: '1', im: 0 },
				{ re: 0, im: '1' },
				{ re: null, im: 0 },
				{ re: 0, im: undefined },
			]) {
				assert.throws(() => cbrtComplexRecursive(invalid), TypeError)
			}
		})

		it('throws RangeError for non-finite re or im values', () => {
			for (const invalid of [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 0 },
				{ re: 0, im: Infinity },
				{ re: -Infinity, im: 1 },
				{ re: 1, im: -Infinity },
			]) {
				assert.throws(() => cbrtComplexRecursive(invalid), RangeError)
			}
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		it('matches polar formula, inverse identity w^3 = z, and principal branch angle across a dense angular sweep', () => {
			const radii = [0.001, 0.25, 1, 7.5, 1e6]
			const steps = 36
			for (const r of radii) {
				for (let j = -steps + 1; j <= steps; j++) {
					const theta = (j * Math.PI) / steps
					const z = {
						re: r * Math.cos(theta),
						im: r * Math.sin(theta),
					}
					const w = cbrtComplexRecursive(z)
					const ref = polarCbrtReference(z)

					// Cross-check against independent polar computation
					assertComplexClose(w, ref, 1e-13, 1e-14, `polar r=${r} j=${j}`)

					// Cross-check inverse identity: w^3 === z
					assertComplexClose(cubeComplex(w), z, 1e-12, 1e-13, `cube r=${r} j=${j}`)

					// Verify principal branch argument lies in (-pi/3, pi/3]
					const argW = Math.atan2(w.im, w.re)
					assert.ok(
						argW > -Math.PI / 3 - 1e-14 && argW <= Math.PI / 3 + 1e-14,
						`principal arg out of bounds: ${argW} for r=${r} j=${j}`,
					)
				}
			}
		})

		it('satisfies conjugate symmetry off the negative real axis', () => {
			const samples = [
				{ re: 3, im: 4 },
				{ re: -2, im: 5 },
				{ re: 0, im: 9 },
				{ re: -10, im: 0.01 },
				{ re: 0.5, im: 0.25 },
			]
			for (const z of samples) {
				const w = cbrtComplexRecursive(z)
				const wConj = cbrtComplexRecursive({ re: z.re, im: -z.im })
				assertComplexClose(wConj, { re: w.re, im: -w.im }, 1e-14, 1e-15)
			}
		})

		it('satisfies scaling homogeneity cbrt(a^3 * z) = a * cbrt(z) for positive real a', () => {
			const z = { re: -4.2, im: 7.8 }
			const base = cbrtComplexRecursive(z)
			for (const a of [0.25, 2, 5, 100]) {
				const a3 = a * a * a
				const scaled = cbrtComplexRecursive({ re: a3 * z.re, im: a3 * z.im })
				assertComplexClose(scaled, { re: a * base.re, im: a * base.im }, 1e-13, 1e-14)
			}
		})
	})
})
