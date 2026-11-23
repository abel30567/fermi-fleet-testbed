import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { projectionBigIntMemo, SCALE } from './projectionBigIntMemo.js'

/**
 * Independent unmemoized reference implementation using direct rational
 * arithmetic without tables or caches, for cross-checking.
 */
function referenceProjection(a, b) {
	let dotAB = 0n
	let dotBB = 0n
	for (let i = 0; i < a.length; i++) {
		dotAB += a[i] * b[i]
		dotBB += b[i] * b[i]
	}
	return b.map((bi) => {
		const num = dotAB * bi * 10n ** 18n
		const sign = num < 0n ? -1n : 1n
		const absNum = num < 0n ? -num : num
		const q = absNum / dotBB
		const r = absNum % dotBB
		const cmp = r * 2n
		let rounded = q
		if (cmp > dotBB || (cmp === dotBB && q % 2n === 1n)) {
			rounded = q + 1n
		}
		return sign * rounded
	})
}

describe('projectionBigIntMemo', () => {
	test('exports SCALE equal to 10^18', () => {
		assert.equal(SCALE, 1_000_000_000_000_000_000n)
	})

	test('projects onto standard basis vectors exactly', () => {
		assert.deepEqual(projectionBigIntMemo([3n, 4n], [1n, 0n]), [
			3n * SCALE,
			0n,
		])
		assert.deepEqual(projectionBigIntMemo([3n, 4n], [0n, 1n]), [
			0n,
			4n * SCALE,
		])
		assert.deepEqual(projectionBigIntMemo([-7n, 2n, 9n], [0n, 0n, -1n]), [
			0n,
			0n,
			9n * SCALE,
		])
	})

	test('computes exact fixed-point projections when b·b divides 10^18', () => {
		// a = [3, 4], b = [1, 1] -> dotAB = 7, dotBB = 2 -> [3.5, 3.5] * 10^18
		assert.deepEqual(projectionBigIntMemo([3n, 4n], [1n, 1n]), [
			3_500_000_000_000_000_000n,
			3_500_000_000_000_000_000n,
		])

		// a = [1, 2], b = [3, 4] -> dotAB = 11, dotBB = 25 -> [33/25, 44/25] = [1.32, 1.76]
		assert.deepEqual(projectionBigIntMemo([1n, 2n], [3n, 4n]), [
			1_320_000_000_000_000_000n,
			1_760_000_000_000_000_000n,
		])

		// b·b = 10000 (outside 1024 table, still exact divisor of 10^18)
		// b = [60, 80] -> dotBB = 10000, a = [1, 2] -> dotAB = 220
		// proj = [220*60/10000, 220*80/10000] = [1.32, 1.76]
		assert.deepEqual(projectionBigIntMemo([1n, 2n], [60n, 80n]), [
			1_320_000_000_000_000_000n,
			1_760_000_000_000_000_000n,
		])
	})

	test('computes non-terminating rational projections with round-half-to-even', () => {
		// a = [1, 0, 0], b = [1, 1, 1] -> dotAB = 1, dotBB = 3 -> [1/3, 1/3, 1/3]
		assert.deepEqual(projectionBigIntMemo([1n, 0n, 0n], [1n, 1n, 1n]), [
			333_333_333_333_333_333n,
			333_333_333_333_333_333n,
			333_333_333_333_333_333n,
		])

		// a = [2, 0, 0], b = [1, 1, 1] -> 2/3 rounds up at 18th decimal place
		assert.deepEqual(projectionBigIntMemo([2n, 0n, 0n], [1n, 1n, 1n]), [
			666_666_666_666_666_667n,
			666_666_666_666_666_667n,
			666_666_666_666_666_667n,
		])

		// Negative rounding symmetry: proj(-a, b) = -proj(a, b)
		assert.deepEqual(projectionBigIntMemo([-2n, 0n, 0n], [1n, 1n, 1n]), [
			-666_666_666_666_666_667n,
			-666_666_666_666_666_667n,
			-666_666_666_666_666_667n,
		])
	})

	test('handles exact half-tie round-half-to-even cases', () => {
		// Need num / den = k + 1/2 where den = b·b is even and does not divide 10^18.
		// Choose b = [1, 1, 2] -> dotBB = 6; b_0 = 1 -> (dotAB * 10^18) / 6.
		// For 10^18 % 6 = 4, we want a denominator where 10^18 / gcd(10^18, den) leaves factor 2 in den:
		// 10^18 = 2^18 * 5^18, so choose den = 2^19 = 524288 -> b = [512, 512] gives dotBB = 2 * 512^2 = 524288 = 2^19!
		// Wait: with b = [512, 512], b_i = 512 = 2^9 cancels 2^9, so instead use 1D b = [2^19] -> dotBB = 2^38,
		// and a = [1]: (a·b)*b / (b·b) = a = 1 (exact!).
		// Better: 2D b = [1, 1024] -> dotBB = 1 + 2^20 = 1048577 (odd).
		// To get exact tie (r * 2 === den): den must be even AND num / den = m + 1/2 => 2*num = (2m+1)*den.
		// Since 10^18 has factor 2^18, den must have factor 2^19 (so 2^19 | dotBB) while (dotAB * b_i) is odd.
		// Choose b = [1, 1, 1, 1] * ... wait: sum of squares divisible by 2^19 with odd b_0:
		// Take b = [1, 1, ..., 1] with 2^19 entries? Too big.
		// Take b = [1, 724] -> 1 + 524176 = 524177 (odd).
		// Easy: 524288 = 2^19. Express 2^19 as a sum of squares with an odd element!
		// Impossible mod 4 for 2 squares, so use 4 squares: 1^2 + 1^2 + 2^2 + ... wait: 1+1+1+1 = 4 (0 mod 4),
		// Need sum = 2^19 = 524288. Try 4 odd squares? Sum of 4 odd squares is 4 mod 8 (not 0 mod 8).
		// Sum of 8 odd squares can be 0 mod 8! Specifically:
		// 1^2 + 1^2 + 1^2 + 1^2 + 1^2 + 1^2 + 1^2 + 724^2 = 7 + 524176 = 524183.
		// Find a^2 + b^2 + c^2 + d^2 + e^2 + f^2 + g^2 + h^2 = 524288 with an odd component:
		// 524288 - 723^2 = 524288 - 522729 = 1559.
		// 1559 - 39^2 = 1559 - 1521 = 38.
		// 38 = 5^2 + 3^2 + 2^2 = 25 + 9 + 4 (5+3+... wait: 723, 39, 5, 3, 2 -> 522729 + 1521 + 25 + 9 + 4 = 524288!).
		const b = [723n, 39n, 5n, 3n, 2n] // dotBB = 524288 = 2^19
		// Choose a1 = [0, 0, 0, 0, 0] with a1[4] = 0, a1[0] = 0, ..., a1 = [0, 0, 0, 1, 0] -> dotAB = 3 (odd)
		// Component 0: (3 * 723 * 10^18) / 2^19 = (2169 * 5^18) / 2 -> exact .5 tie!
		const a1 = [0n, 0n, 0n, 1n, 0n]
		const p1 = projectionBigIntMemo(a1, b)
		assert.deepEqual(p1, referenceProjection(a1, b))
		// Check that component 0 was rounded to an even integer!
		assert.equal(p1[0] & 1n, 0n)

		// Also check negative tie rounds to even
		const a1Neg = [0n, 0n, 0n, -1n, 0n]
		const p1Neg = projectionBigIntMemo(a1Neg, b)
		assert.deepEqual(p1Neg, p1.map((x) => -x))
		assert.equal(p1Neg[0] & 1n, 0n)

		// Choose dotAB = 1 by setting a2 = [0, 0, 1, -1, -1]: 5 - 3 - 2 = 0, try [0, 0, 1, 0, -2] -> 5 - 4 = 1!
		// Component 0: (1 * 723 * 5^18) / 2 -> floor is (723 * 5^18 - 1) / 2 (let's verify parity differs or matches)
		const a2 = [0n, 0n, 1n, 0n, -2n] // dotAB = 1
		const p2 = projectionBigIntMemo(a2, b)
		assert.deepEqual(p2, referenceProjection(a2, b))
		assert.equal(p2[0] & 1n, 0n)
	})

	test('handles edge cases: zero source vector, orthogonal, parallel, anti-parallel, 1D', () => {
		// Zero source vector -> zero vector
		assert.deepEqual(projectionBigIntMemo([0n, 0n, 0n], [5n, -12n, 3n]), [
			0n,
			0n,
			0n,
		])

		// Orthogonal vectors -> zero vector
		assert.deepEqual(projectionBigIntMemo([1n, 2n, 3n], [2n, -1n, 0n]), [
			0n,
			0n,
			0n,
		])

		// Parallel vector: proj_b(k*b) = k*b * SCALE
		const b = [3n, -5n, 7n]
		const parallel = b.map((x) => 4n * x)
		assert.deepEqual(
			projectionBigIntMemo(parallel, b),
			parallel.map((x) => x * SCALE),
		)

		// Anti-parallel vector: proj_b(-3*b) = -3*b * SCALE
		const antiParallel = b.map((x) => -3n * x)
		assert.deepEqual(
			projectionBigIntMemo(antiParallel, b),
			antiParallel.map((x) => x * SCALE),
		)

		// 1D vectors: proj_[b]([a]) = [a * SCALE] regardless of b != 0
		assert.deepEqual(projectionBigIntMemo([42n], [-999n]), [42n * SCALE])
		assert.deepEqual(projectionBigIntMemo([-17n], [1n]), [-17n * SCALE])
	})

	test('preserves exact precision for very large BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
		const big = 10n ** 30n
		const a = [big + 1n, big + 2n]
		const b = [big, 0n]
		assert.deepEqual(projectionBigIntMemo(a, b), [(big + 1n) * SCALE, 0n])

		const a2 = [2n ** 100n + 7n, -(2n ** 99n) + 3n, 2n ** 80n]
		const b2 = [2n ** 90n + 1n, 2n ** 91n - 5n, -(2n ** 89n) + 11n]
		assert.deepEqual(
			projectionBigIntMemo(a2, b2),
			referenceProjection(a2, b2),
		)
	})

	test('verifies mathematical invariants: scale invariance in b, orthogonality of residual, idempotence', () => {
		const a = [11n, -7n, 23n, -5n]
		const b = [3n, 4n, -2n, 6n]
		const p = projectionBigIntMemo(a, b)

		// Scale invariance: proj(a, k*b) === proj(a, b) for k != 0
		for (const k of [-17n, -1n, 2n, 13n, 1000n]) {
			const scaledB = b.map((x) => x * k)
			assert.deepEqual(projectionBigIntMemo(a, scaledB), p)
		}

		// Residual r = a*SCALE - p should be nearly orthogonal to b:
		// |r · b| <= sum(|b_i|) / 2 (since each p_i has rounding error <= 0.5 ULP)
		let residualDotB = 0n
		let absBSum = 0n
		for (let i = 0; i < a.length; i++) {
			residualDotB += (a[i] * SCALE - p[i]) * b[i]
			absBSum += b[i] < 0n ? -b[i] : b[i]
		}
		const absResidual = residualDotB < 0n ? -residualDotB : residualDotB
		assert.ok(absResidual * 2n <= absBSum)

		// Idempotence on exact projection (b = [3, 4], dotBB = 25 divides SCALE):
		// pExact is exact, so proj(pExact, b) === pExact * SCALE
		const aEx = [17n, -9n]
		const bEx = [3n, 4n]
		const pEx = projectionBigIntMemo(aEx, bEx)
		assert.deepEqual(
			projectionBigIntMemo(pEx, bEx),
			pEx.map((x) => x * SCALE),
		)
	})

	test('memoization isolates returned arrays and avoids key collisions', () => {
		const a = [5n, 7n]
		const b = [2n, 1n]

		const first = projectionBigIntMemo(a, b)
		const expected = first.slice()
		// Mutate returned array to verify cached copy is protected
		first[0] = 999999n
		first.push(123n)

		const second = projectionBigIntMemo(a, b)
		assert.deepEqual(second, expected)
		assert.notEqual(first, second)

		// Key collision check: [1, 23] vs [12, 3]
		const pA = projectionBigIntMemo([1n, 23n], [1n, 1n])
		const pB = projectionBigIntMemo([12n, 3n], [1n, 1n])
		assert.notDeepEqual(pA, pB)
		assert.deepEqual(pA, [12n * SCALE, 12n * SCALE])
		assert.deepEqual(pB, [
			7_500_000_000_000_000_000n,
			7_500_000_000_000_000_000n,
		])
	})

	test('handles cache eviction gracefully beyond capacity', () => {
		const b = [1n, 2n, 3n]
		for (let i = 0n; i < 1100n; i++) {
			const res = projectionBigIntMemo([i, -i, 2n * i], b)
			if (i === 0n || i === 500n || i === 1099n) {
				assert.deepEqual(res, referenceProjection([i, -i, 2n * i], b))
			}
		}
		// Re-query evicted entry
		assert.deepEqual(
			projectionBigIntMemo([0n, 0n, 0n], b),
			[0n, 0n, 0n],
		)
	})

	test('independent cross-check against naive rational reference & exact error bound across diverse vectors', () => {
		// Deterministic LCG for reproducible pseudo-random test vectors
		let seed = 123456789n
		const nextInt = (bound) => {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
			return (seed % (2n * bound + 1n)) - bound
		}

		for (const dim of [1, 2, 3, 5, 8]) {
			for (let trial = 0; trial < 20; trial++) {
				const bound = trial % 3 === 0 ? 10n : trial % 3 === 1 ? 500n : 10n ** 12n
				const a = Array.from({ length: dim }, () => nextInt(bound))
				const b = Array.from({ length: dim }, () => nextInt(bound))
				if (b.every((x) => x === 0n)) b[0] = 1n

				const actual = projectionBigIntMemo(a, b)
				const expected = referenceProjection(a, b)
				assert.deepEqual(actual, expected)

				// Independent algebraic error bound check:
				// |actual[i] * dotBB - dotAB * b[i] * SCALE| * 2 <= dotBB
				let dotAB = 0n
				let dotBB = 0n
				for (let i = 0; i < dim; i++) {
					dotAB += a[i] * b[i]
					dotBB += b[i] * b[i]
				}
				for (let i = 0; i < dim; i++) {
					const diff = actual[i] * dotBB - dotAB * b[i] * SCALE
					const absDiff = diff < 0n ? -diff : diff
					assert.ok(absDiff * 2n <= dotBB)
				}
			}
		}
	})

	test('validates inputs and throws descriptive errors', () => {
		// Non-array inputs
		assert.throws(() => projectionBigIntMemo(null, [1n]), TypeError)
		assert.throws(() => projectionBigIntMemo([1n], '1'), TypeError)
		assert.throws(() => projectionBigIntMemo({ 0: 1n, length: 1 }, [1n]), TypeError)

		// Empty vectors
		assert.throws(() => projectionBigIntMemo([], []), RangeError)
		assert.throws(() => projectionBigIntMemo([], [1n]), RangeError)
		assert.throws(() => projectionBigIntMemo([1n], []), RangeError)

		// Mismatched lengths
		assert.throws(() => projectionBigIntMemo([1n, 2n], [1n]), RangeError)
		assert.throws(() => projectionBigIntMemo([1n], [1n, 2n, 3n]), RangeError)

		// Non-bigint elements (including numbers and sparse holes)
		assert.throws(() => projectionBigIntMemo([1, 2n], [1n, 2n]), TypeError)
		assert.throws(() => projectionBigIntMemo([1n, 2n], [1n, '2']), TypeError)
		assert.throws(() => projectionBigIntMemo([1n, null], [1n, 2n]), TypeError)
		// eslint-disable-next-line no-sparse-arrays
		const sparse = [1n, , 3n]
		assert.throws(() => projectionBigIntMemo(sparse, [1n, 2n, 3n]), TypeError)

		// Zero target vector
		assert.throws(() => projectionBigIntMemo([1n, 2n], [0n, 0n]), RangeError)
		assert.throws(() => projectionBigIntMemo([0n], [0n]), RangeError)
	})
})
