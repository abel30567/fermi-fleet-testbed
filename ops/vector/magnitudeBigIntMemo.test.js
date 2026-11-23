import { describe, it } from 'node:test'
import assert from 'node:assert'
import { magnitudeBigIntMemo } from './magnitudeBigIntMemo.js'

const SCALE = 10n ** 18n
const SCALE_SQ = SCALE * SCALE

/**
 * Independent reference implementation using binary search integer square root
 * (no tables, no memoization, no Newton iteration).
 *
 * @param {readonly bigint[]} vector
 * @returns {bigint}
 */
function referenceMagnitudeBinarySearch(vector) {
	let sumSq = 0n
	for (const v of vector) {
		sumSq += v * v
	}
	const target = sumSq * SCALE_SQ
	if (target < 2n) return target

	let low = 1n
	let high = 1n
	while (high * high <= target) {
		low = high
		high <<= 1n
	}
	while (low + 1n < high) {
		const mid = (low + high) >> 1n
		if (mid * mid <= target) {
			low = mid
		} else {
			high = mid
		}
	}
	return low
}

describe('magnitudeBigIntMemo', () => {
	it('computes exact integer magnitudes scaled by 10^18 for Pythagorean tuples', () => {
		assert.strictEqual(magnitudeBigIntMemo([3n, 4n]), 5n * SCALE)
		assert.strictEqual(magnitudeBigIntMemo([-3n, 4n]), 5n * SCALE)
		assert.strictEqual(magnitudeBigIntMemo([3n, -4n]), 5n * SCALE)
		assert.strictEqual(magnitudeBigIntMemo([-3n, -4n]), 5n * SCALE)
		assert.strictEqual(magnitudeBigIntMemo([5n, 12n]), 13n * SCALE)
		assert.strictEqual(magnitudeBigIntMemo([8n, 15n]), 17n * SCALE)
		assert.strictEqual(magnitudeBigIntMemo([1n, 2n, 2n]), 3n * SCALE)
		assert.strictEqual(magnitudeBigIntMemo([2n, 3n, 6n]), 7n * SCALE)
		assert.strictEqual(magnitudeBigIntMemo([6n, 10n, 15n]), 19n * SCALE)
	})

	it('computes exact fixed-point floor scaled by 10^18 for irrational magnitudes', () => {
		// sqrt(2) = 1.4142135623730950488016887...
		assert.strictEqual(magnitudeBigIntMemo([1n, 1n]), 1414213562373095048n)
		// sqrt(3) = 1.7320508075688772935274463...
		assert.strictEqual(magnitudeBigIntMemo([1n, 1n, 1n]), 1732050807568877293n)
		// sqrt(5) = 2.2360679774997896964091736...
		assert.strictEqual(magnitudeBigIntMemo([1n, 2n]), 2236067977499789696n)
	})

	it('handles empty, zero, and single-element vectors', () => {
		assert.strictEqual(magnitudeBigIntMemo([]), 0n)
		assert.strictEqual(magnitudeBigIntMemo([0n]), 0n)
		assert.strictEqual(magnitudeBigIntMemo([0n, 0n, 0n, 0n]), 0n)
		assert.strictEqual(magnitudeBigIntMemo([1n]), 1n * SCALE)
		assert.strictEqual(magnitudeBigIntMemo([-1n]), 1n * SCALE)
		assert.strictEqual(magnitudeBigIntMemo([-42n]), 42n * SCALE)
	})

	it('handles table boundaries and transitions cleanly', () => {
		// Component square table boundary (1024 vs 1025)
		assert.strictEqual(magnitudeBigIntMemo([1024n]), 1024n * SCALE)
		assert.strictEqual(magnitudeBigIntMemo([-1024n]), 1024n * SCALE)
		assert.strictEqual(magnitudeBigIntMemo([1025n]), 1025n * SCALE)
		assert.strictEqual(magnitudeBigIntMemo([-1025n]), 1025n * SCALE)

		// Scaled sqrt table boundary (sumSq = 1024 vs sumSq = 1025)
		assert.strictEqual(magnitudeBigIntMemo([32n]), 32n * SCALE)
		const sumSq1025 = magnitudeBigIntMemo([32n, 1n])
		assert.strictEqual(sumSq1025, referenceMagnitudeBinarySearch([32n, 1n]))
		assert.strictEqual(sumSq1025 * sumSq1025 <= 1025n * SCALE_SQ, true)
		assert.strictEqual((sumSq1025 + 1n) * (sumSq1025 + 1n) > 1025n * SCALE_SQ, true)
	})

	it('handles arbitrarily large BigInt components without precision loss', () => {
		const big = 10n ** 40n
		assert.strictEqual(magnitudeBigIntMemo([3n * big, 4n * big]), 5n * big * SCALE)

		const hugeVec = [10n ** 30n + 7n, -(10n ** 30n + 13n), 10n ** 25n + 99n]
		const actual = magnitudeBigIntMemo(hugeVec)
		const expected = referenceMagnitudeBinarySearch(hugeVec)
		assert.strictEqual(actual, expected)
	})

	it('returns consistent memoized results across repeated, permuted, and evicted cache entries', () => {
		const v1 = [100n, 200n, 300n]
		const v2 = [-300n, 0n, 100n, -200n]
		const first = magnitudeBigIntMemo(v1)
		const second = magnitudeBigIntMemo(v1)
		const equivalent = magnitudeBigIntMemo(v2)
		assert.strictEqual(first, second)
		assert.strictEqual(first, equivalent)

		// Exercise bounded cache eviction (> 4096 distinct uncached sumSq entries)
		const earlyVec = [40n, 1n] // sumSq = 1601
		const earlyBefore = magnitudeBigIntMemo(earlyVec)
		for (let i = 41; i < 4250; i++) {
			const res = magnitudeBigIntMemo([BigInt(i), 1n])
			const sumSq = BigInt(i) * BigInt(i) + 1n
			assert.strictEqual(res * res <= sumSq * SCALE_SQ, true)
			assert.strictEqual((res + 1n) * (res + 1n) > sumSq * SCALE_SQ, true)
		}
		const earlyAfter = magnitudeBigIntMemo(earlyVec)
		assert.strictEqual(earlyAfter, earlyBefore)
		assert.strictEqual(earlyAfter, referenceMagnitudeBinarySearch(earlyVec))
	})

	it('matches independent binary-search reference and Math.hypot across diverse vectors', () => {
		const testVectors = [
			[0n, 1n],
			[2n, 5n],
			[7n, 11n, 13n],
			[-19n, 23n, -29n, 31n],
			[100n, 101n, 102n, 103n, 104n],
			[1024n, 1024n],
			[1025n, 2048n],
			[99991n, 123456n, -654321n],
			[1n, 1n, 1n, 1n, 1n, 1n, 1n, 1n, 1n, 1n]
		]

		for (const vec of testVectors) {
			const actual = magnitudeBigIntMemo(vec)
			const ref = referenceMagnitudeBinarySearch(vec)
			assert.strictEqual(actual, ref)

			// Independent algebraic bracket check: r^2 <= sumSq * 10^36 < (r + 1)^2
			const sumSq = vec.reduce((acc, x) => acc + x * x, 0n)
			assert.strictEqual(actual * actual <= sumSq * SCALE_SQ, true)
			assert.strictEqual((actual + 1n) * (actual + 1n) > sumSq * SCALE_SQ, true)

			// Independent floating-point cross-check via Math.hypot
			const floatMag = Math.hypot(...vec.map(Number))
			const actualFloat = Number(actual) / 1e18
			const relErr = floatMag === 0 ? Math.abs(actualFloat) : Math.abs(actualFloat - floatMag) / floatMag
			assert.ok(relErr < 1e-14, `Expected relative error < 1e-14 for ${vec}, got ${relErr}`)
		}
	})

	it('satisfies norm invariants and does not mutate input array', () => {
		const u = [17n, -23n, 41n]
		const v = [-5n, 31n, -11n]
		const uCopy = [...u]

		const normU = magnitudeBigIntMemo(u)
		const normV = magnitudeBigIntMemo(v)
		const normSum = magnitudeBigIntMemo(u.map((x, i) => x + v[i]))

		// Input immutability
		assert.deepStrictEqual(u, uCopy)

		// Triangle inequality (allowing at most 1 ULP for floor truncation)
		assert.ok(normSum <= normU + normV + 1n)

		// Positive homogeneity: ||k * u|| vs k * ||u||
		const k = 7n
		const normScaled = magnitudeBigIntMemo(u.map((x) => k * x))
		assert.ok(normScaled >= k * normU)
		assert.ok(normScaled < k * (normU + 1n))
	})

	it('validates inputs and rejects non-arrays, non-BigInts, and sparse arrays', () => {
		for (const bad of [null, undefined, 123, 123n, '123', {}, new Set([1n]), new BigInt64Array([3n, 4n])]) {
			assert.throws(() => magnitudeBigIntMemo(bad), TypeError)
		}

		for (const badVec of [[3, 4], [3n, 4], [3n, '4'], [null], [undefined], [NaN], [true], [{}]]) {
			assert.throws(() => magnitudeBigIntMemo(badVec), TypeError)
		}

		// Sparse array with hole
		const sparse = new Array(3)
		sparse[0] = 3n
		sparse[2] = 4n
		assert.throws(() => magnitudeBigIntMemo(sparse), TypeError)
	})
})
