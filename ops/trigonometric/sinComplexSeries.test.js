import { describe, test } from 'node:test'
import assert from 'node:assert'
import { sinComplexSeries } from './sinComplexSeries.js'

/**
 * Independent reference using Euler's formula:
 *   sin(z) = (e^(i*z) - e^(-i*z)) / (2i)
 * where e^(a + i*b) = e^a * (cos(b) + i*sin(b)).
 */
function sinComplexEuler({ re, im }) {
	// i*z = -im + i*re, -i*z = im - i*re
	const expPosMag = Math.exp(-im)
	const expPosRe = expPosMag * Math.cos(re)
	const expPosIm = expPosMag * Math.sin(re)

	const expNegMag = Math.exp(im)
	const expNegRe = expNegMag * Math.cos(-re)
	const expNegIm = expNegMag * Math.sin(-re)

	// diff = e^(i*z) - e^(-i*z) = diffRe + i*diffIm
	// diff / (2i) = (diffIm / 2) - i*(diffRe / 2)
	const diffRe = expPosRe - expNegRe
	const diffIm = expPosIm - expNegIm

	return {
		re: diffIm / 2,
		im: -diffRe / 2,
	}
}

/**
 * Independent reference using direct Taylor series with complex multiplication.
 */
function sinComplexDirectTaylor({ re, im }, terms = 40) {
	const mul = (a, b) => ({
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	})

	const z = { re, im }
	const z2 = mul(z, z)
	let power = z
	let fact = 1
	let sumRe = 0
	let sumIm = 0

	for (let k = 0; k < terms; k++) {
		const sign = k % 2 === 0 ? 1 : -1
		sumRe += (sign * power.re) / fact
		sumIm += (sign * power.im) / fact
		power = mul(power, z2)
		fact *= (2 * k + 2) * (2 * k + 3)
	}

	return { re: sumRe, im: sumIm }
}

function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	const prefix = label ? `${label}: ` : ''
	const scaleRe = Math.max(1, Math.abs(expected.re))
	const scaleIm = Math.max(1, Math.abs(expected.im))
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol * scaleRe,
		`${prefix}real part mismatch: got ${actual.re}, expected ${expected.re}`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol * scaleIm,
		`${prefix}imag part mismatch: got ${actual.im}, expected ${expected.im}`,
	)
}

