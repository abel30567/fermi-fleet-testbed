import { test } from 'node:test'
import assert from 'node:assert/strict'
import { log10ComplexIterative } from './log10ComplexIterative.js'

const EPS = 1e-13

function assertComplexClose(actual, expected, tol = EPS, label = '') {
	assert.equal(typeof actual, 'object', `${label}: result must be an object`)
	assert.ok(actual !== null, `${label}: result must not be null`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${label}: re mismatch: got ${actual.re}, expected ${expected.re} (diff=${Math.abs(actual.re - expected.re)})`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${label}: im mismatch: got ${actual.im}, expected ${expected.im} (diff=${Math.abs(actual.im - expected.im)})`,
	)
}

test('positive real numbers', () => {
	assert.deepEqual(log10ComplexIterative({ re: 1, im: 0 }), { re: 0, im: 0 })
	assert.deepEqual(log10ComplexIterative({ re: 10, im: 0 }), { re: 1, im: 0 })
	assertComplexClose(log10ComplexIterative({ re: 100, im: 0 }), { re: 2, im: 0 })
	assertComplexClose(log10ComplexIterative({ re: 1000, im: 0 }), { re: 3, im: 0 })
	assertComplexClose(log10ComplexIterative({ re: 0.1, im: 0 }), { re: -1, im: 0 })
	assertComplexClose(log10ComplexIterative({ re: 0.01, im: 0 }), { re: -2, im: 0 })
	assertComplexClose(log10ComplexIterative({ re: Math.E, im: 0 }), { re: Math.LOG10E, im: 0 })
})

test('negative real numbers (principal branch arg = +pi)', () => {
	const piOverLn10 = Math.PI / Math.LN10
	assertComplexClose(log10ComplexIterative({ re: -1, im: 0 }), { re: 0, im: piOverLn10 })
	assertComplexClose(log10ComplexIterative({ re: -10, im: 0 }), { re: 1, im: piOverLn10 })
	assertComplexClose(log10ComplexIterative({ re: -100, im: 0 }), { re: 2, im: piOverLn10 })
	assertComplexClose(log10ComplexIterative({ re: -0.1, im: 0 }), { re: -1, im: piOverLn10 })
})

test('purely imaginary numbers', () => {
	const halfPiOverLn10 = Math.PI / (2 * Math.LN10)
	assertComplexClose(log10ComplexIterative({ re: 0, im: 1 }), { re: 0, im: halfPiOverLn10 })
	assertComplexClose(log10ComplexIterative({ re: 0, im: -1 }), { re: 0, im: -halfPiOverLn10 })
	assertComplexClose(log10ComplexIterative({ re: 0, im: 10 }), { re: 1, im: halfPiOverLn10 })
	assertComplexClose(log10ComplexIterative({ re: 0, im: -10 }), { re: 1, im: -halfPiOverLn10 })
	assertComplexClose(log10ComplexIterative({ re: 0, im: 0.01 }), { re: -2, im: halfPiOverLn10 })
})

test('general complex numbers across all four quadrants', () => {
	const quarterPiOverLn10 = Math.PI / (4 * Math.LN10)
	const threeQuarterPiOverLn10 = (3 * Math.PI) / (4 * Math.LN10)
	const halfLog10_2 = 0.5 * Math.log10(2)

	assertComplexClose(log10ComplexIterative({ re: 1, im: 1 }), {
		re: halfLog10_2,
		im: quarterPiOverLn10,
	})
	assertComplexClose(log10ComplexIterative({ re: -1, im: 1 }), {
		re: halfLog10_2,
		im: threeQuarterPiOverLn10,
	})
	assertComplexClose(log10ComplexIterative({ re: -1, im: -1 }), {
		re: halfLog10_2,
		im: -threeQuarterPiOverLn10,
	})
	assertComplexClose(log10ComplexIterative({ re: 1, im: -1 }), {
		re: halfLog10_2,
		im: -quarterPiOverLn10,
	})

	// Pythagorean triples (|z| = 5 and |z| = 13)
	assertComplexClose(log10ComplexIterative({ re: 3, im: 4 }), {
		re: Math.log10(5),
		im: Math.atan2(4, 3) / Math.LN10,
	})
	assertComplexClose(log10ComplexIterative({ re: -12, im: 5 }), {
		re: Math.log10(13),
		im: Math.atan2(5, -12) / Math.LN10,
	})
	assertComplexClose(log10ComplexIterative({ re: -5, im: -12 }), {
		re: Math.log10(13),
		im: Math.atan2(-12, -5) / Math.LN10,
	})
})

