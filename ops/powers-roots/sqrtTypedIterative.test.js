import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sqrtTypedIterative } from './sqrtTypedIterative.js'

/**
 * Independent reference square-root computation via Heron's (Newton-Raphson)
 * iteration: y_{k+1} = 0.5 * (y_k + x / y_k), without calling Math.sqrt.
 *
 * @param {number} x - Positive finite number.
 * @returns {number} Approximate square root of x.
 */
function heronSqrt(x) {
	if (x === 0) return x
	let guess = x >= 1 ? x * 0.5 : 1
	for (let iter = 0; iter < 100; iter += 1) {
		const next = 0.5 * (guess + x / guess)
		if (Math.abs(next - guess) <= Number.EPSILON * Math.max(1, next)) {
			return next
		}
		guess = next
	}
	return guess
}

test('sqrtTypedIterative: computes exact square roots for perfect and fractional squares', () => {
	const input = new Float64Array([0, 1, 4, 9, 16, 25, 100, 144, 0.25, 0.01, 2.25])
	const result = sqrtTypedIterative(input)

	assert.ok(result instanceof Float64Array)
	assert.notStrictEqual(result, input)
	assert.deepEqual(
		Array.from(result),
		[0, 1, 2, 3, 4, 5, 10, 12, 0.5, 0.1, 1.5]
	)
})

test('sqrtTypedIterative: does not mutate input array and works on subarray views', () => {
	const backing = new Float64Array([99, 4, 9, 16, 25, 88])
	const view = backing.subarray(1, 5)
	const snapshot = new Float64Array(backing)

	const result = sqrtTypedIterative(view)

	assert.deepEqual(Array.from(result), [2, 3, 4, 5])
	assert.deepEqual(Array.from(backing), Array.from(snapshot))
})

test('sqrtTypedIterative: handles empty and single-element Float64Array', () => {
	const empty = new Float64Array(0)
	const emptyResult = sqrtTypedIterative(empty)

	assert.ok(emptyResult instanceof Float64Array)
	assert.notStrictEqual(emptyResult, empty)
	assert.equal(emptyResult.length, 0)

	const single = new Float64Array([49])
	const singleResult = sqrtTypedIterative(single)
	assert.deepEqual(Array.from(singleResult), [7])
})

test('sqrtTypedIterative: handles special IEEE 754 boundary values (+0, -0, Infinity, NaN, extremes)', () => {
	const input = new Float64Array([
		0,
		-0,
		Infinity,
		NaN,
		Number.MIN_VALUE,
		1e-300,
		1e300,
		Number.MAX_VALUE
	])
	const result = sqrtTypedIterative(input)

	assert.ok(Object.is(result[0], 0))
	assert.ok(Object.is(result[1], -0))
	assert.equal(result[2], Infinity)
	assert.ok(Number.isNaN(result[3]))
	assert.ok(result[4] > 0 && Number.isFinite(result[4]))
	assert.ok(Math.abs(result[5] - 1e-150) <= 1e-164)
	assert.ok(Math.abs(result[6] - 1e150) <= 1e136)
	assert.ok(result[7] > 1e154 && Number.isFinite(result[7]))
})

test('sqrtTypedIterative: throws TypeError on non-Float64Array inputs', () => {
	const invalidInputs = [
		null,
		undefined,
		[1, 4, 9],
		new Float32Array([1, 4, 9]),
		new Int32Array([1, 4, 9]),
		4,
		'4',
		{ length: 1, 0: 4 }
	]

	for (const bad of invalidInputs) {
		assert.throws(
			() => sqrtTypedIterative(bad),
			{ name: 'TypeError' }
		)
	}
})

test('sqrtTypedIterative: throws RangeError on negative elements including -Infinity', () => {
	const negativeInputs = [
		new Float64Array([-1]),
		new Float64Array([4, -0.0001, 9]),
		new Float64Array([-Infinity]),
		new Float64Array([-Number.MIN_VALUE])
	]

	for (const bad of negativeInputs) {
		assert.throws(
			() => sqrtTypedIterative(bad),
			{ name: 'RangeError' }
		)
	}
})

test('sqrtTypedIterative: cross-check against Heron (Newton-Raphson) method and inverse squaring', () => {
	const values = new Float64Array(100)
	for (let i = 0; i < values.length; i += 1) {
		values[i] = (i + 1) * 0.37 + i * i * 0.13
	}

	const result = sqrtTypedIterative(values)

	for (let i = 0; i < values.length; i += 1) {
		const expected = heronSqrt(values[i])
		const relErr = Math.abs(result[i] - expected) / expected
		assert.ok(
			relErr <= 4 * Number.EPSILON,
			`Heron mismatch at index ${i}: got ${result[i]}, expected ${expected}`
		)

		// Inverse check: sqrt(x)^2 ≈ x
		const squared = result[i] * result[i]
		const invRelErr = Math.abs(squared - values[i]) / values[i]
		assert.ok(
			invRelErr <= 4 * Number.EPSILON,
			`Inverse check failed at index ${i}: (${result[i]})^2 = ${squared} != ${values[i]}`
		)
	}
})

test('sqrtTypedIterative: cross-check against multiplicative and exp/log identities', () => {
	const a = new Float64Array([2, 3, 5, 7, 11, 0.5, 12.345])
	const b = new Float64Array([3, 5, 7, 11, 13, 8.0, 67.89])
	const ab = new Float64Array(a.length)
	for (let i = 0; i < a.length; i += 1) {
		ab[i] = a[i] * b[i]
	}

	const sqrtA = sqrtTypedIterative(a)
	const sqrtB = sqrtTypedIterative(b)
	const sqrtAB = sqrtTypedIterative(ab)

	for (let i = 0; i < a.length; i += 1) {
		// Algebraic identity: sqrt(a * b) === sqrt(a) * sqrt(b)
		const product = sqrtA[i] * sqrtB[i]
		const prodRelErr = Math.abs(sqrtAB[i] - product) / product
		assert.ok(prodRelErr <= 4 * Number.EPSILON)

		// Analytical identity: sqrt(x) === exp(0.5 * ln(x))
		const expLog = Math.exp(0.5 * Math.log(a[i]))
		const expLogRelErr = Math.abs(sqrtA[i] - expLog) / expLog
		assert.ok(expLogRelErr <= 8 * Number.EPSILON)
	}
})
