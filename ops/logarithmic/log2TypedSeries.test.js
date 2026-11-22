import { test } from 'node:test'
import assert from 'node:assert/strict'
import { log2TypedSeries } from './log2TypedSeries.js'

test('log2TypedSeries: input validation throws TypeError for non-Float64Array inputs', () => {
	const invalidInputs = [
		null,
		undefined,
		42,
		'123',
		[1, 2, 4],
		new Float32Array([1, 2, 4]),
		new Int32Array([1, 2, 4]),
		new Uint8Array([1, 2, 4]),
		{},
	]

	for (const bad of invalidInputs) {
		assert.throws(() => log2TypedSeries(bad), TypeError)
	}
})

test('log2TypedSeries: empty Float64Array returns empty Float64Array without mutating input', () => {
	const input = new Float64Array(0)
	const result = log2TypedSeries(input)

	assert.ok(result instanceof Float64Array)
	assert.equal(result.length, 0)
	assert.notEqual(result, input)
})

test('log2TypedSeries: exact powers of two (positive, negative, and subnormal)', () => {
	const exponents = [-1074, -1050, -1023, -1022, -53, -10, -1, 0, 1, 2, 10, 53, 500, 1023]
	const input = new Float64Array(exponents.map((e) => 2 ** e))
	const result = log2TypedSeries(input)

	assert.ok(result instanceof Float64Array)
	assert.equal(result.length, exponents.length)

	for (let i = 0; i < exponents.length; i++) {
		assert.equal(result[i], exponents[i], `Expected exact log2(2^${exponents[i]}) === ${exponents[i]}`)
	}
	// Verify +0 (not -0) for log2(1)
	const idxZero = exponents.indexOf(0)
	assert.ok(Object.is(result[idxZero], 0))
})

test('log2TypedSeries: IEEE-754 special values (0, -0, negative, NaN, Infinity, -Infinity)', () => {
	const input = new Float64Array([
		0,
		-0,
		-1,
		-0.0001,
		-Number.MAX_VALUE,
		Number.NEGATIVE_INFINITY,
		Number.NaN,
		Number.POSITIVE_INFINITY,
	])
	const result = log2TypedSeries(input)

	assert.equal(result[0], Number.NEGATIVE_INFINITY)
	assert.equal(result[1], Number.NEGATIVE_INFINITY)
	assert.ok(Number.isNaN(result[2]))
	assert.ok(Number.isNaN(result[3]))
	assert.ok(Number.isNaN(result[4]))
	assert.ok(Number.isNaN(result[5]))
	assert.ok(Number.isNaN(result[6]))
	assert.equal(result[7], Number.POSITIVE_INFINITY)
})

test('log2TypedSeries: non-power values, values near 1, very small subnormals, and very large values', () => {
	const values = [
		Number.MIN_VALUE,
		Number.MIN_VALUE * 3,
		2 ** -1022 * 0.75, // subnormal near boundary
		2 ** -1022, // smallest normal
		1e-300,
		1e-100,
		0.1,
		0.5 + 1e-12,
		1 - 1e-15,
		1 - 1e-7,
		1 + 1e-15,
		1 + 1e-7,
		Math.SQRT2 - 1e-12,
		Math.SQRT2,
		Math.SQRT2 + 1e-12,
		Math.E,
		Math.PI,
		3,
		10,
		1000,
		1e100,
		1e300,
		Number.MAX_VALUE,
	]
	const input = new Float64Array(values)
	const snapshot = Float64Array.from(input)
	const result = log2TypedSeries(input)

	// Ensure input is not mutated
	assert.deepEqual(input, snapshot)

	for (let i = 0; i < values.length; i++) {
		const expected = Math.log2(values[i])
		const relErr =
			expected === 0 ? Math.abs(result[i]) : Math.abs(result[i] - expected) / Math.abs(expected)
		assert.ok(
			relErr <= 1e-14,
			`Mismatch for x=${values[i]}: got ${result[i]}, expected ${expected}, relErr=${relErr}`,
		)
	}
})

test('log2TypedSeries: cross-check against Math.log2 and inverse identity 2 ** y ≈ x', () => {
	// Deterministic sweep across multiple orders of magnitude and mantissas
	const values = []
	for (let exp = -200; exp <= 200; exp += 17) {
		for (let m = 1.05; m < 2.0; m += 0.13) {
			values.push(m * 2 ** exp)
		}
	}
	const input = new Float64Array(values)
	const result = log2TypedSeries(input)

	for (let i = 0; i < input.length; i++) {
		const x = input[i]
		const y = result[i]
		const ref = Math.log2(x)

		// Cross-check 1: agreement with Math.log2
		const logRelErr = Math.abs(y - ref) / Math.max(1, Math.abs(ref))
		assert.ok(
			logRelErr <= 1e-14,
			`Math.log2 mismatch at x=${x}: got ${y}, ref=${ref}, err=${logRelErr}`,
		)

		// Cross-check 2: inverse identity 2 ** y ≈ x
		const reconstructed = 2 ** y
		const invRelErr = Math.abs(reconstructed - x) / x
		assert.ok(
			invRelErr <= 1e-12,
			`Inverse identity 2**y ≈ x failed at x=${x}: 2**${y}=${reconstructed}, relErr=${invRelErr}`,
		)
	}
})

test('log2TypedSeries: algebraic identity log2(a * b) ≈ log2(a) + log2(b)', () => {
	const a = new Float64Array([1.5, 3.7, 19.25, 0.0042, 1e20])
	const b = new Float64Array([2.3, 0.17, 512.75, 420.1, 1e-15])
	const ab = new Float64Array(a.length)
	for (let i = 0; i < a.length; i++) {
		ab[i] = a[i] * b[i]
	}

	const logA = log2TypedSeries(a)
	const logB = log2TypedSeries(b)
	const logAB = log2TypedSeries(ab)

	for (let i = 0; i < a.length; i++) {
		const lhs = logAB[i]
		const rhs = logA[i] + logB[i]
		const diff = Math.abs(lhs - rhs)
		assert.ok(
			diff <= 1e-13 * Math.max(1, Math.abs(lhs)),
			`Product identity failed at i=${i}: log2(a*b)=${lhs}, log2(a)+log2(b)=${rhs}`,
		)
	}
})