describe('sinComplexSeries', () => {
	test('zero and signed zeros', () => {
		assert.deepStrictEqual(sinComplexSeries({ re: 0, im: 0 }), { re: 0, im: 0 })
		assert.deepStrictEqual(sinComplexSeries({ re: -0, im: -0 }), { re: 0, im: 0 })
	})

	test('real axis reduces to Math.sin(x) + 0i', () => {
		const xs = [
			-10,
			-Math.PI,
			-Math.PI / 2,
			-1,
			-0.5,
			0.25,
			0.5,
			1,
			Math.PI / 6,
			Math.PI / 4,
			Math.PI / 2,
			Math.PI,
			7.5,
		]
		for (const x of xs) {
			const res = sinComplexSeries({ re: x, im: 0 })
			assertComplexClose(res, { re: Math.sin(x), im: 0 }, 1e-14, `x=${x}`)
			assert.strictEqual(res.im, 0)
		}
	})

	test('imaginary axis reduces to 0 + i*Math.sinh(y)', () => {
		const ys = [-5, -2, -1, -0.5, -1e-8, 1e-8, 0.5, 1, 2, 5]
		for (const y of ys) {
			const res = sinComplexSeries({ re: 0, im: y })
			assertComplexClose(res, { re: 0, im: Math.sinh(y) }, 1e-14, `y=${y}`)
			assert.strictEqual(res.re, 0)
		}
	})

	test('normal complex inputs across all quadrants and unit-disk boundary', () => {
		const cases = [
			{ re: 0.3, im: 0.4 },
			{ re: -0.6, im: 0.5 },
			{ re: -0.5, im: -0.5 },
			{ re: 0.8, im: -0.6 }, // |z| === 1 boundary
			{ re: 0.8000001, im: -0.6 }, // just outside |z| === 1
			{ re: 1, im: 1 },
			{ re: -2.5, im: 1.75 },
			{ re: 3.1, im: -2.2 },
			{ re: -4.2, im: -3.3 },
		]
		for (const z of cases) {
			const expected = {
				re: Math.sin(z.re) * Math.cosh(z.im),
				im: Math.cos(z.re) * Math.sinh(z.im),
			}
			assertComplexClose(
				sinComplexSeries(z),
				expected,
				1e-14,
				`z=${z.re}+${z.im}i`,
			)
		}
	})

	test('very small magnitudes satisfy sin(z) ~= z', () => {
		const z = { re: 1e-12, im: -2e-12 }
		assertComplexClose(sinComplexSeries(z), z, 1e-14)
	})

	test('periodicity along the real axis: sin(z + 2*pi*k) = sin(z) and sin(z + pi) = -sin(z)', () => {
		const samples = [
			{ re: 0.4, im: 0.3 },
			{ re: 1.2, im: -1.5 },
			{ re: -0.7, im: 2.1 },
		]
		for (const z of samples) {
			const base = sinComplexSeries(z)
			for (const k of [-3, -1, 1, 2, 5]) {
				const shifted = sinComplexSeries({ re: z.re + 2 * Math.PI * k, im: z.im })
				assertComplexClose(shifted, base, 1e-12, `shift 2pi*${k}`)
			}
			const halfPeriod = sinComplexSeries({ re: z.re + Math.PI, im: z.im })
			assertComplexClose(
				halfPeriod,
				{ re: -base.re, im: -base.im },
				1e-12,
				'half-period',
			)
		}
	})

	test('odd symmetry sin(-z) = -sin(z) and conjugate symmetry sin(conj(z)) = conj(sin(z))', () => {
		const samples = [
			{ re: 0.25, im: 0.75 },
			{ re: 1.5, im: -2.3 },
			{ re: -3.2, im: 0.9 },
		]
		for (const z of samples) {
			const sz = sinComplexSeries(z)
			const sNeg = sinComplexSeries({ re: -z.re, im: -z.im })
			const sConj = sinComplexSeries({ re: z.re, im: -z.im })
			assertComplexClose(sNeg, { re: -sz.re, im: -sz.im }, 1e-14, 'odd')
			assertComplexClose(sConj, { re: sz.re, im: -sz.im }, 1e-14, 'conjugate')
		}
	})

	test('cross-check against Euler formula (e^(iz) - e^(-iz)) / (2i)', () => {
		const samples = [
			{ re: 0, im: 0 },
			{ re: 0.5, im: 0.5 },
			{ re: -0.3, im: 0.8 },
			{ re: 1.25, im: -0.75 },
			{ re: 2.5, im: 3.1 },
			{ re: -4.7, im: -2.8 },
			{ re: 10.5, im: 6.2 },
		]
		for (const z of samples) {
			assertComplexClose(
				sinComplexSeries(z),
				sinComplexEuler(z),
				1e-13,
				`Euler z=${z.re}+${z.im}i`,
			)
		}
	})

	test('cross-check against independent direct Taylor series', () => {
		const samples = [
			{ re: 0.2, im: -0.3 },
			{ re: -0.7, im: 0.6 },
			{ re: 1.5, im: 1.2 },
			{ re: -2.1, im: -1.8 },
		]
		for (const z of samples) {
			assertComplexClose(
				sinComplexSeries(z),
				sinComplexDirectTaylor(z, 40),
				1e-13,
				`Taylor z=${z.re}+${z.im}i`,
			)
		}
	})

	test('overflow handling avoids NaN on pure imaginary axis', () => {
		const pos = sinComplexSeries({ re: 0, im: 800 })
		assert.strictEqual(pos.re, 0)
		assert.strictEqual(pos.im, Infinity)

		const neg = sinComplexSeries({ re: 0, im: -800 })
		assert.strictEqual(neg.re, 0)
		assert.strictEqual(neg.im, -Infinity)
	})

	test('rejects invalid inputs with TypeError or RangeError', () => {
		const typeInvalid = [
			undefined,
			null,
			42,
			'1+2i',
			true,
			[1, 2],
			{},
			{ re: 1 },
			{ im: 2 },
			{ re: '1', im: 2 },
			{ re: 1, im: null },
		]
		for (const bad of typeInvalid) {
			assert.throws(() => sinComplexSeries(bad), TypeError)
		}

		const rangeInvalid = [
			{ re: NaN, im: 0 },
			{ re: 0, im: NaN },
			{ re: Infinity, im: 0 },
			{ re: -Infinity, im: 1 },
			{ re: 1, im: Infinity },
			{ re: 1, im: -Infinity },
		]
		for (const bad of rangeInvalid) {
			assert.throws(() => sinComplexSeries(bad), RangeError)
		}
	})
})
