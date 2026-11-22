import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cosTypedIterative } from './cosTypedIterative.js'

const EPS = 1e-12

function assertClose(actual, expected, eps = EPS, message) {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		message ?? `Expected ${actual} to be within ${eps} of ${expected}`
	)
}

/**
 * Independent cosine approximation via Maclaurin series:
 * cos(x) = sum_{k=0..terms} (-1)^k * x^(2k) / (2k)!
 * Accurate to full IEEE 754 double precision for |x| <= pi with 20 terms.
 */
function cosMaclaurin(x, terms = 20) {
	let sum = 1
	let term = 1
	const x2 = x * x
	for (let k = 1; k <= terms; k++) {
		term = (-term * x2) / ((2 * k - 1) * (2 * k))
		sum += term
	}
	return sum
}

test('cosTypedIterative: canonical angles and non-mutation', () => {
	const input = new Float64Array([
		0,
		Math.PI / 6,
		Math.PI / 4,
		Math.PI / 3,
		Math.PI / 2,
		Math.PI,
		(3 * Math.PI) / 2,
		2 * Math.PI,
		-Math.PI / 3,
		-Math.PI,
	])
	const snapshot = new Float64Array(input)
	const expected = [
		1,
		Math.sqrt(3) / 2,
		Math.SQRT1_2,
		0.5,
		0,
		-1,
		0,
		1,
		0.5,
		-1,
	]

	const result = cosTypedIterative(input)

	assert.ok(result instanceof Float64Array)
	assert.notEqual(result, input)
	assert.equal(result.length, input.length)
	for (let i = 0; i < expected.length; i++) {
		assertClose(result[i], expected[i], 1e-15, `Mismatch at index ${i}`)
	}
	assert.deepEqual(input, snapshot)
})

test('cosTypedIterative: supports optional out buffer and in-place operation', () => {
	const input = new Float64Array([0, Math.PI / 3, Math.PI])
	const out = new Float64Array(3)
	const returned = cosTypedIterative(input, out)

	assert.equal(returned, out)
	assertClose(out[0], 1, 1e-15)
	assertClose(out[1], 0.5, 1e-15)
	assertClose(out[2], -1, 1e-15)

	// In-place: out === input
	const buf = new Float64Array([0, Math.PI / 3, Math.PI])
	const inPlaceReturned = cosTypedIterative(buf, buf)
	assert.equal(inPlaceReturned, buf)
	assertClose(buf[0], 1, 1e-15)
	assertClose(buf[1], 0.5, 1e-15)
	assertClose(buf[2], -1, 1e-15)
})

test('cosTypedIterative: handles subarray views with non-zero byteOffset', () => {
	const backing = new Float64Array([999, 0, Math.PI / 3, Math.PI, 888])
	const view = backing.subarray(1, 4)
	const result = cosTypedIterative(view)

	assert.equal(result.length, 3)
	assertClose(result[0], 1, 1e-15)
	assertClose(result[1], 0.5, 1e-15)
	assertClose(result[2], -1, 1e-15)
})

test('cosTypedIterative: edge cases (empty, single element, large array, special IEEE 754 values)', () => {
	// Empty input
	const empty = new Float64Array(0)
	const emptyRes = cosTypedIterative(empty)
	assert.ok(emptyRes instanceof Float64Array)
	assert.equal(emptyRes.length, 0)
	assert.notEqual(emptyRes, empty)

	// Single element
	const single = cosTypedIterative(new Float64Array([0]))
	assert.equal(single.length, 1)
	assert.equal(single[0], 1)

	// Special values: +0, -0, NaN, Infinity, -Infinity, subnormal, large magnitude
	const specials = new Float64Array([
		0,
		-0,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		Number.MIN_VALUE,
		1e-12,
		1e6,
		-1e6,
	])
	const res = cosTypedIterative(specials)
	assert.equal(res[0], 1)
	assert.equal(res[1], 1)
	assert.ok(Number.isNaN(res[2]))
	assert.ok(Number.isNaN(res[3]))
	assert.ok(Number.isNaN(res[4]))
	assert.equal(res[5], 1)
	assertClose(res[6], 1, 1e-15)
	assert.equal(res[7], Math.cos(1e6))
	assert.equal(res[8], Math.cos(-1e6))
	assert.equal(res[7], res[8])

	// Larger array
	const n = 1024
	const large = new Float64Array(n)
	for (let i = 0; i < n; i++) {
		large[i] = (i - n / 2) * 0.01
	}
	const largeRes = cosTypedIterative(large)
	assert.equal(largeRes.length, n)
	for (let i = 0; i < n; i++) {
		assert.equal(largeRes[i], Math.cos(large[i]))
	}
})

