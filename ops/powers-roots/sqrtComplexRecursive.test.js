import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sqrtComplexRecursive } from './sqrtComplexRecursive.js'

/**
 * Multiplies two complex numbers { re, im }.
 */
function mulComplex(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Independent polar-form reference implementation of principal complex sqrt
 * for moderate-magnitude inputs.
 */
function sqrtPolarReference(z) {
	const r = Math.hypot(z.re, z.im)
	if (r === 0) return { re: 0, im: 0 }
	const theta = Math.atan2(z.im, z.re)
	const rootR = Math.sqrt(r)
	const halfTheta = theta / 2
	return {
		re: rootR * Math.cos(halfTheta),
		im: rootR * Math.sin(halfTheta),
	}
}

/**
 * Independent direct algebraic reference implementation using Math.hypot / Math.sqrt.
 */
function sqrtAlgebraicReference(z) {
	const r = Math.hypot(z.re, z.im)
	if (r === 0) return { re: 0, im: 0 }
	if (z.re >= 0) {
		const u = Math.sqrt(0.5 * (r + z.re))
		const v = z.im === 0 ? 0 : z.im / (2 * u)
		return { re: u, im: v }
	}
	const vAbs = Math.sqrt(0.5 * (r - z.re))
	const v = z.im < 0 ? -vAbs : vAbs
	const u = z.im === 0 ? 0 : z.im / (2 * v)
	return { re: u, im: v }
}

/**
 * Asserts two finite numbers are close within a combined absolute/relative tolerance.
 */
function assertClose(actual, expected, relTol = 1e-14, absTol = 1e-15, label = '') {
	assert.equal(typeof actual, 'number', `${label}: expected number`)
	assert.ok(Number.isFinite(actual), `${label}: expected finite number, got ${actual}`)
	const diff = Math.abs(actual - expected)
	const tol = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= tol,
		`${label}: expected ${expected}, got ${actual} (diff=${diff}, tol=${tol})`
	)
}

function assertComplexClose(actual, expected, relTol = 1e-14, absTol = 1e-15, label = '') {
	assertClose(actual.re, expected.re, relTol, absTol, `${label}.re`)
	assertClose(actual.im, expected.im, relTol, absTol, `${label}.im`)
}

