import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { arctanComplexSeries } from './arctanComplexSeries.js'

/**
 * Independent complex tangent implementation:
 * tan(u + iv) = (sin(2u) + i * sinh(2v)) / (cos(2u) + cosh(2v))
 */
function complexTan({ re: u, im: v }) {
	const denom = Math.cos(2 * u) + Math.cosh(2 * v)
	return {
		re: Math.sin(2 * u) / denom,
		im: Math.sinh(2 * v) / denom,
	}
}

/**
 * Independent numerical line integral of 1 / (1 + w^2) from 0 to z using
 * composite Simpson's rule along w(t) = t * z, t in [0, 1].
 */
function arctanBySimpsonIntegral({ re: x, im: y }, steps = 2000) {
	const integrand = (t) => {
		const wr = t * x
		const wi = t * y
		const dr = 1 + (wr * wr - wi * wi)
		const di = 2 * wr * wi
		const denom = dr * dr + di * di
		// z / (1 + w^2)
		return {
			re: (x * dr + y * di) / denom,
			im: (y * dr - x * di) / denom,
		}
	}

	const h = 1 / steps
	const f0 = integrand(0)
	const fn = integrand(1)
	let sumRe = f0.re + fn.re
	let sumIm = f0.im + fn.im

	for (let i = 1; i < steps; i++) {
		const coeff = i % 2 === 0 ? 2 : 4
		const fi = integrand(i * h)
		sumRe += coeff * fi.re
		sumIm += coeff * fi.im
	}

	return {
		re: (sumRe * h) / 3,
		im: (sumIm * h) / 3,
	}
}

function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	const dr = Math.abs(actual.re - expected.re)
	const di = Math.abs(actual.im - expected.im)
	assert.ok(
		dr <= tol && di <= tol,
		`${label ? label + ': ' : ''}expected {re: ${expected.re}, im: ${expected.im}}, ` +
			`got {re: ${actual.re}, im: ${actual.im}} (diff re=${dr}, im=${di}, tol=${tol})`,
	)
}

