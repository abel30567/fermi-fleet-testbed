import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { arcsinBigIntIterative } from './arcsinBigIntIterative.js'

const SCALE = 10n ** 18n
const HALF = SCALE / 2n

// Known exact constants rounded to 10^18 scale
const PI_OVER_2 = 1570796326794896619n // 1.57079632679489661923...
const PI_OVER_3 = 1047197551196597746n // 1.04719755119659774615...
const PI_OVER_4 = 785398163397448310n // 0.78539816339744830961...
const PI_OVER_6 = 523598775598298873n // 0.52359877559829887307...
const SQRT2_OVER_2 = 707106781186547524n // 0.70710678118654752440...
const SQRT3_OVER_2 = 866025403784438647n // 0.86602540378443864676...

/**
 * Independent fixed-point sin(t) at 10^18 scale (computed with 10^36 internal
 * precision via alternating Taylor series) for round-trip verification.
 *
 * @param {bigint} theta - Angle in radians scaled by 10^18.
 * @returns {bigint} sin(theta / 10^18) * 10^18.
 */
function sinFixedPoint(theta) {
	const guard = 10n ** 18n
	const workScale = SCALE * guard
	const t = theta * guard
	const tSq = t * t
	const workScaleSq = workScale * workScale
	let sum = t
	let term = t
	for (let k = 1n; ; k++) {
		term = (-term * tSq) / (workScaleSq * (2n * k) * (2n * k + 1n))
		if (term === 0n) break
		sum += term
	}
	if (sum >= 0n) return (sum + guard / 2n) / guard
	return -((-sum + guard / 2n) / guard)
}

function absDiff(a, b) {
	return a >= b ? a - b : b - a
}

