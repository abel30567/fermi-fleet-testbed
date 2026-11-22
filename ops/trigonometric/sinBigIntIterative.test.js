import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sinBigIntIterative } from './sinBigIntIterative.js'

const SCALE = 10n ** 18n

// Standard angles in radians scaled by 10^18 (rounded to nearest integer)
const PI_SCALED = 3141592653589793238n
const TWO_PI_SCALED = 6283185307179586477n
const HALF_PI_SCALED = 1570796326794896619n
const QUARTER_PI_SCALED = 785398163397448310n
const SIXTH_PI_SCALED = 523598775598298873n
const THIRD_PI_SCALED = 1047197551196597746n

function absBigInt(n) {
	return n < 0n ? -n : n
}

describe('sinBigIntIterative', () => {
	describe('normal cases and special angles', () => {
		test('sin(0) === 0n', () => {
			assert.equal(sinBigIntIterative(0n), 0n)
		})

		test('sin(pi/6) === 0.5', () => {
			assert.equal(sinBigIntIterative(SIXTH_PI_SCALED), 500000000000000000n)
		})

		test('sin(pi/4) === sqrt(2)/2', () => {
			// 785398163397448310n is +3.84e-19 above pi/4, so sin rounds to ...525n
			const expected = 707106781186547524n
			const actual = sinBigIntIterative(QUARTER_PI_SCALED)
			assert.ok(
				absBigInt(actual - expected) <= 1n,
				`Expected ${actual} to be within 1 ulp of ${expected}`,
			)
		})

		test('sin(pi/3) === sqrt(3)/2', () => {
			const expected = 866025403784438647n
			const actual = sinBigIntIterative(THIRD_PI_SCALED)
			assert.ok(
				absBigInt(actual - expected) <= 1n,
				`Expected ${actual} to be within 1 ulp of ${expected}`,
			)
		})

		test('sin(pi/2) === 1', () => {
			assert.equal(sinBigIntIterative(HALF_PI_SCALED), SCALE)
		})

		test('sin(pi) === 0', () => {
			assert.equal(sinBigIntIterative(PI_SCALED), 0n)
		})

		test('sin(3*pi/2) === -1', () => {
			const threeHalfPi = 4712388980384689858n
			assert.equal(sinBigIntIterative(threeHalfPi), -SCALE)
		})

		test('sin(2*pi) === 0', () => {
			assert.equal(sinBigIntIterative(TWO_PI_SCALED), 0n)
		})

		test('negative angles satisfy odd symmetry sin(-x) === -sin(x)', () => {
			const samples = [
				1n,
				123456789012345678n,
				SIXTH_PI_SCALED,
				QUARTER_PI_SCALED,
				HALF_PI_SCALED,
				PI_SCALED,
				10000000000000000000n,
			]
			for (const x of samples) {
				assert.equal(
					sinBigIntIterative(-x),
					-sinBigIntIterative(x),
					`Failed odd symmetry for x=${x}`,
				)
			}
			assert.equal(sinBigIntIterative(-HALF_PI_SCALED), -SCALE)
			assert.equal(sinBigIntIterative(-SIXTH_PI_SCALED), -500000000000000000n)
		})

		test('large multi-turn angles stay accurate', () => {
			// Exact high-precision 2*pi * 10^18 rounded for 1000 turns:
			// 2000 * pi = 6283.185307179586476925286766559...
			const thousandTurns = 6283185307179586476925n
			assert.equal(sinBigIntIterative(thousandTurns), 0n)
			assert.equal(sinBigIntIterative(thousandTurns + HALF_PI_SCALED), SCALE)
			assert.equal(sinBigIntIterative(-thousandTurns - HALF_PI_SCALED), -SCALE)

			// Huge angle exceeding default 80-digit pi table (forces dynamic Machin pi):
			// x = 10^75 radians -> xScaled = 10^93
			const hugeAngle = 10n ** 93n
			const hugeSin = sinBigIntIterative(hugeAngle)
			assert.ok(
				hugeSin >= -SCALE && hugeSin <= SCALE,
				`Expected result in [-10^18, 10^18], got ${hugeSin}`,
			)
			assert.equal(sinBigIntIterative(-hugeAngle), -hugeSin)
		})
	})

	describe('edge cases and input validation', () => {
		test('throws TypeError for non-BigInt inputs', () => {
			const invalidInputs = [
				0,
				1.5,
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
				Symbol('x'),
			]
			for (const input of invalidInputs) {
				assert.throws(
					() => sinBigIntIterative(input),
					{ name: 'TypeError' },
					`Expected TypeError for input ${String(input)}`,
				)
			}
		})

		test('tiny non-zero angles satisfy sin(x) ≈ x', () => {
			assert.equal(sinBigIntIterative(1n), 1n)
			assert.equal(sinBigIntIterative(-1n), -1n)
			assert.equal(sinBigIntIterative(1000n), 1000n)
		})
	})

	describe('independent cross-checks', () => {
		test('matches Math.sin within IEEE-754 precision across angles', () => {
			const testRadians = [
				-10,
				-3.7,
				-1.23456789,
				-0.5,
				-0.001,
				0.001,
				0.25,
				0.7,
				1.0,
				2.3456789,
				5.5,
				12.345,
			]
			// Allow 1e-13 scaled (10^5) to cover double rounding on inputs & Math.sin
			const tolerance = 100000n

			for (const rad of testRadians) {
				const xScaled = BigInt(Math.round(rad * 1e12)) * 10n ** 6n
				const exactRad = Number(xScaled) / 1e18
				const actual = sinBigIntIterative(xScaled)
				const expected = BigInt(Math.round(Math.sin(exactRad) * 1e18))
				assert.ok(
					absBigInt(actual - expected) <= tolerance,
					`Mismatch for rad=${exactRad}: actual=${actual}, expected=${expected}`,
				)
			}
		})

		test('satisfies triple-angle identity sin(3x) = 3*sin(x) - 4*sin(x)^3', () => {
			const angles = [
				100000000000000000n, // 0.1 rad
				500000000000000000n, // 0.5 rad
				1000000000000000000n, // 1.0 rad
				2100000000000000000n, // 2.1 rad
				-1750000000000000000n, // -1.75 rad
				123456789012345678901234567890n, // large multi-turn angle
				10n ** 93n, // dynamic high-precision pi path
			]

			for (const x of angles) {
				const s = sinBigIntIterative(x)
				const s3 = sinBigIntIterative(3n * x)
				// Compute 4 * s^3 / SCALE^2 with rounding to nearest
				const sCubed = 4n * s * s * s
				const scaleSq = SCALE * SCALE
				const halfScaleSq = scaleSq / 2n
				const fourSCubed =
					sCubed >= 0n
						? (sCubed + halfScaleSq) / scaleSq
						: (sCubed - halfScaleSq) / scaleSq
				const rhs = 3n * s - fourSCubed

				assert.ok(
					absBigInt(s3 - rhs) <= 10n,
					`Triple-angle identity failed for x=${x}: sin(3x)=${s3}, rhs=${rhs}, diff=${s3 - rhs}`,
				)
			}
		})

		test('satisfies Pythagorean identity sin(x)^2 + sin(pi/2 - x)^2 = 1', () => {
			const angles = [
				100000000000000000n,
				400000000000000000n,
				1000000000000000000n,
				1500000000000000000n,
			]

			for (const x of angles) {
				const s = sinBigIntIterative(x)
				const c = sinBigIntIterative(HALF_PI_SCALED - x)
				const sumSq = (s * s + c * c + SCALE / 2n) / SCALE
				assert.ok(
					absBigInt(sumSq - SCALE) <= 5n,
					`Pythagorean identity failed for x=${x}: sumSq=${sumSq}`,
				)
			}
		})
	})
})
