import { test } from 'node:test'
import assert from 'node:assert/strict'
import { divideTypedIterative } from './divideTypedIterative.js'

test('divideTypedIterative: normal element-wise division', () => {
	const a = new Float64Array([10, -20, 7.5, -9, 1])
	const b = new Float64Array([2, 4, 2.5, -3, 3])
	const result = divideTypedIterative(a, b)

	assert.ok(result instanceof Float64Array)
	assert.equal(result.length, 5)
	assert.deepEqual(
		Array.from(result),
		[5, -5, 3, 3, 1 / 3],
	)
	// Verify inputs are not mutated
	assert.deepEqual(Array.from(a), [10, -20, 7.5, -9, 1])
	assert.deepEqual(Array.from(b), [2, 4, 2.5, -3, 3])
})

test('divideTypedIterative: supports subarray views sharing an ArrayBuffer', () => {
	const buf = new Float64Array([100, 12, 18, 24, 2, 3, 4, 200])
	const a = buf.subarray(1, 4) // [12, 18, 24]
	const b = buf.subarray(4, 7) // [2, 3, 4]
	const result = divideTypedIterative(a, b)

	assert.ok(result instanceof Float64Array)
	assert.deepEqual(Array.from(result), [6, 6, 6])
	assert.notEqual(result.buffer, buf.buffer)
})

test('divideTypedIterative: empty and single-element Float64Arrays', () => {
	const emptyA = new Float64Array(0)
	const emptyB = new Float64Array(0)
	const emptyResult = divideTypedIterative(emptyA, emptyB)

	assert.ok(emptyResult instanceof Float64Array)
	assert.equal(emptyResult.length, 0)
	assert.notEqual(emptyResult, emptyA)
	assert.notEqual(emptyResult, emptyB)

	const single = divideTypedIterative(
		new Float64Array([42]),
		new Float64Array([6]),
	)
	assert.deepEqual(Array.from(single), [7])
})

test('divideTypedIterative: IEEE 754 special values and boundaries', () => {
	const a = new Float64Array([
		1,
		-1,
		1,
		-1,
		0,
		0,
		-0,
		0,
		Infinity,
		Infinity,
		5,
		5,
		NaN,
		2,
		Number.MAX_VALUE,
		Number.MAX_VALUE,
		Number.MIN_VALUE,
		Number.MIN_VALUE,
	])
	const b = new Float64Array([
		0,
		0,
		-0,
		-0,
		0,
		5,
		5,
		-5,
		2,
		Infinity,
		Infinity,
		-Infinity,
		2,
		NaN,
		Number.MAX_VALUE,
		0.5,
		2,
		Number.MIN_VALUE,
	])

	const res = divideTypedIterative(a, b)

	assert.equal(res[0], Infinity)
	assert.equal(res[1], -Infinity)
	assert.equal(res[2], -Infinity)
	assert.equal(res[3], Infinity)
	assert.ok(Number.isNaN(res[4]))
	assert.ok(Object.is(res[5], 0))
	assert.ok(Object.is(res[6], -0))
	assert.ok(Object.is(res[7], -0))
	assert.equal(res[8], Infinity)
	assert.ok(Number.isNaN(res[9]))
	assert.ok(Object.is(res[10], 0))
	assert.ok(Object.is(res[11], -0))
	assert.ok(Number.isNaN(res[12]))
	assert.ok(Number.isNaN(res[13]))
	assert.equal(res[14], 1)
	assert.equal(res[15], Infinity) // overflow
	assert.ok(Object.is(res[16], 0)) // underflow past subnormal min
	assert.equal(res[17], 1)
})

test('divideTypedIterative: dividing an array by itself yields ones', () => {
	const a = new Float64Array([-123.456, 0.25, 1, 99999.5, Number.EPSILON])
	const result = divideTypedIterative(a, a)
	assert.deepEqual(Array.from(result), [1, 1, 1, 1, 1])
	assert.notEqual(result, a)
})

test('divideTypedIterative: throws TypeError on non-Float64Array inputs', () => {
	const valid = new Float64Array([1, 2])
	const invalidInputs = [
		[1, 2],
		new Float32Array([1, 2]),
		new Int32Array([1, 2]),
		null,
		undefined,
		42,
		'12',
		{ length: 2, 0: 1, 1: 2 },
	]

	for (const bad of invalidInputs) {
		assert.throws(() => divideTypedIterative(bad, valid), TypeError)
		assert.throws(() => divideTypedIterative(valid, bad), TypeError)
	}
})

test('divideTypedIterative: throws RangeError on mismatched lengths', () => {
	assert.throws(
		() => divideTypedIterative(new Float64Array([1, 2]), new Float64Array([1])),
		RangeError,
	)
	assert.throws(
		() => divideTypedIterative(new Float64Array(0), new Float64Array([1])),
		RangeError,
	)
	assert.throws(
		() => divideTypedIterative(new Float64Array([1, 2, 3]), new Float64Array(0)),
		RangeError,
	)
})

test('divideTypedIterative: cross-check inverse identity and analytical closed form', () => {
	// 1. Inverse identity: (a / b) * b recovers a
	const n = 256
	const a = new Float64Array(n)
	const b = new Float64Array(n)
	for (let i = 0; i < n; i += 1) {
		const signA = i % 2 === 0 ? 1 : -1
		const signB = i % 3 === 0 ? -1 : 1
		a[i] = signA * (i + 1.37) * 0.75
		b[i] = signB * (i + 2.5) * 0.125
	}

	const q = divideTypedIterative(a, b)
	for (let i = 0; i < n; i += 1) {
		const recovered = q[i] * b[i]
		const tol = 1e-12 * Math.max(1, Math.abs(a[i]))
		assert.ok(
			Math.abs(recovered - a[i]) <= tol,
			`index ${i}: expected ${recovered} ≈ ${a[i]}`,
		)
	}

	// 2. Analytical closed-form identity: (k * (k + 1)) / k === k + 1
	const num = new Float64Array(100)
	const den = new Float64Array(100)
	for (let k = 1; k <= 100; k += 1) {
		num[k - 1] = k * (k + 1)
		den[k - 1] = k
	}
	const exact = divideTypedIterative(num, den)
	for (let k = 1; k <= 100; k += 1) {
		assert.equal(exact[k - 1], k + 1)
	}

	// 3. Bit-for-bit cross-check against independent Array.prototype.map reference
	const reference = Array.from(a).map((val, idx) => val / b[idx])
	for (let i = 0; i < n; i += 1) {
		assert.ok(
			Object.is(q[i], reference[i]),
			`index ${i}: expected Object.is(${q[i]}, ${reference[i]})`,
		)
	}

	// 4. Distributivity over addition: (a + c) / b ≈ (a / b) + (c / b)
	const c = new Float64Array(n)
	const sum = new Float64Array(n)
	for (let i = 0; i < n; i += 1) {
		c[i] = (i - 128) * 1.125
		sum[i] = a[i] + c[i]
	}
	const lhs = divideTypedIterative(sum, b)
	const cDivB = divideTypedIterative(c, b)
	for (let i = 0; i < n; i += 1) {
		const rhs = q[i] + cDivB[i]
		const tol = 1e-12 * Math.max(1, Math.abs(lhs[i]), Math.abs(rhs))
		assert.ok(
			Math.abs(lhs[i] - rhs) <= tol,
			`distributivity mismatch at ${i}: ${lhs[i]} vs ${rhs}`,
		)
	}
})
