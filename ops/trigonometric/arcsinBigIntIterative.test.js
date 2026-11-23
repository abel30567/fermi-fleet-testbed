import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arcsinBigIntIterative, SCALE } from './arcsinBigIntIterative.js'

const HALF_PI = 1_570_796_326_794_896_619n
const PI_OVER_3 = 1_047_197_551_196_597_746n
const PI_OVER_4 = 785_398_163_397_448_310n
const PI_OVER_6 = 523_598_775_598_298_873n

/**
 * Independent BigInt sin(theta) at 10^18 scale (using 10^36 internal precision)
 * for round-trip cross-checking sin(arcsin(x)) == x.
 */
function sinBigIntReference(theta) {
	const G = 10n ** 18n
	const W = SCALE * G
	const W2 = W * W
	const neg = theta < 0n
	const t = (neg ? -theta : theta) * G
	const t2 = t * t
	let term = t
	let sum = t
	for (let k = 1n; ; k += 1n) {
		term = (-term * t2) / (2n * k * (2n * k + 1n) * W2)
		if (term === 0n) break
		sum += term
	}
	const absSum = sum < 0n ? -sum : sum
	const rounded = (absSum + G / 2n) / G
	const signed = sum < 0n ? -rounded : rounded
	return neg ? -signed : signed
}

function absDiff(a, b) {
	return a >= b ? a - b : b - a
}

test('arcsinBigIntIterative: exact known trigonometric values', () => {
	assert.equal(arcsinBigIntIterative(0n), 0n)
	assert.equal(arcsinBigIntIterative(SCALE), HALF_PI)
	assert.equal(arcsinBigIntIterative(-SCALE), -HALF_PI)
	assert.equal(arcsinBigIntIterative(SCALE / 2n), PI_OVER_6)
	assert.equal(arcsinBigIntIterative(-(SCALE / 2n)), -PI_OVER_6)

	// sqrt(2)/2 * 10^18 rounded to nearest integer
	const sqrt2Over2 = 707_106_781_186_547_524n
	assert.ok(
		absDiff(arcsinBigIntIterative(sqrt2Over2), PI_OVER_4) <= 1n,
		'arcsin(sqrt(2)/2) should match pi/4 within 1 ULP'
	)
	assert.ok(
		absDiff(arcsinBigIntIterative(-sqrt2Over2), -PI_OVER_4) <= 1n,
		'arcsin(-sqrt(2)/2) should match -pi/4 within 1 ULP'
	)

	// sqrt(3)/2 * 10^18 rounded to nearest integer (derivative is 2 here, so <= 2 ULP)
	const sqrt3Over2 = 866_025_403_784_438_647n
	assert.ok(
		absDiff(arcsinBigIntIterative(sqrt3Over2), PI_OVER_3) <= 2n,
		'arcsin(sqrt(3)/2) should match pi/3 within 2 ULP'
	)
})

test('arcsinBigIntIterative: small values and near-endpoint edge cases', () => {
	// For tiny x, arcsin(x) = x + O(x^3), so exact to 10^-18 for |x| <= 10^12
	assert.equal(arcsinBigIntIterative(1n), 1n)
	assert.equal(arcsinBigIntIterative(-1n), -1n)
	assert.equal(arcsinBigIntIterative(1_000_000n), 1_000_000n)
	assert.equal(arcsinBigIntIterative(-1_000_000n), -1_000_000n)

	// Near endpoints: arcsin(1 - eps) ≈ pi/2 - sqrt(2 * eps)
	// For eps = 10^-18, sqrt(2 * 10^-18) = sqrt(2) * 10^-9 ≈ 1_414_213_562n
	const nearOne = arcsinBigIntIterative(SCALE - 1n)
	const expectedNearOne = HALF_PI - 1_414_213_562n
	assert.ok(
		absDiff(nearOne, expectedNearOne) <= 1n,
		`expected ${nearOne} within 1 ULP of ${expectedNearOne}`
	)
	assert.equal(arcsinBigIntIterative(-(SCALE - 1n)), -nearOne)

	// Continuity across the argument reduction threshold sqrt(2)/2
	const justBelow = 707_106_781_186_547_524n
	const justAbove = 707_106_781_186_547_525n
	const valBelow = arcsinBigIntIterative(justBelow)
	const valAbove = arcsinBigIntIterative(justAbove)
	assert.ok(valAbove > valBelow)
	// Derivative at sqrt(2)/2 is sqrt(2) ≈ 1.414, so step of 1 produces delta 1 or 2
	assert.ok(valAbove - valBelow <= 2n)
})

