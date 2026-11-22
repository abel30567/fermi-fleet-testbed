import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lnTypedIterative } from './lnTypedIterative.js'

/**
 * Independent reference implementation of natural logarithm using binary range
 * reduction and the hyperbolic arctangent series:
 *   ln(m) = 2 * sum_{j=0}^{inf} u^(2j+1) / (2j+1), where u = (m - 1) / (m + 1)
 *   ln(m * 2^k) = ln(m) + k * ln(2)
 * Does not call Math.log, Math.log2, or Math.log10.
 */
function referenceLnSeries(x) {
	let m = x
	let k = 0
	const TWO_50 = 1125899906842624 // 2^50
	const INV_TWO_50 = 1 / TWO_50

	while (m >= TWO_50) {
		m *= INV_TWO_50
		k += 50
	}
	while (m < INV_TWO_50) {
		m *= TWO_50
		k -= 50
	}
	while (m > Math.SQRT2) {
		m *= 0.5
		k += 1
	}
	while (m < Math.SQRT1_2) {
		m *= 2
		k -= 1
	}

	const u = (m - 1) / (m + 1)
	const u2 = u * u
	let term = u
	let sum = term
	for (let j = 1; j <= 30; j++) {
		term *= u2
		const delta = term / (2 * j + 1)
		sum += delta
		if (Math.abs(delta) <= 1e-17 * Math.abs(sum)) break
	}
	return 2 * sum + k * Math.LN2
}

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-15, label = '') {
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= limit,
		`${label ? label + ': ' : ''}expected ${actual} to be within ${limit} of ${expected} (diff=${diff})`
	)
}

test('normal cases: known analytic values', () => {
	const input = new Float64Array([
		1,
		Math.E,
		Math.E ** 2,
		Math.E ** -3,
		2,
		0.5,
		10,
		Math.SQRT2,
	])
	const expected = [
		0,
		1,
		2,
		-3,
		Math.LN2,
		-Math.LN2,
		Math.LN10,
		Math.LN2 / 2,
	]

	const out = lnTypedIterative(input)

	assert.ok(out instanceof Float64Array)
	assert.equal(out.length, input.length)
	assert.notEqual(out, input)
	assert.ok(Object.is(out[0], 0), 'ln(1) should be +0')
	for (let i = 0; i < expected.length; i++) {
		assertClose(out[i], expected[i], 1e-14, 1e-15, `index ${i}`)
	}
})

test('normal cases: does not mutate input array and supports subarray views', () => {
	const backing = new Float64Array([99, 1, Math.E, 4, 16, 88])
	const view = backing.subarray(1, 5)
	const snapshot = new Float64Array(backing)

	const out = lnTypedIterative(view)

	assert.ok(out instanceof Float64Array)
	assert.equal(out.length, 4)
	assert.deepEqual(backing, snapshot)
	assertClose(out[0], 0, 1e-15, 1e-15)
	assertClose(out[1], 1, 1e-15, 1e-15)
	assertClose(out[2], 2 * Math.LN2, 1e-14, 1e-15)
	assertClose(out[3], 4 * Math.LN2, 1e-14, 1e-15)
})

test('edge cases: empty Float64Array', () => {
	const input = new Float64Array(0)
	const out = lnTypedIterative(input)

	assert.ok(out instanceof Float64Array)
	assert.equal(out.length, 0)
	assert.notEqual(out, input)
})

test('edge cases: boundary values near 1, subnormals, and extremes', () => {
	const input = new Float64Array([
		1,
		1 + Number.EPSILON,
		1 - Number.EPSILON / 2,
		Number.MIN_VALUE,
		Number.MAX_VALUE,
	])
	const out = lnTypedIterative(input)

	assert.ok(Object.is(out[0], 0))
	assertClose(out[1], Number.EPSILON, 1e-12, 1e-18, 'ln(1 + EPSILON)')
	assertClose(out[2], -Number.EPSILON / 2, 1e-12, 1e-18, 'ln(1 - EPSILON/2)')
	// Number.MIN_VALUE === 2^-1074 => ln(2^-1074) = -1074 * ln(2)
	assertClose(out[3], -1074 * Math.LN2, 1e-14, 1e-15, 'ln(MIN_VALUE)')
	// Number.MAX_VALUE === (2 - 2^-52) * 2^1023 => ln(MAX_VALUE) ≈ 1024 * ln(2)
	assertClose(out[4], 1024 * Math.LN2, 1e-14, 1e-15, 'ln(MAX_VALUE)')
})

test('edge cases: IEEE-754 special values (+0, -0, negatives, +/-Infinity, NaN)', () => {
	const input = new Float64Array([
		0,
		-0,
		-1,
		-1e-300,
		-Number.MAX_VALUE,
		-Infinity,
		Infinity,
		NaN,
	])
	const out = lnTypedIterative(input)

	assert.equal(out[0], -Infinity)
	assert.equal(out[1], -Infinity)
	assert.ok(Number.isNaN(out[2]))
	assert.ok(Number.isNaN(out[3]))
	assert.ok(Number.isNaN(out[4]))
	assert.ok(Number.isNaN(out[5]))
	assert.equal(out[6], Infinity)
	assert.ok(Number.isNaN(out[7]))
})

