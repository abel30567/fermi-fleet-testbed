import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arcsinTypedIterative } from './arcsinTypedIterative.js'

const EPSILON = 1e-12

/**
 * Independent Maclaurin series computation of arcsin(x) for |x| <= 0.5:
 *   arcsin(x) = sum_{k=0}^{N} ((2k)! / (4^k (k!)^2 (2k + 1))) * x^(2k + 1)
 */
function arcsinSeriesReference(x, terms = 40) {
	let sum = x
	let term = x
	const x2 = x * x
	for (let k = 1; k < terms; k += 1) {
		const num = (2 * k - 1) * (2 * k - 1) * x2
		const den = 2 * k * (2 * k + 1)
		term *= num / den
		sum += term
	}
	return sum
}

test('arcsinTypedIterative computes standard trigonometric values accurately', () => {
	const input = new Float64Array([
		-1,
		-Math.sqrt(3) / 2,
		-Math.SQRT1_2,
		-0.5,
		0,
		0.5,
		Math.SQRT1_2,
		Math.sqrt(3) / 2,
		1,
	])
	const expected = [
		-Math.PI / 2,
		-Math.PI / 3,
		-Math.PI / 4,
		-Math.PI / 6,
		0,
		Math.PI / 6,
		Math.PI / 4,
		Math.PI / 3,
		Math.PI / 2,
	]

	const output = arcsinTypedIterative(input)

	assert.ok(output instanceof Float64Array)
	assert.notEqual(output, input)
	assert.equal(output.length, input.length)

	for (let i = 0; i < expected.length; i += 1) {
		assert.ok(
			Math.abs(output[i] - expected[i]) <= EPSILON,
			`index ${i}: got ${output[i]}, expected ${expected[i]}`
		)
	}
})

test('arcsinTypedIterative handles edge cases: empty array, signed zero, tiny values, non-mutation, subarray views', () => {
	const empty = new Float64Array(0)
	const emptyOut = arcsinTypedIterative(empty)
	assert.ok(emptyOut instanceof Float64Array)
	assert.notEqual(emptyOut, empty)
	assert.equal(emptyOut.length, 0)

	const signedZero = new Float64Array([-0, 0])
	const signedZeroOut = arcsinTypedIterative(signedZero)
	assert.ok(Object.is(signedZeroOut[0], -0))
	assert.ok(Object.is(signedZeroOut[1], 0))

	const tiny = new Float64Array([-1e-12, -Number.MIN_VALUE, Number.MIN_VALUE, 1e-12])
	const tinyOut = arcsinTypedIterative(tiny)
	for (let i = 0; i < tiny.length; i += 1) {
		// For |x| << 1, arcsin(x) = x + O(x^3)
		assert.ok(Math.abs(tinyOut[i] - tiny[i]) <= 1e-15)
	}

	// Ensure input is not mutated
	const original = new Float64Array([-0.75, 0.25, 0.9])
	const snapshot = new Float64Array(original)
	arcsinTypedIterative(original)
	assert.deepEqual(original, snapshot)

	// Subarray view with non-zero byteOffset
	const backing = new Float64Array([99, -0.5, 0, 0.5, -99])
	const slice = backing.subarray(1, 4)
	const sliceOut = arcsinTypedIterative(slice)
	assert.equal(sliceOut.length, 3)
	assert.ok(Math.abs(sliceOut[0] - -Math.PI / 6) <= EPSILON)
	assert.equal(sliceOut[1], 0)
	assert.ok(Math.abs(sliceOut[2] - Math.PI / 6) <= EPSILON)
})

test('arcsinTypedIterative throws TypeError for non-Float64Array inputs', () => {
	const invalidInputs = [
		null,
		undefined,
		[0, 0.5],
		new Float32Array([0, 0.5]),
		new Int32Array([0, 1]),
		new Uint8Array([0, 1]),
		0.5,
		'0.5',
		{ 0: 0, length: 1 },
	]

	for (const bad of invalidInputs) {
		assert.throws(() => arcsinTypedIterative(bad), TypeError)
	}
})

test('arcsinTypedIterative throws RangeError for elements outside [-1, 1] or non-finite values', () => {
	const outOfRangeInputs = [
		new Float64Array([1.0000001]),
		new Float64Array([-1.0000001]),
		new Float64Array([0, 0.5, 2]),
		new Float64Array([-3, 0]),
		new Float64Array([NaN]),
		new Float64Array([0, NaN]),
		new Float64Array([Infinity]),
		new Float64Array([-Infinity]),
	]

	for (const bad of outOfRangeInputs) {
		assert.throws(() => arcsinTypedIterative(bad), RangeError)
	}
})

test('arcsinTypedIterative cross-check against trig identities and independent Maclaurin series', () => {
	const count = 201
	const xs = new Float64Array(count)
	for (let i = 0; i < count; i += 1) {
		xs[i] = -1 + (2 * i) / (count - 1)
	}

	const angles = arcsinTypedIterative(xs)

	// 1. Inverse identity: sin(arcsin(x)) == x and output range in [-pi/2, pi/2]
	for (let i = 0; i < count; i += 1) {
		assert.ok(angles[i] >= -Math.PI / 2 && angles[i] <= Math.PI / 2)
		assert.ok(
			Math.abs(Math.sin(angles[i]) - xs[i]) <= EPSILON,
			`sin(arcsin(${xs[i]})) = ${Math.sin(angles[i])}`
		)
	}

	// 2. Odd symmetry: arcsin(-x) === -arcsin(x)
	const negXs = new Float64Array(count)
	for (let i = 0; i < count; i += 1) {
		negXs[i] = -xs[i]
	}
	const negAngles = arcsinTypedIterative(negXs)
	for (let i = 0; i < count; i += 1) {
		assert.ok(Math.abs(negAngles[i] + angles[i]) <= EPSILON)
	}

	// 3. Complementary identity: arcsin(x) + arccos(x) === pi / 2
	for (let i = 0; i < count; i += 1) {
		assert.ok(Math.abs(angles[i] + Math.acos(xs[i]) - Math.PI / 2) <= EPSILON)
	}

	// 4. Alternative formula via atan: arcsin(x) === atan(x / sqrt(1 - x^2)) for |x| < 1
	for (let i = 1; i < count - 1; i += 1) {
		const x = xs[i]
		const viaAtan = Math.atan(x / Math.sqrt(1 - x * x))
		assert.ok(Math.abs(angles[i] - viaAtan) <= EPSILON)
	}

	// 5. Independent Maclaurin power series cross-check on [-0.5, 0.5]
	const seriesXs = new Float64Array([-0.5, -0.37, -0.2, -0.05, 0, 0.05, 0.2, 0.37, 0.5])
	const seriesOut = arcsinTypedIterative(seriesXs)
	for (let i = 0; i < seriesXs.length; i += 1) {
		const ref = arcsinSeriesReference(seriesXs[i])
		assert.ok(
			Math.abs(seriesOut[i] - ref) <= EPSILON,
			`series mismatch at x=${seriesXs[i]}: got ${seriesOut[i]}, ref ${ref}`
		)
	}
})
