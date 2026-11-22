import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arccosTypedIterative } from './arccosTypedIterative.js'

const EPS = 1e-12

function assertClose(actual, expected, tol = EPS, message) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		message ?? `Expected ${actual} to be within ${tol} of ${expected}`
	)
}

test('arccosTypedIterative computes known trigonometric values accurately', () => {
	const input = new Float64Array([
		1,
		Math.sqrt(3) / 2,
		Math.SQRT1_2,
		0.5,
		0,
		-0.5,
		-Math.SQRT1_2,
		-Math.sqrt(3) / 2,
		-1,
	])
	const expected = [
		0,
		Math.PI / 6,
		Math.PI / 4,
		Math.PI / 3,
		Math.PI / 2,
		(2 * Math.PI) / 3,
		(3 * Math.PI) / 4,
		(5 * Math.PI) / 6,
		Math.PI,
	]

	const snapshot = new Float64Array(input)
	const output = arccosTypedIterative(input)

	assert.ok(output instanceof Float64Array)
	assert.notEqual(output, input)
	assert.equal(output.length, input.length)
	assert.deepEqual(input, snapshot)

	for (let i = 0; i < expected.length; i += 1) {
		assertClose(output[i], expected[i], EPS)
	}
})

test('arccosTypedIterative handles empty, boundary, signed zero, near-boundary, and subarray inputs', () => {
	const empty = new Float64Array(0)
	const emptyOut = arccosTypedIterative(empty)
	assert.ok(emptyOut instanceof Float64Array)
	assert.notEqual(emptyOut, empty)
	assert.equal(emptyOut.length, 0)

	const special = new Float64Array([
		-1,
		-1 + Number.EPSILON,
		-Number.MIN_VALUE,
		-0,
		0,
		Number.MIN_VALUE,
		1 - Number.EPSILON,
		1,
	])
	const specialOut = arccosTypedIterative(special)
	assert.equal(specialOut[0], Math.PI)
	assert.equal(specialOut[3], Math.PI / 2)
	assert.equal(specialOut[4], Math.PI / 2)
	assert.equal(specialOut[7], 0)
	assert.ok(specialOut[1] < Math.PI && specialOut[1] > Math.PI - 1e-7)
	assert.ok(specialOut[6] > 0 && specialOut[6] < 1e-7)
	assertClose(specialOut[2], Math.PI / 2, EPS)
	assertClose(specialOut[5], Math.PI / 2, EPS)

	const backing = new Float64Array([99, -1, 0, 1, -99])
	const view = backing.subarray(1, 4)
	const viewOut = arccosTypedIterative(view)
	assert.equal(viewOut.length, 3)
	assertClose(viewOut[0], Math.PI)
	assertClose(viewOut[1], Math.PI / 2)
	assertClose(viewOut[2], 0)
})

test('arccosTypedIterative throws TypeError on non-Float64Array inputs', () => {
	const invalidInputs = [
		null,
		undefined,
		[0, 0.5, 1],
		new Float32Array([0, 0.5]),
		new Int32Array([0, 1]),
		new ArrayBuffer(16),
		0.5,
		'0.5',
		{ 0: 0.5, length: 1 },
	]

	for (const bad of invalidInputs) {
		assert.throws(() => arccosTypedIterative(bad), TypeError)
	}
})

test('arccosTypedIterative throws RangeError on out-of-domain or non-finite elements', () => {
	const invalidArrays = [
		new Float64Array([1.0000001]),
		new Float64Array([-1.0000001]),
		new Float64Array([0, 0.5, 2]),
		new Float64Array([0, -2, 0.5]),
		new Float64Array([Infinity]),
		new Float64Array([-Infinity]),
		new Float64Array([0, NaN, 1]),
	]

	for (const bad of invalidArrays) {
		assert.throws(() => arccosTypedIterative(bad), RangeError)
	}
})

test('arccosTypedIterative satisfies inverse, reflection, complementary, and atan2 cross-checks', () => {
	const count = 201
	const xs = new Float64Array(count)
	const negXs = new Float64Array(count)
	for (let i = 0; i < count; i += 1) {
		const x = -1 + (2 * i) / (count - 1)
		xs[i] = x
		negXs[i] = -x
	}

	const angles = arccosTypedIterative(xs)
	const negAngles = arccosTypedIterative(negXs)

	for (let i = 0; i < count; i += 1) {
		const x = xs[i]
		const theta = angles[i]

		// Range invariant: arccos(x) in [0, pi]
		assert.ok(theta >= 0 && theta <= Math.PI)

		// Inverse identity: cos(arccos(x)) = x
		assertClose(Math.cos(theta), x, EPS)

		// Complementary identity: arccos(x) + arcsin(x) = pi / 2
		assertClose(theta + Math.asin(x), Math.PI / 2, EPS)

		// Reflection identity: arccos(-x) = pi - arccos(x)
		assertClose(negAngles[i], Math.PI - theta, EPS)

		// Independent closed-form via atan2: arccos(x) = atan2(sqrt(1 - x^2), x)
		const independent = Math.atan2(Math.sqrt(Math.max(0, 1 - x * x)), x)
		assertClose(theta, independent, EPS)
	}

	// Forward cosine round-trip on [0, pi]: arccos(cos(theta)) = theta
	const thetaGrid = new Float64Array(count)
	const cosGrid = new Float64Array(count)
	for (let i = 0; i < count; i += 1) {
		thetaGrid[i] = (Math.PI * i) / (count - 1)
		cosGrid[i] = Math.cos(thetaGrid[i])
	}
	const recovered = arccosTypedIterative(cosGrid)
	for (let i = 0; i < count; i += 1) {
		assertClose(recovered[i], thetaGrid[i], 1e-11)
	}
})
