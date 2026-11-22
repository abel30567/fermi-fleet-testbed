import { test, describe } from 'node:test'
import assert from 'node:assert'
import { log2ComplexSeries } from './log2ComplexSeries.js'

const EPS = 1e-12

function assertComplexClose(actual, expected, tol = EPS, label = '') {
	const prefix = label ? `${label}: ` : ''
	assert.ok(
		Number.isFinite(actual.re) && Number.isFinite(actual.im),
		`${prefix}result must be finite, got ${JSON.stringify(actual)}`,
	)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${prefix}re mismatch: got ${actual.re}, expected ${expected.re} (diff ${Math.abs(actual.re - expected.re)})`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${prefix}im mismatch: got ${actual.im}, expected ${expected.im} (diff ${Math.abs(actual.im - expected.im)})`,
	)
}

/**
 * Independent complex power of 2: 2^(u + i*v) = 2^u * (cos(v*ln2) + i*sin(v*ln2))
 */
function pow2Complex({ re, im }) {
	const mag = 2 ** re
	const angle = im * Math.LN2
	return {
		re: mag * Math.cos(angle),
		im: mag * Math.sin(angle),
	}
}

/**
 * Independent complex Mercator series for log2(1 + w) = (1/ln2) * sum_{n=1}^{N} (-1)^(n-1) * w^n / n
 * Valid for |w| < 1.
 */
function log2OnePlusMercator(w, terms = 80) {
	let powRe = 1
	let powIm = 0
	let sumRe = 0
	let sumIm = 0
	for (let n = 1; n <= terms; n++) {
		const nextRe = powRe * w.re - powIm * w.im
		const nextIm = powRe * w.im + powIm * w.re
		powRe = nextRe
		powIm = nextIm
		const sign = n % 2 === 1 ? 1 : -1
		sumRe += (sign * powRe) / n
		sumIm += (sign * powIm) / n
	}
	return { re: sumRe / Math.LN2, im: sumIm / Math.LN2 }
}