describe('arctanComplexSeries', () => {
	test('real axis matches Math.atan across all magnitude regimes', () => {
		const values = [0, 1e-12, 0.1, 0.25, 0.5, 1, Math.sqrt(3), 3.9, 4, 10, 1e6, -0.1, -1, -10]
		for (const x of values) {
			const res = arctanComplexSeries({ re: x, im: 0 })
			assertComplexClose(res, { re: Math.atan(x), im: 0 }, 1e-14, `x=${x}`)
		}
	})

	test('pure imaginary axis matches i*atanh(y) for |y| < 1', () => {
		const values = [0, 1e-10, 0.1, 0.25, 0.5, 0.9, -0.2, -0.75]
		for (const y of values) {
			const res = arctanComplexSeries({ re: 0, im: y })
			assertComplexClose(res, { re: 0, im: Math.atanh(y) }, 1e-14, `y=${y}`)
		}
	})

	test('branch cut on imaginary axis for |y| > 1', () => {
		const cases = [
			{ z: { re: 0, im: 2 }, expected: { re: Math.PI / 2, im: 0.5 * Math.log(3) } },
			{ z: { re: 0, im: -2 }, expected: { re: Math.PI / 2, im: -0.5 * Math.log(3) } },
			{ z: { re: 0, im: 5 }, expected: { re: Math.PI / 2, im: Math.atanh(0.2) } },
			{ z: { re: 0, im: -5 }, expected: { re: Math.PI / 2, im: -Math.atanh(0.2) } },
			{ z: { re: -0, im: 2 }, expected: { re: -Math.PI / 2, im: 0.5 * Math.log(3) } },
			{ z: { re: -0, im: 5 }, expected: { re: -Math.PI / 2, im: Math.atanh(0.2) } },
		]
		for (const { z, expected } of cases) {
			assertComplexClose(arctanComplexSeries(z), expected, 1e-14, `z=(${z.re},${z.im})`)
		}
	})

	test('known exact complex values', () => {
		// arctan(1 + i): Re = 0.5 * atan2(2, -1), Im = 0.25 * ln(5)
		assertComplexClose(
			arctanComplexSeries({ re: 1, im: 1 }),
			{ re: 0.5 * Math.atan2(2, -1), im: 0.25 * Math.log(5) },
			1e-14,
			'z=1+i',
		)
		// arctan(-1 + i): Re = -0.5 * atan2(2, -1), Im = 0.25 * ln(5)
		assertComplexClose(
			arctanComplexSeries({ re: -1, im: 1 }),
			{ re: -0.5 * Math.atan2(2, -1), im: 0.25 * Math.log(5) },
			1e-14,
			'z=-1+i',
		)
		// Unit circle z = 0.6 + 0.8i => 1 - x^2 - y^2 = 0 => Re = pi/4
		assertComplexClose(
			arctanComplexSeries({ re: 0.6, im: 0.8 }),
			{ re: Math.PI / 4, im: 0.25 * Math.log((0.36 + 3.24) / (0.36 + 0.04)) },
			1e-14,
			'z=0.6+0.8i',
		)
	})

	test('independent cross-check 1: tan(arctan(z)) === z across all quadrants and regimes', () => {
		const samples = [
			{ re: 0.05, im: 0.1 },
			{ re: -0.15, im: 0.12 },
			{ re: 0.2, im: -0.1 },
			{ re: -0.1, im: -0.2 },
			{ re: 0.5, im: 0.5 },
			{ re: 1.2, im: -0.7 },
			{ re: -2.3, im: 1.4 },
			{ re: 0.6, im: 0.8 },
			{ re: 0.01, im: 0.99 },
			{ re: 0.01, im: 1.01 },
			{ re: 5, im: 3 },
			{ re: -7, im: -11 },
			{ re: 50, im: -25 },
		]
		for (const z of samples) {
			const w = arctanComplexSeries(z)
			const roundTrip = complexTan(w)
			const scale = Math.max(1, Math.hypot(z.re, z.im))
			assertComplexClose(roundTrip, z, 1e-12 * scale, `tan(arctan(${z.re}+${z.im}i))`)
		}
	})

	test('independent cross-check 2: matches numerical contour integral of 1/(1+w^2)', () => {
		const samples = [
			{ re: 0.1, im: 0.15 },
			{ re: 0.7, im: 0.4 },
			{ re: -1.5, im: 0.9 },
			{ re: 3.2, im: -2.1 },
			{ re: 6.0, im: 4.5 },
		]
		for (const z of samples) {
			const actual = arctanComplexSeries(z)
			const expected = arctanBySimpsonIntegral(z)
			assertComplexClose(actual, expected, 1e-11, `integral(${z.re}+${z.im}i)`)
		}
	})

	test('odd, conjugate, and reciprocal identities', () => {
		const samples = [
			{ re: 0.12, im: 0.18 },
			{ re: 1.3, im: 0.7 },
			{ re: 6.5, im: 2.2 },
		]
		for (const z of samples) {
			const w = arctanComplexSeries(z)

			// Odd: arctan(-z) = -arctan(z)
			const wNeg = arctanComplexSeries({ re: -z.re, im: -z.im })
			assertComplexClose(wNeg, { re: -w.re, im: -w.im }, 1e-14, 'odd')

			// Conjugate: arctan(conj(z)) = conj(arctan(z))
			const wConj = arctanComplexSeries({ re: z.re, im: -z.im })
			assertComplexClose(wConj, { re: w.re, im: -w.im }, 1e-14, 'conjugate')

			// Reciprocal: arctan(z) + arctan(1/z) = pi/2 for Re(z) > 0
			const r2 = z.re * z.re + z.im * z.im
			const wInv = arctanComplexSeries({ re: z.re / r2, im: -z.im / r2 })
			assertComplexClose(
				{ re: w.re + wInv.re, im: w.im + wInv.im },
				{ re: Math.PI / 2, im: 0 },
				1e-14,
				'reciprocal',
			)
		}
	})

	test('continuity across internal regime thresholds (|z| = 0.25 and |z| = 4)', () => {
		const eps = 1e-10
		const angle = 0.7
		const cos = Math.cos(angle)
		const sin = Math.sin(angle)

		for (const radius of [0.25, 4]) {
			const below = arctanComplexSeries({ re: (radius - eps) * cos, im: (radius - eps) * sin })
			const above = arctanComplexSeries({ re: (radius + eps) * cos, im: (radius + eps) * sin })
			assertComplexClose(below, above, 1e-9, `continuity at |z|=${radius}`)
		}
	})

	test('edge cases: tiny, huge, and near-singularity inputs without overflow or underflow', () => {
		// Tiny input: arctan(z) ≈ z
		const tiny = arctanComplexSeries({ re: 1e-100, im: -2e-100 })
		assert.equal(tiny.re, 1e-100)
		assert.equal(tiny.im, -2e-100)

		// Disparate small scales: preserves tiny real part alongside moderate imaginary part
		const disparate = arctanComplexSeries({ re: 1e-100, im: 0.2 })
		// Re(arctan(eps + i*y)) = eps / (1 - y^2) + O(eps^3)
		const expectedRe = 1e-100 / (1 - 0.04)
		assert.ok(Math.abs(disparate.re - expectedRe) / expectedRe < 1e-14)
		assert.ok(Math.abs(disparate.im - Math.atanh(0.2)) < 1e-15)

		// Very large input (would overflow x^2 + y^2 if squared naively)
		const huge = arctanComplexSeries({ re: 1e200, im: 1e200 })
		assert.ok(Number.isFinite(huge.re) && Number.isFinite(huge.im))
		assert.equal(huge.re, Math.PI / 2)
		assert.ok(Math.abs(huge.im - 0.5e-200) / 0.5e-200 < 1e-14)

		// Very close to singularity z = i (x^2 underflows if squared naively)
		const nearPole = arctanComplexSeries({ re: 1e-200, im: 1 })
		assert.ok(Number.isFinite(nearPole.re) && Number.isFinite(nearPole.im))
		assertComplexClose(
			nearPole,
			{ re: Math.PI / 4, im: 0.5 * (Math.log(2) - Math.log(1e-200)) },
			1e-12,
			'nearPole',
		)
	})

	test('input validation and singularity errors', () => {
		assert.throws(() => arctanComplexSeries(null), TypeError)
		assert.throws(() => arctanComplexSeries(undefined), TypeError)
		assert.throws(() => arctanComplexSeries(1), TypeError)
		assert.throws(() => arctanComplexSeries('1+i'), TypeError)
		assert.throws(() => arctanComplexSeries({ re: 1 }), TypeError)
		assert.throws(() => arctanComplexSeries({ im: 1 }), TypeError)
		assert.throws(() => arctanComplexSeries({ re: '1', im: 0 }), TypeError)

		assert.throws(() => arctanComplexSeries({ re: NaN, im: 0 }), RangeError)
		assert.throws(() => arctanComplexSeries({ re: 0, im: NaN }), RangeError)
		assert.throws(() => arctanComplexSeries({ re: Infinity, im: 0 }), RangeError)
		assert.throws(() => arctanComplexSeries({ re: 0, im: -Infinity }), RangeError)

		// Logarithmic singularities at z = ±i
		assert.throws(() => arctanComplexSeries({ re: 0, im: 1 }), RangeError)
		assert.throws(() => arctanComplexSeries({ re: 0, im: -1 }), RangeError)
	})
})
