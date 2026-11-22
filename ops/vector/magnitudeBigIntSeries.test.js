import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { magnitudeBigIntSeries } from './magnitudeBigIntSeries.js'

const SCALE = 10n ** 18n
const SCALE_SQUARED = 10n ** 36n

/**
 * Independently verify that `result` is the exact nearest integer to
 * sqrt(sum(v_i^2) * 10^36) using the inequality:
 *   (result - 1/2)^2 < N < (result + 1/2)^2
 * multiplied by 4 to stay purely in exact BigInt arithmetic:
 *   (2*result - 1)^2 < 4*N < (2*result + 1)^2  (for result > 0)
 */
function assertExactRoundedMagnitude(vector, result) {
	const sumSquares = vector.reduce((acc, v) => acc + v * v, 0n)
	if (sumSquares === 0n) {
		assert.equal(result, 0n)
		return
	}
	const n = sumSquares * SCALE_SQUARED
	const fourN = 4n * n
	const lower = (2n * result - 1n) ** 2n
	const upper = (2n * result + 1n) ** 2n
	assert.ok(
		lower < fourN && fourN < upper,
		`Expected (2*r - 1)^2 < 4*N < (2*r + 1)^2 for result=${result}, N=${n}`,
	)
}

describe('magnitudeBigIntSeries', () => {
	test('exact Pythagorean triples and integer-norm vectors', () => {
		assert.equal(magnitudeBigIntSeries([3n, 4n]), 5n * SCALE)
		assert.equal(magnitudeBigIntSeries([5n, 12n]), 13n * SCALE)
		assert.equal(magnitudeBigIntSeries([8n, 15n]), 17n * SCALE)
		assert.equal(magnitudeBigIntSeries([2n, 3n, 6n]), 7n * SCALE)
		assert.equal(magnitudeBigIntSeries([7n]), 7n * SCALE)
		assert.equal(magnitudeBigIntSeries([-9n]), 9n * SCALE)
	})

	test('non-integer magnitudes rounded to nearest 10^-18', () => {
		// sqrt(2) = 1.4142135623730950488016887...
		assert.equal(magnitudeBigIntSeries([1n, 1n]), 1414213562373095049n)
		// sqrt(3) = 1.7320508075688772935274463...
		assert.equal(magnitudeBigIntSeries([1n, 1n, 1n]), 1732050807568877294n)
		// sqrt(5) = 2.2360679774997896964091736...
		assert.equal(magnitudeBigIntSeries([1n, 2n]), 2236067977499789696n)
		// sqrt(14) = 3.7416573867739413855837487...
		assert.equal(magnitudeBigIntSeries([1n, 2n, 3n]), 3741657386773941386n)
	})

	test('edge cases: empty vector, zero vectors, and negative components', () => {
		assert.equal(magnitudeBigIntSeries([]), 0n)
		assert.equal(magnitudeBigIntSeries([0n]), 0n)
		assert.equal(magnitudeBigIntSeries([0n, 0n, 0n, 0n]), 0n)
		assert.equal(magnitudeBigIntSeries([-3n, -4n]), 5n * SCALE)
		assert.equal(magnitudeBigIntSeries([-1n, 1n]), 1414213562373095049n)
		assert.equal(magnitudeBigIntSeries([0n, -5n, 0n, 12n, 0n]), 13n * SCALE)
	})

	test('huge BigInt components and near-half-ULP rounding boundaries', () => {
		const big = 10n ** 100n
		assert.equal(magnitudeBigIntSeries([3n * big, 4n * big]), 5n * big * SCALE)

		// sqrt((10^18)^2 + 1) * 10^18 = 10^36 * sqrt(1 + 10^-36)
		// = 10^36 + 0.5 - 0.125*10^-36 + ... < 10^36 + 0.5 -> rounds down to 10^36
		const nearHalfDown = magnitudeBigIntSeries([10n ** 18n, 1n])
		assert.equal(nearHalfDown, 10n ** 36n)
		assertExactRoundedMagnitude([10n ** 18n, 1n], nearHalfDown)

		// sqrt((10^18)^2 + 2) * 10^18 = 10^36 + 1 - 0.5*10^-36 + ... -> rounds up to 10^36 + 1
		const nearOne = magnitudeBigIntSeries([10n ** 18n, 1n, 1n])
		assert.equal(nearOne, 10n ** 36n + 1n)
		assertExactRoundedMagnitude([10n ** 18n, 1n, 1n], nearOne)

		// Arbitrary huge non-Pythagorean vector verified by exact rounding bounds
		const hugeVec = [10n ** 60n + 7n, -3n * 10n ** 60n + 19n, 5n * 10n ** 59n]
		const hugeMag = magnitudeBigIntSeries(hugeVec)
		assertExactRoundedMagnitude(hugeVec, hugeMag)
	})

	test('cross-check against Math.hypot and exact squared-norm invariant', () => {
		const vectors = [
			[1n, 2n, 3n, 4n, 5n],
			[-7n, 11n, -13n, 17n],
			[123456n, -654321n, 98765n],
			[1000n, 1n],
			[42n, 42n, 42n],
		]

		for (const vec of vectors) {
			const result = magnitudeBigIntSeries(vec)

			// 1. Exact rounding bracket: (result - 0.5)^2 < sum(v_i^2) * 10^36 < (result + 0.5)^2
			assertExactRoundedMagnitude(vec, result)

			// 2. Independent floating-point cross-check via Math.hypot
			const expectedFloat = Math.hypot(...vec.map(Number))
			const actualFloat = Number(result) / 1e18
			const relError = Math.abs(actualFloat - expectedFloat) / expectedFloat
			assert.ok(
				relError < 1e-14,
				`Relative error ${relError} too large for vector ${vec.join(', ')}`,
			)
		}
	})

	test('invalid inputs throw TypeError', () => {
		const invalidVectors = [
			null,
			undefined,
			42,
			42n,
			'123',
			{},
			new Set([1n, 2n]),
			new BigInt64Array([3n, 4n]),
		]
		for (const bad of invalidVectors) {
			assert.throws(() => magnitudeBigIntSeries(bad), TypeError)
		}

		const invalidElements = [
			[1, 2],
			[1n, 2],
			[1n, '2'],
			[1n, null],
			[1n, undefined],
			[NaN],
			[{}],
			[true],
		]
		for (const bad of invalidElements) {
			assert.throws(() => magnitudeBigIntSeries(bad), TypeError)
		}

		// Sparse array with hole
		const sparse = new Array(2)
		sparse[0] = 3n
		assert.throws(() => magnitudeBigIntSeries(sparse), TypeError)
	})
})