test('edge cases: invalid input validation errors', () => {
	const invalidInputs = [
		undefined,
		null,
		[1, 2, 3],
		new Float32Array([1, 2]),
		new Int32Array([1, 2]),
		new Uint8Array([1, 2]),
		new BigInt64Array([1n, 2n]),
		new ArrayBuffer(16),
		new DataView(new ArrayBuffer(16)),
		Math.E,
		'1',
		true,
		Symbol('x'),
		{ length: 2, 0: 1, 1: 2 },
	]

	assert.throws(() => lnTypedIterative(), TypeError)
	for (const bad of invalidInputs) {
		assert.throws(() => lnTypedIterative(bad), TypeError)
	}

	if (typeof ArrayBuffer.prototype.transfer === 'function') {
		const buf = new ArrayBuffer(16)
		const arr = new Float64Array(buf)
		buf.transfer()
		assert.throws(() => lnTypedIterative(arr), TypeError)
	}
})

test('cross-check: inverse relationship with Math.exp', () => {
	const positiveValues = new Float64Array([
		1e-100, 1e-10, 0.001, 0.1, 0.5, 0.9999, 1, 1.0001, 2.5, 7.389, 100, 1e50, 1e200,
	])
	const logs = lnTypedIterative(positiveValues)
	for (let i = 0; i < positiveValues.length; i++) {
		assertClose(Math.exp(logs[i]), positiveValues[i], 1e-13, 1e-300, `exp(ln(${positiveValues[i]}))`)
	}

	const exponents = new Float64Array([-500, -50, -1, -0.25, 0, 0.25, 1, 10, 50, 500])
	const expValues = new Float64Array(exponents.length)
	for (let i = 0; i < exponents.length; i++) {
		expValues[i] = Math.exp(exponents[i])
	}
	const roundTrip = lnTypedIterative(expValues)
	for (let i = 0; i < exponents.length; i++) {
		assertClose(roundTrip[i], exponents[i], 1e-13, 1e-14, `ln(exp(${exponents[i]}))`)
	}
})

test('cross-check: algebraic logarithm identities (product, quotient, power, change-of-base)', () => {
	const a = new Float64Array([0.125, 0.7, 2.5, 13.7, 420.5, 1e12])
	const b = new Float64Array([0.33, 1.9, 3.14159, 0.05, 8.25, 1e-5])
	const prod = new Float64Array(a.length)
	const quot = new Float64Array(a.length)
	const pow3 = new Float64Array(a.length)
	for (let i = 0; i < a.length; i++) {
		prod[i] = a[i] * b[i]
		quot[i] = a[i] / b[i]
		pow3[i] = a[i] ** 3
	}

	const lnA = lnTypedIterative(a)
	const lnB = lnTypedIterative(b)
	const lnProd = lnTypedIterative(prod)
	const lnQuot = lnTypedIterative(quot)
	const lnPow3 = lnTypedIterative(pow3)

	for (let i = 0; i < a.length; i++) {
		assertClose(lnProd[i], lnA[i] + lnB[i], 1e-13, 1e-14, `product rule [${i}]`)
		assertClose(lnQuot[i], lnA[i] - lnB[i], 1e-13, 1e-14, `quotient rule [${i}]`)
		assertClose(lnPow3[i], 3 * lnA[i], 1e-13, 1e-14, `power rule [${i}]`)
		assertClose(lnA[i], Math.log10(a[i]) * Math.LN10, 1e-13, 1e-14, `log10 base change [${i}]`)
		assertClose(lnA[i], Math.log2(a[i]) * Math.LN2, 1e-13, 1e-14, `log2 base change [${i}]`)
	}
})

test('cross-check: independent range-reduced atanh series implementation', () => {
	const samples = new Float64Array([
		Number.MIN_VALUE,
		1e-300,
		1e-50,
		1e-6,
		0.25,
		0.7071067811865475,
		0.999999,
		1,
		1.000001,
		1.4142135623730951,
		Math.PI,
		100,
		1e20,
		1e150,
		Number.MAX_VALUE,
	])

	const actual = lnTypedIterative(samples)
	for (let i = 0; i < samples.length; i++) {
		const ref = referenceLnSeries(samples[i])
		assertClose(actual[i], ref, 1e-14, 1e-15, `series ref for x=${samples[i]}`)
	}
})

test('large input array stress test', () => {
	const n = 10000
	const input = new Float64Array(n)
	for (let i = 0; i < n; i++) {
		input[i] = (i + 1) * 0.125
	}
	const out = lnTypedIterative(input)
	assert.equal(out.length, n)
	for (let i = 0; i < n; i++) {
		assertClose(Math.exp(out[i]), input[i], 1e-13, 1e-15, `large[${i}]`)
	}
})
