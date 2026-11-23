import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { tanComplexSeries } from './tanComplexSeries.js'

/**
 * Helper: assert two complex numbers are equal within tolerance.
 */
function assertComplexClose(actual, expected, tol = 1e-12, msg = '') {
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${msg} real part mismatch: got ${actual.re}, expected ${expected.re} (tol ${tol})`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${msg} imag part mismatch: got ${actual.im}, expected ${expected.im} (tol ${tol})`,
	)
}

/**
 * Independent complex arithmetic helpers for cross-checking.
 */
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im })
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im })
const cMul = (a, b) => ({
	re: a.re * b.re - a.im * b.im,
	im: a.re * b.im + a.im * b.re,
})
const cDiv = (a, b) => {
	const d = b.re * b.re + b.im * b.im
	return {
		re: (a.re * b.re + a.im * b.im) / d,
		im: (a.im * b.re - a.re * b.im) / d,
	}
}
const cExp = (z) => {
	const r = Math.exp(z.re)
	return { re: r * Math.cos(z.im), im: r * Math.sin(z.im) }
}

/**
 * Independent reference via Euler's formula:
 *   tan(z) = -i * (e^(iz) - e^(-iz)) / (e^(iz) + e^(-iz))
 */
function tanViaEuler(z) {
	const iz = { re: -z.im, im: z.re }
	const negIz = { re: z.im, im: -z.re }
	const ePos = cExp(iz)
	const eNeg = cExp(negIz)
	const ratio = cDiv(cSub(ePos, eNeg), cAdd(ePos, eNeg))
	return cMul({ re: 0, im: -1 }, ratio)
}

/**
 * Independent reference via Maclaurin series (valid for |z| < pi/2):
 *   tan(z) = z + z^3/3 + 2z^5/15 + 17z^7/315 + 62z^9/2835 + 1382z^11/155925 + 21844z^13/6081075
 */
function tanViaMaclaurin(z) {
	const coeffs = [
		1,
		1 / 3,
		2 / 15,
		17 / 315,
		62 / 2835,
		1382 / 155925,
		21844 / 6081075,
		929569 / 638512875,
	]
	const z2 = cMul(z, z)
	let term = z
	let sum = { re: 0, im: 0 }
	for (const c of coeffs) {
		sum = cAdd(sum, { re: c * term.re, im: c * term.im })
		term = cMul(term, z2)
	}
	return sum
}

