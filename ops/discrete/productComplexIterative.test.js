import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { productComplexIterative } from './productComplexIterative.js'

function assertComplexClose(actual, expected, tol = 1e-12) {
	assert.equal(typeof actual, 'object')
	assert.notEqual(actual, null)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`real part mismatch: got ${actual.re}, expected ${expected.re} (tol ${tol})`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`imag part mismatch: got ${actual.im}, expected ${expected.im} (tol ${tol})`,
	)
}

describe('productComplexIterative', () => {
	test('multiplies basic complex numbers', () => {
		// (1 + 2i)(3 + 4i) = -5 + 10i
		assert.deepStrictEqual(
			productComplexIterative([
				{ re: 1, im: 2 },
				{ re: 3, im: 4 },
			]),
			{ re: -5, im: 10 },
		)

		// (1 + 2i)(3 + 4i)(5 - 6i) = (-5 + 10i)(5 - 6i) = 35 + 80i
		assert.deepStrictEqual(
			productComplexIterative([
				{ re: 1, im: 2 },
				{ re: 3, im: 4 },
				{ re: 5, im: -6 },
			]),
			{ re: 35, im: 80 },
		)
	})

	test('multiplies conjugate pairs to positive real modulus squared', () => {
		assert.deepStrictEqual(
			productComplexIterative([
				{ re: 3, im: 4 },
				{ re: 3, im: -4 },
			]),
			{ re: 25, im: 0 },
		)
	})

	test('handles powers of i correctly', () => {
		const i = { re: 0, im: 1 }
		assert.deepStrictEqual(productComplexIterative([i]), { re: 0, im: 1 })
		assert.deepStrictEqual(productComplexIterative([i, i]), { re: -1, im: 0 })
		assert.deepStrictEqual(productComplexIterative([i, i, i]), { re: 0, im: -1 })
		assert.deepStrictEqual(productComplexIterative([i, i, i, i]), { re: 1, im: 0 })
	})

	test('handles purely real and purely imaginary sequences', () => {
		assert.deepStrictEqual(
			productComplexIterative([
				{ re: 2, im: 0 },
				{ re: -3, im: 0 },
				{ re: 4, im: 0 },
			]),
			{ re: -24, im: 0 },
		)
		assert.deepStrictEqual(
			productComplexIterative([
				{ re: 0, im: 2 },
				{ re: 0, im: 3 },
				{ re: 0, im: 4 },
			]),
			{ re: 0, im: -24 },
		)
	})

	test('returns multiplicative identity { re: 1, im: 0 } for empty array', () => {
		assert.deepStrictEqual(productComplexIterative([]), { re: 1, im: 0 })
	})

	test('returns a fresh object for single element without mutating inputs', () => {
		const elem = { re: 5, im: -7 }
		const input = [elem]
		const result = productComplexIterative(input)
		assert.deepStrictEqual(result, { re: 5, im: -7 })
		assert.notEqual(result, elem)
		assert.deepStrictEqual(elem, { re: 5, im: -7 })
	})

	test('handles zero factors and normalizes negative zero to positive zero', () => {
		const res1 = productComplexIterative([
			{ re: -2, im: 3 },
			{ re: 0, im: 0 },
			{ re: 4, im: -5 },
		])
		assert.deepStrictEqual(res1, { re: 0, im: 0 })
		assert.ok(Object.is(res1.re, 0))
		assert.ok(Object.is(res1.im, 0))

		const res2 = productComplexIterative([{ re: -0, im: -0 }])
		assert.ok(Object.is(res2.re, 0))
		assert.ok(Object.is(res2.im, 0))
	})

	test('validates invalid container and element inputs', () => {
		for (const bad of [null, undefined, 123, 'abc', { re: 1, im: 0 }, new Set()]) {
			assert.throws(() => productComplexIterative(bad), TypeError)
		}

		for (const badElem of [
			null,
			undefined,
			42,
			'1+2i',
			[],
			{},
			{ re: 1 },
			{ im: 2 },
			{ re: '1', im: 0 },
			{ re: 1, im: null },
		]) {
			assert.throws(() => productComplexIterative([badElem]), TypeError)
		}

		for (const nonFinite of [
			{ re: NaN, im: 0 },
			{ re: 0, im: NaN },
			{ re: Infinity, im: 1 },
			{ re: 1, im: -Infinity },
		]) {
			assert.throws(() => productComplexIterative([nonFinite]), RangeError)
		}

		// Sparse array hole
		const sparse = [{ re: 1, im: 0 }, , { re: 2, im: 0 }]
		assert.throws(() => productComplexIterative(sparse), TypeError)

		// Invalid elements appearing after a zero factor must still be rejected
		assert.throws(
			() => productComplexIterative([{ re: 0, im: 0 }, { re: NaN, im: 0 }]),
			RangeError,
		)
		assert.throws(() => productComplexIterative([{ re: 0, im: 0 }, null]), TypeError)
	})

	test('cross-check: matches polar representation (product of moduli, sum of arguments)', () => {
		const values = [
			{ re: 1.5, im: -0.75 },
			{ re: -2.25, im: 1.25 },
			{ re: 0.5, im: 2.0 },
			{ re: -1.0, im: -1.5 },
			{ re: 0.8, im: 0.6 },
		]

		let logMagSum = 0
		let angleSum = 0
		for (const { re, im } of values) {
			logMagSum += Math.log(Math.hypot(re, im))
			angleSum += Math.atan2(im, re)
		}
		const mag = Math.exp(logMagSum)
		const expectedPolar = {
			re: mag * Math.cos(angleSum),
			im: mag * Math.sin(angleSum),
		}

		const actual = productComplexIterative(values)
		assertComplexClose(actual, expectedPolar, 1e-11)
		assert.ok(Math.abs(Math.hypot(actual.re, actual.im) - mag) <= 1e-11)
	})

	test('cross-check: De Moivre theorem and product of n-th roots of unity', () => {
		// De Moivre: (cos(theta) + i sin(theta))^n = cos(n*theta) + i sin(n*theta)
		const theta = 0.37
		const n = 11
		const factors = Array.from({ length: n }, () => ({
			re: Math.cos(theta),
			im: Math.sin(theta),
		}))
		assertComplexClose(
			productComplexIterative(factors),
			{ re: Math.cos(n * theta), im: Math.sin(n * theta) },
			1e-12,
		)

		// Product of all n-th roots of unity equals (-1)^(n - 1)
		for (const order of [1, 2, 3, 4, 5, 6, 7, 8]) {
			const roots = Array.from({ length: order }, (_, k) => ({
				re: Math.cos((2 * Math.PI * k) / order),
				im: Math.sin((2 * Math.PI * k) / order),
			}))
			const expectedSign = order % 2 === 1 ? 1 : -1
			assertComplexClose(
				productComplexIterative(roots),
				{ re: expectedSign, im: 0 },
				1e-12,
			)
		}
	})

	test('cross-check: commutativity and divide-and-conquer associativity', () => {
		const values = [
			{ re: 2, im: -1 },
			{ re: -1, im: 3 },
			{ re: 0.5, im: 0.5 },
			{ re: 4, im: 2 },
			{ re: -3, im: -1 },
			{ re: 1, im: -4 },
		]

		function mulPair(a, b) {
			return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
		}
		function divideAndConquer(arr) {
			if (arr.length === 0) return { re: 1, im: 0 }
			if (arr.length === 1) return arr[0]
			const mid = Math.floor(arr.length / 2)
			return mulPair(divideAndConquer(arr.slice(0, mid)), divideAndConquer(arr.slice(mid)))
		}

		const forward = productComplexIterative(values)
		const reversed = productComplexIterative([...values].reverse())
		const recursive = divideAndConquer(values)

		assertComplexClose(forward, reversed, 1e-12)
		assertComplexClose(forward, recursive, 1e-12)
	})
})
