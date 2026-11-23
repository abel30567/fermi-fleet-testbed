import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arccosTypedMemo } from './arccosTypedMemo.js'

const EPS = 1e-14

function assertClose(actual, expected, tol = EPS, message) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		message ?? `Expected ${actual} to be within ${tol} of ${expected}`
	)
}

test('arccosTypedMemo computes known trigonometric values accurately', () => {
	const input = new Float64Array([
		-1,
		-Math.sqrt(3) / 2,
		-Math.SQRT1_2,
		-0.5,
		0,
		-0,
		0.5,
		Math.SQRT1_2,
		Math.sqrt(3) / 2,
		1,
	])
	const expected = [
		Math.PI,
		(5 * Math.PI) / 6,
		(3 * Math.PI) / 4,
		(2 * Math.PI) / 3,
		Math.PI / 2,
		Math.PI / 2,
		Math.PI / 3,
		Math.PI / 4,
		Math.PI / 6,
		0,
	]

	const result = arccosTypedMemo(input)
	assert.ok(result instanceof Float64Array)
	assert.equal(result.length, input.length)

	for (let i = 0; i < expected.length; i++) {
		assertClose(result[i], expected[i], EPS, `Mismatch at index ${i} for x=${input[i]}`)
	}

	// Exact domain boundary checks
	assert.equal(result[0], Math.PI)
	assert.equal(result[4], Math.PI / 2)
	assert.equal(result[5], Math.PI / 2)
	assert.equal(result[9], 0)
})

test('arccosTypedMemo handles empty Float64Array and does not mutate input', () => {
	const empty = new Float64Array(0)
	const emptyOut = arccosTypedMemo(empty)
	assert.ok(emptyOut instanceof Float64Array)
	assert.equal(emptyOut.length, 0)
	assert.notEqual(emptyOut, empty)

	const input = new Float64Array([-0.75, 0.25, 0.6])
	const snapshot = new Float64Array(input)
	const out = arccosTypedMemo(input)
	assert.notEqual(out, input)
	assert.deepEqual(input, snapshot)
})

test('arccosTypedMemo returns NaN for out-of-domain and NaN inputs', () => {
	const input = new Float64Array([
		-1.0000000000000002,
		1.0000000000000002,
		-2,
		2,
		-Infinity,
		Infinity,
		Number.NaN,
	])
	const result = arccosTypedMemo(input)
	assert.equal(result.length, input.length)
	for (let i = 0; i < result.length; i++) {
		assert.ok(Number.isNaN(result[i]), `Expected NaN at index ${i} for x=${input[i]}`)
	}
})

test('arccosTypedMemo throws TypeError on non-Float64Array inputs', () => {
	const invalidInputs = [
		null,
		undefined,
		0,
		0.5,
		'0.5',
		true,
		{},
		[0, 0.5, 1],
		new Float32Array([0, 0.5, 1]),
		new Int32Array([0, 1]),
		new Uint8Array([0, 1]),
		new ArrayBuffer(8),
	]

	for (const bad of invalidInputs) {
		assert.throws(() => arccosTypedMemo(bad), {
			name: 'TypeError',
		})
	}
})

test('arccosTypedMemo uses precomputed table and memoizes non-grid values', () => {
	const origAcos = Math.acos
	let calls = 0
	Math.acos = (x) => {
		calls++
		return origAcos(x)
	}

	try {
		// Precomputed dyadic grid points (-1, -0.5, -0.25, 0, 0.25, 0.5, 1) should never invoke Math.acos
		const gridPoints = new Float64Array([-1, -0.5, -0.25, 0, 0.25, 0.5, 1, 3 / 1024, -513 / 1024])
		const gridOut = arccosTypedMemo(gridPoints)
		assert.equal(calls, 0, 'Precomputed table points should not call Math.acos')
		for (let i = 0; i < gridPoints.length; i++) {
			assert.equal(gridOut[i], origAcos(gridPoints[i]))
		}

		// Non-grid values should invoke Math.acos only once and reuse cached results thereafter
		const v1 = 1 / 3
		const v2 = -1 / 7
		const firstOut = arccosTypedMemo(new Float64Array([v1, v2, v1, v2, v1]))
		assert.equal(calls, 2, 'Each distinct non-grid value should compute Math.acos once')

		const secondOut = arccosTypedMemo(new Float64Array([v2, v1]))
		assert.equal(calls, 2, 'Subsequent calls with cached values should hit memo cache')
		assert.equal(secondOut[0], firstOut[1])
		assert.equal(secondOut[1], firstOut[0])
	} finally {
		Math.acos = origAcos
	}
})

test('arccosTypedMemo handles memo cache eviction beyond capacity without losing accuracy', () => {
	const count = 4200
	const input = new Float64Array(count)
	for (let i = 0; i < count; i++) {
		// Distinct irrational-like non-grid values in (-1, 1)
		input[i] = -0.999 + (1.998 * i) / (count - 1)
	}
	const out = arccosTypedMemo(input)
	for (let i = 0; i < count; i++) {
		assertClose(out[i], Math.acos(input[i]), 0)
	}
})

test('independent cross-checks: cos(arccos(x)) ≈ x, arcsin(x) + arccos(x) ≈ π/2, reflection and monotonicity', () => {
	const xs = new Float64Array([
		-1,
		-0.987654321,
		-0.8,
		-0.6180339887498949,
		-0.3333333333333333,
		-1e-12,
		0,
		1e-12,
		0.3333333333333333,
		0.6180339887498949,
		0.8,
		0.987654321,
		1,
	])

	const ys = arccosTypedMemo(xs)

	for (let i = 0; i < xs.length; i++) {
		// Inverse trigonometric identity: cos(arccos(x)) === x
		assertClose(Math.cos(ys[i]), xs[i], 1e-14, `cos(arccos(${xs[i]})) !== ${xs[i]}`)

		// Complementary angle identity: arcsin(x) + arccos(x) === π/2
		assertClose(Math.asin(xs[i]) + ys[i], Math.PI / 2, 1e-14, `asin + acos !== π/2 for ${xs[i]}`)

		// Range check: arccos(x) ∈ [0, π]
		assert.ok(ys[i] >= 0 && ys[i] <= Math.PI)
	}

	// Reflection symmetry: arccos(-x) + arccos(x) === π
	for (let i = 0; i < Math.floor(xs.length / 2); i++) {
		const j = xs.length - 1 - i
		assertClose(ys[i] + ys[j], Math.PI, 1e-14, `arccos(-x) + arccos(x) !== π for ${xs[i]}`)
	}

	// Strict monotonicity: arccos is strictly decreasing on [-1, 1]
	for (let i = 1; i < ys.length; i++) {
		assert.ok(ys[i] < ys[i - 1], `Expected strictly decreasing at index ${i}`)
	}
})
