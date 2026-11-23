import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summationFloatIterative } from './summationFloatIterative.js'

test('sums basic positive, negative, and mixed float64 arrays', () => {
	assert.equal(summationFloatIterative([1, 2, 3, 4]), 10)
	assert.equal(summationFloatIterative([-5, -2.5, -1.25]), -8.75)
	assert.equal(summationFloatIterative([-10, 3.5, 6.5]), 0)
	assert.equal(summationFloatIterative([0.25, 0.5, 0.125]), 0.875)
})

test('handles empty and single-element inputs', () => {
	assert.equal(summationFloatIterative([]), 0)
	assert.equal(summationFloatIterative(new Float64Array(0)), 0)
	assert.equal(summationFloatIterative([42.5]), 42.5)
	assert.equal(summationFloatIterative([-0]), 0)
})

test('accepts non-array iterables (Float64Array, Set, generator)', () => {
	assert.equal(summationFloatIterative(new Float64Array([1.5, 2.5, 3.0])), 7)
	assert.equal(summationFloatIterative(new Set([2, 4, 8, 16])), 30)

	function* gen() {
		yield 0.5
		yield 1.5
		yield 2.5
	}
	assert.equal(summationFloatIterative(gen()), 4.5)
})

test('handles IEEE-754 float64 edge cases (subnormals, overflow, left-to-right order)', () => {
	assert.equal(
		summationFloatIterative([Number.MIN_VALUE, Number.MIN_VALUE]),
		2 * Number.MIN_VALUE,
	)
	assert.equal(
		summationFloatIterative([Number.MAX_VALUE, Number.MAX_VALUE]),
		Infinity,
	)
	assert.equal(
		summationFloatIterative([-Number.MAX_VALUE, -Number.MAX_VALUE]),
		-Infinity,
	)
	assert.equal(summationFloatIterative([0.1, 0.2]), 0.1 + 0.2)
	// Left-to-right iterative accumulation absorbs 1 into 1e16 before subtracting 1e16
	assert.equal(summationFloatIterative([1e16, 1, -1e16]), 0)
	assert.equal(summationFloatIterative([1e16, -1e16, 1]), 1)
})

test('rejects invalid container inputs with TypeError', () => {
	const invalidContainers = [null, undefined, 42, true, {}, '123']
	for (const input of invalidContainers) {
		assert.throws(() => summationFloatIterative(input), TypeError)
	}
})

test('rejects non-number elements and sparse arrays with TypeError', () => {
	assert.throws(() => summationFloatIterative([1, '2', 3]), TypeError)
	assert.throws(() => summationFloatIterative([1, null]), TypeError)
	assert.throws(() => summationFloatIterative([1, undefined]), TypeError)
	assert.throws(() => summationFloatIterative([1, 2n]), TypeError)
	assert.throws(() => summationFloatIterative([1, {}]), TypeError)
	// Sparse array yields undefined at the hole
	// eslint-disable-next-line no-sparse-arrays
	assert.throws(() => summationFloatIterative([1, , 3]), TypeError)
})

test('rejects non-finite float64 elements (NaN, Infinity, -Infinity) with RangeError', () => {
	assert.throws(() => summationFloatIterative([NaN]), RangeError)
	assert.throws(() => summationFloatIterative([1, NaN, 2]), RangeError)
	assert.throws(() => summationFloatIterative([1, Infinity]), RangeError)
	assert.throws(() => summationFloatIterative([-Infinity, 1]), RangeError)
})

test('cross-check: arithmetic series closed form sum_{k=1}^n k = n(n+1)/2', () => {
	const n = 1000
	const terms = Array.from({ length: n }, (_, i) => i + 1)
	const expected = (n * (n + 1)) / 2
	assert.equal(summationFloatIterative(terms), expected)

	// General arithmetic progression: a + k*d for k = 0..m-1
	const m = 200
	const a = -3.25
	const d = 0.75
	const apTerms = Array.from({ length: m }, (_, k) => a + k * d)
	const apExpected = (m / 2) * (2 * a + (m - 1) * d)
	assert.equal(summationFloatIterative(apTerms), apExpected)
})

test('cross-check: geometric series closed form (exact dyadic and general ratio)', () => {
	// Exact in IEEE-754 binary64: sum_{k=0}^{n-1} (1/2)^k = 2 - 2^{-(n-1)}
	const nDyadic = 40
	const dyadicTerms = Array.from({ length: nDyadic }, (_, k) => 2 ** -k)
	const dyadicExpected = 2 - 2 ** -(nDyadic - 1)
	assert.equal(summationFloatIterative(dyadicTerms), dyadicExpected)

	// General geometric series: sum_{k=0}^{n-1} a * r^k = a * (1 - r^n) / (1 - r)
	const n = 30
	const a = 3.5
	const r = 1 / 3
	const geomTerms = Array.from({ length: n }, (_, k) => a * r ** k)
	const geomExpected = (a * (1 - r ** n)) / (1 - r)
	assert.ok(
		Math.abs(summationFloatIterative(geomTerms) - geomExpected) < 1e-12,
	)
})

test('cross-check: sum of squares and telescoping series closed forms', () => {
	// sum_{k=1}^n k^2 = n(n+1)(2n+1)/6
	const n = 100
	const squares = Array.from({ length: n }, (_, i) => (i + 1) ** 2)
	const expectedSquares = (n * (n + 1) * (2 * n + 1)) / 6
	assert.equal(summationFloatIterative(squares), expectedSquares)

	// Telescoping series: sum_{k=1}^m (1/k - 1/(k+1)) = 1 - 1/(m+1)
	const m = 500
	const telescoping = Array.from(
		{ length: m },
		(_, i) => 1 / (i + 1) - 1 / (i + 2),
	)
	const expectedTelescoping = 1 - 1 / (m + 1)
	assert.ok(
		Math.abs(summationFloatIterative(telescoping) - expectedTelescoping) <
			1e-12,
	)
})
