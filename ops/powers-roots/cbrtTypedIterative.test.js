import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cbrtTypedIterative } from './cbrtTypedIterative.js'

function assertClose(actual, expected, relTol = 1e-14, absTol = 1e-15) {
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= limit,
		`Expected ${actual} to be close to ${expected} (diff=${diff}, limit=${limit})`,
	)
}

function newtonCbrt(x) {
	if (x === 0) return x
	const sign = x < 0 ? -1 : 1
	const ax = Math.abs(x)
	// Initial guess via exponent scaling (independent of Math.cbrt)
	let y = Math.exp(Math.log(ax) / 3)
	for (let iter = 0; iter < 8; iter += 1) {
		y = (2 * y + ax / (y * y)) / 3
	}
	return sign * y
}

test('normal cases: exact positive, negative, and fractional cubes', () => {
	const input = new Float64Array([-1000, -27, -8, -1, -0.125, 0.125, 1, 8, 27, 64, 1000])
	const snapshot = new Float64Array(input)
	const result = cbrtTypedIterative(input)

	assert.ok(result instanceof Float64Array)
	assert.notStrictEqual(result, input)
	assert.deepEqual(input, snapshot, 'input array should not be mutated')
	assert.deepEqual(
		result,
		new Float64Array([-10, -3, -2, -1, -0.5, 0.5, 1, 2, 3, 4, 10]),
	)
})

test('normal cases: optional out buffer, in-place execution, and subarray views', () => {
	const input = new Float64Array([1, 8, 27, 64])
	const out = new Float64Array(4)
	const ret = cbrtTypedIterative(input, out)

	assert.strictEqual(ret, out)
	assert.deepEqual(out, new Float64Array([1, 2, 3, 4]))

	// In-place execution (out === input)
	const inplace = new Float64Array([-64, -8, 0, 125])
	const retInplace = cbrtTypedIterative(inplace, inplace)
	assert.strictEqual(retInplace, inplace)
	assert.deepEqual(inplace, new Float64Array([-4, -2, 0, 5]))

	// Subarray view with non-zero byteOffset
	const backing = new Float64Array([999, -27, 64, -125, 999])
	const view = backing.subarray(1, 4)
	const viewResult = cbrtTypedIterative(view)
	assert.deepEqual(viewResult, new Float64Array([-3, 4, -5]))
})

test('edge cases: empty Float64Array', () => {
	const empty = new Float64Array(0)
	const result = cbrtTypedIterative(empty)
	assert.ok(result instanceof Float64Array)
	assert.equal(result.length, 0)
	assert.notStrictEqual(result, empty)

	const emptyOut = new Float64Array(0)
	assert.strictEqual(cbrtTypedIterative(empty, emptyOut), emptyOut)
})

test('edge cases: IEEE-754 special values (+0, -0, ±Infinity, NaN)', () => {
	const input = new Float64Array([0, -0, Infinity, -Infinity, NaN])
	const result = cbrtTypedIterative(input)

	assert.ok(Object.is(result[0], +0), 'cbrt(+0) should be +0')
	assert.ok(Object.is(result[1], -0), 'cbrt(-0) should be -0')
	assert.equal(result[2], Infinity)
	assert.equal(result[3], -Infinity)
	assert.ok(Number.isNaN(result[4]), 'cbrt(NaN) should be NaN')
})

test('edge cases: extreme floating-point boundaries and subnormals', () => {
	const boundaries = new Float64Array([
		Number.MAX_VALUE,
		-Number.MAX_VALUE,
		Number.MIN_VALUE,
		-Number.MIN_VALUE,
		Number.EPSILON,
		Number.MAX_SAFE_INTEGER,
		Number.MIN_SAFE_INTEGER,
		1e-300,
		1e300,
	])
	const result = cbrtTypedIterative(boundaries)

	for (let i = 0; i < boundaries.length; i += 1) {
		assert.ok(Number.isFinite(result[i]), `result[${i}] should be finite`)
		assert.equal(Math.sign(result[i]), Math.sign(boundaries[i]))
	}
	assertClose(result[7], 1e-100, 1e-14)
	assertClose(result[8], 1e100, 1e-14)
	// Cube of cbrt(MAX_VALUE) should not overflow back unexpectedly beyond precision
	assertClose(result[0] / 1e102, Math.cbrt(Number.MAX_VALUE / 1e306), 1e-14)
})

test('input validation: throws TypeError and RangeError on invalid inputs', () => {
	const invalidInputs = [
		null,
		undefined,
		[1, 8, 27],
		new Float32Array([1, 8, 27]),
		new Int32Array([1, 8, 27]),
		27,
		'27',
		{ length: 1, 0: 27 },
	]
	for (const bad of invalidInputs) {
		assert.throws(() => cbrtTypedIterative(bad), TypeError)
	}

	const valid = new Float64Array([1, 8, 27])
	assert.throws(() => cbrtTypedIterative(valid, [0, 0, 0]), TypeError)
	assert.throws(() => cbrtTypedIterative(valid, new Float32Array(3)), TypeError)
	assert.throws(() => cbrtTypedIterative(valid, null), TypeError)

	assert.throws(() => cbrtTypedIterative(valid, new Float64Array(2)), RangeError)
	assert.throws(() => cbrtTypedIterative(valid, new Float64Array(4)), RangeError)
	assert.throws(() => cbrtTypedIterative(valid, new Float64Array(0)), RangeError)
})

test('cross-check: inverse cube identity, odd symmetry, multiplicative identity, and independent Newton-Raphson solver', () => {
	const values = new Float64Array([
		-1e12, -42.5, -Math.PI, -2, -0.37, -1e-9,
		1e-9, 0.37, 2, Math.E, Math.PI, 42.5, 1e12,
	])
	const roots = cbrtTypedIterative(values)

	// 1. Inverse identity: (cbrt(x))^3 ≈ x
	for (let i = 0; i < values.length; i += 1) {
		const y = roots[i]
		assertClose(y * y * y, values[i], 1e-14)
	}

	// 2. Independent Newton-Raphson cross-check
	for (let i = 0; i < values.length; i += 1) {
		assertClose(roots[i], newtonCbrt(values[i]), 1e-14)
	}

	// 3. Odd function identity: cbrt(-x) === -cbrt(x)
	const negated = new Float64Array(values.length)
	for (let i = 0; i < values.length; i += 1) {
		negated[i] = -values[i]
	}
	const negRoots = cbrtTypedIterative(negated)
	for (let i = 0; i < values.length; i += 1) {
		assert.ok(Object.is(negRoots[i], -roots[i]))
	}

	// 4. Multiplicative identity: cbrt(a * b) ≈ cbrt(a) * cbrt(b)
	const a = new Float64Array([2, -3.5, 7.25, -0.4, 123.45])
	const b = new Float64Array([5, 4.2, -11.8, -0.25, 0.081])
	const prod = new Float64Array(a.length)
	for (let i = 0; i < a.length; i += 1) {
		prod[i] = a[i] * b[i]
	}
	const cbrtA = cbrtTypedIterative(a)
	const cbrtB = cbrtTypedIterative(b)
	const cbrtProd = cbrtTypedIterative(prod)
	for (let i = 0; i < a.length; i += 1) {
		assertClose(cbrtProd[i], cbrtA[i] * cbrtB[i], 1e-14)
	}
})
