import { test } from 'node:test'
import assert from 'node:assert/strict'
import { productTypedSeries } from './productTypedSeries.js'

/**
 * Helper to assert two Float64Arrays are close within a relative/absolute tolerance.
 */
function assertCloseArray(actual, expected, relTol = 1e-13, absTol = 1e-15) {
	assert.ok(actual instanceof Float64Array, 'result should be a Float64Array')
	assert.equal(actual.length, expected.length, 'length mismatch')
	for (let i = 0; i < expected.length; i++) {
		const a = actual[i]
		const e = expected[i]
		if (Object.is(e, -0)) {
			assert.ok(Object.is(a, -0), `index ${i}: expected -0, got ${a}`)
			continue
		}
		if (e === 0) {
			assert.ok(Object.is(a, 0), `index ${i}: expected +0, got ${a}`)
			continue
		}
		if (!Number.isFinite(e)) {
			assert.equal(a, e, `index ${i}: expected ${e}, got ${a}`)
			continue
		}
		const diff = Math.abs(a - e)
		const tol = Math.max(absTol, relTol * Math.abs(e))
		assert.ok(
			diff <= tol,
			`index ${i}: expected ${e}, got ${a} (diff=${diff}, tol=${tol})`
		)
	}
}

test('normal cases: binary and multi-array element-wise products', () => {
	const a = new Float64Array([1, 2, -3, 4.5, 0.25])
	const b = new Float64Array([10, -5, -7, 2, 8])
	const out2 = productTypedSeries(a, b)
	assertCloseArray(out2, new Float64Array([10, -10, 21, 9, 2]))

	const c = new Float64Array([0.5, 3, -2, -1, 16])
	const out3 = productTypedSeries(a, b, c)
	assertCloseArray(out3, new Float64Array([5, -30, -42, -9, 32]))
})

test('normal cases: single Float64Array returns an independent copy', () => {
	const input = new Float64Array([1, -2.5, 0, -0, 128, 3.141592653589793])
	const out = productTypedSeries(input)
	assert.notEqual(out, input)
	assertCloseArray(out, input)
	input[0] = 999
	assert.equal(out[0], 1)
})

test('edge cases: empty Float64Array inputs', () => {
	const out1 = productTypedSeries(new Float64Array(0))
	assert.ok(out1 instanceof Float64Array)
	assert.equal(out1.length, 0)

	const out2 = productTypedSeries(new Float64Array(0), new Float64Array(0))
	assert.ok(out2 instanceof Float64Array)
	assert.equal(out2.length, 0)
})

test('edge cases: zeros and IEEE-754 signed zeros', () => {
	const a = new Float64Array([0, -0, 0, -0, 5, -5])
	const b = new Float64Array([5, 5, -5, -5, 0, -0])
	const out = productTypedSeries(a, b)
	assert.ok(Object.is(out[0], 0))
	assert.ok(Object.is(out[1], -0))
	assert.ok(Object.is(out[2], -0))
	assert.ok(Object.is(out[3], 0))
	assert.ok(Object.is(out[4], 0))
	assert.ok(Object.is(out[5], 0))

	// Zero followed by negative factor in a third array flips zero sign
	const c = new Float64Array([-1, -1, -1, -1, -1, -1])
	const out3 = productTypedSeries(a, b, c)
	assert.ok(Object.is(out3[0], -0))
	assert.ok(Object.is(out3[1], 0))
	assert.ok(Object.is(out3[2], 0))
	assert.ok(Object.is(out3[3], -0))
	assert.ok(Object.is(out3[4], -0))
	assert.ok(Object.is(out3[5], -0))
})

