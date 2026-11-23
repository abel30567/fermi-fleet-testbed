import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { permutationsIntervalIterative } from './permutationsIntervalIterative.js'

/**
 * Independent BigInt oracle using the factorial-ratio definition:
 *   P(n, k) = n! / (n - k)!  for 0 <= k <= n, and 0 for k > n.
 */
function exactFactorial(m) {
	let acc = 1n
	for (let i = 2n; i <= BigInt(m); i++) {
		acc *= i
	}
	return acc
}

function exactPermutationsByFactorialRatio(n, k) {
	if (k > n) return 0n
	return exactFactorial(n) / exactFactorial(n - k)
}

/**
 * Second independent oracle using binomial coefficient identity:
 *   P(n, k) = C(n, k) * k!
 * where C(n, k) is computed via Pascal's recurrence.
 */
function exactPermutationsByPascal(n, k) {
	if (k > n) return 0n
	const row = new Array(k + 1).fill(0n)
	row[0] = 1n
	for (let i = 1; i <= n; i++) {
		const upper = Math.min(i, k)
		for (let j = upper; j >= 1; j--) {
			row[j] += row[j - 1]
		}
	}
	return row[k] * exactFactorial(k)
}

/**
 * Direct exact BigInt falling product for large n with small k (where n! is impractical).
 */
function exactFallingProductBigInt(n, k) {
	if (k > n) return 0n
	let acc = 1n
	const bn = BigInt(n)
	for (let i = 0n; i < BigInt(k); i++) {
		acc *= bn - i
	}
	return acc
}

/**
 * Checks exact mathematical enclosure `lo <= exact <= hi` using BigInt conversion
 * (every non-negative integer float64, including all floats >= 2^52, converts
 * losslessly via BigInt()).
 */
function assertEnclosesBigInt(interval, exact, label = '') {
	const [lo, hi] = interval
	assert.equal(typeof lo, 'number', `${label}: lo must be number`)
	assert.equal(typeof hi, 'number', `${label}: hi must be number`)
	assert.ok(!Number.isNaN(lo) && !Number.isNaN(hi), `${label}: endpoints must not be NaN`)
	assert.ok(lo >= 0, `${label}: lo must be >= 0`)
	assert.ok(lo <= hi, `${label}: lo (${lo}) must be <= hi (${hi})`)
	assert.ok(Number.isFinite(lo), `${label}: lo must be finite`)
	assert.ok(BigInt(lo) <= exact, `${label}: lo (${lo}) exceeds exact (${exact})`)
	if (hi !== Infinity) {
		assert.ok(exact <= BigInt(hi), `${label}: exact (${exact}) exceeds hi (${hi})`)
	}
}

/**
 * Returns the ULP distance between two positive finite float64 numbers a <= b.
 */
function ulpDistance(a, b) {
	const buf = new ArrayBuffer(8)
	const f64 = new Float64Array(buf)
	const u64 = new BigUint64Array(buf)
	f64[0] = a
	const ua = u64[0]
	f64[0] = b
	const ub = u64[0]
	return ub - ua
}