describe('tanComplexSeries', () => {
	test('handles zero and purely real inputs', () => {
		assert.deepStrictEqual(tanComplexSeries({ re: 0, im: 0 }), { re: 0, im: 0 })
		assert.deepStrictEqual(tanComplexSeries({ re: -0, im: -0 }), { re: 0, im: 0 })

		for (const x of [-1.2, -Math.PI / 4, 0.5, Math.PI / 4, Math.PI / 3, 2.5]) {
			const res = tanComplexSeries({ re: x, im: 0 })
			assertComplexClose(res, { re: Math.tan(x), im: 0 }, 1e-15, `x=${x}`)
		}
	})

	test('handles purely imaginary inputs: tan(iy) = i*tanh(y)', () => {
		for (const y of [-100, -5, -1, -1e-8, 1e-8, 1, 5, 100]) {
			const res = tanComplexSeries({ re: 0, im: y })
			assertComplexClose(res, { re: 0, im: Math.tanh(y) }, 1e-15, `y=${y}`)
		}
	})

	test('matches known general complex values', () => {
		// tan(1 + i) ≈ 0.2717525853195117 + 1.0839233273386946i
		assertComplexClose(
			tanComplexSeries({ re: 1, im: 1 }),
			{ re: 0.2717525853195117, im: 1.0839233273386946 },
			1e-14,
			'tan(1 + i)',
		)
		// tan(pi/4 + i) = (1 + i*sinh(2)) / cosh(2)
		const expected = {
			re: 1 / Math.cosh(2),
			im: Math.sinh(2) / Math.cosh(2),
		}
		assertComplexClose(
			tanComplexSeries({ re: Math.PI / 4, im: 1 }),
			expected,
			1e-14,
			'tan(pi/4 + i)',
		)
	})

	test('handles large imaginary parts without overflow or NaN', () => {
		for (const y of [10, 10.0001, 25, 400, 1000, 1e6]) {
			const pos = tanComplexSeries({ re: 1.23, im: y })
			const neg = tanComplexSeries({ re: 1.23, im: -y })
			assert.ok(Number.isFinite(pos.re) && Number.isFinite(pos.im))
			assert.ok(Number.isFinite(neg.re) && Number.isFinite(neg.im))
			assertComplexClose(pos, { re: 0, im: 1 }, 1e-8, `y=${y}`)
			assertComplexClose(neg, { re: 0, im: -1 }, 1e-8, `y=-${y}`)
		}

		// Exact limit for very large |y|
		assert.deepStrictEqual(tanComplexSeries({ re: 0.7, im: 1000 }), { re: 0, im: 1 })
		assert.deepStrictEqual(tanComplexSeries({ re: 0.7, im: -1000 }), { re: 0, im: -1 })
	})

	test('smooth continuity across the |y| = 10 regime switch', () => {
		const below = tanComplexSeries({ re: 0.9, im: 10 })
		const above = tanComplexSeries({ re: 0.9, im: 10 + 1e-12 })
		assertComplexClose(below, above, 1e-15, 'continuity at y=10')

		const belowNeg = tanComplexSeries({ re: -0.9, im: -10 })
		const aboveNeg = tanComplexSeries({ re: -0.9, im: -10 - 1e-12 })
		assertComplexClose(belowNeg, aboveNeg, 1e-15, 'continuity at y=-10')
	})

	test('handles tiny inputs and values near poles accurately', () => {
		// Tiny input: tan(z) ≈ z
		const tiny = { re: 1e-100, im: -2e-100 }
		assertComplexClose(tanComplexSeries(tiny), tiny, 1e-115, 'tiny z')

		// Near pole z = pi/2 + i*1e-6: tan(pi/2 + i*eps) ≈ i / eps
		const eps = 1e-6
		const nearPole = tanComplexSeries({ re: Math.PI / 2, im: eps })
		assert.ok(Number.isFinite(nearPole.re) && Number.isFinite(nearPole.im))
		assert.ok(
			Math.abs(nearPole.im - 1 / eps) / (1 / eps) < 1e-11,
			`near-pole imag: got ${nearPole.im}, expected ~${1 / eps}`,
		)
	})

	test('cross-check: agrees with Maclaurin series for small |z|', () => {
		const points = [
			{ re: 0.1, im: 0.2 },
			{ re: -0.25, im: 0.15 },
			{ re: 0.2, im: -0.2 },
			{ re: -0.05, im: -0.25 },
		]
		for (const z of points) {
			assertComplexClose(
				tanComplexSeries(z),
				tanViaMaclaurin(z),
				1e-12,
				`Maclaurin cross-check z=(${z.re},${z.im})`,
			)
		}
	})

	test('cross-check: agrees with Euler exponential formula across quadrants', () => {
		const points = [
			{ re: 0.5, im: 0.8 },
			{ re: -1.1, im: 2.3 },
			{ re: 2.7, im: -1.9 },
			{ re: -3.5, im: -4.2 },
			{ re: 0.2, im: 8.5 },
			{ re: 1.4, im: 12.0 },
		]
		for (const z of points) {
			assertComplexClose(
				tanComplexSeries(z),
				tanViaEuler(z),
				1e-12,
				`Euler cross-check z=(${z.re},${z.im})`,
			)
		}
	})

	test('cross-check: satisfies symmetry, periodicity, and angle-addition identities', () => {
		const z1 = { re: 0.7, im: -0.4 }
		const z2 = { re: -0.5, im: 1.1 }

		// Odd function: tan(-z) = -tan(z)
		const t1 = tanComplexSeries(z1)
		const tNeg1 = tanComplexSeries({ re: -z1.re, im: -z1.im })
		assertComplexClose(tNeg1, { re: -t1.re, im: -t1.im }, 1e-14, 'oddness')

		// Conjugate symmetry: tan(conj(z)) = conj(tan(z))
		const tConj = tanComplexSeries({ re: z1.re, im: -z1.im })
		assertComplexClose(tConj, { re: t1.re, im: -t1.im }, 1e-14, 'conjugate symmetry')

		// Periodicity: tan(z + pi) = tan(z)
		const tShifted = tanComplexSeries({ re: z1.re + Math.PI, im: z1.im })
		assertComplexClose(tShifted, t1, 1e-14, 'pi-periodicity')

		// Angle addition: tan(z1 + z2) = (tan(z1) + tan(z2)) / (1 - tan(z1)*tan(z2))
		const t2 = tanComplexSeries(z2)
		const lhs = tanComplexSeries(cAdd(z1, z2))
		const rhs = cDiv(cAdd(t1, t2), cSub({ re: 1, im: 0 }, cMul(t1, t2)))
		assertComplexClose(lhs, rhs, 1e-13, 'angle addition')
	})

	test('validates invalid inputs with appropriate errors', () => {
		for (const bad of [null, undefined, 42, '1+i', true, [1, 2]]) {
			assert.throws(() => tanComplexSeries(bad), TypeError)
		}
		for (const bad of [
			{},
			{ re: 1 },
			{ im: 1 },
			{ re: '1', im: 0 },
			{ re: 0, im: null },
		]) {
			assert.throws(() => tanComplexSeries(bad), TypeError)
		}
		for (const bad of [
			{ re: Number.NaN, im: 0 },
			{ re: 0, im: Number.NaN },
			{ re: Number.POSITIVE_INFINITY, im: 0 },
			{ re: 0, im: Number.NEGATIVE_INFINITY },
		]) {
			assert.throws(() => tanComplexSeries(bad), RangeError)
		}
	})
})
