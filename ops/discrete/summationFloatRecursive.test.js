import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summationFloatRecursive } from './summationFloatRecursive.js'

/**
 * Independent reference: Neumaier compensated summation for float64 cross-checks.
 * @param {readonly number[] | Float64Array} values
 * @returns {number}
 */
function neumaierSum(values) {
	let sum = 0
	let compensation = 0
	for (let i = 0; i < values.length; i++) {
		const x = values[i]
		const t = sum + x
		if (Math.abs(sum) >= Math.abs(x)) {
			compensation += (sum - t) + x
		} else {
			compensation += (x - t) + sum
		}
		sum = t
	}
	return sum + compensation
}

test('normal cases: small arrays of positive, negative, and fractional numbers', () => {
	assert.equal(summationFloatRecursive([1, 2, 3, 4]), 10)
	assert.equal(summationFloatRecursive([-1, -2, -3, -4]), -10)
	assert.equal(summationFloatRecursive([1.5, -0.5, 2.25, -3.25]), 0)
	assert.equal(summationFloatRecursive([0.25, 0.5, 0.125, 0.125]), 1)
})

test('normal cases: supports Float64Array inputs', () => {
	const arr = new Float64Array([1.5, 2.5, 3.0, -2.0, 5.0])
	assert.equal(summationFloatRecursive(arr), 10)
	assert.equal(summationFloatRecursive(new Float64Array(0)), 0)
	assert.equal(summationFloatRecursive(new Float64Array([-42.5])), -42.5)
})

test('normal cases: exercises odd and even divide-and-conquer split sizes', () => {
	for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 15, 16, 17, 31, 32, 33, 127, 128, 129]) {
		const values = Array.from({ length: n }, (_, i) => i + 1)
		const expected = (n * (n + 1)) / 2
		assert.equal(summationFloatRecursive(values), expected)
	}
})

test('edge cases: empty array, single element, and signed zero semantics', () => {
	assert.ok(Object.is(summationFloatRecursive([]), 0))
	assert.equal(summationFloatRecursive([7.25]), 7.25)
	assert.ok(Object.is(summationFloatRecursive([-0]), -0))
	assert.ok(Object.is(summationFloatRecursive([-0, -0]), -0))
	assert.ok(Object.is(summationFloatRecursive([-0, -0, -0]), -0))
	assert.ok(Object.is(summationFloatRecursive([-0, 0]), 0))
	assert.ok(Object.is(summationFloatRecursive([0, -0]), 0))
})

test('edge cases: IEEE-754 special values (NaN, Infinity, -Infinity, subnormals, overflow)', () => {
	assert.ok(Number.isNaN(summationFloatRecursive([NaN])))
	assert.ok(Number.isNaN(summationFloatRecursive([1, 2, NaN, 4])))
	assert.equal(summationFloatRecursive([1, Infinity, 2]), Infinity)
	assert.equal(summationFloatRecursive([1, -Infinity, 2]), -Infinity)
	assert.ok(Number.isNaN(summationFloatRecursive([Infinity, -Infinity])))
	assert.equal(summationFloatRecursive([Number.MAX_VALUE, Number.MAX_VALUE]), Infinity)
	assert.equal(summationFloatRecursive([-Number.MAX_VALUE, -Number.MAX_VALUE]), -Infinity)

	// Subnormal numbers
	const subnormals = Array.from({ length: 16 }, () => Number.MIN_VALUE)
	assert.equal(summationFloatRecursive(subnormals), 16 * Number.MIN_VALUE)
})

test('invalid inputs: rejects non-array / non-Float64Array containers', () => {
	const invalidContainers = [
		null,
		undefined,
		42,
		'123',
		true,
		{},
		{ length: 2, 0: 1, 1: 2 },
		new Int32Array([1, 2, 3]),
		new Set([1, 2, 3]),
	]
	for (const input of invalidContainers) {
		assert.throws(() => summationFloatRecursive(input), TypeError)
	}
})

