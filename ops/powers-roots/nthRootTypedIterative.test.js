import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nthRootTypedIterative } from './nthRootTypedIterative.js'

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-15, label = '') {
	const diff = Math.abs(actual - expected)
	const bound = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= bound,
		`${label ? label + ': ' : ''}expected ${actual} to be within ${bound} of ${expected} (diff=${diff})`,
	)
}

test('normal cases: exact positive integer roots', () => {
	const values = new Float64Array([1, 4, 16, 27, 64, 1000, 16, 243, 729, 128, 1024, 1e15, 1e-15])
	const degrees = new Float64Array([5, 2, 2, 3, 3, 3, 4, 5, 6, 7, 10, 5, 5])
	const expected = [1, 2, 4, 3, 4, 10, 2, 3, 3, 2, 2, 1000, 0.001]

	const result = nthRootTypedIterative(values, degrees)
	assert.ok(result instanceof Float64Array)
	assert.equal(result.length, expected.length)

	for (let i = 0; i < expected.length; i++) {
		assert.equal(result[i], expected[i], `mismatch at index ${i}`)
	}
})

test('normal cases: negative radicands with odd integer degrees and negative degrees', () => {
	const values = new Float64Array([-1, -8, -27, -32, -8, -1, 8, 16, 4, -4])
	const degrees = new Float64Array([5, 3, 3, 5, -3, -3, -3, -4, -1, -1])
	const expected = [-1, -2, -3, -2, -0.5, -1, 0.5, 0.5, 0.25, -0.25]

	const result = nthRootTypedIterative(values, degrees)
	for (let i = 0; i < expected.length; i++) {
		assert.equal(result[i], expected[i], `mismatch at index ${i}`)
	}
})

test('normal cases: fractional degrees both below and above 1', () => {
	const values = new Float64Array([9, 4, 27, 1024, 128, 2])
	const degrees = new Float64Array([0.5, 0.25, 1.5, 2.5, 3.5, 0.01])
	const expected = [81, 256, 9, 16, 4, Math.pow(2, 100)]

	const result = nthRootTypedIterative(values, degrees)
	for (let i = 0; i < expected.length; i++) {
		assert.equal(result[i], expected[i], `mismatch at index ${i}`)
	}
})

test('immutability, aliasing, and subarray views', () => {
	const values = new Float64Array([1, 4, 27, 256])
	const degrees = new Float64Array([1, 2, 3, 4])
	const valuesSnapshot = new Float64Array(values)
	const degreesSnapshot = new Float64Array(degrees)

	const out = nthRootTypedIterative(values, degrees)
	assert.notEqual(out, values)
	assert.notEqual(out, degrees)
	assert.deepEqual(values, valuesSnapshot)
	assert.deepEqual(degrees, degreesSnapshot)
	assert.deepEqual(out, new Float64Array([1, 2, 3, 4]))

	// Aliased inputs (same Float64Array instance for both parameters)
	const aliased = new Float64Array([1, 4, 27])
	const aliasedOut = nthRootTypedIterative(aliased, aliased)
	assertClose(aliasedOut[0], 1)
	assertClose(aliasedOut[1], Math.pow(4, 1 / 4))
	assertClose(aliasedOut[2], Math.pow(27, 1 / 27))

	// Subarray views with non-zero byteOffset
	const backingX = new Float64Array([999, 8, 16, 32, 999])
	const backingN = new Float64Array([999, 3, 4, 5, 999])
	const viewOut = nthRootTypedIterative(backingX.subarray(1, 4), backingN.subarray(1, 4))
	assert.deepEqual(viewOut, new Float64Array([2, 2, 2]))
})

test('edge cases: empty Float64Array inputs', () => {
	const out = nthRootTypedIterative(new Float64Array(0), new Float64Array(0))
	assert.ok(out instanceof Float64Array)
	assert.equal(out.length, 0)
})

test('edge cases: zero, negative zero, degree 0, degree +-1, and domain NaNs', () => {
	const values = new Float64Array([
		0, -0, -0, 0, -0, -0,
		5, 5, -9, -16, -8, -8,
		5, -5, -0, 0,
	])
	const degrees = new Float64Array([
		3, 3, 2, -3, -3, -2,
		0, -0, 2, 4, 2.5, -2,
		1, 1, 1, -1,
	])

	const out = nthRootTypedIterative(values, degrees)

	assert.ok(Object.is(out[0], 0))
	assert.ok(Object.is(out[1], -0))
	assert.ok(Object.is(out[2], 0))
	assert.equal(out[3], Infinity)
	assert.equal(out[4], -Infinity)
	assert.equal(out[5], Infinity)

	assert.ok(Number.isNaN(out[6]), 'n = 0 should yield NaN')
	assert.ok(Number.isNaN(out[7]), 'n = -0 should yield NaN')
	assert.ok(Number.isNaN(out[8]), 'negative x with even n = 2 should yield NaN')
	assert.ok(Number.isNaN(out[9]), 'negative x with even n = 4 should yield NaN')
	assert.ok(Number.isNaN(out[10]), 'negative x with non-integer n should yield NaN')
	assert.ok(Number.isNaN(out[11]), 'negative x with negative even n should yield NaN')

	assert.equal(out[12], 5)
	assert.equal(out[13], -5)
	assert.ok(Object.is(out[14], -0))
	assert.equal(out[15], Infinity)
})