test('edge cases: exact powers of two, subnormals, and avoiding intermediate overflow/underflow', () => {
	// Powers of two should be exact
	const p1 = new Float64Array([0.5, 2, 1024, 2 ** -50, -0.125])
	const p2 = new Float64Array([4, 8, 2 ** -10, 2 ** 60, -16])
	const pout = productTypedSeries(p1, p2)
	assert.deepEqual(Array.from(pout), [2, 16, 1, 1024, 2])

	// Subnormal inputs: MIN_VALUE * 2^54 = 2^-1020, and 1e-315 * 1e305 = 1e-10
	const sub1 = new Float64Array([Number.MIN_VALUE, 1e-315])
	const sub2 = new Float64Array([2 ** 54, 1e305])
	const subOut = productTypedSeries(sub1, sub2)
	assertCloseArray(subOut, new Float64Array([2 ** -1020, 1e-10]), 1e-12)

	// Intermediate overflow avoided: 1e200 * 1e200 * 1e-200 = 1e200 (naive left-to-right overflows to Infinity)
	const big1 = new Float64Array([1e200, 1e-200, 1e300])
	const big2 = new Float64Array([1e200, 1e-200, 1e300])
	const big3 = new Float64Array([1e-200, 1e200, 1e300])
	const bigOut = productTypedSeries(big1, big2, big3)
	assertCloseArray(bigOut, new Float64Array([1e200, 1e-200, Infinity]), 1e-13)
})

test('cross-check: independent direct iterative multiplication over deterministic dataset', () => {
	// Deterministic LCG pseudo-random generator
	let state = 0x12345678
	function nextFloat() {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return (state / 0x100000000) * 10 - 5 // range [-5, 5)
	}

	const len = 64
	const numArrays = 6
	const inputs = Array.from({ length: numArrays }, () => {
		const arr = new Float64Array(len)
		for (let i = 0; i < len; i++) {
			arr[i] = nextFloat()
		}
		return arr
	})

	const actual = productTypedSeries(...inputs)

	// Independent reference: direct iterative multiplication
	const expected = new Float64Array(len)
	for (let i = 0; i < len; i++) {
		let prod = 1
		for (let a = 0; a < numArrays; a++) {
			prod *= inputs[a][i]
		}
		expected[i] = prod
	}

	assertCloseArray(actual, expected, 1e-13, 1e-15)
})

test('cross-check: independent exact BigInt product for integer inputs', () => {
	const intsA = [3, -7, 11, 13, 17, 19, 23, 29]
	const intsB = [5, 13, -17, 19, -23, 29, 31, 37]
	const intsC = [7, -19, 23, -29, 31, -37, 41, 43]
	const intsD = [2, 3, 5, 7, 11, 13, 17, 19]

	const actual = productTypedSeries(
		Float64Array.from(intsA),
		Float64Array.from(intsB),
		Float64Array.from(intsC),
		Float64Array.from(intsD)
	)

	for (let i = 0; i < intsA.length; i++) {
		const exact =
			BigInt(intsA[i]) * BigInt(intsB[i]) * BigInt(intsC[i]) * BigInt(intsD[i])
		assert.ok(
			Math.abs(actual[i] - Number(exact)) <= Math.abs(Number(exact)) * 1e-14,
			`index ${i}: expected ${exact}, got ${actual[i]}`
		)
	}
})

test('invalid inputs: throws TypeError or RangeError', () => {
	// Zero arguments
	assert.throws(() => productTypedSeries(), TypeError)

	// Non-Float64Array arguments
	assert.throws(() => productTypedSeries([1, 2, 3]), TypeError)
	assert.throws(() => productTypedSeries(new Float32Array([1, 2])), TypeError)
	assert.throws(() => productTypedSeries(new Int32Array([1, 2])), TypeError)
	assert.throws(() => productTypedSeries(new Float64Array([1]), null), TypeError)
	assert.throws(() => productTypedSeries(new Float64Array([1]), 'bad'), TypeError)

	// Mismatched lengths
	assert.throws(
		() => productTypedSeries(new Float64Array([1, 2]), new Float64Array([1])),
		RangeError
	)

	// Non-finite elements (NaN, Infinity, -Infinity)
	assert.throws(
		() => productTypedSeries(new Float64Array([1, NaN])),
		RangeError
	)
	assert.throws(
		() => productTypedSeries(new Float64Array([1, 2]), new Float64Array([1, Infinity])),
		RangeError
	)
	assert.throws(
		() => productTypedSeries(new Float64Array([-Infinity]), new Float64Array([1])),
		RangeError
	)
})