test('cosTypedIterative: throws TypeError and RangeError on invalid inputs', () => {
	const invalidInputs = [
		undefined,
		null,
		[],
		[0, 1],
		new Float32Array([0]),
		new Int32Array([0]),
		new Uint8Array([0]),
		0,
		'0',
		{},
	]

	for (const bad of invalidInputs) {
		assert.throws(() => cosTypedIterative(bad), TypeError)
	}

	const valid = new Float64Array([0, 1, 2])
	for (const badOut of [null, [0, 0, 0], new Float32Array(3), 'out', 42]) {
		assert.throws(() => cosTypedIterative(valid, badOut), TypeError)
	}

	// Mismatched output lengths -> RangeError
	assert.throws(() => cosTypedIterative(valid, new Float64Array(2)), RangeError)
	assert.throws(() => cosTypedIterative(valid, new Float64Array(4)), RangeError)
	assert.throws(() => cosTypedIterative(valid, new Float64Array(0)), RangeError)

	// Detached ArrayBuffer -> TypeError
	const abIn = new ArrayBuffer(16)
	const detachedIn = new Float64Array(abIn)
	abIn.transfer()
	assert.throws(() => cosTypedIterative(detachedIn), TypeError)

	const abOut = new ArrayBuffer(24)
	const detachedOut = new Float64Array(abOut)
	abOut.transfer()
	assert.throws(() => cosTypedIterative(valid, detachedOut), TypeError)
})

test('cosTypedIterative: cross-check against independent Maclaurin series', () => {
	const count = 65
	const angles = new Float64Array(count)
	for (let i = 0; i < count; i++) {
		angles[i] = -Math.PI + (2 * Math.PI * i) / (count - 1)
	}

	const actual = cosTypedIterative(angles)
	for (let i = 0; i < count; i++) {
		const independent = cosMaclaurin(angles[i], 20)
		assertClose(
			actual[i],
			independent,
			1e-14,
			`Maclaurin mismatch at x=${angles[i]}`
		)
	}
})

test('cosTypedIterative: cross-check trigonometric identities and inverse', () => {
	const angles = new Float64Array([
		-3.1, -2.25, -1.5, -0.75, -0.1, 0, 0.2, 0.75, 1.3, 2.1, 3.0, 4.7, 10.5,
	])
	const negAngles = new Float64Array(angles.length)
	const shiftedTwoPi = new Float64Array(angles.length)
	const shiftedPi = new Float64Array(angles.length)
	const doubled = new Float64Array(angles.length)
	for (let i = 0; i < angles.length; i++) {
		negAngles[i] = -angles[i]
		shiftedTwoPi[i] = angles[i] + 2 * Math.PI
		shiftedPi[i] = angles[i] + Math.PI
		doubled[i] = 2 * angles[i]
	}

	const c = cosTypedIterative(angles)
	const cNeg = cosTypedIterative(negAngles)
	const cTwoPi = cosTypedIterative(shiftedTwoPi)
	const cPi = cosTypedIterative(shiftedPi)
	const cDouble = cosTypedIterative(doubled)

	for (let i = 0; i < angles.length; i++) {
		// Pythagorean identity: cos^2(x) + sin^2(x) = 1
		const s = Math.sin(angles[i])
		assertClose(c[i] * c[i] + s * s, 1, 1e-14)

		// Even-function symmetry: cos(-x) === cos(x)
		assert.equal(cNeg[i], c[i])

		// Periodicity: cos(x + 2pi) = cos(x) and cos(x + pi) = -cos(x)
		assertClose(cTwoPi[i], c[i], 1e-13)
		assertClose(cPi[i], -c[i], 1e-13)

		// Double-angle identity: cos(2x) = 2*cos^2(x) - 1
		assertClose(cDouble[i], 2 * c[i] * c[i] - 1, 1e-13)
	}

	// Inverse operation: acos(cos(x)) = x for x in [0, pi]
	const principal = new Float64Array([0, 0.25, 0.5, 1.0, Math.PI / 2, 2.2, Math.PI])
	const cosPrincipal = cosTypedIterative(principal)
	for (let i = 0; i < principal.length; i++) {
		assertClose(Math.acos(cosPrincipal[i]), principal[i], 1e-14)
	}
})
