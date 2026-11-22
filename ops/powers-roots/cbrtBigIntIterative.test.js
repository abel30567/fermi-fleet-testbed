import { describe, test } from 'node:test'
import assert from 'node:assert'
import { cbrtBigIntIterative } from './cbrtBigIntIterative.js'

const SCALE = 10n ** 18n
const SCALE_CUBED = 10n ** 54n

/**
 * Independent verifier: confirms that |r|^3 <= |x| * 10^54 < (|r| + 1)^3
 * and that the sign matches x.
 */
function assertExactFixedPointCbrt(x, result) {
	assert.strictEqual(typeof result, 'bigint')
	if (x === 0n) {
		assert.strictEqual(result, 0n)
		return
	}
	if (x < 0n) {
		assert.ok(result < 0n, `expected negative result for ${x}, got ${result}`)
	} else {
		assert.ok(result > 0n, `expected positive result for ${x}, got ${result}`)
	}
	const absX = x < 0n ? -x : x
	const absR = result < 0n ? -result : result
	const target = absX * SCALE_CUBED
	const lower = absR * absR * absR
	const upper = (absR + 1n) * (absR + 1n) * (absR + 1n)
	assert.ok(lower <= target, `|r|^3 (${lower}) exceeded |x|*10^54 (${target}) for x=${x}`)
	assert.ok(target < upper, `(|r|+1)^3 (${upper}) did not exceed |x|*10^54 (${target}) for x=${x}`)
}

describe('cbrtBigIntIterative', () => {
	test('computes exact fixed-point cube roots for positive perfect cubes', () => {
		const cases = [
			[1n, 1n * SCALE],
			[8n, 2n * SCALE],
			[27n, 3n * SCALE],
			[64n, 4n * SCALE],
			[125n, 5n * SCALE],
			[1000n, 10n * SCALE],
			[1000000n, 100n * SCALE],
			[10n ** 18n, 10n ** 6n * SCALE],
		]

		for (const [input, expected] of cases) {
			const actual = cbrtBigIntIterative(input)
			assert.strictEqual(actual, expected)
			assertExactFixedPointCbrt(input, actual)
		}
	})

	test('computes accurate fixed-point cube roots for positive non-cubes', () => {
		// Known high-precision cube roots truncated to 18 decimal places
		assert.strictEqual(cbrtBigIntIterative(2n), 1259921049894873164n)
		assert.strictEqual(cbrtBigIntIterative(3n), 1442249570307408382n)
		assert.strictEqual(cbrtBigIntIterative(10n), 2154434690031883721n)
		assert.strictEqual(cbrtBigIntIterative(100n), 4641588833612778892n)

		for (const n of [2n, 3n, 5n, 7n, 9n, 10n, 26n, 28n, 99n, 100n, 999n]) {
			assertExactFixedPointCbrt(n, cbrtBigIntIterative(n))
		}
	})

	test('handles zero, +/-1, and negative inputs (perfect cubes and non-cubes)', () => {
		assert.strictEqual(cbrtBigIntIterative(0n), 0n)
		assert.strictEqual(cbrtBigIntIterative(-0n), 0n)
		assert.strictEqual(cbrtBigIntIterative(1n), 1n * SCALE)
		assert.strictEqual(cbrtBigIntIterative(-1n), -1n * SCALE)
		assert.strictEqual(cbrtBigIntIterative(-8n), -2n * SCALE)
		assert.strictEqual(cbrtBigIntIterative(-27n), -3n * SCALE)
		assert.strictEqual(cbrtBigIntIterative(-1000n), -10n * SCALE)

		// Negative non-cubes preserve odd-function symmetry
		assert.strictEqual(cbrtBigIntIterative(-2n), -1259921049894873164n)
		assert.strictEqual(cbrtBigIntIterative(-10n), -2154434690031883721n)

		for (const n of [-1n, -2n, -7n, -8n, -10n, -26n, -27n, -28n, -100n, -123456789n]) {
			const actual = cbrtBigIntIterative(n)
			assert.strictEqual(actual, -cbrtBigIntIterative(-n))
			assertExactFixedPointCbrt(n, actual)
		}
	})

	test('handles huge BigInts (both exact cubes and non-cubes, positive and negative)', () => {
		const bigRoot = 123456789012345678901234567890n
		const bigCube = bigRoot ** 3n
		assert.strictEqual(cbrtBigIntIterative(bigCube), bigRoot * SCALE)
		assert.strictEqual(cbrtBigIntIterative(-bigCube), -bigRoot * SCALE)

		const hugeSamples = [
			bigCube - 1n,
			bigCube + 1n,
			-(bigCube - 1n),
			-(bigCube + 1n),
			10n ** 100n,
			-(10n ** 100n),
			(1n << 300n) + 12345n,
			-((1n << 300n) + 12345n),
		]

		for (const x of hugeSamples) {
			assertExactFixedPointCbrt(x, cbrtBigIntIterative(x))
		}
	})

	test('throws TypeError on invalid non-BigInt inputs', () => {
		const invalidInputs = [
			0,
			1,
			8,
			-27,
			2.5,
			NaN,
			Infinity,
			-Infinity,
			'8',
			'8n',
			null,
			undefined,
			true,
			false,
			{},
			[],
			Symbol('x'),
		]

		for (const bad of invalidInputs) {
			assert.throws(
				() => cbrtBigIntIterative(bad),
				{ name: 'TypeError' },
				`expected TypeError for input ${String(bad)}`
			)
		}
	})

	test('cross-checks against independent integer bracket and Math.cbrt', () => {
		const samples = [
			-1000000, -999999, -12345, -100, -28, -27, -26, -10, -2, -1,
			0, 1, 2, 3, 7, 8, 9, 10, 26, 27, 28, 100, 12345, 999999, 1000000,
			2 ** 40, -(2 ** 40), 2 ** 50 + 7,
		]

		for (const n of samples) {
			const x = BigInt(n)
			const fixed = cbrtBigIntIterative(x)

			// 1. Exact BigInt bracket check: |r|^3 <= |x| * 10^54 < (|r|+1)^3
			assertExactFixedPointCbrt(x, fixed)

			// 2. Floating-point cross-check against Math.cbrt (within float64 relative tolerance)
			const asNumber = Number(fixed) / 1e18
			const expectedFloat = Math.cbrt(n)
			const tolerance = Math.max(1e-12, Math.abs(expectedFloat) * 1e-13)
			assert.ok(
				Math.abs(asNumber - expectedFloat) <= tolerance,
				`Math.cbrt mismatch for ${n}: got ${asNumber}, expected ${expectedFloat}`
			)
		}
	})
})
