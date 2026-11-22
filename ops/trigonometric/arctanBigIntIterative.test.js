import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { arctanBigIntIterative } from './arctanBigIntIterative.js'

const SCALE = 10n ** 18n
const PI_HALF = 1570796326794896619n // round((pi / 2) * 10^18)
const PI_THIRD = 1047197551196597746n // round((pi / 3) * 10^18)
const PI_QUARTER = 785398163397448310n // round((pi / 4) * 10^18)
const PI_SIXTH = 523598775598298873n // round((pi / 6) * 10^18)

describe('arctanBigIntIterative', () => {
	test('normal cases: zero, +/-1, +/-0.5, special angles, and large values', () => {
		assert.equal(arctanBigIntIterative(0n), 0n)
		assert.equal(arctanBigIntIterative(SCALE), PI_QUARTER)
		assert.equal(arctanBigIntIterative(-SCALE), -PI_QUARTER)

		// arctan(0.5) = 0.463647609000806116214...
		const atanHalf = 463647609000806116n
		assert.equal(arctanBigIntIterative(SCALE / 2n), atanHalf)
		assert.equal(arctanBigIntIterative(-(SCALE / 2n)), -atanHalf)

		// arctan(sqrt(3)) = pi / 3, arctan(1 / sqrt(3)) = pi / 6
		const sqrt3 = 1732050807568877294n
		const invSqrt3 = 577350269189625765n
		assert.equal(arctanBigIntIterative(sqrt3), PI_THIRD)
		assert.equal(arctanBigIntIterative(-sqrt3), -PI_THIRD)
		assert.equal(arctanBigIntIterative(invSqrt3), PI_SIXTH)
		assert.equal(arctanBigIntIterative(-invSqrt3), -PI_SIXTH)

		// Large positive and negative values
		// arctan(10) = 1.471127674303734591852...
		assert.equal(arctanBigIntIterative(10n * SCALE), 1471127674303734592n)
		assert.equal(arctanBigIntIterative(-10n * SCALE), -1471127674303734592n)

		// arctan(1000) = pi/2 - 10^-3 + 10^-9/3 - 10^-15/5 + ... = 1.569796327128229752564...
		assert.equal(arctanBigIntIterative(1000n * SCALE), 1569796327128229753n)
		assert.equal(arctanBigIntIterative(-1000n * SCALE), -1569796327128229753n)
	})

	test('edge cases: tiny inputs, boundary around |x| = 1, and huge BigInt inputs', () => {
		// Tiny inputs where arctan(x) == x to 18 decimal digits
		assert.equal(arctanBigIntIterative(1n), 1n)
		assert.equal(arctanBigIntIterative(-1n), -1n)
		assert.equal(arctanBigIntIterative(123456n), 123456n)
		assert.equal(arctanBigIntIterative(-123456n), -123456n)

		// Continuity across the |x| > 1 argument reduction boundary
		const justBelow = arctanBigIntIterative(SCALE - 1n)
		const atOne = arctanBigIntIterative(SCALE)
		const justAbove = arctanBigIntIterative(SCALE + 1n)
		const twoAbove = arctanBigIntIterative(SCALE + 2n)
		assert.equal(justBelow, PI_QUARTER - 1n)
		assert.equal(atOne, PI_QUARTER)
		assert.equal(justAbove, PI_QUARTER)
		assert.equal(twoAbove, PI_QUARTER + 1n)
		assert.ok(justBelow <= atOne && atOne <= justAbove && justAbove <= twoAbove)

		// arctan(10^18) = pi/2 - 10^-18 + O(10^-54)
		assert.equal(arctanBigIntIterative(10n ** 36n), PI_HALF - 1n)
		assert.equal(arctanBigIntIterative(-(10n ** 36n)), -(PI_HALF - 1n))

		// Huge BigInt inputs saturate cleanly to +/-pi/2
		assert.equal(arctanBigIntIterative(10n ** 50n), PI_HALF)
		assert.equal(arctanBigIntIterative(-(10n ** 50n)), -PI_HALF)
		assert.equal(arctanBigIntIterative(10n ** 100n), PI_HALF)
		assert.equal(arctanBigIntIterative(-(10n ** 100n)), -PI_HALF)
	})

	test('input validation: throws TypeError for non-BigInt inputs', () => {
		const invalidInputs = [
			0,
			1,
			-1,
			1.5,
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
			Symbol('arctan')
		]
		for (const input of invalidInputs) {
			assert.throws(() => arctanBigIntIterative(input), TypeError)
		}
	})

	test('odd symmetry and monotonicity across wide range', () => {
		const samples = [
			-(10n ** 40n),
			-10000n * SCALE,
			-10n * SCALE,
			-2n * SCALE,
			-SCALE,
			-(SCALE / 4n),
			-1000n,
			0n,
			1000n,
			SCALE / 4n,
			SCALE,
			2n * SCALE,
			10n * SCALE,
			10000n * SCALE,
			10n ** 40n
		]

		let prev = null
		for (const x of samples) {
			const y = arctanBigIntIterative(x)
			assert.equal(arctanBigIntIterative(-x), -y)
			if (prev !== null) {
				assert.ok(y > prev, `expected strict increase at x=${x}`)
			}
			prev = y
		}
	})

	test('cross-check against Math.atan', () => {
		const floatInputs = [
			-1e6,
			-100,
			-10,
			-2.5,
			-1.001,
			-1,
			-0.999,
			-0.5,
			-0.1,
			-1e-6,
			0,
			1e-6,
			0.1,
			0.5,
			0.999,
			1,
			1.001,
			2.5,
			10,
			100,
			1e6
		]

		for (const v of floatInputs) {
			const scaled = BigInt(Math.round(v * 1e9)) * 10n ** 9n
			const actual = arctanBigIntIterative(scaled)
			const expected = BigInt(Math.round(Math.atan(v) * 1e15)) * 1000n
			const diff = actual >= expected ? actual - expected : expected - actual
			assert.ok(
				diff <= 2000n,
				`Mismatch vs Math.atan(${v}): actual=${actual}, expected=${expected}, diff=${diff}`
			)
		}
	})

	test("cross-check via Machin's formula and exact trigonometric identities", () => {
		// Machin's formula: 4 * arctan(1/5) - arctan(1/239) = pi / 4
		const oneFifth = SCALE / 5n // exact: 2 * 10^17
		const oneOver239 = (SCALE + 119n) / 239n // rounded to nearest 10^-18
		const machin =
			4n * arctanBigIntIterative(oneFifth) -
			arctanBigIntIterative(oneOver239)
		const machinDiff =
			machin >= PI_QUARTER ? machin - PI_QUARTER : PI_QUARTER - machin
		assert.ok(
			machinDiff <= 2n,
			`Machin formula mismatch: got ${machin}, expected ${PI_QUARTER}`
		)

		// Exact base-10 identity: arctan(1/2) + arctan(1/5) + arctan(1/8) = pi / 4
		const eulerSum =
			arctanBigIntIterative(SCALE / 2n) +
			arctanBigIntIterative(SCALE / 5n) +
			arctanBigIntIterative(SCALE / 8n)
		const eulerDiff =
			eulerSum >= PI_QUARTER ? eulerSum - PI_QUARTER : PI_QUARTER - eulerSum
		assert.ok(
			eulerDiff <= 2n,
			`Euler sum mismatch: got ${eulerSum}, expected ${PI_QUARTER}`
		)

		// Complementary angle identity: arctan(x) + arctan(1/x) = pi / 2 for exact pairs
		const exactPairs = [
			[2n * SCALE, SCALE / 2n],
			[4n * SCALE, SCALE / 4n],
			[5n * SCALE, SCALE / 5n],
			[8n * SCALE, SCALE / 8n],
			[10n * SCALE, SCALE / 10n],
			[100n * SCALE, SCALE / 100n]
		]
		for (const [x, invX] of exactPairs) {
			const sum = arctanBigIntIterative(x) + arctanBigIntIterative(invX)
			const diff = sum >= PI_HALF ? sum - PI_HALF : PI_HALF - sum
			assert.ok(
				diff <= 1n,
				`Complementary identity mismatch for (${x}, ${invX}): sum=${sum}, pi/2=${PI_HALF}`
			)
		}
	})
})