test('edge cases: signed zeros, extreme magnitudes, branch cut neighbors, and immutability', () => {
	// Signed zeros normalized in output, principal branch kept in (-pi, pi]
	const r1 = log10ComplexIterative({ re: 1, im: -0 })
	assert.ok(Object.is(r1.re, 0))
	assert.ok(Object.is(r1.im, 0))

	const rNeg = log10ComplexIterative({ re: -1, im: -0 })
	assert.ok(Object.is(rNeg.re, 0))
	assertComplexClose(rNeg, { re: 0, im: Math.PI / Math.LN10 })

	// Very large magnitudes that would overflow re^2 + im^2
	assertComplexClose(
		log10ComplexIterative({ re: 1e300, im: 1e300 }),
		{ re: 300 + 0.5 * Math.log10(2), im: Math.PI / (4 * Math.LN10) },
		1e-11,
	)
	const maxRes = log10ComplexIterative({ re: Number.MAX_VALUE, im: Number.MAX_VALUE })
	assert.ok(Number.isFinite(maxRes.re) && Number.isFinite(maxRes.im))
	assertComplexClose(
		maxRes,
		{ re: Math.log10(Number.MAX_VALUE) + 0.5 * Math.log10(2), im: Math.PI / (4 * Math.LN10) },
		1e-11,
	)

	// Very small / subnormal magnitudes that would underflow re^2 + im^2
	assertComplexClose(
		log10ComplexIterative({ re: 1e-300, im: 1e-300 }),
		{ re: -300 + 0.5 * Math.log10(2), im: Math.PI / (4 * Math.LN10) },
		1e-11,
	)
	const minRes = log10ComplexIterative({ re: Number.MIN_VALUE, im: 0 })
	assert.ok(Number.isFinite(minRes.re) && minRes.im === 0)
	assertComplexClose(minRes, { re: -1074 * Math.log10(2), im: 0 }, 1e-11)

	// Values straddling the negative real branch cut
	const aboveCut = log10ComplexIterative({ re: -1, im: 1e-12 })
	const belowCut = log10ComplexIterative({ re: -1, im: -1e-12 })
	assert.ok(aboveCut.im > 0 && belowCut.im < 0)
	assertComplexClose(aboveCut, { re: 0, im: (Math.PI - 1e-12) / Math.LN10 }, 1e-11)
	assertComplexClose(belowCut, { re: 0, im: -(Math.PI - 1e-12) / Math.LN10 }, 1e-11)

	// Values close to 1 preserve precision (2^-40 is exact in IEEE-754 binary64)
	const tiny = 2 ** -40
	assertComplexClose(
		log10ComplexIterative({ re: 1 + tiny, im: 0 }),
		{ re: Math.log1p(tiny) / Math.LN10, im: 0 },
		1e-24,
	)

	// Input is not mutated and extra properties are ignored
	const input = Object.freeze({ re: 10, im: 0, extra: 'ignored' })
	assert.deepEqual(log10ComplexIterative(input), { re: 1, im: 0 })
})

