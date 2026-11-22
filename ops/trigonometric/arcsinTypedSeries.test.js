import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arcsinTypedSeries } from './arcsinTypedSeries.js'

const TOL = 1e-14

function assertClose(actual, expected, tol = TOL, message) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		message ?? `Expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`
	)
}

test('arcsinTypedSeries: normal values and known exact angles', () => {
	const input = new Float64Array([
		-1,
		-Math.SQRT1_2,
		-0.5,
		-0.25,
		0,
		0.25,
		0.5,
		Math.SQRT1_2,
		Math.sqrt(3) / 2,
		1
	])
	const expected = [
		-Math.PI / 2,
		-Math.PI / 4,
		-Math.PI / 6,
		Math.asin(-0.25),
		0,
		Math.asin(0.25),
		Math.PI / 6,
		Math.PI / 4,
		Math.PI / 3,
		Math.PI / 2
	]

	const result = arcsinTypedSeries(input)
	assert.ok(result instanceof Float64Array)
	assert.equal(result.length, input.length)

	for (let i = 0; i < input.length; i++) {
		assertClose(result[i], expected[i], TOL, `Mismatch at index ${i} (x=${input[i]})`)
	}
})

test('arcsinTypedSeries: empty Float64Array', () => {
	const input = new Float64Array(0)
	const result = arcsinTypedSeries(input)
	assert.ok(result instanceof Float64Array)
	assert.equal(result.length, 0)
	assert.notEqual(result, input)
})

test('arcsinTypedSeries: does not mutate input array', () => {
	const input = new Float64Array([-0.75, 0, 0.75])
	const snapshot = new Float64Array(input)
	const result = arcsinTypedSeries(input)
	assert.notEqual(result, input)
	assert.deepEqual(input, snapshot)
})

test('arcsinTypedSeries: preserves signed zero (+0 and -0)', () => {
	const input = new Float64Array([0, -0])
	const result = arcsinTypedSeries(input)
	assert.ok(Object.is(result[0], 0), 'Expected +0 for input +0')
	assert.ok(Object.is(result[1], -0), 'Expected -0 for input -0')
})

test('arcsinTypedSeries: boundary values around ±0.5 and ±1 and tiny values', () => {
	const input = new Float64Array([
		-1,
		-1 + Number.EPSILON,
		-0.999999999999,
		-0.5 - 1e-12,
		-0.5,
		-0.5 + 1e-12,
		-1e-12,
		-1e-300,
		1e-300,
		1e-12,
		0.5 - 1e-12,
		0.5,
		0.5 + 1e-12,
		0.999999999999,
		1 - Number.EPSILON,
		1
	])
	const result = arcsinTypedSeries(input)

	for (let i = 0; i < input.length; i++) {
		assertClose(result[i], Math.asin(input[i]), 1e-14, `Boundary mismatch at x=${input[i]}`)
	}
})

test('arcsinTypedSeries: out-of-domain, NaN, and Infinity produce NaN', () => {
	const input = new Float64Array([
		-Infinity,
		-100,
		-1.0000000001,
		-1 - Number.EPSILON,
		1 + Number.EPSILON,
		1.0000000001,
		100,
		Infinity,
		Number.NaN
	])
	const result = arcsinTypedSeries(input)

	assert.equal(result.length, input.length)
	for (let i = 0; i < input.length; i++) {
		assert.ok(Number.isNaN(result[i]), `Expected NaN for input ${input[i]}, got ${result[i]}`)
	}
})

test('arcsinTypedSeries: invalid inputs throw TypeError', () => {
	const invalidInputs = [
		null,
		undefined,
		0.5,
		'0.5',
		[0, 0.5, 1],
		{ 0: 0.5, length: 1 },
		new Float32Array([0, 0.5]),
		new Int32Array([0, 1]),
		new Uint8Array([0, 1])
	]

	for (const bad of invalidInputs) {
		assert.throws(
			() => arcsinTypedSeries(bad),
			{ name: 'TypeError' },
			`Expected TypeError for invalid input: ${String(bad)}`
		)
	}
})

test('arcsinTypedSeries: dense cross-check against Math.asin and sin(y) ≈ x across [-1, 1]', () => {
	const half = 1000
	const count = 2 * half + 1
	const input = new Float64Array(count)
	for (let i = 0; i < count; i++) {
		input[i] = (i - half) / half
	}

	const result = arcsinTypedSeries(input)

	for (let i = 0; i < count; i++) {
		const x = input[i]
		const y = result[i]

		// Cross-check 1: compare against Math.asin
		assertClose(y, Math.asin(x), 1e-14, `Math.asin mismatch at x=${x}`)

		// Cross-check 2: inverse identity sin(arcsin(x)) ≈ x
		assertClose(Math.sin(y), x, 1e-14, `sin(arcsin(x)) mismatch at x=${x}`)

		// Cross-check 3: range invariant y in [-pi/2, pi/2]
		assert.ok(y >= -Math.PI / 2 && y <= Math.PI / 2, `Out of range y=${y} for x=${x}`)
	}

	// Cross-check 4: exact odd symmetry arcsin(-x) === -arcsin(x)
	for (let i = 0; i < half; i++) {
		const left = result[i]
		const right = result[count - 1 - i]
		assert.equal(left, -right, `Odd symmetry violation at index ${i} (x=${input[i]})`)
	}
})