test('edge cases: infinities, NaN propagation, and extreme scales', () => {
	const values = new Float64Array([
		Infinity, Infinity, -Infinity, -Infinity, -Infinity,
		5, 5, 0, 0, Infinity, -5,
		NaN, 8, 1e300, 1e-300,
	])
	const degrees = new Float64Array([
		3, -3, 3, -3, 2,
		Infinity, -Infinity, Infinity, -Infinity, Infinity, Infinity,
		3, NaN, 3, -3,
	])

	const out = nthRootTypedIterative(values, degrees)

	assert.equal(out[0], Infinity)
	assert.ok(Object.is(out[1], 0))
	assert.equal(out[2], -Infinity)
	assert.ok(Object.is(out[3], -0))
	assert.ok(Number.isNaN(out[4]))

	assert.equal(out[5], 1)
	assert.equal(out[6], 1)
	assert.equal(out[7], 0)
	assert.equal(out[8], Infinity)
	assert.ok(Number.isNaN(out[9]))
	assert.ok(Number.isNaN(out[10]))

	assert.ok(Number.isNaN(out[11]))
	assert.ok(Number.isNaN(out[12]))
	assertClose(out[13], 1e100, 1e-14)
	assertClose(out[14], 1e100, 1e-14)
})

test('input validation: throws TypeError and RangeError on invalid arguments', () => {
	const valid = new Float64Array([1, 2, 3])

	// Invalid `values` type
	for (const bad of [[1, 2, 3], new Float32Array([1, 2, 3]), new Int32Array([1, 2, 3]), 42, 'abc', null, undefined, {}]) {
		assert.throws(() => nthRootTypedIterative(bad, valid), TypeError)
	}

	// Invalid `degrees` type
	for (const bad of [[1, 2, 3], new Float32Array([1, 2, 3]), new Uint8Array([1, 2, 3]), 3, '3', null, undefined, {}]) {
		assert.throws(() => nthRootTypedIterative(valid, bad), TypeError)
	}

	// Mismatched lengths
	assert.throws(
		() => nthRootTypedIterative(new Float64Array([1, 2]), new Float64Array([1, 2, 3])),
		RangeError,
	)
	assert.throws(
		() => nthRootTypedIterative(new Float64Array([1]), new Float64Array(0)),
		RangeError,
	)
})

test('cross-check 1: inverse power identity (nthRoot(x, n)^n === x) and log-exp formula', () => {
	const values = new Float64Array([0.001, 0.25, 0.7, 2, Math.PI, 17.5, 1234.5678, 1e12, -7.5, -125.5])
	const degrees = new Float64Array([4, 3, 5, 7, 6, 11, 9, 13, 3, 5])

	const roots = nthRootTypedIterative(values, degrees)

	for (let i = 0; i < values.length; i++) {
		const x = values[i]
		const n = degrees[i]
		const r = roots[i]

		// Inverse operation: r^n should recover x
		const reconstructed = Math.pow(r, n)
		assertClose(reconstructed, x, 1e-12, 1e-15, `inverse check at i=${i}`)

		// Analytical log-exp identity for positive x: x^(1/n) = exp(ln(x) / n)
		if (x > 0) {
			const analytical = Math.exp(Math.log(x) / n)
			assertClose(r, analytical, 1e-13, 1e-15, `exp(ln(x)/n) check at i=${i}`)
		}
	}
})

test('cross-check 2: algebraic nested-root and product identities', () => {
	const xs = new Float64Array([0.5, 2.5, 12, 81.3, 1000])
	const ys = new Float64Array([3.2, 4.1, 7.7, 0.125, 25])
	const a = new Float64Array([2, 3, 4, 5, 3])
	const b = new Float64Array([3, 5, 2, 2, 7])
	const ab = new Float64Array(xs.length)
	const prod = new Float64Array(xs.length)
	for (let i = 0; i < xs.length; i++) {
		ab[i] = a[i] * b[i]
		prod[i] = xs[i] * ys[i]
	}

	// Nested root identity: nthRoot(nthRoot(x, a), b) === nthRoot(x, a * b)
	const nested = nthRootTypedIterative(nthRootTypedIterative(xs, a), b)
	const direct = nthRootTypedIterative(xs, ab)
	for (let i = 0; i < xs.length; i++) {
		assertClose(nested[i], direct[i], 1e-13, 1e-15, `nested root identity at i=${i}`)
	}

	// Product identity: nthRoot(x * y, a) === nthRoot(x, a) * nthRoot(y, a)
	const rootProd = nthRootTypedIterative(prod, a)
	const rootX = nthRootTypedIterative(xs, a)
	const rootY = nthRootTypedIterative(ys, a)
	for (let i = 0; i < xs.length; i++) {
		assertClose(rootProd[i], rootX[i] * rootY[i], 1e-13, 1e-15, `product identity at i=${i}`)
	}
})

test('cross-check 3: independent bisection root-finder reference', () => {
	function bisectionNthRoot(x, n) {
		let lo = 0
		let hi = Math.max(1, x)
		for (let iter = 0; iter < 120; iter++) {
			const mid = lo + (hi - lo) / 2
			let p = 1
			for (let k = 0; k < n; k++) {
				p *= mid
			}
			if (p < x) {
				lo = mid
			} else {
				hi = mid
			}
		}
		return lo + (hi - lo) / 2
	}

	const values = new Float64Array([0.01, 0.5, 2, 10, 99.9, 5000])
	const degrees = new Float64Array([2, 3, 5, 4, 7, 6])
	const actual = nthRootTypedIterative(values, degrees)

	for (let i = 0; i < values.length; i++) {
		const ref = bisectionNthRoot(values[i], degrees[i])
		assertClose(actual[i], ref, 1e-13, 1e-15, `bisection cross-check at i=${i}`)
	}
})
