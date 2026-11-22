import { test } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyTypedIterative } from './multiplyTypedIterative.js'

test('multiplyTypedIterative - basic element-wise multiplication', () => {
	const a = new Float64Array([1, -2, 3.5, 0, 10])
	const b = new Float64Array([4, 5, -2, 7.25, 0.1])
	const result = multiplyTypedIterative(a, b)

	assert.ok(result instanceof Float64Array)
	assert.notEqual(result, a)
	assert.notEqual(result, b)
	assert.deepEqual(result, new Float64Array([4, -10, -7, 0, 1]))

	// Verify inputs are not mutated
	assert.deepEqual(a, new Float64Array([1, -2, 3.5, 0, 10]))
	assert.deepEqual(b, new Float64Array([4, 5, -2, 7.25, 0.1]))
})

test('multiplyTypedIterative - aliasing and subarray views', () => {
	const a = new Float64Array([2, -3, 0.5, 4])
	const squared = multiplyTypedIterative(a, a)
	assert.deepEqual(squared, new Float64Array([4, 9, 0.25, 16]))

	const buffer = new Float64Array([99, 2, 3, 4, 88, 5, 6, 7, 77])
	const viewA = buffer.subarray(1, 4) // [2, 3, 4]
	const viewB = buffer.subarray(5, 8) // [5, 6, 7]
	assert.deepEqual(
		multiplyTypedIterative(viewA, viewB),
		new Float64Array([10, 18, 28])
	)
})

test('multiplyTypedIterative - edge cases (empty, single element, IEEE-754 special values)', () => {
	// Empty arrays
	const emptyResult = multiplyTypedIterative(
		new Float64Array(0),
		new Float64Array(0)
	)
	assert.ok(emptyResult instanceof Float64Array)
	assert.equal(emptyResult.length, 0)

	// Single element
	assert.deepEqual(
		multiplyTypedIterative(new Float64Array([6]), new Float64Array([7])),
		new Float64Array([42])
	)

	// Special IEEE-754 values
	const a = new Float64Array([
		NaN,
		Infinity,
		-Infinity,
		0,
		-0,
		Number.MAX_VALUE,
		Number.MIN_VALUE,
	])
	const b = new Float64Array([
		5,
		2,
		-3,
		Infinity,
		4,
		2,
		0.5,
	])
	const result = multiplyTypedIterative(a, b)

	assert.ok(Number.isNaN(result[0]))
	assert.equal(result[1], Infinity)
	assert.equal(result[2], Infinity)
	assert.ok(Number.isNaN(result[3]))
	assert.ok(Object.is(result[4], -0))
	assert.equal(result[5], Infinity)
	assert.equal(result[6], 0)
})

test('multiplyTypedIterative - input validation errors', () => {
	const valid = new Float64Array([1, 2, 3])

	// Invalid first argument types
	for (const bad of [
		null,
		undefined,
		[1, 2, 3],
		new Float32Array([1, 2, 3]),
		new Int32Array([1, 2, 3]),
		42,
		'123',
		{ length: 3 },
	]) {
		assert.throws(() => multiplyTypedIterative(bad, valid), TypeError)
	}

	// Invalid second argument types
	for (const bad of [
		null,
		undefined,
		[1, 2, 3],
		new Float32Array([1, 2, 3]),
		new Int32Array([1, 2, 3]),
		42,
		'123',
		{ length: 3 },
	]) {
		assert.throws(() => multiplyTypedIterative(valid, bad), TypeError)
	}

	// Mismatched lengths
	assert.throws(
		() => multiplyTypedIterative(new Float64Array([1, 2]), new Float64Array([1, 2, 3])),
		RangeError
	)
	assert.throws(
		() => multiplyTypedIterative(new Float64Array(0), new Float64Array([1])),
		RangeError
	)
})

test('multiplyTypedIterative - cross-check against closed-form formula, algebraic identities, and inverse division', () => {
	// 1. Analytical closed-form: sum_{k=1}^{n} k^2 = n(n+1)(2n+1)/6
	const n = 200
	const seq = new Float64Array(n)
	for (let i = 0; i < n; i += 1) {
		seq[i] = i + 1
	}
	const squares = multiplyTypedIterative(seq, seq)
	let sumOfSquares = 0
	for (let i = 0; i < n; i += 1) {
		sumOfSquares += squares[i]
	}
	const closedForm = (n * (n + 1) * (2 * n + 1)) / 6
	assert.equal(sumOfSquares, closedForm)

	// 2. Algebraic identities & independent Array reference on deterministic data
	const len = 128
	const a = new Float64Array(len)
	const b = new Float64Array(len)
	const c = new Float64Array(len)
	const ones = new Float64Array(len).fill(1)

	for (let i = 0; i < len; i += 1) {
		a[i] = ((i * 37) % 101) - 50 + 0.25
		b[i] = ((i * 53) % 97) - 48 + 0.5
		c[i] = ((i * 29) % 89) - 44 + 0.125
	}

	const ab = multiplyTypedIterative(a, b)
	const ba = multiplyTypedIterative(b, a)

	// Reference Array.prototype.map cross-check & commutativity
	const ref = Array.from(a, (val, idx) => val * b[idx])
	assert.deepEqual(Array.from(ab), ref)
	assert.deepEqual(ab, ba)

	// Multiplicative identity
	assert.deepEqual(multiplyTypedIterative(a, ones), a)

	// Distributivity: a * (b + c) === (a * b) + (a * c) within floating-point precision
	const bPlusC = new Float64Array(len)
	for (let i = 0; i < len; i += 1) {
		bPlusC[i] = b[i] + c[i]
	}
	const lhs = multiplyTypedIterative(a, bPlusC)
	const ac = multiplyTypedIterative(a, c)
	for (let i = 0; i < len; i += 1) {
		assert.ok(Math.abs(lhs[i] - (ab[i] + ac[i])) <= 1e-10)
	}

	// Inverse operation cross-check: (a * b) / b === a (all b[i] are non-zero since b[i] ends in .5)
	for (let i = 0; i < len; i += 1) {
		assert.ok(Math.abs(ab[i] / b[i] - a[i]) <= 1e-12)
	}
})
