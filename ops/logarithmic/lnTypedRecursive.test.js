import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lnTypedRecursive } from './lnTypedRecursive.js'

function assertClose(actual, expected, tol = 1e-12, message) {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		diff <= tol * scale,
		message ?? `Expected ${actual} to be close to ${expected} (diff=${diff}, tol=${tol * scale})`,
	)
}

test('normal positive Float64Array values', () => {
	const input = new Float64Array([1, Math.E, Math.E ** 2, Math.E ** 5, 10, 100])
	const result = lnTypedRecursive(input)

	assert.ok(result instanceof Float64Array)
	assert.equal(result.length, input.length)
	assert.equal(result[0], 0)
	assertClose(result[1], 1)
	assertClose(result[2], 2)
	assertClose(result[3], 5)
	assertClose(result[4], Math.LN10)
	assertClose(result[5], 2 * Math.LN10)
})

test('does not mutate input Float64Array', () => {
	const original = [1, 2, Math.E, 42.5]
	const input = new Float64Array(original)
	const result = lnTypedRecursive(input)

	assert.notEqual(result, input)
	assert.deepEqual(Array.from(input), original)
})

test('empty Float64Array returns empty Float64Array', () => {
	const input = new Float64Array(0)
	const result = lnTypedRecursive(input)

	assert.ok(result instanceof Float64Array)
	assert.equal(result.length, 0)
})

test('single-element Float64Array edge cases (1, Math.E, arbitrary)', () => {
	const r1 = lnTypedRecursive(new Float64Array([1]))
	assert.ok(r1 instanceof Float64Array)
	assert.equal(r1.length, 1)
	assert.equal(r1[0], 0)

	const rE = lnTypedRecursive(new Float64Array([Math.E]))
	assertClose(rE[0], 1)

	const rHalf = lnTypedRecursive(new Float64Array([0.5]))
	assertClose(rHalf[0], -Math.LN2)
})

test('fractional inputs in (0, 1) yield negative logarithms', () => {
	const input = new Float64Array([0.5, 0.25, 1 / Math.E, 1e-6, 1e-100, Number.MIN_VALUE])
	const result = lnTypedRecursive(input)

	assertClose(result[0], -Math.LN2)
	assertClose(result[1], -2 * Math.LN2)
	assertClose(result[2], -1)
	assertClose(result[3], -6 * Math.LN10)
	assertClose(result[4], -100 * Math.LN10)
	assertClose(result[5], Math.log(Number.MIN_VALUE))
	for (let i = 0; i < result.length; i++) {
		assert.ok(result[i] < 0, `Expected negative result at index ${i}, got ${result[i]}`)
	}
})

test('odd, even, large arrays and Float64Array subarray views', () => {
	const n = 1025
	const input = new Float64Array(n)
	for (let i = 0; i < n; i++) {
		input[i] = i + 1
	}
	const result = lnTypedRecursive(input)
	assert.equal(result.length, n)
	for (let i = 0; i < n; i++) {
		assertClose(result[i], Math.log(i + 1))
	}

	const backing = new Float64Array([999, 1, Math.E, Math.E ** 3, 999])
	const view = backing.subarray(1, 4)
	const viewResult = lnTypedRecursive(view)
	assert.equal(viewResult.length, 3)
	assert.equal(viewResult[0], 0)
	assertClose(viewResult[1], 1)
	assertClose(viewResult[2], 3)
})

test('throws RangeError for non-positive (<= 0) elements', () => {
	const invalidArrays = [
		new Float64Array([0]),
		new Float64Array([-0]),
		new Float64Array([-1]),
		new Float64Array([1, 2, 0, 4]),
		new Float64Array([1, 2, -0.0001, 4]),
		new Float64Array([-1e300]),
	]

	for (const arr of invalidArrays) {
		assert.throws(() => lnTypedRecursive(arr), { name: 'RangeError' })
	}
})

test('throws RangeError for NaN and non-finite elements', () => {
	const invalidArrays = [
		new Float64Array([Number.NaN]),
		new Float64Array([1, Number.NaN, 3]),
		new Float64Array([Number.POSITIVE_INFINITY]),
		new Float64Array([Number.NEGATIVE_INFINITY]),
		new Float64Array([2, Number.POSITIVE_INFINITY]),
	]

	for (const arr of invalidArrays) {
		assert.throws(() => lnTypedRecursive(arr), { name: 'RangeError' })
	}
})

test('throws TypeError for non-Float64Array inputs', () => {
	const badInputs = [
		[1, 2, 3],
		new Float32Array([1, 2, 3]),
		new Int32Array([1, 2, 3]),
		new Uint8Array([1, 2, 3]),
		null,
		undefined,
		1,
		'Float64Array',
		{},
	]

	for (const bad of badInputs) {
		assert.throws(() => lnTypedRecursive(bad), { name: 'TypeError' })
	}
})

test('cross-check: inverse identity Math.exp(ln(x)) ≈ x', () => {
	const input = new Float64Array([
		1e-12,
		0.001,
		0.123456789,
		0.5,
		1,
		Math.SQRT2,
		Math.E,
		Math.PI,
		42,
		1e6,
		1e150,
	])
	const logged = lnTypedRecursive(input)

	for (let i = 0; i < input.length; i++) {
		assertClose(Math.exp(logged[i]), input[i], 1e-11)
	}
})

test('cross-check: logarithm product and power identities', () => {
	const a = new Float64Array([0.25, 1.5, 3, 7.2, 100])
	const b = new Float64Array([4, 2.5, 11, 0.125, 0.01])
	const prod = new Float64Array(a.length)
	const cubed = new Float64Array(a.length)
	for (let i = 0; i < a.length; i++) {
		prod[i] = a[i] * b[i]
		cubed[i] = a[i] ** 3
	}

	const lnA = lnTypedRecursive(a)
	const lnB = lnTypedRecursive(b)
	const lnProd = lnTypedRecursive(prod)
	const lnCubed = lnTypedRecursive(cubed)

	for (let i = 0; i < a.length; i++) {
		assertClose(lnProd[i], lnA[i] + lnB[i], 1e-12)
		assertClose(lnCubed[i], 3 * lnA[i], 1e-12)
	}
})