describe('permutationsIntervalIterative', () => {
	describe('normal cases', () => {
		it('computes exact degenerate (point) intervals for small values', () => {
			assert.deepEqual(permutationsIntervalIterative([5, 5], [3, 3]), [60, 60])
			assert.deepEqual(permutationsIntervalIterative([10, 10], [4, 4]), [5040, 5040])
			assert.deepEqual(permutationsIntervalIterative([7, 7], [7, 7]), [5040, 5040])
			assert.deepEqual(permutationsIntervalIterative([8, 8], [1, 1]), [8, 8])
			assert.deepEqual(permutationsIntervalIterative([18, 18], [18, 18]), [6402373705728000, 6402373705728000])
		})

		it('computes exact bounds for non-degenerate intervals with kHi <= nLo', () => {
			// n in [4, 6], k in [2, 3]: min = P(4, 2) = 12, max = P(6, 3) = 120
			assert.deepEqual(permutationsIntervalIterative([4, 6], [2, 3]), [12, 120])
			// n in [5, 7], k in [0, 3]: min = P(5, 0) = 1, max = P(7, 3) = 210
			assert.deepEqual(permutationsIntervalIterative([5, 7], [0, 3]), [1, 210])
			// n in [3, 5], k in [1, 1]: P(n, 1) = n
			assert.deepEqual(permutationsIntervalIterative([3, 5], [1, 1]), [3, 5])
		})

		it('computes exact bounds when intervals overlap (nLo < kHi and kLo <= nHi)', () => {
			// n in [3, 5], k in [2, 4]: P(3, 4) = 0 is min; P(5, 4) = 120 is max
			assert.deepEqual(permutationsIntervalIterative([3, 5], [2, 4]), [0, 120])
			// n in [3, 5], k in [2, 6]: P(3, 6) = 0 is min; P(5, 5) = 120 is max
			assert.deepEqual(permutationsIntervalIterative([3, 5], [2, 6]), [0, 120])
			// n in [0, 5], k in [0, 5]: P(0, 1) = 0 is min; P(5, 5) = 120 is max
			assert.deepEqual(permutationsIntervalIterative([0, 5], [0, 5]), [0, 120])
		})
	})

	describe('edge cases', () => {
		it('handles zero-valued intervals and P(0, 0) = 1', () => {
			assert.deepEqual(permutationsIntervalIterative([0, 0], [0, 0]), [1, 1])
			assert.deepEqual(permutationsIntervalIterative([0, 10], [0, 0]), [1, 1])
			assert.deepEqual(permutationsIntervalIterative([0, 0], [0, 1]), [0, 1])
			assert.deepEqual(permutationsIntervalIterative([0, 0], [1, 3]), [0, 0])
		})

		it('returns [0, 0] when kLo > nHi (all pairs satisfy k > n)', () => {
			assert.deepEqual(permutationsIntervalIterative([2, 3], [4, 5]), [0, 0])
			assert.deepEqual(permutationsIntervalIterative([5, 5], [6, 6]), [0, 0])
			assert.deepEqual(
				permutationsIntervalIterative([1, 1], [1000, Number.MAX_SAFE_INTEGER]),
				[0, 0],
			)
		})

		it('handles k = n - 1 and k = n equality', () => {
			assert.deepEqual(permutationsIntervalIterative([6, 6], [5, 6]), [720, 720])
			assert.deepEqual(permutationsIntervalIterative([1, 1], [0, 1]), [1, 1])
		})

		it('normalizes -0 inputs to +0 without producing -0 outputs', () => {
			const res1 = permutationsIntervalIterative([-0, -0], [-0, -0])
			assert.deepEqual(res1, [1, 1])
			const res2 = permutationsIntervalIterative([-0, -0], [1, 1])
			assert.ok(Object.is(res2[0], 0))
			assert.ok(Object.is(res2[1], 0))
		})

		it('does not mutate input interval arrays', () => {
			const n = [4, 6]
			const k = [2, 3]
			const out = permutationsIntervalIterative(n, k)
			assert.deepEqual(n, [4, 6])
			assert.deepEqual(k, [2, 3])
			assert.notEqual(out, n)
			assert.notEqual(out, k)
		})

		it('handles huge safe-integer inputs quickly via overflow saturation', () => {
			const big = Number.MAX_SAFE_INTEGER
			const out = permutationsIntervalIterative([big, big], [big, big])
			assert.deepEqual(out, [Number.MAX_VALUE, Infinity])
		})
	})

	describe('input validation errors', () => {
		it('throws TypeError for missing, non-array, or wrong-length intervals', () => {
			assert.throws(() => permutationsIntervalIterative(), TypeError)
			assert.throws(() => permutationsIntervalIterative([1, 2]), TypeError)
			assert.throws(() => permutationsIntervalIterative(null, [1, 2]), TypeError)
			assert.throws(() => permutationsIntervalIterative([1, 2], undefined), TypeError)
			assert.throws(() => permutationsIntervalIterative({ lo: 1, hi: 2 }, [1, 2]), TypeError)
			assert.throws(() => permutationsIntervalIterative([1], [1, 2]), TypeError)
			assert.throws(() => permutationsIntervalIterative([1, 2, 3], [1, 2]), TypeError)
			assert.throws(() => permutationsIntervalIterative([1, 2], []), TypeError)
			assert.throws(() => permutationsIntervalIterative([1, 2], [1, 2, 3]), TypeError)
		})

		it('throws TypeError for non-number endpoints', () => {
			assert.throws(() => permutationsIntervalIterative(['1', 2], [1, 2]), TypeError)
			assert.throws(() => permutationsIntervalIterative([1, '2'], [1, 2]), TypeError)
			assert.throws(() => permutationsIntervalIterative([1, 2], [1n, 2n]), TypeError)
			assert.throws(() => permutationsIntervalIterative([1, 2], [null, 2]), TypeError)
		})

		it('throws RangeError for non-finite, non-integer, unsafe, negative, or inverted bounds', () => {
			// Non-finite
			assert.throws(() => permutationsIntervalIterative([NaN, 2], [1, 2]), RangeError)
			assert.throws(() => permutationsIntervalIterative([1, Infinity], [1, 2]), RangeError)
			assert.throws(() => permutationsIntervalIterative([1, 2], [-Infinity, 2]), RangeError)
			assert.throws(() => permutationsIntervalIterative([1, 2], [1, NaN]), RangeError)
			// Non-integer
			assert.throws(() => permutationsIntervalIterative([1.5, 2], [1, 2]), RangeError)
			assert.throws(() => permutationsIntervalIterative([1, 2], [0, 1.1]), RangeError)
			// Unsafe integers
			const unsafe = Number.MAX_SAFE_INTEGER + 1
			assert.throws(() => permutationsIntervalIterative([unsafe, unsafe], [1, 1]), RangeError)
			assert.throws(() => permutationsIntervalIterative([10, 10], [0, unsafe]), RangeError)
			// Negative
			assert.throws(() => permutationsIntervalIterative([-1, 2], [1, 2]), RangeError)
			assert.throws(() => permutationsIntervalIterative([1, 2], [-2, -1]), RangeError)
			// Inverted (lo > hi)
			assert.throws(() => permutationsIntervalIterative([5, 3], [1, 2]), RangeError)
			assert.throws(() => permutationsIntervalIterative([5, 6], [3, 2]), RangeError)
		})
	})

	describe('outward-rounding enclosure guarantees', () => {
		it('strictly encloses inexact products exceeding Number.MAX_SAFE_INTEGER', () => {
			// P(10^15, 2) = 10^15 * (10^15 - 1) = 999999999999999000000000000000 (not exact in float64)
			const n = 1e15
			const interval = permutationsIntervalIterative([n, n], [2, 2])
			const exact = exactFallingProductBigInt(n, 2)
			assertEnclosesBigInt(interval, exact, 'P(1e15, 2)')
			assert.ok(interval[0] < interval[1], 'inexact single product must have non-zero enclosure width')
			assert.equal(ulpDistance(interval[0], interval[1]), 1n, 'single inexact product must be 1 ULP wide')

			// P(10^12, 3)
			const n2 = 1e12
			const interval2 = permutationsIntervalIterative([n2, n2], [3, 3])
			const exact2 = exactFallingProductBigInt(n2, 3)
			assertEnclosesBigInt(interval2, exact2, 'P(1e12, 3)')
			assert.ok(interval2[0] < interval2[1])
			assert.ok(ulpDistance(interval2[0], interval2[1]) <= 3n)
		})

		it('encloses every factorial P(n, n) from n = 19 to n = 170 with tight ULP bounds', () => {
			for (let n = 19; n <= 170; n++) {
				const interval = permutationsIntervalIterative([n, n], [n, n])
				const exact = exactFactorial(n)
				assertEnclosesBigInt(interval, exact, `P(${n}, ${n})`)
				assert.ok(Number.isFinite(interval[1]), `P(${n}, ${n}) upper bound should remain finite`)
				// Width grows by at most ~1-2 ULPs per inexact step
				const ulps = ulpDistance(interval[0], interval[1])
				assert.ok(ulps <= BigInt(2 * n), `P(${n}, ${n}) ULP width ${ulps} unexpectedly large`)
			}
		})

		it('outward-rounds overflow at P(171, 171) to [Number.MAX_VALUE, Infinity] enclosing exact 171!', () => {
			const interval = permutationsIntervalIterative([171, 171], [171, 171])
			assert.deepEqual(interval, [Number.MAX_VALUE, Infinity])
			const exact171 = exactFactorial(171)
			assertEnclosesBigInt(interval, exact171, 'P(171, 171)')
		})

		it('encloses mixed finite-lo / overflowing-hi intervals like n=[170, 171], k=[170, 171]', () => {
			const interval = permutationsIntervalIterative([170, 171], [170, 171])
			// kHi (171) > nLo (170), so min is P(170, 171) = 0, max is P(171, 171) = 171!
			assert.equal(interval[0], 0)
			assert.equal(interval[1], Infinity)

			// n=[170, 171], k=[169, 170]: min is P(170, 169) = 170!, max is P(171, 170) = 171!
			const interval2 = permutationsIntervalIterative([170, 171], [169, 170])
			assert.ok(interval2[0] < Number.MAX_VALUE)
			assert.equal(interval2[1], Infinity)
			assertEnclosesBigInt(interval2, exactPermutationsByFactorialRatio(170, 169), 'min P(170,169)')
			assertEnclosesBigInt(interval2, exactPermutationsByFactorialRatio(171, 170), 'max P(171,170)')
		})

		it('exercises scaled Dekker path near 2^450..2^1023 without overflow or NaN', () => {
			// P(1000, 102) ≈ 1.4e304 (very close to MAX_VALUE, crosses 2^450 and 2^996)
			for (const k of [45, 50, 80, 100, 102, 103, 104]) {
				const interval = permutationsIntervalIterative([1000, 1000], [k, k])
				const exact = exactFallingProductBigInt(1000, k)
				assertEnclosesBigInt(interval, exact, `P(1000, ${k})`)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('cross-checks against exhaustive brute-force grid using factorial-ratio oracle', () => {
			const boxes = [
				[[0, 4], [0, 4]],
				[[2, 6], [1, 5]],
				[[5, 9], [2, 4]],
				[[3, 7], [6, 9]],
				[[10, 14], [3, 6]],
				[[20, 24], [15, 22]],
			]

			for (const [nInt, kInt] of boxes) {
				const result = permutationsIntervalIterative(nInt, kInt)
				let minExact = null
				let maxExact = null

				for (let n = nInt[0]; n <= nInt[1]; n++) {
					for (let k = kInt[0]; k <= kInt[1]; k++) {
						const val = exactPermutationsByFactorialRatio(n, k)
						if (minExact === null || val < minExact) minExact = val
						if (maxExact === null || val > maxExact) maxExact = val
						assertEnclosesBigInt(result, val, `grid (${n}, ${k}) in ${JSON.stringify([nInt, kInt])}`)
					}
				}

				// For small boxes where exact values are safe integers, bounds must be exact
				if (maxExact <= BigInt(Number.MAX_SAFE_INTEGER)) {
					assert.equal(BigInt(result[0]), minExact)
					assert.equal(BigInt(result[1]), maxExact)
				}
			}
		})

		it('cross-checks against independent Pascal C(n, k) * k! oracle', () => {
			const cases = [
				[0, 0],
				[6, 3],
				[12, 7],
				[25, 20],
				[30, 15],
				[50, 25],
				[60, 60],
				[15, 20],
			]

			for (const [n, k] of cases) {
				const result = permutationsIntervalIterative([n, n], [k, k])
				const exactPascal = exactPermutationsByPascal(n, k)
				assertEnclosesBigInt(result, exactPascal, `Pascal P(${n}, ${k})`)
			}
		})
	})
})
