import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tanTypedIterative } from './tanTypedIterative.js'

const EPSILON = 1e-12

function assertClose(actual, expected, tol = EPSILON, msg) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		msg ?? `Expected ${actual} to be within ${tol} of ${expected}`
	)
}

test('computes tangent for standard angles and does not mutate input', () => {
	const input = new Float64Array([
		0,
		Math.PI / 6,
		Math.PI / 4,
		Math.PI / 3,
		-Math.PI / 4,
		-Math.PI / 3,
		Math.PI,
	])
	const snapshot = new Float64Array(input)
	const result = tanTypedIterative(input)

	assert.ok(result instanceof Float64Array)
	assert.notStrictEqual(result, input)
	assert.strictEqual(result.length, input.length)
	assert.deepStrictEqual(input, snapshot)

	assert.strictEqual(result[0], 0)
	assertClose(result[1], 1 / Math.sqrt(3))
	assertClose(result[2], 1)
	assertClose(result[3], Math.sqrt(3))
	assertClose(result[4], -1)
	assertClose(result[5], -Math.sqrt(3))
	assertClose(result[6], 0)
})

test('handles empty Float64Array', () => {
	const input = new Float64Array(0)
	const result = tanTypedIterative(input)

	assert.ok(result instanceof Float64Array)
	assert.notStrictEqual(result, input)
	assert.strictEqual(result.length, 0)
})

test('preserves signed zeros and handles NaN and Infinity edge cases', () => {
	const input = new Float64Array([0, -0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])
	const result = tanTypedIterative(input)

	assert.ok(Object.is(result[0], 0), 'tan(+0) should be +0')
	assert.ok(Object.is(result[1], -0), 'tan(-0) should be -0')
	assert.ok(Number.isNaN(result[2]), 'tan(NaN) should be NaN')
	assert.ok(Number.isNaN(result[3]), 'tan(+Infinity) should be NaN')
	assert.ok(Number.isNaN(result[4]), 'tan(-Infinity) should be NaN')
})

test('handles subarrays with non-zero byteOffset and larger inputs', () => {
	const backing = new Float64Array([99, 0.25, 0.5, 0.75, -0.5, 99])
	const view = backing.subarray(1, 5)
	const result = tanTypedIterative(view)

	assert.strictEqual(result.length, 4)
	for (let i = 0; i < view.length; i++) {
		assert.strictEqual(result[i], Math.tan(view[i]))
	}

	const large = new Float64Array(1000)
	for (let i = 0; i < large.length; i++) {
		large[i] = (i - 500) * 0.0025
	}
	const largeResult = tanTypedIterative(large)
	assert.strictEqual(largeResult.length, 1000)
	for (let i = 0; i < large.length; i++) {
		assert.strictEqual(largeResult[i], Math.tan(large[i]))
	}
})

test('throws TypeError for invalid inputs', () => {
	const invalidInputs = [
		null,
		undefined,
		[0, 1, 2],
		new Float32Array([0, 1]),
		new Int32Array([0, 1]),
		42,
		'0.5',
		{ length: 1, 0: 0 },
	]

	for (const bad of invalidInputs) {
		assert.throws(() => tanTypedIterative(bad), TypeError)
	}
})

test('independent cross-check: sin(x)/cos(x) and sec^2(x) identities', () => {
	const xs = new Float64Array([-1.2, -0.8, -0.3, 0.1, 0.45, 0.9, 1.35])
	const tans = tanTypedIterative(xs)

	for (let i = 0; i < xs.length; i++) {
		const x = xs[i]
		const s = Math.sin(x)
		const c = Math.cos(x)
		assertClose(tans[i], s / c, 1e-12, `sin/cos mismatch at x=${x}`)
		assertClose(1 + tans[i] * tans[i], 1 / (c * c), 1e-11, `sec^2 mismatch at x=${x}`)
	}
})

test('independent cross-check: odd symmetry, angle addition, and Taylor series for small x', () => {
	const small = new Float64Array([-0.05, -0.01, -1e-6, 1e-6, 0.01, 0.05])
	const smallTans = tanTypedIterative(small)
	const negSmall = new Float64Array(small.length)
	for (let i = 0; i < small.length; i++) {
		negSmall[i] = -small[i]
	}
	const negTans = tanTypedIterative(negSmall)

	for (let i = 0; i < small.length; i++) {
		const x = small[i]
		// Odd function: tan(-x) === -tan(x)
		assert.strictEqual(negTans[i], -smallTans[i])

		// Independent Maclaurin series: x + x^3/3 + 2x^5/15 + 17x^7/315
		const x2 = x * x
		const x3 = x2 * x
		const x5 = x3 * x2
		const x7 = x5 * x2
		const taylor = x + x3 / 3 + (2 * x5) / 15 + (17 * x7) / 315
		assertClose(smallTans[i], taylor, 1e-13, `Taylor series mismatch at x=${x}`)
	}

	// Angle addition identity: tan(a + b) = (tan(a) + tan(b)) / (1 - tan(a) * tan(b))
	const a = 0.4
	const b = 0.55
	const [tanA, tanB, tanAB] = tanTypedIterative(new Float64Array([a, b, a + b]))
	const expectedAB = (tanA + tanB) / (1 - tanA * tanB)
	assertClose(tanAB, expectedAB, 1e-12)
})
