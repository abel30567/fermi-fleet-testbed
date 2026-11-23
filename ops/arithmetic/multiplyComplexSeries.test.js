import test from 'node:test'
import assert from 'node:assert/strict'
import { multiplyComplexSeries } from './multiplyComplexSeries.js'

/**
 * Helper to compare two complex numbers within an absolute tolerance.
 */
function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`re mismatch: expected ${expected.re}, got ${actual.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`im mismatch: expected ${expected.im}, got ${actual.im}`
	)
}

/**
 * Independent reference implementation via Euler's polar identity:
 * z1 * z2 = (r1 * r2) * (cos(t1 + t2) + i * sin(t1 + t2)).
 */
function multiplyComplexPolar(a, b) {
	const r1 = Math.hypot(a.re, a.im)
	const r2 = Math.hypot(b.re, b.im)
	const t1 = Math.atan2(a.im, a.re)
	const t2 = Math.atan2(b.im, b.re)
	const r = r1 * r2
	const t = t1 + t2
	return { re: r * Math.cos(t), im: r * Math.sin(t) }
}

/**
 * Independent reference implementation via Gauss's 3-multiplication identity.
 */
function multiplyComplexGauss(a, b) {
	const k1 = b.re * (a.re + a.im)
	const k2 = a.re * (b.im - b.re)
	const k3 = a.im * (b.re + b.im)
	return { re: k1 - k3, im: k1 + k2 }
}

/**
 * Independent reference implementation via 2x2 real matrix isomorphism.
 */
function multiplyComplexMatrix(a, b) {
	// [[a.re, -a.im], [a.im, a.re]] * [[b.re, -b.im], [b.im, b.re]]
	return {
		re: a.re * b.re + -a.im * b.im,
		im: a.im * b.re + a.re * b.im,
	}
}

test('normal cases: standard complex products', () => {
	assert.deepStrictEqual(
		multiplyComplexSeries({ re: 1, im: 2 }, { re: 3, im: 4 }),
		{ re: -5, im: 10 }
	)
	assert.deepStrictEqual(
		multiplyComplexSeries({ re: -2, im: 5 }, { re: 7, im: -3 }),
		{ re: 1, im: 41 }
	)
	assert.deepStrictEqual(
		multiplyComplexSeries({ re: 2.5, im: -1.5 }, { re: 4, im: 2 }),
		{ re: 13, im: -1 }
	)
})

test('algebraic identities: i^2 = -1, unit identity, and conjugates', () => {
	const one = { re: 1, im: 0 }
	const i = { re: 0, im: 1 }
	const z = { re: 3, im: -4 }
	const zBar = { re: 3, im: 4 }

	// i * i = -1
	assert.deepStrictEqual(multiplyComplexSeries(i, i), { re: -1, im: 0 })
	// z * 1 = z
	assert.deepStrictEqual(multiplyComplexSeries(z, one), z)
	assert.deepStrictEqual(multiplyComplexSeries(one, z), z)
	// z * conj(z) = |z|^2 + 0i
	assert.deepStrictEqual(multiplyComplexSeries(z, zBar), { re: 25, im: 0 })
})

test('edge cases: zeros, negative zeros, purely real/imaginary, and imbalanced magnitudes', () => {
	const zero = { re: 0, im: 0 }
	const neg = { re: -5, im: -7 }

	// Multiplication by zero normalizes -0 to +0
	const prodZero = multiplyComplexSeries(zero, neg)
	assert.deepStrictEqual(prodZero, { re: 0, im: 0 })
	assert.ok(Object.is(prodZero.re, 0))
	assert.ok(Object.is(prodZero.im, 0))

	// Negative zero inputs normalize cleanly
	const prodNegZero = multiplyComplexSeries({ re: -0, im: 0 }, { re: 1, im: -0 })
	assert.ok(Object.is(prodNegZero.re, 0))
	assert.ok(Object.is(prodNegZero.im, 0))

	// Purely real and purely imaginary
	assert.deepStrictEqual(
		multiplyComplexSeries({ re: 6, im: 0 }, { re: -3, im: 0 }),
		{ re: -18, im: 0 }
	)
	assert.deepStrictEqual(
		multiplyComplexSeries({ re: 0, im: 3 }, { re: 0, im: -4 }),
		{ re: 12, im: 0 }
	)

	// Imbalanced magnitudes where naive 3-mul Gauss identity can lose precision
	assert.deepStrictEqual(
		multiplyComplexSeries({ re: 1e16, im: 1 }, { re: 1, im: 0 }),
		{ re: 1e16, im: 1 }
	)
})

test('field axioms: commutativity, associativity, distributivity, and inverse', () => {
	const a = { re: 2, im: -3 }
	const b = { re: -4, im: 5 }
	const c = { re: 6, im: 7 }

	// Commutativity: a * b = b * a
	assert.deepStrictEqual(multiplyComplexSeries(a, b), multiplyComplexSeries(b, a))

	// Associativity: (a * b) * c = a * (b * c)
	assert.deepStrictEqual(
		multiplyComplexSeries(multiplyComplexSeries(a, b), c),
		multiplyComplexSeries(a, multiplyComplexSeries(b, c))
	)

	// Distributivity: a * (b + c) = a * b + a * c
	const bPlusC = { re: b.re + c.re, im: b.im + c.im }
	const ab = multiplyComplexSeries(a, b)
	const ac = multiplyComplexSeries(a, c)
	assert.deepStrictEqual(multiplyComplexSeries(a, bPlusC), {
		re: ab.re + ac.re,
		im: ab.im + ac.im,
	})

	// Multiplicative inverse: z * (conj(z) / |z|^2) = 1
	const normSq = a.re * a.re + a.im * a.im
	const invA = { re: a.re / normSq, im: -a.im / normSq }
	assertComplexClose(multiplyComplexSeries(a, invA), { re: 1, im: 0 }, 1e-15)
})

test('independent cross-checks: polar form, Gauss identity, matrix isomorphism, and modulus', () => {
	const pairs = [
		[{ re: 1.25, im: -3.5 }, { re: -2.75, im: 4.125 }],
		[{ re: Math.SQRT2, im: Math.PI }, { re: -Math.E, im: 0.5 }],
		[{ re: 0.001, im: 0.002 }, { re: -0.003, im: 0.004 }],
		[{ re: -10, im: -20 }, { re: 30, im: -40 }],
		[{ re: 7, im: 0 }, { re: 0, im: -9 }],
	]

	for (const [z1, z2] of pairs) {
		const actual = multiplyComplexSeries(z1, z2)
		const polar = multiplyComplexPolar(z1, z2)
		const gauss = multiplyComplexGauss(z1, z2)
		const matrix = multiplyComplexMatrix(z1, z2)

		assertComplexClose(actual, polar, 1e-11)
		assertComplexClose(actual, gauss, 1e-11)
		assertComplexClose(actual, matrix, 1e-15)

		// Multiplicativity of modulus: |z1 * z2| = |z1| * |z2|
		const modProduct = Math.hypot(actual.re, actual.im)
		const expectedMod = Math.hypot(z1.re, z1.im) * Math.hypot(z2.re, z2.im)
		assert.ok(Math.abs(modProduct - expectedMod) <= 1e-11)
	}
})

test('invalid inputs throw TypeError or RangeError', () => {
	const valid = { re: 1, im: 2 }

	// Non-object / null / array inputs
	for (const bad of [null, undefined, 42, '1+2i', true, [1, 2]]) {
		assert.throws(() => multiplyComplexSeries(bad, valid), TypeError)
		assert.throws(() => multiplyComplexSeries(valid, bad), TypeError)
	}

	// Missing or non-numeric re / im properties
	for (const bad of [{}, { re: 1 }, { im: 2 }, { re: '1', im: 2 }, { re: 1, im: null }]) {
		assert.throws(() => multiplyComplexSeries(bad, valid), TypeError)
		assert.throws(() => multiplyComplexSeries(valid, bad), TypeError)
	}

	// Non-finite numeric components
	for (const bad of [
		{ re: NaN, im: 0 },
		{ re: 0, im: NaN },
		{ re: Infinity, im: 1 },
		{ re: 1, im: -Infinity },
	]) {
		assert.throws(() => multiplyComplexSeries(bad, valid), RangeError)
		assert.throws(() => multiplyComplexSeries(valid, bad), RangeError)
	}

	// Overflow produces RangeError
	assert.throws(
		() => multiplyComplexSeries({ re: 1e308, im: 0 }, { re: 10, im: 0 }),
		RangeError
	)
})