test('invalid inputs throw appropriate errors', () => {
	// Singularity at 0 + 0i
	assert.throws(() => log10ComplexIterative({ re: 0, im: 0 }), RangeError)
	assert.throws(() => log10ComplexIterative({ re: -0, im: -0 }), RangeError)

	// Non-object / null / array / primitives
	for (const bad of [null, undefined, 10, '10', true, [], [1, 2], () => {}]) {
		assert.throws(() => log10ComplexIterative(bad), TypeError)
	}

	// Missing or non-numeric components
	for (const bad of [
		{},
		{ re: 1 },
		{ im: 1 },
		{ re: '1', im: 0 },
		{ re: 1, im: '0' },
		{ re: null, im: 1 },
		{ re: 1, im: undefined },
		{ re: 1n, im: 0 },
	]) {
		assert.throws(() => log10ComplexIterative(bad), TypeError)
	}

	// Non-finite components
	for (const bad of [
		{ re: Number.NaN, im: 0 },
		{ re: 0, im: Number.NaN },
		{ re: Number.POSITIVE_INFINITY, im: 0 },
		{ re: 0, im: Number.NEGATIVE_INFINITY },
		{ re: Number.POSITIVE_INFINITY, im: Number.POSITIVE_INFINITY },
	]) {
		assert.throws(() => log10ComplexIterative(bad), RangeError)
	}
})

test('independent cross-check: Math.log10/Math.atan2, inverse 10^w = z, and algebraic identities', () => {
	const samples = [
		{ re: 0.25, im: 0.75 },
		{ re: 2.5, im: -7.1 },
		{ re: -4.2, im: 1.9 },
		{ re: -0.8, im: -0.3 },
		{ re: 17.3, im: 42.6 },
		{ re: -0.003, im: 123.45 },
		{ re: 999.1, im: -0.002 },
		{ re: 1e-6, im: -1e-6 },
		{ re: -1e6, im: 1e6 },
	]

	for (const z of samples) {
		const w = log10ComplexIterative(z)

		// 1. Cross-check against built-in Math functions
		const ref = {
			re: Math.log10(Math.hypot(z.re, z.im)),
			im: Math.atan2(z.im, z.re) / Math.LN10,
		}
		assertComplexClose(w, ref, 1e-13, `Math ref for (${z.re}, ${z.im})`)

		// 2. Inverse check: 10^w = 10^u * (cos(v * ln 10) + i * sin(v * ln 10)) == z
		const mag = 10 ** w.re
		const angle = w.im * Math.LN10
		const reconstructed = {
			re: mag * Math.cos(angle),
			im: mag * Math.sin(angle),
		}
		const scale = Math.hypot(z.re, z.im)
		assertComplexClose(reconstructed, z, 1e-11 * Math.max(1, scale), `10^w for (${z.re}, ${z.im})`)

		// 3. Conjugate symmetry: log10(conj(z)) = conj(log10(z)) away from negative real axis
		const wConj = log10ComplexIterative({ re: z.re, im: -z.im })
		assertComplexClose(wConj, { re: w.re, im: -w.im }, 1e-13, `conj for (${z.re}, ${z.im})`)

		// 4. Reciprocal identity: log10(1 / z) = -log10(z) away from negative real axis
		const denom = z.re * z.re + z.im * z.im
		const wInv = log10ComplexIterative({ re: z.re / denom, im: -z.im / denom })
		assertComplexClose(wInv, { re: -w.re, im: -w.im }, 1e-12, `inv for (${z.re}, ${z.im})`)

		// 5. Decade scaling: log10(1000 * z) = 3 + log10(z)
		const wScaled = log10ComplexIterative({ re: 1000 * z.re, im: 1000 * z.im })
		assertComplexClose(wScaled, { re: w.re + 3, im: w.im }, 1e-12, `scale for (${z.re}, ${z.im})`)
	}

	// 6. Product identity: log10(z1 * z2) = log10(z1) + log10(z2) when arg(z1) + arg(z2) in (-pi, pi]
	const z1 = { re: 2, im: 3 }
	const z2 = { re: 4, im: -1 }
	const prod = { re: z1.re * z2.re - z1.im * z2.im, im: z1.re * z2.im + z1.im * z2.re }
	const w1 = log10ComplexIterative(z1)
	const w2 = log10ComplexIterative(z2)
	const wProd = log10ComplexIterative(prod)
	assertComplexClose(wProd, { re: w1.re + w2.re, im: w1.im + w2.im }, 1e-13, 'product identity')
})
