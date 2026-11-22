import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { tanBigIntIterative } from './tanBigIntIterative.js'

const SCALE = 10n ** 18n

// High-precision reference pi scaled by 10^36 for constructing accurate fixed-point angles.
const PI_36 = 3141592653589793238462643383279502884n
const EXTRA = 10n ** 18n

/**
 * Helper: computes round((num / den) * pi * 10^18) as an exact fixed-point BigInt.
 */
function piMultiple(num, den = 1n) {
	const sign = (num < 0n) !== (den < 0n) ? -1n : 1n
	const absNum = num < 0n ? -num : num
	const absDen = den < 0n ? -den : den
	const scaled = absNum * PI_36
	const denom = absDen * EXTRA
	const rounded = (scaled + denom / 2n) / denom
	return sign < 0n ? -rounded : rounded
}

function absBigInt(v) {
	return v < 0n ? -v : v
}

describe('tanBigIntIterative', () => {
	describe('normal cases', () => {
		test('tan(0) === 0n', () => {
			assert.equal(tanBigIntIterative(0n), 0n)
		})

		test('tan(pi/4) is ~1.0 (within 1 ULP due to irrational pi/4 input rounding)', () => {
			// pi/4 * 10^18 = 785398163397448309.61566...
			// Rounding up by +0.38434e-18 shifts tan(pi/4) by sec^2(pi/4) * dx = +0.76868e-18 -> +1n.
			const piOver4 = piMultiple(1n, 4n)
			assert.equal(piOver4, 785398163397448310n)
			assert.equal(tanBigIntIterative(piOver4), SCALE + 1n)
			assert.equal(tanBigIntIterative(piOver4 - 1n), SCALE - 1n)
		})

		test('tan(-pi/4) is ~-1.0', () => {
			const negPiOver4 = -piMultiple(1n, 4n)
			assert.equal(tanBigIntIterative(negPiOver4), -(SCALE + 1n))
		})

		test('tan(pi/6) matches 1 / sqrt(3) at fixed-point input precision', () => {
			const piOver6 = piMultiple(1n, 6n)
			assert.equal(piOver6, 523598775598298873n)
			// Exact tan(523598775598298873e-18) * 10^18 = 577350269189625764.406339...
			// (1/sqrt(3) * 10^18 = 577350269189625764.509..., shifted by -0.103e-18 from input rounding)
			assert.equal(tanBigIntIterative(piOver6), 577350269189625764n)
			assert.ok(absBigInt(tanBigIntIterative(piOver6) - 577350269189625765n) <= 1n)
		})

		test('tan(pi/3) matches sqrt(3) and tan(1.0) matches exact 18-digit value', () => {
			const piOver3 = piMultiple(1n, 3n)
			// Exact tan(1047197551196597746e-18) * 10^18 = 1732050807568877292.910588...
			assert.equal(tanBigIntIterative(piOver3), 1732050807568877293n)
			// Exact tan(1.0) * 10^18 = 1557407724654902230.506974...
			assert.equal(tanBigIntIterative(SCALE), 1557407724654902231n)
		})

		test('tan(pi) === 0n', () => {
			const pi = piMultiple(1n, 1n)
			assert.equal(tanBigIntIterative(pi), 0n)
		})

		test('multi-turn angles preserve periodicity modulo pi', () => {
			const expectedPiOver6 = 577350269189625765n
			const expectedPiOver4 = SCALE

			for (const turns of [1n, 2n, -3n, 10n, -50n, 1000n, -123456n]) {
				const anglePi6 = piMultiple(1n + 6n * turns, 6n)
				assert.ok(
					absBigInt(tanBigIntIterative(anglePi6) - expectedPiOver6) <= 2n,
					`failed for pi/6 + ${turns}*pi`,
				)

				const anglePi4 = piMultiple(1n + 4n * turns, 4n)
				assert.ok(
					absBigInt(tanBigIntIterative(anglePi4) - expectedPiOver4) <= 2n,
					`failed for pi/4 + ${turns}*pi`,
				)

				const angleZero = piMultiple(turns, 1n)
				assert.ok(
					absBigInt(tanBigIntIterative(angleZero)) <= 1n,
					`failed for ${turns}*pi`,
				)
			}
		})
	})

	describe('edge cases', () => {
		test('odd symmetry: tan(-x) === -tan(x)', () => {
			const samples = [
				1n,
				42n,
				10n ** 12n,
				500000000000000000n, // 0.5 rad
				1000000000000000000n, // 1.0 rad
				piMultiple(1n, 6n),
				piMultiple(1n, 4n),
				piMultiple(1n, 3n),
				piMultiple(1n, 2n) - 10n ** 12n,
				piMultiple(1n, 2n) - 1n,
				piMultiple(7n, 3n),
				piMultiple(999n, 4n),
			]

			for (const x of samples) {
				assert.equal(tanBigIntIterative(-x), -tanBigIntIterative(x))
			}
		})

		test('tiny angles satisfy tan(x) === x to 10^-18 resolution', () => {
			// For |x| <= 10^-9 rad, x^3 / 3 <= 3.3e-28 << 10^-18, so tan(x) rounds to x.
			for (const x of [1n, -1n, 12345n, -987654321n, 10n ** 9n]) {
				assert.equal(tanBigIntIterative(x), x)
			}
		})

		test('rejects poles where cos(x) = 0 with RangeError', () => {
			const poles = [
				piMultiple(1n, 2n),
				-piMultiple(1n, 2n),
				piMultiple(3n, 2n),
				-piMultiple(3n, 2n),
				piMultiple(101n, 2n),
				-piMultiple(101n, 2n),
			]

			for (const pole of poles) {
				assert.throws(
					() => tanBigIntIterative(pole),
					{ name: 'RangeError' },
					`expected RangeError at pole ${pole}`,
				)
			}
		})

		test('near-pole behavior returns accurate large finite values with expected sign', () => {
			const halfPi = piMultiple(1n, 2n)

			// pi/2 - 10^-6 rad: tan(pi/2 - eps) = cot(eps) ≈ 1/eps - eps/3 ≈ 10^6
			const eps = 10n ** 12n // 10^-6 rad
			const justBelow = tanBigIntIterative(halfPi - eps)
			const justAbove = tanBigIntIterative(halfPi + eps)

			// Expected magnitude ≈ 10^6 * 10^18 = 10^24 (within ~10^18 due to halfPi rounding of 2.31e-19)
			const expectedMag = 10n ** 24n
			assert.ok(justBelow > 0n)
			assert.ok(justAbove < 0n)
			assert.ok(absBigInt(justBelow - expectedMag) < 10n ** 18n)
			assert.ok(absBigInt(-justAbove - expectedMag) < 10n ** 18n)

			// 1 ULP on either side of the pole must not throw and must have huge opposite-sign values.
			const oneUlpBelow = tanBigIntIterative(halfPi - 1n)
			const oneUlpAbove = tanBigIntIterative(halfPi + 1n)
			assert.ok(oneUlpBelow > 10n ** 35n)
			assert.ok(oneUlpAbove < -(10n ** 36n))
		})

		test('non-BigInt inputs throw TypeError', () => {
			const invalidInputs = [
				0,
				1,
				-1.5,
				NaN,
				Infinity,
				-Infinity,
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

			for (const bad of invalidInputs) {
				assert.throws(() => tanBigIntIterative(bad), { name: 'TypeError' })
			}
		})
	})

	describe('independent cross-checks', () => {
		test('matches Math.tan across angles within float64 precision', () => {
			const radians = [
				-9.5, -5.0, -2.5, -1.2, -0.7, -0.25, -0.01,
				0.01, 0.25, 0.5, 0.7, 1.0, 1.2, 1.5, 2.0, 2.5, 4.0, 7.5, 10.0,
			]

			for (const rad of radians) {
				const x = BigInt(Math.round(rad * 1e18))
				const exactScaled = Number(tanBigIntIterative(x)) / 1e18
				const ref = Math.tan(Number(x) / 1e18)
				const tol = Math.max(1e-13, Math.abs(ref) * 1e-13)
				assert.ok(
					Math.abs(exactScaled - ref) <= tol,
					`rad=${rad}: got ${exactScaled}, expected ${ref} (diff=${Math.abs(exactScaled - ref)})`,
				)
			}
		})

		test('satisfies double-angle identity tan(2x) = 2*tan(x) / (1 - tan(x)^2)', () => {
			const angles = [
				100000000000000000n, // 0.1 rad
				300000000000000000n, // 0.3 rad
				500000000000000000n, // 0.5 rad
				-600000000000000000n, // -0.6 rad
				1000000000000000000n, // 1.0 rad
				-1200000000000000000n, // -1.2 rad
				2100000000000000000n, // 2.1 rad
				piMultiple(1n, 6n), // pi/6 -> tan(pi/3) = sqrt(3)
				piMultiple(1n, 8n), // pi/8 -> tan(pi/4) = 1
				piMultiple(17n, 7n), // multi-turn rational multiple of pi
			]

			for (const x of angles) {
				const t = tanBigIntIterative(x)
				const lhs = tanBigIntIterative(2n * x)

				// Exact fixed-point evaluation of 2*t / (1 - t^2):
				// (2 * t * SCALE^2) / (SCALE^2 - t^2)
				const scaleSq = SCALE * SCALE
				const num = 2n * t * scaleSq
				const den = scaleSq - t * t
				// Round half away from zero
				const sign = (num < 0n) !== (den < 0n) ? -1n : 1n
				const absNum = absBigInt(num)
				const absDen = absBigInt(den)
				const rhs = sign * ((absNum + absDen / 2n) / absDen)

				// Allow small rounding propagation from intermediate tan(x) scaled by |d/dt (2t/(1-t^2))|
				const sensitivity = 10n + (4n * absBigInt(lhs)) / SCALE + (2n * lhs * lhs) / scaleSq
				assert.ok(
					absBigInt(lhs - rhs) <= sensitivity,
					`double-angle mismatch for x=${x}: lhs=${lhs}, rhs=${rhs}, diff=${absBigInt(lhs - rhs)}`,
				)
			}
		})

		test('satisfies co-function identity tan(x) * tan(pi/2 - x) === 1', () => {
			const halfPi = piMultiple(1n, 2n)
			const angles = [
				100000000000000000n, // 0.1 rad
				400000000000000000n, // 0.4 rad
				700000000000000000n, // 0.7 rad
				1100000000000000000n, // 1.1 rad
				1400000000000000000n, // 1.4 rad
			]

			for (const x of angles) {
				const a = tanBigIntIterative(x)
				const b = tanBigIntIterative(halfPi - x)
				const prod = (a * b + SCALE / 2n) / SCALE
				assert.ok(
					absBigInt(prod - SCALE) <= 50n,
					`complement product mismatch for x=${x}: prod=${prod}`,
				)
			}
		})
	})
})