describe('sqrtComplexRecursive', () => {
	test('exact Pythagorean complex squares in all four quadrants', () => {
		assertComplexClose(sqrtComplexRecursive({ re: 3, im: 4 }), { re: 2, im: 1 })
		assertComplexClose(sqrtComplexRecursive({ re: 3, im: -4 }), { re: 2, im: -1 })
		assertComplexClose(sqrtComplexRecursive({ re: -3, im: 4 }), { re: 1, im: 2 })
		assertComplexClose(sqrtComplexRecursive({ re: -3, im: -4 }), { re: 1, im: -2 })
		assertComplexClose(sqrtComplexRecursive({ re: 5, im: 12 }), { re: 3, im: 2 })
		assertComplexClose(sqrtComplexRecursive({ re: -5, im: -12 }), { re: 2, im: -3 })
		assertComplexClose(sqrtComplexRecursive({ re: 7, im: 24 }), { re: 4, im: 3 })
		assertComplexClose(sqrtComplexRecursive({ re: -7, im: 24 }), { re: 3, im: 4 })
	})

	test('zero and negative-zero normalization', () => {
		for (const z of [
			{ re: 0, im: 0 },
			{ re: -0, im: 0 },
			{ re: 0, im: -0 },
			{ re: -0, im: -0 },
		]) {
			const res = sqrtComplexRecursive(z)
			assert.ok(Object.is(res.re, 0), `expected +0 for re, got ${res.re}`)
			assert.ok(Object.is(res.im, 0), `expected +0 for im, got ${res.im}`)
		}
	})

	test('pure positive and negative real numbers (including branch cut)', () => {
		const pos1 = sqrtComplexRecursive({ re: 1, im: 0 })
		assertComplexClose(pos1, { re: 1, im: 0 })
		assert.ok(Object.is(pos1.im, 0))

		assertComplexClose(sqrtComplexRecursive({ re: 4, im: 0 }), { re: 2, im: 0 })
		assertComplexClose(sqrtComplexRecursive({ re: 2, im: 0 }), { re: Math.SQRT2, im: 0 })
		assertComplexClose(sqrtComplexRecursive({ re: 0.25, im: 0 }), { re: 0.5, im: 0 })
		assertComplexClose(sqrtComplexRecursive({ re: 100, im: 0 }), { re: 10, im: 0 })

		const neg1 = sqrtComplexRecursive({ re: -1, im: 0 })
		assertComplexClose(neg1, { re: 0, im: 1 })
		assert.ok(Object.is(neg1.re, 0))

		const neg4 = sqrtComplexRecursive({ re: -4, im: 0 })
		assertComplexClose(neg4, { re: 0, im: 2 })
		assert.ok(Object.is(neg4.re, 0))

		// -0 imaginary part is normalized to 0, returning principal root +2i
		const neg4NegZero = sqrtComplexRecursive({ re: -4, im: -0 })
		assertComplexClose(neg4NegZero, { re: 0, im: 2 })
		assert.ok(Object.is(neg4NegZero.re, 0))

		assertComplexClose(sqrtComplexRecursive({ re: -2, im: 0 }), { re: 0, im: Math.SQRT2 })
	})

	test('pure imaginary numbers', () => {
		assertComplexClose(sqrtComplexRecursive({ re: 0, im: 2 }), { re: 1, im: 1 })
		assertComplexClose(sqrtComplexRecursive({ re: 0, im: -2 }), { re: 1, im: -1 })
		assertComplexClose(sqrtComplexRecursive({ re: 0, im: 1 }), {
			re: Math.SQRT1_2,
			im: Math.SQRT1_2,
		})
		assertComplexClose(sqrtComplexRecursive({ re: 0, im: -1 }), {
			re: Math.SQRT1_2,
			im: -Math.SQRT1_2,
		})
	})

	test('annulus boundary values (0.25 and 4)', () => {
		const boundaries = [
			{ re: 0.25, im: 0.25 },
			{ re: 0.24999999999999997, im: 0 },
			{ re: 0.25000000000000006, im: 0 },
			{ re: 4, im: 4 },
			{ re: 4.000000000000001, im: 0 },
			{ re: -4.000000000000001, im: -0.24999999999999997 },
		]
		for (const z of boundaries) {
			const w = sqrtComplexRecursive(z)
			assertComplexClose(mulComplex(w, w), z, 1e-14, 1e-15, `boundary ${JSON.stringify(z)}`)
			assert.ok(w.re >= 0)
		}
	})

	test('cancellation-free accuracy near the negative real axis', () => {
		const above = sqrtComplexRecursive({ re: -1, im: 1e-300 })
		assertClose(above.re, 5e-301, 1e-14, 0, 'above.re')
		assertClose(above.im, 1, 1e-14, 0, 'above.im')

		const below = sqrtComplexRecursive({ re: -1, im: -1e-300 })
		assertClose(below.re, 5e-301, 1e-14, 0, 'below.re')
		assertClose(below.im, -1, 1e-14, 0, 'below.im')

		const nearAbove = sqrtComplexRecursive({ re: -4, im: 1e-15 })
		assertClose(nearAbove.re, 2.5e-16, 1e-14, 0, 'nearAbove.re')
		assertClose(nearAbove.im, 2, 1e-14, 0, 'nearAbove.im')

		const nearBelow = sqrtComplexRecursive({ re: -4, im: -1e-15 })
		assertClose(nearBelow.re, 2.5e-16, 1e-14, 0, 'nearBelow.re')
		assertClose(nearBelow.im, -2, 1e-14, 0, 'nearBelow.im')
	})

	test('extreme magnitudes and extreme component aspect ratios (overflow/underflow safety)', () => {
		// Huge pure real & imaginary
		assertComplexClose(sqrtComplexRecursive({ re: 1e300, im: 0 }), { re: 1e150, im: 0 }, 1e-14, 0)
		assertComplexClose(sqrtComplexRecursive({ re: -1e300, im: 0 }), { re: 0, im: 1e150 }, 1e-14, 0)

		// Extreme aspect ratios where scaling alone would underflow the minor component
		const hugePos = sqrtComplexRecursive({ re: 1e300, im: 1e-100 })
		assertClose(hugePos.re, 1e150, 1e-14, 0, 'hugePos.re')
		assertClose(hugePos.im, 5e-251, 1e-14, 0, 'hugePos.im')

		const hugeNeg = sqrtComplexRecursive({ re: -1e300, im: -1e-100 })
		assertClose(hugeNeg.re, 5e-251, 1e-14, 0, 'hugeNeg.re')
		assertClose(hugeNeg.im, -1e150, 1e-14, 0, 'hugeNeg.im')

		const hugeImPosRe = sqrtComplexRecursive({ re: 1e-100, im: -1e300 })
		assertClose(hugeImPosRe.re, Math.SQRT1_2 * 1e150, 1e-14, 0, 'hugeImPosRe.re')
		assertClose(hugeImPosRe.im, -Math.SQRT1_2 * 1e150, 1e-14, 0, 'hugeImPosRe.im')

		const hugeImNegRe = sqrtComplexRecursive({ re: -1e-100, im: -1e300 })
		assertClose(hugeImNegRe.re, Math.SQRT1_2 * 1e150, 1e-14, 0, 'hugeImNegRe.re')
		assertClose(hugeImNegRe.im, -Math.SQRT1_2 * 1e150, 1e-14, 0, 'hugeImNegRe.im')

		// Number.MAX_VALUE: verify without overflowing via scaling by 2^-256
		const maxRes = sqrtComplexRecursive({ re: Number.MAX_VALUE, im: Number.MAX_VALUE })
		assert.ok(Number.isFinite(maxRes.re) && Number.isFinite(maxRes.im))
		const scaledMax = { re: maxRes.re * 2 ** -256, im: maxRes.im * 2 ** -256 }
		assertComplexClose(
			mulComplex(scaledMax, scaledMax),
			{ re: Number.MAX_VALUE * 2 ** -512, im: Number.MAX_VALUE * 2 ** -512 },
			1e-14,
			0,
			'MAX_VALUE'
		)

		const maxNegIm = sqrtComplexRecursive({ re: Number.MAX_VALUE, im: -Number.MAX_VALUE })
		assertClose(maxNegIm.re, maxRes.re, 1e-14, 0)
		assertClose(maxNegIm.im, -maxRes.im, 1e-14, 0)

		// Tiny normal and subnormal (Number.MIN_VALUE = 2^-1074)
		assertComplexClose(sqrtComplexRecursive({ re: 1e-300, im: 0 }), { re: 1e-150, im: 0 }, 1e-14, 0)
		assertComplexClose(sqrtComplexRecursive({ re: -1e-300, im: 0 }), { re: 0, im: 1e-150 }, 1e-14, 0)

		const minPos = sqrtComplexRecursive({ re: Number.MIN_VALUE, im: 0 })
		assertClose(minPos.re, 2 ** -537, 1e-14, 0, 'MIN_VALUE.re')
		assert.ok(Object.is(minPos.im, 0))

		const minNeg = sqrtComplexRecursive({ re: -Number.MIN_VALUE, im: 0 })
		assert.ok(Object.is(minNeg.re, 0))
		assertClose(minNeg.im, 2 ** -537, 1e-14, 0, '-MIN_VALUE.im')

		const minIm = sqrtComplexRecursive({ re: 0, im: Number.MIN_VALUE })
		const expectedMinIm = Math.SQRT1_2 * 2 ** -537
		assertClose(minIm.re, expectedMinIm, 1e-14, 0, 'i*MIN_VALUE.re')
		assertClose(minIm.im, expectedMinIm, 1e-14, 0, 'i*MIN_VALUE.im')
	})

	test('cross-check against polar reference formula, w^2 = z inverse, and algebraic identities', () => {
		const samples = [
			{ re: 1.5, im: 2.75 },
			{ re: -1.5, im: 2.75 },
			{ re: 1.5, im: -2.75 },
			{ re: -1.5, im: -2.75 },
			{ re: 0.001, im: 1000 },
			{ re: -0.001, im: -1000 },
			{ re: 1000, im: -0.001 },
			{ re: -1000, im: 0.001 },
			{ re: Math.PI, im: Math.E },
			{ re: -Math.E, im: Math.PI },
			{ re: 1e-12, im: 1e-12 },
			{ re: -1e-12, im: 1e-12 },
			{ re: 1e12, im: -3e11 },
			{ re: -7.3e-5, im: -2.1e-4 },
		]

		for (const z of samples) {
			const w = sqrtComplexRecursive(z)

			// 1. Principal branch invariant: Re(w) >= 0 and sign(Im(w)) matches sign(Im(z))
			assert.ok(w.re >= 0, `expected Re(sqrt(z)) >= 0 for ${JSON.stringify(z)}`)
			if (z.im > 0) assert.ok(w.im > 0)
			if (z.im < 0) assert.ok(w.im < 0)

			// 2. Inverse check: |w^2 - z| <= 1e-14 * |z| (complex norm backward error)
			const sq = mulComplex(w, w)
			const modZ = Math.hypot(z.re, z.im)
			const residual = Math.hypot(sq.re - z.re, sq.im - z.im)
			assert.ok(
				residual <= Math.max(1e-15, 1e-14 * modZ),
				`inverse ${JSON.stringify(z)}: residual=${residual}, |z|=${modZ}`
			)

			// 3. Independent direct algebraic reference check (componentwise)
			const algRef = sqrtAlgebraicReference(z)
			assertComplexClose(w, algRef, 1e-14, 1e-15, `algebraic ${JSON.stringify(z)}`)

			// 4. Independent polar-form reference check (complex norm, accounting for cos(pi/2) cancellation in polar form)
			const polarRef = sqrtPolarReference(z)
			const polarErr = Math.hypot(w.re - polarRef.re, w.im - polarRef.im)
			const modRef = Math.hypot(polarRef.re, polarRef.im)
			assert.ok(
				polarErr <= Math.max(1e-15, 1e-14 * modRef),
				`polar ${JSON.stringify(z)}: err=${polarErr}, |ref|=${modRef}`
			)

			// 5. Modulus identity: |w|^2 === |z|
			const modW2 = w.re * w.re + w.im * w.im
			assertClose(modW2, modZ, 1e-14, 1e-15, `modulus ${JSON.stringify(z)}`)

			// 6. Scaling identity: sqrt(4z) === 2 * sqrt(z)
			const w4 = sqrtComplexRecursive({ re: 4 * z.re, im: 4 * z.im })
			assertComplexClose(w4, { re: 2 * w.re, im: 2 * w.im }, 1e-14, 1e-15, `scale4 ${JSON.stringify(z)}`)

			// 7. Conjugate symmetry off the negative real axis: sqrt(conj(z)) === conj(sqrt(z))
			if (z.im !== 0 || z.re >= 0) {
				const wConj = sqrtComplexRecursive({ re: z.re, im: -z.im })
				assertComplexClose(wConj, { re: w.re, im: -w.im }, 1e-14, 1e-15, `conj ${JSON.stringify(z)}`)
			}
		}
	})

	test('input validation throws TypeError and RangeError appropriately', () => {
		const invalidTypes = [
			undefined,
			null,
			42,
			'1+2i',
			true,
			[1, 2],
			{},
			{ re: 1 },
			{ im: 2 },
			{ re: '1', im: 0 },
			{ re: 0, im: null },
			{ re: 0, im: undefined },
		]

		for (const bad of invalidTypes) {
			assert.throws(
				() => sqrtComplexRecursive(bad),
				TypeError,
				`expected TypeError for ${JSON.stringify(bad)}`
			)
		}

		const nonFinite = [
			{ re: NaN, im: 0 },
			{ re: 0, im: NaN },
			{ re: NaN, im: NaN },
			{ re: Infinity, im: 0 },
			{ re: -Infinity, im: 0 },
			{ re: 0, im: Infinity },
			{ re: 0, im: -Infinity },
			{ re: Infinity, im: -Infinity },
		]

		for (const bad of nonFinite) {
			assert.throws(
				() => sqrtComplexRecursive(bad),
				RangeError,
				`expected RangeError for ${JSON.stringify(bad)}`
			)
		}
	})
})
