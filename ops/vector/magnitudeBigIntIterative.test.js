import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { magnitudeBigIntIterative } from './magnitudeBigIntIterative.js'

const SCALE = 10n ** 18n
const SCALE_SQ = 10n ** 36n

/**
 * Verifies the exact fixed-point floor square root bracket:
 *   r^2 <= sum(v_i^2) * 10^36 < (r + 1)^2
 *
 * @param {readonly bigint[]} vector
 * @param {bigint} result
 */
function assertExactFloorSqrtBracket(vector, result) {
	assert.equal(typeof result, 'bigint')
	assert.ok(result >= 0n, `Expected non-negative result, got ${result}`)

	const sumSq = vector.reduce((acc, v) => acc + v * v, 0n)
	const scaledTarget = sumSq * SCALE_SQ
	const lower = result * result
	const upper = (result + 1n) * (result + 1n)

	assert.ok(
		lower <= scaledTarget && scaledTarget < upper,
		`Bracket failed for ${vector.length}D vector: ${lower} <= ${scaledTarget} < ${upper}`
	)
}

describe('magnitudeBigIntIterative', () => {
	describe('normal cases', () => {
		test('Pythagorean triples and exact integer norms', () => {
			assert.equal(magnitudeBigIntIterative([3n, 4n]), 5n * SCALE)
			assert.equal(magnitudeBigIntIterative([5n, 12n]), 13n * SCALE)
			assert.equal(magnitudeBigIntIterative([8n, 15n]), 17n * SCALE)
			assert.equal(magnitudeBigIntIterative([3n, 4n, 12n]), 13n * SCALE)
			assert.equal(magnitudeBigIntIterative([2n, 3n, 6n]), 7n * SCALE)
			assert.equal(magnitudeBigIntIterative([1n, 2n, 2n]), 3n * SCALE)
		})

		test('single-component vectors', () => {
			assert.equal(magnitudeBigIntIterative([1n]), 1n * SCALE)
			assert.equal(magnitudeBigIntIterative([42n]), 42n * SCALE)
			assert.equal(magnitudeBigIntIterative([-42n]), 42n * SCALE)
		})

		test('non-integer norms truncated to 18 decimal places', () => {
			// floor(sqrt(2) * 10^18)
			assert.equal(magnitudeBigIntIterative([1n, 1n]), 1414213562373095048n)
			// floor(sqrt(3) * 10^18)
			assert.equal(magnitudeBigIntIterative([1n, 1n, 1n]), 1732050807568877293n)
			// floor(sqrt(5) * 10^18)
			assert.equal(magnitudeBigIntIterative([1n, 2n]), 2236067977499789696n)
			// floor(sqrt(10) * 10^18)
			assert.equal(magnitudeBigIntIterative([1n, 3n]), 3162277660168379331n)
		})
	})

	describe('edge cases', () => {
		test('empty and zero vectors return 0n', () => {
			assert.equal(magnitudeBigIntIterative([]), 0n)
			assert.equal(magnitudeBigIntIterative([0n]), 0n)
			assert.equal(magnitudeBigIntIterative([0n, 0n, 0n, 0n]), 0n)
		})

		test('negative components do not affect Euclidean norm', () => {
			assert.equal(magnitudeBigIntIterative([-3n, -4n]), 5n * SCALE)
			assert.equal(magnitudeBigIntIterative([-3n, 4n]), 5n * SCALE)
			assert.equal(magnitudeBigIntIterative([3n, -4n]), 5n * SCALE)
			assert.equal(magnitudeBigIntIterative([-1n, -1n]), 1414213562373095048n)
			assert.equal(magnitudeBigIntIterative([-2n, 3n, -6n]), 7n * SCALE)
		})

		test('huge BigInts (> 2^100)', () => {
			const big = 1n << 120n
			assert.equal(
				magnitudeBigIntIterative([3n * big, 4n * big]),
				5n * big * SCALE
			)
			assert.equal(
				magnitudeBigIntIterative([-3n * big, 4n * big, -12n * big]),
				13n * big * SCALE
			)

			const hugeNonInteger = [1n << 128n, (1n << 128n) + 7n, -(1n << 105n)]
			const hugeResult = magnitudeBigIntIterative(hugeNonInteger)
			assertExactFloorSqrtBracket(hugeNonInteger, hugeResult)

			const asymmetricHuge = [1n << 160n, 1n]
			const asymmetricResult = magnitudeBigIntIterative(asymmetricHuge)
			assertExactFloorSqrtBracket(asymmetricHuge, asymmetricResult)
			// Adding 1^2 to (2^160)^2 changes sqrt by ~ 1 / (2 * 2^160) << 10^-18,
			// so floor(sqrt(2^320 + 1) * 10^18) === 2^160 * 10^18
			assert.equal(asymmetricResult, (1n << 160n) * SCALE)
		})

		test('rejects non-array inputs with TypeError', () => {
			for (const invalid of [null, undefined, 0, 42, 42n, '123', {}, new Set([1n])]) {
				assert.throws(() => magnitudeBigIntIterative(invalid), TypeError)
			}
		})

		test('rejects non-BigInt elements and sparse arrays with TypeError', () => {
			const sparse = new Array(3)
			sparse[0] = 1n
			sparse[2] = 2n

			const invalidVectors = [
				[1, 2],
				[1n, 2],
				[1n, '2'],
				[1n, null],
				[1n, undefined],
				[1n, true],
				[1n, {}],
				[NaN],
				sparse
			]

			for (const vec of invalidVectors) {
				assert.throws(() => magnitudeBigIntIterative(vec), TypeError)
			}
		})
	})

	describe('cross-checks against independent computations', () => {
		test('satisfies exact bracket r^2 <= sum(v_i^2)*10^36 < (r+1)^2 across varied vectors', () => {
			const vectors = [
				[],
				[0n],
				[1n],
				[1n, 1n],
				[7n, -11n, 13n, -17n, 19n],
				[999999999999n, -888888888888n, 777777777777n],
				[(1n << 101n) - 1n, (1n << 102n) + 3n],
				[-(1n << 200n), (1n << 199n) + 123456789n, -(1n << 150n)]
			]

			for (const vec of vectors) {
				const res = magnitudeBigIntIterative(vec)
				assertExactFloorSqrtBracket(vec, res)
			}
		})

		test('agrees with Math.hypot within floating-point precision for Number-range vectors', () => {
			const cases = [
				[3n, 4n],
				[1n, 1n],
				[1n, 2n, 3n, 4n, 5n],
				[-123n, 456n, -789n],
				[100000n, 200000n, 300000n],
				[9876543n, -1234567n, 5555555n, -4444444n]
			]

			for (const vec of cases) {
				const exactScaled = magnitudeBigIntIterative(vec)
				assertExactFloorSqrtBracket(vec, exactScaled)

				const approxFromBigInt = Number(exactScaled) / 1e18
				const expectedHypot = Math.hypot(...vec.map(Number))
				const tolerance = 1e-12 * Math.max(1, expectedHypot)

				assert.ok(
					Math.abs(approxFromBigInt - expectedHypot) <= tolerance,
					`Mismatch for [${vec.join(', ')}]: got ${approxFromBigInt}, Math.hypot=${expectedHypot}`
				)
			}
		})

		test('invariant under component permutation and sign flips', () => {
			const base = [17n, -31n, 53n, -97n, 193n]
			const reversed = [...base].reverse()
			const negated = base.map((x) => -x)

			const expected = magnitudeBigIntIterative(base)
			assert.equal(magnitudeBigIntIterative(reversed), expected)
			assert.equal(magnitudeBigIntIterative(negated), expected)
		})
	})
})