test('arcsinBigIntIterative: odd symmetry and strict monotonicity', () => {
	const samples = [
		-SCALE,
		-999_999_999_999_999_999n,
		-900_000_000_000_000_000n,
		-750_000_000_000_000_000n,
		-707_106_781_186_547_525n,
		-707_106_781_186_547_524n,
		-500_000_000_000_000_000n,
		-100_000_000_000_000_000n,
		-1n,
		0n,
		1n,
		100_000_000_000_000_000n,
		500_000_000_000_000_000n,
		707_106_781_186_547_524n,
		707_106_781_186_547_525n,
		750_000_000_000_000_000n,
		900_000_000_000_000_000n,
		999_999_999_999_999_999n,
		SCALE,
	]

	for (const x of samples) {
		assert.equal(arcsinBigIntIterative(-x), -arcsinBigIntIterative(x))
	}

	for (let i = 1; i < samples.length; i++) {
		assert.ok(
			arcsinBigIntIterative(samples[i - 1]) < arcsinBigIntIterative(samples[i]),
			`expected strict monotonicity at index ${i}`
		)
	}
})

test('arcsinBigIntIterative: input validation rejects invalid types and out-of-range values', () => {
	for (const bad of [0, 0.5, -1, NaN, '0', '500000000000000000', null, undefined, {}, []]) {
		assert.throws(() => arcsinBigIntIterative(bad), TypeError)
	}

	for (const outOfRange of [SCALE + 1n, -SCALE - 1n, 2n * SCALE, -10n * SCALE]) {
		assert.throws(() => arcsinBigIntIterative(outOfRange), RangeError)
	}
})

test('arcsinBigIntIterative: independent cross-check against Math.asin', () => {
	const testValues = [-1, -0.99, -0.875, -0.75, -0.6, -0.5, -0.25, -0.1, 0, 0.1, 0.25, 0.5, 0.6, 0.75, 0.875, 0.99, 1]
	for (const f of testValues) {
		const x = BigInt(Math.round(f * 1e18))
		const actual = arcsinBigIntIterative(x)
		const expectedFloat = Math.asin(Number(x) / 1e18)
		const actualFloat = Number(actual) / 1e18
		assert.ok(
			Math.abs(actualFloat - expectedFloat) < 1e-14,
			`mismatch at ${f}: actual=${actualFloat}, expected=${expectedFloat}`
		)
	}
})

test('arcsinBigIntIterative: independent high-precision sin(arcsin(x)) round-trip and Pythagorean identity', () => {
	// Round-trip sin(arcsin(x)) == x to full 18-digit fixed-point precision
	const inputs = [
		-SCALE,
		-999_999_000_000_000_000n,
		-950_000_000_000_000_000n,
		-800_000_000_000_000_000n,
		-707_106_781_186_547_525n,
		-707_106_781_186_547_524n,
		-600_000_000_000_000_000n,
		-333_333_333_333_333_333n,
		-123_456_789_012_345_678n,
		0n,
		123_456_789_012_345_678n,
		333_333_333_333_333_333n,
		600_000_000_000_000_000n,
		707_106_781_186_547_524n,
		707_106_781_186_547_525n,
		800_000_000_000_000_000n,
		950_000_000_000_000_000n,
		999_999_000_000_000_000n,
		SCALE,
	]

	for (const x of inputs) {
		const theta = arcsinBigIntIterative(x)
		const reconstructed = sinBigIntReference(theta)
		assert.ok(
			absDiff(reconstructed, x) <= 1n,
			`sin(arcsin(${x})) = ${reconstructed}, diff = ${absDiff(reconstructed, x)}`
		)
	}

	// Exact Pythagorean triple (3/5, 4/5): arcsin(0.6) + arcsin(0.8) == pi/2
	const a = arcsinBigIntIterative(600_000_000_000_000_000n)
	const b = arcsinBigIntIterative(800_000_000_000_000_000n)
	assert.ok(
		absDiff(a + b, HALF_PI) <= 1n,
		`arcsin(0.6) + arcsin(0.8) = ${a + b}, expected ${HALF_PI}`
	)
})
