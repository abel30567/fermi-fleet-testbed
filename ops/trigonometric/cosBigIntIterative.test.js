import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cosBigIntIterative } from './cosBigIntIterative.js'

const SCALE = 10n ** 18n

// High-precision reference values of pi and special angles scaled by 10^18
const PI_18 = 3141592653589793238n
const HALF_PI_18 = 1570796326794896619n
const QUARTER_PI_18 = 785398163397448310n
const THIRD_PI_18 = 1047197551196597746n
const SIXTH_PI_18 = 523598775598298873n
const TWO_PI_18 = 6283185307179586477n

// Reference exact cosine values scaled by 10^18
const SQRT2_OVER_2_18 = 707106781186547524n
const SQRT3_OVER_2_18 = 866025403784438647n

// 50-digit pi for constructing exact large multi-turn angles
const PI_50 = 314159265358979323846264338327950288419716939937510n
const PI_50_SCALE = 10n ** 50n

function absDiff(a, b) {
	return a >= b ? a - b : b - a
}

function roundDiv(num, den) {
	const half = den / 2n
	return num >= 0n ? (num + half) / den : -((-num + half) / den)
}

test('cosBigIntIterative: standard angles (0, pi/6, pi/4, pi/3, pi/2, pi, 2*pi)', () => {
	assert.equal(cosBigIntIterative(0n), SCALE)
	assert.equal(cosBigIntIterative(SIXTH_PI_18), SQRT3_OVER_2_18)
	assert.equal(cosBigIntIterative(QUARTER_PI_18), SQRT2_OVER_2_18)
	assert.equal(cosBigIntIterative(THIRD_PI_18), 500000000000000000n)
	assert.equal(cosBigIntIterative(HALF_PI_18), 0n)
	assert.equal(cosBigIntIterative(PI_18), -SCALE)
	assert.equal(cosBigIntIterative(TWO_PI_18), SCALE)
})

test('cosBigIntIterative: even symmetry and negative angles', () => {
	const samples = [
		1n,
		100000000000000000n,
		SIXTH_PI_18,
		QUARTER_PI_18,
		THIRD_PI_18,
		HALF_PI_18,
		2094395102393195492n, // 2*pi/3
		PI_18,
		4712388980384689858n, // 3*pi/2
		10n ** 22n + 123456789n
	]

	for (const x of samples) {
		assert.equal(
			cosBigIntIterative(-x),
			cosBigIntIterative(x),
			`cos(-x) must equal cos(x) for x=${x}`
		)
	}

	assert.equal(cosBigIntIterative(-THIRD_PI_18), 500000000000000000n)
	assert.equal(cosBigIntIterative(-PI_18), -SCALE)
})

test('cosBigIntIterative: large multi-turn angles', () => {
	// Construct exact multiples of 2*pi and odd multiples of pi from 50-digit pi
	const turns = [10n, 1000n, 10n ** 6n, 10n ** 12n, 10n ** 20n]

	for (const n of turns) {
		const twoPiN = roundDiv(2n * n * PI_50 * SCALE, PI_50_SCALE)
		assert.equal(
			cosBigIntIterative(twoPiN),
			SCALE,
			`cos(2*pi*${n}) should be 1`
		)
		assert.equal(
			cosBigIntIterative(-twoPiN),
			SCALE,
			`cos(-2*pi*${n}) should be 1`
		)

		const oddPi = roundDiv((2n * n + 1n) * PI_50 * SCALE, PI_50_SCALE)
		assert.equal(
			cosBigIntIterative(oddPi),
			-SCALE,
			`cos((2*${n}+1)*pi) should be -1`
		)

		const shiftedThird = roundDiv(
			(2n * n * 3n + 1n) * PI_50 * SCALE,
			3n * PI_50_SCALE
		)
		assert.ok(
			absDiff(cosBigIntIterative(shiftedThird), 500000000000000000n) <= 1n,
			`cos(2*pi*${n} + pi/3) should be 0.5 within 1 ulp`
		)
	}
})

test('cosBigIntIterative: cross-check against Math.cos', () => {
	const testAngles = [
		-10,
		-3.7,
		-2.1,
		-1.5,
		-0.5,
		-0.001,
		0.001,
		0.25,
		0.5,
		1.0,
		1.23456789,
		2.0,
		2.5,
		3.0,
		4.2,
		5.5,
		7.89,
		12.345
	]

	// IEEE 754 double has ~15-16 significant decimal digits, so allow 10^4 ulps at 10^18 scale (1e-14)
	const tolerance = 10n ** 4n

	for (const rad of testAngles) {
		const x = BigInt(Math.round(rad * 1e12)) * 10n ** 6n
		const actual = cosBigIntIterative(x)
		const expected = BigInt(Math.round(Math.cos(Number(x) / 1e18) * 1e18))
		assert.ok(
			absDiff(actual, expected) <= tolerance,
			`Mismatch at rad=${rad}: actual=${actual}, expected=${expected}`
		)
	}
})

test('cosBigIntIterative: double-angle identity cos(2x) = 2*cos(x)^2 - 1 (including gigantic angles)', () => {
	const angles = [
		123456789012345678n,
		1000000000000000000n,
		2500000000000000000n,
		-7654321098765432109n,
		10n ** 30n + 987654321n,
		// Exercises dynamic Machin pi expansion beyond 80-digit cached pi
		10n ** 80n + 314159265358979323n
	]

	for (const x of angles) {
		const cosX = cosBigIntIterative(x)
		const cos2X = cosBigIntIterative(2n * x)
		const rhs = roundDiv(2n * cosX * cosX, SCALE) - SCALE
		assert.ok(
			absDiff(cos2X, rhs) <= 3n,
			`Double-angle identity failed for x=${x}: cos(2x)=${cos2X}, 2*cos(x)^2-1=${rhs}`
		)
	}
})

test('cosBigIntIterative: invalid non-BigInt inputs throw TypeError', () => {
	const invalidInputs = [
		0,
		1,
		-1.5,
		NaN,
		Infinity,
		'0',
		'1000000000000000000',
		null,
		undefined,
		true,
		false,
		{},
		[],
		Symbol('x')
	]

	for (const bad of invalidInputs) {
		assert.throws(
			() => cosBigIntIterative(bad),
			TypeError,
			`Expected TypeError for input ${String(bad)}`
		)
	}
})
