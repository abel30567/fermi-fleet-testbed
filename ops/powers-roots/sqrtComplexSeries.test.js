import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sqrtComplexSeries } from './sqrtComplexSeries.js'

function mulComplex(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function polarSqrt(z) {
	if (z.re === 0 && z.im === 0) {
		return { re: 0, im: 0 }
	}
	const r = Math.hypot(z.re, z.im)
	const theta = Math.atan2(z.im, z.re)
	const rootR = Math.sqrt(r)
	return {
		re: rootR * Math.cos(theta / 2),
		im: rootR * Math.sin(theta / 2),
	}
}

function binomialSqrtOnePlusW(w, terms = 80) {
	// (1 + w)^(1/2) = sum_{k=0}^inf binom(1/2, k) * w^k for |w| < 1
	let sumRe = 1
	let sumIm = 0
	let coeff = 1
	let powRe = 1
	let powIm = 0

	for (let k = 1; k < terms; k++) {
		coeff *= (0.5 - (k - 1)) / k
		const nextRe = powRe * w.re - powIm * w.im
		const nextIm = powRe * w.im + powIm * w.re
		powRe = nextRe
		powIm = nextIm
		sumRe += coeff * powRe
		sumIm += coeff * powIm
	}

	return { re: sumRe, im: sumIm }
}

function assertComplexClose(actual, expected, relTol = 1e-14, absTol = 1e-14) {
	const scale = Math.max(
		Math.hypot(actual.re, actual.im),
		Math.hypot(expected.re, expected.im),
		1
	)
	const tol = Math.max(absTol, relTol * scale)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`re mismatch: actual=${actual.re}, expected=${expected.re}, diff=${Math.abs(actual.re - expected.re)}, tol=${tol}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`im mismatch: actual=${actual.im}, expected=${expected.im}, diff=${Math.abs(actual.im - expected.im)}, tol=${tol}`
	)
}

describe('sqrtComplexSeries', () => {
	it('handles zero and signed-zero inputs', () => {
		for (const z of [
			{ re: 0, im: 0 },
			{ re: -0, im: 0 },
			{ re: 0, im: -0 },
			{ re: -0, im: -0 },
		]) {
			const res = sqrtComplexSeries(z)
			assert.ok(Object.is(res.re, 0))
			assert.ok(Object.is(res.im, 0))
		}
	})

	it('handles positive and negative real numbers', () => {
		assert.deepStrictEqual(sqrtComplexSeries({ re: 1, im: 0 }), { re: 1, im: 0 })
		assert.deepStrictEqual(sqrtComplexSeries({ re: 4, im: 0 }), { re: 2, im: 0 })
		assert.deepStrictEqual(sqrtComplexSeries({ re: 0.25, im: 0 }), { re: 0.5, im: 0 })
		assert.deepStrictEqual(sqrtComplexSeries({ re: 9, im: -0 }), { re: 3, im: 0 })

		// Negative reals lie on the principal branch cut: sqrt(-x) = i * sqrt(x)
		assert.deepStrictEqual(sqrtComplexSeries({ re: -1, im: 0 }), { re: 0, im: 1 })
		assert.deepStrictEqual(sqrtComplexSeries({ re: -4, im: 0 }), { re: 0, im: 2 })
		assert.deepStrictEqual(sqrtComplexSeries({ re: -0.25, im: 0 }), { re: 0, im: 0.5 })
		assert.deepStrictEqual(sqrtComplexSeries({ re: -9, im: -0 }), { re: 0, im: 3 })
	})

	it('handles pure imaginary numbers', () => {
		const invSqrt2 = Math.SQRT1_2
		assertComplexClose(sqrtComplexSeries({ re: 0, im: 1 }), { re: invSqrt2, im: invSqrt2 })
		assertComplexClose(sqrtComplexSeries({ re: 0, im: -1 }), { re: invSqrt2, im: -invSqrt2 })
		assertComplexClose(sqrtComplexSeries({ re: 0, im: 2 }), { re: 1, im: 1 })
		assertComplexClose(sqrtComplexSeries({ re: 0, im: -2 }), { re: 1, im: -1 })
		assertComplexClose(sqrtComplexSeries({ re: 0, im: 8 }), { re: 2, im: 2 })
		assertComplexClose(sqrtComplexSeries({ re: 0, im: -8 }), { re: 2, im: -2 })
	})

	it('computes exact Gaussian integer square roots across all quadrants', () => {
		const cases = [
			{ z: { re: 3, im: 4 }, expected: { re: 2, im: 1 } },
			{ z: { re: 3, im: -4 }, expected: { re: 2, im: -1 } },
			{ z: { re: -3, im: 4 }, expected: { re: 1, im: 2 } },
			{ z: { re: -3, im: -4 }, expected: { re: 1, im: -2 } },
			{ z: { re: 5, im: 12 }, expected: { re: 3, im: 2 } },
			{ z: { re: -5, im: 12 }, expected: { re: 2, im: 3 } },
			{ z: { re: -7, im: -24 }, expected: { re: 3, im: -4 } },
			{ z: { re: 7, im: 24 }, expected: { re: 4, im: 3 } },
		]

		for (const { z, expected } of cases) {
			assertComplexClose(sqrtComplexSeries(z), expected, 1e-15, 1e-15)
		}
	})

	it('cross-checks against squaring sqrt(z)^2 = z and polar half-angle formula', () => {
		const vals = [-10, -2.5, -1, -1e-6, 0, 1e-6, 1, 2.5, 10]
		for (const re of vals) {
			for (const im of vals) {
				const z = { re, im }
				const root = sqrtComplexSeries(z)

				// Principal branch conditions
				assert.ok(root.re >= 0, `Re(sqrt(z)) should be >= 0 for ${JSON.stringify(z)}`)
				if (im > 0) assert.ok(root.im > 0)
				if (im < 0) assert.ok(root.im < 0)
				if (im === 0 && re < 0) assert.ok(root.im > 0)

				// Squaring inverse property: root^2 ≈ z
				const squared = mulComplex(root, root)
				assertComplexClose(squared, z, 1e-13, 1e-13)

				// Independent polar half-angle reference
				const polar = polarSqrt(z)
				assertComplexClose(root, polar, 1e-13, 1e-13)

				// Modulus property: |sqrt(z)| ≈ sqrt(|z|)
				const rootMod = Math.hypot(root.re, root.im)
				const expectedMod = Math.sqrt(Math.hypot(re, im))
				assert.ok(
					Math.abs(rootMod - expectedMod) <= 1e-13 * Math.max(expectedMod, 1),
					`modulus mismatch for ${JSON.stringify(z)}`
				)
			}
		}
	})

	it('cross-checks against the binomial series (1 + w)^(1/2) for |w| < 1', () => {
		const perturbations = [
			{ re: 0.2, im: 0.3 },
			{ re: -0.4, im: 0.25 },
			{ re: 0.1, im: -0.45 },
			{ re: -0.3, im: -0.3 },
			{ re: 0, im: 0.5 },
			{ re: -0.5, im: 0 },
		]

		for (const w of perturbations) {
			const z = { re: 1 + w.re, im: w.im }
			const actual = sqrtComplexSeries(z)
			const series = binomialSqrtOnePlusW(w)
			assertComplexClose(actual, series, 1e-14, 1e-14)
		}
	})

	it('satisfies conjugate symmetry off the negative real axis', () => {
		const samples = [
			{ re: 2.3, im: 4.7 },
			{ re: -2.3, im: 4.7 },
			{ re: 0, im: 3.14 },
			{ re: -100, im: 1e-9 },
		]

		for (const z of samples) {
			const conjZ = { re: z.re, im: -z.im }
			const root = sqrtComplexSeries(z)
			const rootConj = sqrtComplexSeries(conjZ)
			assertComplexClose(rootConj, { re: root.re, im: -root.im }, 1e-15, 1e-15)
		}
	})

	it('avoids catastrophic cancellation near the negative real axis', () => {
		// For z = -a + b*i with a > 0 and |b| << a:
		// sqrt(z) ≈ (|b| / (2*sqrt(a))) + i * sgn(b) * sqrt(a)
		const zPos = { re: -1e12, im: 1e-6 }
		const rPos = sqrtComplexSeries(zPos)
		assert.ok(Math.abs(rPos.re - 5e-13) / 5e-13 < 1e-14)
		assert.ok(Math.abs(rPos.im - 1e6) / 1e6 < 1e-14)

		const zNeg = { re: -1e12, im: -1e-6 }
		const rNeg = sqrtComplexSeries(zNeg)
		assert.ok(Math.abs(rNeg.re - 5e-13) / 5e-13 < 1e-14)
		assert.ok(Math.abs(rNeg.im - (-1e6)) / 1e6 < 1e-14)
	})

	it('handles very large and very small magnitudes without overflow or underflow', () => {
		// Large symmetric values where naive hypot(re, im) would overflow to Infinity
		const huge = 1.5e308
		const rootHuge = sqrtComplexSeries({ re: huge, im: huge })
		assert.ok(Number.isFinite(rootHuge.re) && Number.isFinite(rootHuge.im))
		const expectedHugeScale = Math.sqrt(huge)
		const unitRoot = sqrtComplexSeries({ re: 1, im: 1 })
		assert.ok(
			Math.abs(rootHuge.re - unitRoot.re * expectedHugeScale) /
				(unitRoot.re * expectedHugeScale) <
				1e-14
		)
		assert.ok(
			Math.abs(rootHuge.im - unitRoot.im * expectedHugeScale) /
				(unitRoot.im * expectedHugeScale) <
				1e-14
		)

		// MAX_VALUE on real and negative real axes
		const rootMaxPos = sqrtComplexSeries({ re: Number.MAX_VALUE, im: 0 })
		assert.ok(Number.isFinite(rootMaxPos.re) && rootMaxPos.im === 0)
		assert.ok(Math.abs(rootMaxPos.re - Math.sqrt(Number.MAX_VALUE)) / rootMaxPos.re < 1e-14)

		const rootMaxNeg = sqrtComplexSeries({ re: -Number.MAX_VALUE, im: 0 })
		assert.ok(rootMaxNeg.re === 0 && Number.isFinite(rootMaxNeg.im))
		assert.ok(Math.abs(rootMaxNeg.im - Math.sqrt(Number.MAX_VALUE)) / rootMaxNeg.im < 1e-14)

		// Very small and subnormal magnitudes
		const tiny = 1e-320
		const rootTiny = sqrtComplexSeries({ re: tiny, im: tiny })
		assert.ok(Number.isFinite(rootTiny.re) && rootTiny.re > 0)
		assert.ok(Number.isFinite(rootTiny.im) && rootTiny.im > 0)
		const expectedTinyScale = Math.sqrt(tiny)
		assert.ok(
			Math.abs(rootTiny.re - unitRoot.re * expectedTinyScale) /
				(unitRoot.re * expectedTinyScale) <
				1e-12
		)
		assert.ok(
			Math.abs(rootTiny.im - unitRoot.im * expectedTinyScale) /
				(unitRoot.im * expectedTinyScale) <
				1e-12
		)

		// Number.MIN_VALUE (2^-1074)
		const rootMinPos = sqrtComplexSeries({ re: Number.MIN_VALUE, im: 0 })
		assert.strictEqual(rootMinPos.re, 2 ** -537)
		assert.strictEqual(rootMinPos.im, 0)

		const rootMinNeg = sqrtComplexSeries({ re: -Number.MIN_VALUE, im: 0 })
		assert.strictEqual(rootMinNeg.re, 0)
		assert.strictEqual(rootMinNeg.im, 2 ** -537)

		// Extreme aspect ratio at high magnitude
		const rootSkew = sqrtComplexSeries({ re: 1e308, im: 1e-150 })
		assert.ok(Math.abs(rootSkew.re - 1e154) / 1e154 < 1e-14)
		assert.ok(Math.abs(rootSkew.im - 5e-305) / 5e-305 < 1e-14)
	})

	it('throws TypeError or RangeError on invalid inputs', () => {
		for (const bad of [null, undefined, 42, '1+i', true, [1, 2]]) {
			assert.throws(() => sqrtComplexSeries(bad), TypeError)
		}

		for (const bad of [
			{},
			{ re: 1 },
			{ im: 1 },
			{ re: '1', im: 0 },
			{ re: 0, im: '1' },
			{ re: 1n, im: 0 },
			{ re: 0, im: null },
		]) {
			assert.throws(() => sqrtComplexSeries(bad), TypeError)
		}

		for (const bad of [
			{ re: Number.NaN, im: 0 },
			{ re: 0, im: Number.NaN },
			{ re: Number.POSITIVE_INFINITY, im: 0 },
			{ re: 0, im: Number.NEGATIVE_INFINITY },
			{ re: Number.NEGATIVE_INFINITY, im: Number.POSITIVE_INFINITY },
		]) {
			assert.throws(() => sqrtComplexSeries(bad), RangeError)
		}
	})
})
