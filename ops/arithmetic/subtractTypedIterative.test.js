import { test } from 'node:test'
import assert from 'node:assert/strict'
import { subtractTypedIterative } from './subtractTypedIterative.js'

test('subtracts elements of two Float64Arrays accurately without mutating inputs', () => {
	const a = new Float64Array([10, -4.5, 0, 3.25, 1e12])
	const b = new Float64Array([3, 2.5, -7, 3.25, 5e11])
	const aCopy = new Float64Array(a)
	const bCopy = new Float64Array(b)

	const out = subtractTypedIterative(a, b)

	assert.ok(out instanceof Float64Array)
	assert.notEqual(out, a)
	assert.notEqual(out, b)
	assert.deepEqual(out, new Float64Array([7, -7, 7, 0, 5e11]))
	assert.deepEqual(a, aCopy)
	assert.deepEqual(b, bCopy)
})

test('handles single-element, empty, aliased, and overlapping subarray views', () => {
	const empty = subtractTypedIterative(new Float64Array(0), new Float64Array(0))
	assert.ok(empty instanceof Float64Array)
	assert.equal(empty.length, 0)

	const single = subtractTypedIterative(
		new Float64Array([42.5]),
		new Float64Array([0.5])
	)
	assert.deepEqual(single, new Float64Array([42]))

	// Same reference passed for both arguments
	const self = new Float64Array([1.25, -9.5, 0, 100])
	assert.deepEqual(
		subtractTypedIterative(self, self),
		new Float64Array([0, 0, 0, 0])
	)

	// Overlapping subarrays sharing one ArrayBuffer
	const backing = new Float64Array([10, 20, 35, 55, 80])
	const viewA = backing.subarray(1, 5) // [20, 35, 55, 80]
	const viewB = backing.subarray(0, 4) // [10, 20, 35, 55]
	const diffs = subtractTypedIterative(viewA, viewB)
	assert.deepEqual(diffs, new Float64Array([10, 15, 20, 25]))
	assert.deepEqual(backing, new Float64Array([10, 20, 35, 55, 80]))
})

test('preserves IEEE-754 special values and boundary behavior', () => {
	const a = new Float64Array([
		NaN,
		1,
		Infinity,
		Infinity,
		-Infinity,
		-0,
		0,
		Number.MAX_VALUE,
		-Number.MAX_VALUE,
		Number.MIN_VALUE
	])
	const b = new Float64Array([
		1,
		NaN,
		5,
		Infinity,
		Infinity,
		0,
		-0,
		-Number.MAX_VALUE,
		Number.MAX_VALUE,
		0
	])

	const out = subtractTypedIterative(a, b)

	assert.ok(Number.isNaN(out[0]))
	assert.ok(Number.isNaN(out[1]))
	assert.equal(out[2], Infinity)
	assert.ok(Number.isNaN(out[3]))
	assert.equal(out[4], -Infinity)
	assert.ok(Object.is(out[5], -0))
	assert.ok(Object.is(out[6], 0))
	assert.equal(out[7], Infinity)
	assert.equal(out[8], -Infinity)
	assert.equal(out[9], Number.MIN_VALUE)
})

test('throws TypeError for non-Float64Array inputs', () => {
	const valid = new Float64Array([1, 2, 3])
	const invalidInputs = [
		null,
		undefined,
		[1, 2, 3],
		new Float32Array([1, 2, 3]),
		new Int32Array([1, 2, 3]),
		new Uint8Array([1, 2, 3]),
		42,
		'123',
		{ 0: 1, 1: 2, 2: 3, length: 3 }
	]

	for (const bad of invalidInputs) {
		assert.throws(() => subtractTypedIterative(bad, valid), TypeError)
		assert.throws(() => subtractTypedIterative(valid, bad), TypeError)
	}
	assert.throws(() => subtractTypedIterative(), TypeError)
})

test('throws RangeError when Float64Array lengths do not match', () => {
	assert.throws(
		() =>
			subtractTypedIterative(
				new Float64Array([1, 2, 3]),
				new Float64Array([1, 2])
			),
		RangeError
	)
	assert.throws(
		() =>
			subtractTypedIterative(new Float64Array(0), new Float64Array([1])),
		RangeError
	)
	assert.throws(
		() =>
			subtractTypedIterative(new Float64Array([1]), new Float64Array(0)),
		RangeError
	)
})

test('cross-check: algebraic identities and analytical arithmetic progression closed form', () => {
	const n = 256
	const a0 = 12.5
	const da = 1.25
	const b0 = -3.75
	const db = 0.5

	const a = new Float64Array(n)
	const b = new Float64Array(n)
	for (let i = 0; i < n; i += 1) {
		a[i] = a0 + i * da
		b[i] = b0 + i * db
	}

	const diff = subtractTypedIterative(a, b)
	const revDiff = subtractTypedIterative(b, a)

	// Closed-form element & series sum cross-check, plus inverse-addition and anti-commutativity
	let runningSum = 0
	for (let i = 0; i < n; i += 1) {
		const expected = (a0 - b0) + i * (da - db)
		assert.equal(diff[i], expected)
		// Anti-commutativity: (a - b) === -(b - a)
		assert.equal(diff[i], -revDiff[i])
		// Inverse of addition: (a - b) + b === a (exact here since all terms are dyadic rationals)
		assert.equal(diff[i] + b[i], a[i])
		runningSum += diff[i]
	}

	const closedFormSum = n * (a0 - b0) + ((da - db) * n * (n - 1)) / 2
	assert.equal(runningSum, closedFormSum)
})

test('cross-check: matches independent Array.prototype.map reference on large deterministic input', () => {
	const n = 1000
	let state = 0x12345678
	const nextFloat = () => {
		// Deterministic LCG in [-1000, 1000)
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return (state / 0x100000000) * 2000 - 1000
	}

	const rawA = Array.from({ length: n }, nextFloat)
	const rawB = Array.from({ length: n }, nextFloat)
	const expected = Float64Array.from(rawA.map((val, idx) => val - rawB[idx]))

	const actual = subtractTypedIterative(
		Float64Array.from(rawA),
		Float64Array.from(rawB)
	)

	assert.deepEqual(actual, expected)
})
