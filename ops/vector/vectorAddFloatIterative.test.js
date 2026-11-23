import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vectorAddFloatIterative } from './vectorAddFloatIterative.js'

test('adds integer and fractional float64 vectors element-wise', () => {
	assert.deepEqual(vectorAddFloatIterative([1, 2, 3], [4, 5, 6]), [5, 7, 9])
	assert.deepEqual(
		vectorAddFloatIterative([1.5, -2.25, 0.125], [-0.5, 3.75, 0.875]),
		[1, 1.5, 1]
	)
})

test('preserves IEEE-754 float64 rounding semantics', () => {
	const res = vectorAddFloatIterative([0.1, 1e16], [0.2, 1])
	assert.equal(res[0], 0.1 + 0.2)
	assert.equal(res[1], 1e16 + 1)
})

test('handles single-element and empty vectors', () => {
	assert.deepEqual(vectorAddFloatIterative([], []), [])
	assert.deepEqual(vectorAddFloatIterative([42.5], [-42.5]), [0])
})

test('does not mutate inputs and supports same-reference arguments', () => {
	const a = [1.25, -3.5, 7.0]
	const b = [2.75, 1.5, -2.0]
	const out = vectorAddFloatIterative(a, b)

	assert.deepEqual(a, [1.25, -3.5, 7.0])
	assert.deepEqual(b, [2.75, 1.5, -2.0])
	assert.notEqual(out, a)
	assert.notEqual(out, b)

	const doubled = vectorAddFloatIterative(a, a)
	assert.deepEqual(doubled, [2.5, -7.0, 14.0])
})

test('handles signed zeros, subnormals, and extreme magnitudes', () => {
	const zeros = vectorAddFloatIterative([-0, -0, 0], [-0, 0, -0])
	assert.ok(Object.is(zeros[0], -0))
	assert.ok(Object.is(zeros[1], 0))
	assert.ok(Object.is(zeros[2], 0))

	const extremes = vectorAddFloatIterative(
		[Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE, Number.EPSILON],
		[Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE, 1]
	)
	assert.equal(extremes[0], Number.MIN_VALUE + Number.MIN_VALUE)
	assert.equal(extremes[1], Infinity)
	assert.equal(extremes[2], -Infinity)
	assert.equal(extremes[3], 1 + Number.EPSILON)
})

test('throws TypeError when arguments are not Arrays', () => {
	const invalidInputs = [null, undefined, 123, '123', {}, new Float64Array([1])]
	for (const bad of invalidInputs) {
		assert.throws(() => vectorAddFloatIterative(bad, [1]), TypeError)
		assert.throws(() => vectorAddFloatIterative([1], bad), TypeError)
	}
})

test('throws RangeError when vector lengths differ', () => {
	assert.throws(() => vectorAddFloatIterative([1, 2], [1]), RangeError)
	assert.throws(() => vectorAddFloatIterative([], [0]), RangeError)
	assert.throws(() => vectorAddFloatIterative([1], [1, 2, 3]), RangeError)
})

test('throws TypeError for non-number elements and sparse arrays', () => {
	assert.throws(() => vectorAddFloatIterative(['1'], [1]), TypeError)
	assert.throws(() => vectorAddFloatIterative([1], [null]), TypeError)
	assert.throws(() => vectorAddFloatIterative([undefined], [1]), TypeError)
	assert.throws(() => vectorAddFloatIterative([1n], [1]), TypeError)
	assert.throws(() => vectorAddFloatIterative([true], [1]), TypeError)

	const sparseA = new Array(2)
	sparseA[0] = 1
	assert.throws(() => vectorAddFloatIterative(sparseA, [1, 2]), TypeError)

	const sparseB = new Array(2)
	sparseB[1] = 2
	assert.throws(() => vectorAddFloatIterative([1, 2], sparseB), TypeError)
})

test('throws RangeError for non-finite float64 elements', () => {
	for (const nonFinite of [NaN, Infinity, -Infinity]) {
		assert.throws(() => vectorAddFloatIterative([nonFinite], [1]), RangeError)
		assert.throws(() => vectorAddFloatIterative([1], [nonFinite]), RangeError)
	}
})

test('independent cross-check: matches Float64Array reference across PRNG vectors and satisfies vector axioms', () => {
	// Deterministic Mulberry32 PRNG
	let seed = 0x12345678
	function nextFloat() {
		seed |= 0
		seed = (seed + 0x6d2b79f5) | 0
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		const u = ((t ^ (t >>> 14)) >>> 0) / 4294967296
		return (u - 0.5) * 1e6
	}

	const n = 2000
	const a = Array.from({ length: n }, () => nextFloat())
	const b = Array.from({ length: n }, () => nextFloat())
	const zeros = new Array(n).fill(0)
	const negA = a.map((x) => -x)

	// Independent Float64Array reference
	const fa = Float64Array.from(a)
	const fb = Float64Array.from(b)
	const expected = Array.from(fa, (v, i) => v + fb[i])

	const actual = vectorAddFloatIterative(a, b)
	assert.deepEqual(actual, expected)

	// Commutativity: a + b === b + a
	assert.deepEqual(vectorAddFloatIterative(b, a), actual)

	// Additive identity: a + 0 === a
	assert.deepEqual(vectorAddFloatIterative(a, zeros), a)

	// Additive inverse: a + (-a) === 0
	assert.deepEqual(vectorAddFloatIterative(a, negA), zeros)
})
