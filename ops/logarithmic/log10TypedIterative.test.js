import { test } from 'node:test'
import assert from 'node:assert/strict'
import { log10TypedIterative } from './log10TypedIterative.js'

/**
 * Independent natural logarithm using binary range reduction (`x = m * 2^e`, `m in [1, 2)`)
 * and the rapidly converging area hyperbolic tangent series:
 * `ln(m) = 2 * sum_{k=0..N} (1 / (2k + 1)) * ((m - 1) / (m + 1))^(2k + 1)`.
 * Does not call `Math.log`, `Math.log2`, or `Math.log10`.
 */
function independentLn(x) {
	let m = x
	let e = 0
	while (m >= 2) {
		m *= 0.5
		e += 1
	}
	while (m < 1) {
		m *= 2
		e -= 1
	}

	const seriesLn = (v) => {
		const y = (v - 1) / (v + 1)
		const y2 = y * y
		let term = y
		let sum = 0
		for (let k = 0; k < 25; k += 1) {
			sum += term / (2 * k + 1)
			term *= y2
		}
		return 2 * sum
	}

	const ln2 = seriesLn(2)
	return seriesLn(m) + e * ln2
}

/**
 * Independent base-10 logarithm computed solely via `independentLn(x) / independentLn(10)`.
 */
function independentLog10(x) {
	return independentLn(x) / independentLn(10)
}