test('invalid inputs: rejects non-number elements and sparse arrays', () => {
	assert.throws(() => summationFloatRecursive([1, '2', 3]), TypeError)
	assert.throws(() => summationFloatRecursive([1, null, 3]), TypeError)
	assert.throws(() => summationFloatRecursive([1, undefined, 3]), TypeError)
	assert.throws(() => summationFloatRecursive([1, 2n, 3]), TypeError)
	assert.throws(() => summationFloatRecursive([true, false]), TypeError)
	assert.throws(() => summationFloatRecursive([1, {}, 3]), TypeError)

	// Sparse array with holes
	// eslint-disable-next-line no-sparse-arrays
	const sparse = [1, , 3]
	assert.throws(() => summationFloatRecursive(sparse), TypeError)
	assert.throws(() => summationFloatRecursive(new Array(4)), TypeError)
})

test('cross-check: closed-form arithmetic, square, and dyadic geometric series', () => {
	// Sum of squares: sum_{k=1}^{n} k^2 = n(n+1)(2n+1)/6
	const n = 200
	const squares = Array.from({ length: n }, (_, i) => (i + 1) ** 2)
	assert.equal(summationFloatRecursive(squares), (n * (n + 1) * (2 * n + 1)) / 6)

	// Exact dyadic geometric series: sum_{k=0}^{51} 2^{-k} = 2 - 2^{-51}
	const dyadic = Array.from({ length: 52 }, (_, k) => 2 ** -k)
	assert.equal(summationFloatRecursive(dyadic), 2 - 2 ** -51)

	// Telescoping series with exact dyadic values: sum_{k=1}^{1024} (k^2 - (k-1)^2) = 1024^2
	const telescoping = Array.from({ length: 1024 }, (_, i) => {
		const k = i + 1
		return k * k - (k - 1) * (k - 1)
	})
	assert.equal(summationFloatRecursive(telescoping), 1024 * 1024)
})

test('cross-check: matches Neumaier compensated sum and beats naive left-to-right accuracy on large arrays', () => {
	// 100,000 copies of 0.1: exact value is 10000
	const count = 100_000
	const tenths = new Float64Array(count).fill(0.1)

	const recursiveResult = summationFloatRecursive(tenths)
	const neumaierResult = neumaierSum(tenths)

	let naiveResult = 0
	for (let i = 0; i < count; i++) {
		naiveResult += tenths[i]
	}

	const exact = 10_000
	const recursiveErr = Math.abs(recursiveResult - exact)
	const naiveErr = Math.abs(naiveResult - exact)

	// Pairwise divide-and-conquer should stay extremely close to exact & Neumaier
	assert.ok(recursiveErr < 1e-10, `expected recursiveErr < 1e-10, got ${recursiveErr}`)
	assert.ok(
		Math.abs(recursiveResult - neumaierResult) < 1e-10,
		`expected recursive and neumaier sums to agree within 1e-10`
	)
	// And strictly more accurate than naive sequential summation on this workload
	assert.ok(
		recursiveErr < naiveErr,
		`expected pairwise error (${recursiveErr}) < naive error (${naiveErr})`
	)
})

test('cross-check: deterministic pseudo-random float64 array vs Neumaier reference and linearity', () => {
	// Deterministic LCG generating floats in [-100, 100]
	let state = 0x12345678
	const values = new Float64Array(4096)
	for (let i = 0; i < values.length; i++) {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		values[i] = (state / 0xffffffff) * 200 - 100
	}

	const actual = summationFloatRecursive(values)
	const expected = neumaierSum(values)
	assert.ok(
		Math.abs(actual - expected) <= 1e-10,
		`expected |${actual} - ${expected}| <= 1e-10`
	)

	// Exact scaling by power of 2 (only shifts exponent in IEEE-754)
	const scaled = values.map((v) => v * 4)
	assert.equal(summationFloatRecursive(scaled), actual * 4)

	// Exact negation
	const negated = values.map((v) => -v)
	assert.equal(summationFloatRecursive(negated), -actual)
})