describe('arcsinBigIntIterative', () => {
	test('handles zero and standard exact angles (0, ±0.5, ±sqrt(2)/2, ±sqrt(3)/2, ±1)', () => {
		assert.equal(arcsinBigIntIterative(0n), 0n)

		assert.equal(arcsinBigIntIterative(HALF), PI_OVER_6)
		assert.equal(arcsinBigIntIterative(-HALF), -PI_OVER_6)

		// sqrt(2)/2 rounded to 18 digits has ~4e-19 error; derivative is sqrt(2)
		assert.ok(absDiff(arcsinBigIntIterative(SQRT2_OVER_2), PI_OVER_4) <= 1n)
		assert.ok(absDiff(arcsinBigIntIterative(-SQRT2_OVER_2), -PI_OVER_4) <= 1n)

		// sqrt(3)/2 rounded to 18 digits has ~2.4e-19 error; derivative is 2
		assert.ok(absDiff(arcsinBigIntIterative(SQRT3_OVER_2), PI_OVER_3) <= 1n)
		assert.ok(absDiff(arcsinBigIntIterative(-SQRT3_OVER_2), -PI_OVER_3) <= 1n)

		assert.equal(arcsinBigIntIterative(SCALE), PI_OVER_2)
		assert.equal(arcsinBigIntIterative(-SCALE), -PI_OVER_2)
	})

	test('satisfies odd symmetry arcsin(-x) === -arcsin(x) across domain', () => {
		const samples = [
			1n,
			12345678901234567n,
			HALF - 1n,
			HALF,
			HALF + 1n,
			750000000000000000n,
			SCALE - 1000n,
			SCALE - 1n,
			SCALE,
		]
		for (const x of samples) {
			assert.equal(arcsinBigIntIterative(-x), -arcsinBigIntIterative(x))
		}
	})

	test('maintains continuity and monotonicity across the |x| = 0.5 branch boundary', () => {
		const below = arcsinBigIntIterative(HALF - 1n)
		const at = arcsinBigIntIterative(HALF)
		const above = arcsinBigIntIterative(HALF + 1n)

		// Derivative at 0.5 is 2/sqrt(3) ≈ 1.1547, so adjacent steps differ by 1 or 2
		assert.ok(at > below && at - below <= 2n)
		assert.ok(above > at && above - at <= 2n)
	})

	test('handles values very close to ±1 accurately', () => {
		// For x = 1 - eps with eps = 10^-18:
		// arcsin(1 - eps) ≈ pi/2 - sqrt(2 * eps) = pi/2 - sqrt(2) * 10^-9
		const nearOne = SCALE - 1n
		const expectedNearOne = PI_OVER_2 - 1414213562n
		assert.ok(absDiff(arcsinBigIntIterative(nearOne), expectedNearOne) <= 1n)
		assert.ok(absDiff(arcsinBigIntIterative(-nearOne), -expectedNearOne) <= 1n)

		// For x = 1 - 10^-12:
		// arcsin(1 - 10^-12) ≈ pi/2 - sqrt(2) * 10^-6
		const nearOneE12 = SCALE - 10n ** 6n
		const expectedNearOneE12 = PI_OVER_2 - 1414213562373n
		assert.ok(absDiff(arcsinBigIntIterative(nearOneE12), expectedNearOneE12) <= 1n)

		// Smallest non-zero positive/negative values: arcsin(10^-18) = 10^-18
		assert.equal(arcsinBigIntIterative(1n), 1n)
		assert.equal(arcsinBigIntIterative(-1n), -1n)
	})

	test('throws TypeError for non-BigInt inputs', () => {
		const invalidInputs = [0, 0.5, 1, -1, NaN, Infinity, '0', '500000000000000000', null, undefined, true, false, {}, []]
		for (const input of invalidInputs) {
			assert.throws(
				() => arcsinBigIntIterative(input),
				TypeError,
				`Expected TypeError for input ${String(input)}`
			)
		}
	})

	test('throws RangeError for inputs outside [-10^18, 10^18]', () => {
		const outOfDomain = [SCALE + 1n, -SCALE - 1n, 2n * SCALE, -2n * SCALE, 10n ** 30n, -(10n ** 30n)]
		for (const input of outOfDomain) {
			assert.throws(
				() => arcsinBigIntIterative(input),
				RangeError,
				`Expected RangeError for input ${input}`
			)
		}
	})

	test('cross-checks against Math.asin across the full domain', () => {
		const steps = 40
		for (let i = -steps; i <= steps; i++) {
			const x = (BigInt(i) * SCALE) / BigInt(steps)
			const actual = arcsinBigIntIterative(x)
			const expectedFloat = Math.asin(Number(x) / 1e18)
			const actualFloat = Number(actual) / 1e18
			// IEEE 754 float64 has ~15-16 significant digits (tolerance 1e-14)
			assert.ok(
				Math.abs(actualFloat - expectedFloat) < 1e-14,
				`Mismatch vs Math.asin at x=${x}: actual=${actualFloat}, expected=${expectedFloat}`
			)
		}
	})

	test('cross-checks round-trip identity sin(arcsin(x)) ≈ x to full 18-digit precision', () => {
		const testValues = [
			-SCALE,
			-SCALE + 1n,
			-SCALE + 10n ** 6n,
			-999999000000000000n,
			-SQRT3_OVER_2,
			-SQRT2_OVER_2,
			-HALF - 1n,
			-HALF,
			-HALF + 1n,
			-333333333333333333n,
			-123456789012345678n,
			-1n,
			0n,
			1n,
			123456789012345678n,
			333333333333333333n,
			HALF - 1n,
			HALF,
			HALF + 1n,
			SQRT2_OVER_2,
			SQRT3_OVER_2,
			999999000000000000n,
			SCALE - 10n ** 6n,
			SCALE - 1n,
			SCALE,
		]

		for (const x of testValues) {
			const angle = arcsinBigIntIterative(x)
			const reconstructed = sinFixedPoint(angle)
			assert.ok(
				absDiff(reconstructed, x) <= 1n,
				`Round-trip sin(arcsin(${x})) = ${reconstructed} differs by ${absDiff(reconstructed, x)}`
			)
		}
	})
})