function assertClose(actual, expected, tol = 1e-12, label = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected}`
	)
}

test('normal cases: exact powers of 10 and common positive values', () => {
	const input = new Float64Array([1, 10, 100, 1000, 1e6, 1e12, 1e15])
	const result = log10TypedIterative(input)

	assert.ok(result instanceof Float64Array)
	assert.notEqual(result, input)
	assert.equal(result.length, input.length)
	assert.deepEqual(Array.from(result), [0, 1, 2, 3, 6, 12, 15])
	// Verify input is not mutated
	assert.deepEqual(Array.from(input), [1, 10, 100, 1000, 1e6, 1e12, 1e15])
})

test('normal cases: fractional and non-power-of-10 values', () => {
	const input = new Float64Array([0.1, 0.01, 0.001, 2, 5, Math.SQRT10 ?? Math.sqrt(10), 250])
	const expected = [-1, -2, -3, 0.3010299956639812, 0.6989700043360189, 0.5, 2.3979400086720375]
	const result = log10TypedIterative(input)

	for (let i = 0; i < input.length; i += 1) {
		assertClose(result[i], expected[i], 1e-15, `index ${i}`)
	}
})

test('edge cases: empty Float64Array and single-element Float64Array', () => {
	const empty = new Float64Array(0)
	const emptyResult = log10TypedIterative(empty)
	assert.ok(emptyResult instanceof Float64Array)
	assert.notEqual(emptyResult, empty)
	assert.equal(emptyResult.length, 0)

	const single = new Float64Array([1])
	const singleResult = log10TypedIterative(single)
	assert.equal(singleResult.length, 1)
	assert.ok(Object.is(singleResult[0], 0))
})

test('edge cases: IEEE-754 boundaries and special values', () => {
	const minNormal = 2 ** -1022
	const input = new Float64Array([
		0,
		-0,
		-1,
		-1e10,
		-Number.MIN_VALUE,
		-Infinity,
		Infinity,
		NaN,
		Number.MIN_VALUE,
		minNormal,
		Number.EPSILON,
		Number.MAX_VALUE
	])
	const result = log10TypedIterative(input)

	assert.equal(result[0], -Infinity)
	assert.equal(result[1], -Infinity)
	assert.ok(Number.isNaN(result[2]))
	assert.ok(Number.isNaN(result[3]))
	assert.ok(Number.isNaN(result[4]))
	assert.ok(Number.isNaN(result[5]))
	assert.equal(result[6], Infinity)
	assert.ok(Number.isNaN(result[7]))

	assert.ok(Number.isFinite(result[8]))
	assertClose(result[8], -323.3062153431158, 1e-12, 'Number.MIN_VALUE')
	assertClose(result[9], -307.6526555685888, 1e-12, 'minNormal')
	assertClose(result[10], -15.653559774527022, 1e-12, 'Number.EPSILON')
	assertClose(result[11], 308.25471555991675, 1e-12, 'Number.MAX_VALUE')
})

test('edge cases: optional out buffer, in-place aliasing, and subarray views', () => {
	const input = new Float64Array([1, 10, 100, 1000])
	const out = new Float64Array(4)
	const returned = log10TypedIterative(input, out)

	assert.equal(returned, out)
	assert.deepEqual(Array.from(out), [0, 1, 2, 3])

	// In-place computation (out === input)
	const inplace = new Float64Array([1, 100, 1e4])
	const sameRef = log10TypedIterative(inplace, inplace)
	assert.equal(sameRef, inplace)
	assert.deepEqual(Array.from(inplace), [0, 2, 4])

	// Subarray view should only read/write its slice
	const backing = new Float64Array([999, 10, 1000, 888])
	const view = backing.subarray(1, 3)
	const viewResult = log10TypedIterative(view)
	assert.deepEqual(Array.from(viewResult), [1, 3])
	assert.deepEqual(Array.from(backing), [999, 10, 1000, 888])
})

test('input validation: throws TypeError and RangeError on invalid inputs', () => {
	const invalidInputs = [
		undefined,
		null,
		10,
		'10',
		true,
		[1, 10, 100],
		{ length: 2, 0: 1, 1: 10 },
		new Float32Array([1, 10]),
		new Int32Array([1, 10]),
		new Uint8Array([1, 10])
	]

	for (const bad of invalidInputs) {
		assert.throws(
			() => log10TypedIterative(bad),
			{ name: 'TypeError' },
			`expected TypeError for input ${String(bad)}`
		)
	}

	const validInput = new Float64Array([1, 10, 100])
	for (const badOut of [null, [0, 0, 0], new Float32Array(3), 'out', 42]) {
		assert.throws(
			() => log10TypedIterative(validInput, badOut),
			{ name: 'TypeError' },
			`expected TypeError for out ${String(badOut)}`
		)
	}

	assert.throws(
		() => log10TypedIterative(validInput, new Float64Array(2)),
		{ name: 'RangeError' }
	)
	assert.throws(
		() => log10TypedIterative(validInput, new Float64Array(4)),
		{ name: 'RangeError' }
	)
})

test('cross-check: independent series algorithm, change-of-base, inverse, and log identities', () => {
	const values = new Float64Array([
		1e-9,
		0.0037,
		0.25,
		0.5,
		1,
		Math.E,
		Math.PI,
		7.5,
		42,
		1234.5678,
		9.87654321e18
	])
	const result = log10TypedIterative(values)

	for (let i = 0; i < values.length; i += 1) {
		const x = values[i]
		const y = result[i]

		// 1. Independent series algorithm (no Math.log/log2/log10)
		assertClose(y, independentLog10(x), 1e-12, `independent series at x=${x}`)

		// 2. Change-of-base identity: log10(x) = ln(x) / ln(10) = log2(x) / log2(10)
		assertClose(y, Math.log(x) / Math.LN10, 1e-14, `ln change-of-base at x=${x}`)
		assertClose(y, Math.log2(x) / Math.log2(10), 1e-14, `log2 change-of-base at x=${x}`)

		// 3. Inverse operation: 10^(log10(x)) === x (relative tolerance)
		const reconstructed = 10 ** y
		assert.ok(
			Math.abs(reconstructed - x) <= Math.max(1e-12, Math.abs(x) * 1e-13),
			`inverse check failed for x=${x}: 10^${y} = ${reconstructed}`
		)
	}

	// 4. Algebraic identities: product, quotient, and power rules
	const a = new Float64Array([2, 3.5, 12.5, 0.04, 150])
	const b = new Float64Array([5, 7.2, 0.8, 250, 0.006])
	const prod = new Float64Array(a.length)
	const quot = new Float64Array(a.length)
	const cubed = new Float64Array(a.length)
	for (let i = 0; i < a.length; i += 1) {
		prod[i] = a[i] * b[i]
		quot[i] = a[i] / b[i]
		cubed[i] = a[i] ** 3
	}

	const logA = log10TypedIterative(a)
	const logB = log10TypedIterative(b)
	const logProd = log10TypedIterative(prod)
	const logQuot = log10TypedIterative(quot)
	const logCubed = log10TypedIterative(cubed)

	for (let i = 0; i < a.length; i += 1) {
		assertClose(logProd[i], logA[i] + logB[i], 1e-13, `product rule at i=${i}`)
		assertClose(logQuot[i], logA[i] - logB[i], 1e-13, `quotient rule at i=${i}`)
		assertClose(logCubed[i], 3 * logA[i], 1e-13, `power rule at i=${i}`)
	}
})