describe('log2ComplexSeries', () => {
	test('positive real powers of 2 and general positive reals', () => {
		assert.deepStrictEqual(log2ComplexSeries({ re: 1, im: 0 }), { re: 0, im: 0 })
		assert.deepStrictEqual(log2ComplexSeries({ re: 2, im: 0 }), { re: 1, im: 0 })
		assert.deepStrictEqual(log2ComplexSeries({ re: 8, im: 0 }), { re: 3, im: 0 })
		assert.deepStrictEqual(log2ComplexSeries({ re: 0.25, im: 0 }), { re: -2, im: 0 })
		assert.deepStrictEqual(log2ComplexSeries({ re: 1024, im: 0 }), { re: 10, im: 0 })

		assertComplexClose(log2ComplexSeries({ re: 3, im: 0 }), { re: Math.log2(3), im: 0 }, 1e-14)
		assertComplexClose(log2ComplexSeries({ re: Math.E, im: 0 }), { re: Math.LOG2E, im: 0 }, 1e-14)
		assertComplexClose(log2ComplexSeries({ re: 10, im: 0 }), { re: Math.log2(10), im: 0 }, 1e-14)
	})

	test('general complex numbers across all four quadrants', () => {
		const piOverLn2 = Math.PI / Math.LN2
		assertComplexClose(
			log2ComplexSeries({ re: 1, im: 1 }),
			{ re: 0.5, im: piOverLn2 / 4 },
			1e-14,
			'1 + i',
		)
		assertComplexClose(
			log2ComplexSeries({ re: -1, im: 1 }),
			{ re: 0.5, im: (3 * piOverLn2) / 4 },
			1e-14,
			'-1 + i',
		)
		assertComplexClose(
			log2ComplexSeries({ re: -1, im: -1 }),
			{ re: 0.5, im: (-3 * piOverLn2) / 4 },
			1e-14,
			'-1 - i',
		)
		assertComplexClose(
			log2ComplexSeries({ re: 1, im: -1 }),
			{ re: 0.5, im: -piOverLn2 / 4 },
			1e-14,
			'1 - i',
		)
		assertComplexClose(
			log2ComplexSeries({ re: 3, im: 4 }),
			{ re: Math.log2(5), im: Math.atan2(4, 3) / Math.LN2 },
			1e-14,
			'3 + 4i',
		)
		assertComplexClose(
			log2ComplexSeries({ re: -5, im: -12 }),
			{ re: Math.log2(13), im: Math.atan2(-12, -5) / Math.LN2 },
			1e-14,
			'-5 - 12i',
		)
	})

	test('edge cases: negative reals (principal branch cut)', () => {
		const piOverLn2 = Math.PI / Math.LN2
		assertComplexClose(log2ComplexSeries({ re: -1, im: 0 }), { re: 0, im: piOverLn2 }, 1e-14)
		assertComplexClose(log2ComplexSeries({ re: -1, im: -0 }), { re: 0, im: piOverLn2 }, 1e-14)
		assertComplexClose(log2ComplexSeries({ re: -8, im: 0 }), { re: 3, im: piOverLn2 }, 1e-14)
		assertComplexClose(log2ComplexSeries({ re: -0.5, im: 0 }), { re: -1, im: piOverLn2 }, 1e-14)
	})

	test('edge cases: pure imaginary numbers', () => {
		const halfPiOverLn2 = Math.PI / (2 * Math.LN2)
		assertComplexClose(log2ComplexSeries({ re: 0, im: 1 }), { re: 0, im: halfPiOverLn2 }, 1e-14)
		assertComplexClose(log2ComplexSeries({ re: 0, im: -1 }), { re: 0, im: -halfPiOverLn2 }, 1e-14)
		assertComplexClose(log2ComplexSeries({ re: 0, im: 4 }), { re: 2, im: halfPiOverLn2 }, 1e-14)
		assertComplexClose(log2ComplexSeries({ re: 0, im: -0.25 }), { re: -2, im: -halfPiOverLn2 }, 1e-14)
	})

	test('edge cases: unit circle and near-unit-circle accuracy', () => {
		for (const theta of [-2.5, -Math.PI / 3, 0.7, Math.PI / 6, 2.9]) {
			const z = { re: Math.cos(theta), im: Math.sin(theta) }
			assertComplexClose(
				log2ComplexSeries(z),
				{ re: 0, im: theta / Math.LN2 },
				1e-14,
				`e^(i*${theta})`,
			)
		}

		// Pythagorean triple on unit circle: 0.6^2 + 0.8^2 = 1
		assertComplexClose(
			log2ComplexSeries({ re: 0.6, im: 0.8 }),
			{ re: 0, im: Math.atan2(0.8, 0.6) / Math.LN2 },
			1e-15,
		)

		// Near 1: avoids catastrophic cancellation in log2(|1 + 1e-10*i|) = 0.5*1e-20 / ln2
		const nearOne = log2ComplexSeries({ re: 1, im: 1e-10 })
		const expectedRe = (0.5 * 1e-20) / Math.LN2
		assert.ok(
			Math.abs(nearOne.re - expectedRe) / expectedRe < 1e-10,
			`near-1 real part lost precision: got ${nearOne.re}, expected ${expectedRe}`,
		)
		assert.ok(
			Math.abs(nearOne.im - 1e-10 / Math.LN2) < 1e-24,
			`near-1 imag part mismatch: got ${nearOne.im}`,
		)
	})

	test('edge cases: extreme magnitudes and subnormals without overflow/underflow', () => {
		const piOver4Ln2 = Math.PI / (4 * Math.LN2)
		assertComplexClose(
			log2ComplexSeries({ re: 1e300, im: 1e300 }),
			{ re: 300 * Math.log2(10) + 0.5, im: piOver4Ln2 },
			1e-12,
			'1e300 + 1e300i',
		)
		assertComplexClose(
			log2ComplexSeries({ re: 1e-300, im: 1e-300 }),
			{ re: -300 * Math.log2(10) + 0.5, im: piOver4Ln2 },
			1e-12,
			'1e-300 + 1e-300i',
		)
		// Subnormal power of 2: 2^-1050
		assertComplexClose(
			log2ComplexSeries({ re: 2 ** -1050, im: 0 }),
			{ re: -1050, im: 0 },
			1e-12,
			'subnormal 2^-1050',
		)
	})

	test('edge cases: invalid inputs and zero throw errors', () => {
		const invalidTypes = [null, undefined, 0, 1, '1+i', true, [1, 2], {}, { re: 1 }, { im: 1 }, { re: '1', im: 0 }, { re: 1, im: null }]
		for (const bad of invalidTypes) {
			assert.throws(() => log2ComplexSeries(bad), TypeError, `expected TypeError for ${JSON.stringify(bad)}`)
		}

		const invalidRanges = [
			{ re: NaN, im: 0 },
			{ re: 0, im: NaN },
			{ re: Infinity, im: 0 },
			{ re: 0, im: -Infinity },
			{ re: -Infinity, im: Infinity },
			{ re: 0, im: 0 },
			{ re: -0, im: 0 },
			{ re: 0, im: -0 },
			{ re: -0, im: -0 },
		]
		for (const bad of invalidRanges) {
			assert.throws(() => log2ComplexSeries(bad), RangeError, `expected RangeError for ${JSON.stringify(bad)}`)
		}
	})

	test('cross-check: round-trip 2^(log2(z)) == z', () => {
		const samples = [
			{ re: 1, im: 0 },
			{ re: -1, im: 0 },
			{ re: 0, im: 1 },
			{ re: 0, im: -2.5 },
			{ re: 3.5, im: 4.25 },
			{ re: -7.1, im: 2.3 },
			{ re: -0.05, im: -0.12 },
			{ re: 123.456, im: -78.9 },
			{ re: 1e-6, im: 2e-6 },
		]
		for (const z of samples) {
			const w = log2ComplexSeries(z)
			const reconstructed = pow2Complex(w)
			const scale = Math.hypot(z.re, z.im)
			assertComplexClose(reconstructed, z, 1e-12 * Math.max(1, scale), `round-trip ${JSON.stringify(z)}`)
		}
	})

	test('cross-check: independent complex Mercator power series for log2(1 + w)', () => {
		const perturbations = [
			{ re: 0.25, im: 0.1 },
			{ re: -0.2, im: 0.3 },
			{ re: -0.15, im: -0.25 },
			{ re: 0.1, im: -0.35 },
			{ re: 0.01, im: -0.02 },
		]
		for (const w of perturbations) {
			const z = { re: 1 + w.re, im: w.im }
			const actual = log2ComplexSeries(z)
			const expected = log2OnePlusMercator(w)
			assertComplexClose(actual, expected, 1e-13, `Mercator 1 + ${JSON.stringify(w)}`)
		}
	})

	test('cross-check: algebraic identities (conjugate, reciprocal, product)', () => {
		const z = { re: 2.3, im: -4.1 }
		const lz = log2ComplexSeries(z)

		// Conjugate symmetry: log2(conj(z)) = conj(log2(z))
		const lConj = log2ComplexSeries({ re: z.re, im: -z.im })
		assertComplexClose(lConj, { re: lz.re, im: -lz.im }, 1e-14, 'conjugate')

		// Reciprocal: log2(1/z) = -log2(z)
		const denom = z.re * z.re + z.im * z.im
		const invZ = { re: z.re / denom, im: -z.im / denom }
		const lInv = log2ComplexSeries(invZ)
		assertComplexClose(lInv, { re: -lz.re, im: -lz.im }, 1e-14, 'reciprocal')

		// Product rule (first quadrant, sum of args < pi): log2(z1 * z2) = log2(z1) + log2(z2)
		const z1 = { re: 1.5, im: 2.0 }
		const z2 = { re: 3.0, im: 0.75 }
		const prod = { re: z1.re * z2.re - z1.im * z2.im, im: z1.re * z2.im + z1.im * z2.re }
		const l1 = log2ComplexSeries(z1)
		const l2 = log2ComplexSeries(z2)
		assertComplexClose(
			log2ComplexSeries(prod),
			{ re: l1.re + l2.re, im: l1.im + l2.im },
			1e-13,
			'product',
		)
	})
})
