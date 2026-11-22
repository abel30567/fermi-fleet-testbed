import { test } from 'node:test'
import assert from 'node:assert/strict'
import { log2TypedIterative } from './log2TypedIterative.js'

test('log2TypedIterative computes exact results for powers of two', () => {
	const input = new Float64Array([0.0625, 0.25, 0.5, 1, 2, 4, 8, 16, 1024])
	const expected = new Float64Array([-4, -2, -1, 0, 1, 2, 3, 4, 10])
	const actual = log2TypedIterative(input)

	assert.ok(actual instanceof Float64Array)
	assert.notStrictEqual(actual, input)
	assert.deepEqual(actual, expected)
	// Ensure input was not mutated
	assert.deepEqual(input, new Float64Array([0.0625, 0.25, 0.5, 1, 2, 4, 8, 16, 1024]))
})

test('log2TypedIterative handles non-power-of-two positive numbers and subarrays', () => {
	const buffer = new Float64Array([99, Math.SQRT2, 3, 10, 100, 99])
	const view = buffer.subarray(1, 5)
	const actual = log2TypedIterative(view)

	assert.equal(actual.length, 4)
	assert.ok(Math.abs(actual[0] - 0.5) < 1e-15)
	assert.ok(Math.abs(actual[1] - Math.log2(3)) < 1e-15)
	assert.ok(Math.abs(actual[2] - Math.log2(10)) < 1e-15)
	assert.ok(Math.abs(actual[3] - Math.log2(100)) < 1e-15)
})

test('log2TypedIterative handles empty and single-element arrays', () => {
	const empty = new Float64Array(0)
	const emptyResult = log2TypedIterative(empty)
	assert.ok(emptyResult instanceof Float64Array)
	assert.equal(emptyResult.length, 0)
	assert.notStrictEqual(emptyResult, empty)

	const single = new Float64Array([1])
	assert.deepEqual(log2TypedIterative(single), new Float64Array([0]))
})

test('log2TypedIterative handles boundary and special positive IEEE 754 values', () => {
	const input = new Float64Array([
		Number.MIN_VALUE,
		Number.EPSILON,
		Number.MAX_SAFE_INTEGER,
		Number.MAX_VALUE,
		Infinity
	])
	const actual = log2TypedIterative(input)

	assert.equal(actual[0], -1074)
	assert.equal(actual[1], -52)
	assert.ok(Math.abs(actual[2] - 53) < 1e-15)
	assert.ok(Math.abs(actual[3] - 1024) < 1e-12)
	assert.equal(actual[4], Infinity)
})

test('log2TypedIterative throws TypeError for non-Float64Array inputs', () => {
	const invalidInputs = [
		null,
		undefined,
		[1, 2, 4],
		new Float32Array([1, 2]),
		new Int32Array([1, 2]),
		4,
		'4',
		{ 0: 1, length: 1 }
	]

	for (const bad of invalidInputs) {
		assert.throws(
			() => log2TypedIterative(bad),
			{ name: 'TypeError' },
			`Expected TypeError for input: ${String(bad)}`
		)
	}
})

test('log2TypedIterative throws RangeError for zero, negative, -Infinity, and NaN elements', () => {
	const invalidArrays = [
		new Float64Array([0]),
		new Float64Array([-0]),
		new Float64Array([-1]),
		new Float64Array([1, 2, -0.5]),
		new Float64Array([4, -Infinity]),
		new Float64Array([2, NaN, 8])
	]

	for (const arr of invalidArrays) {
		assert.throws(
			() => log2TypedIterative(arr),
			{ name: 'RangeError' },
			`Expected RangeError for elements: [${Array.from(arr).join(', ')}]`
		)
	}
})

test('log2TypedIterative cross-checks against change-of-base formula and inverse exponentiation', () => {
	const input = new Float64Array([
		1e-100,
		1e-10,
		0.1,
		0.75,
		1.5,
		Math.PI,
		Math.E,
		42,
		1e10,
		1e100
	])
	const actual = log2TypedIterative(input)

	for (let i = 0; i < input.length; i++) {
		const x = input[i]
		// Independent computation via natural log change-of-base: log2(x) = ln(x) / ln(2)
		const viaLn = Math.log(x) / Math.LN2
		assert.ok(
			Math.abs(actual[i] - viaLn) <= 1e-12 * Math.max(1, Math.abs(viaLn)),
			`Change-of-base mismatch at index ${i}: ${actual[i]} vs ${viaLn}`
		)

		// Inverse operation: 2 ** log2(x) === x
		const reconstructed = 2 ** actual[i]
		const relErr = Math.abs(reconstructed - x) / x
		assert.ok(
			relErr < 1e-12,
			`Inverse check failed at index ${i}: 2 ** ${actual[i]} = ${reconstructed} vs ${x}`
		)
	}
})

test('log2TypedIterative satisfies logarithmic product, quotient, and power identities', () => {
	const a = new Float64Array([1.5, 3, 7, 12.5, 100])
	const b = new Float64Array([2.5, 5, 11, 0.25, 0.01])

	const products = new Float64Array(a.length)
	const quotients = new Float64Array(a.length)
	const powers = new Float64Array(a.length)
	const exponent = 3.5

	for (let i = 0; i < a.length; i++) {
		products[i] = a[i] * b[i]
		quotients[i] = a[i] / b[i]
		powers[i] = a[i] ** exponent
	}

	const logA = log2TypedIterative(a)
	const logB = log2TypedIterative(b)
	const logProd = log2TypedIterative(products)
	const logQuot = log2TypedIterative(quotients)
	const logPow = log2TypedIterative(powers)

	for (let i = 0; i < a.length; i++) {
		assert.ok(Math.abs(logProd[i] - (logA[i] + logB[i])) < 1e-12)
		assert.ok(Math.abs(logQuot[i] - (logA[i] - logB[i])) < 1e-12)
		assert.ok(Math.abs(logPow[i] - exponent * logA[i]) < 1e-12)
	}
})
