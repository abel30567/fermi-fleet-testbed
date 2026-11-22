import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { dotProductBigIntRecursive } from './dotProductBigIntRecursive.js'

/**
 * Independent iterative reference implementation for cross-checking.
 *
 * @param {readonly bigint[]} a
 * @param {readonly bigint[]} b
 * @returns {bigint}
 */
function dotProductIterativeRef(a, b) {
	let sum = 0n
	for (let i = 0; i < a.length; i++) {
		sum += a[i] * b[i]
	}
	return sum
}

/**
 * Deterministic LCG-based BigInt vector generator for reproducible tests.
 *
 * @param {number} length
 * @param {bigint} seed
 * @param {bigint} range
 * @returns {{ vec: bigint[], nextSeed: bigint }}
 */
function makeDeterministicVector(length, seed, range) {
	const vec = new Array(length)
	let state = seed
	const mod = 1n << 64n
	const mult = 6364136223846793005n
	const inc = 1442695040888963407n
	const span = 2n * range + 1n
	for (let i = 0; i < length; i++) {
		state = (state * mult + inc) % mod
		vec[i] = (state % span) - range
	}
	return { vec, nextSeed: state }
}

describe('dotProductBigIntRecursive', () => {
	describe('normal cases', () => {
		it('computes exact dot product for small positive vectors', () => {
			assert.equal(dotProductBigIntRecursive([1n, 2n, 3n], [4n, 5n, 6n]), 32n)
			assert.equal(dotProductBigIntRecursive([2n, 3n], [5n, 7n]), 31n)
			assert.equal(
				dotProductBigIntRecursive([1n, 2n, 3n, 4n, 5n], [5n, 4n, 3n, 2n, 1n]),
				35n
			)
		})

		it('handles negative numbers, mixed signs, and orthogonal vectors', () => {
			assert.equal(dotProductBigIntRecursive([-1n, -2n, -3n], [4n, 5n, 6n]), -32n)
			assert.equal(dotProductBigIntRecursive([-1n, 2n, -3n], [-4n, 5n, -6n]), 32n)
			assert.equal(dotProductBigIntRecursive([1n, 0n, -1n], [1n, 999n, 1n]), 0n)
			assert.equal(dotProductBigIntRecursive([3n, -4n], [4n, 3n]), 0n)
		})

		it('preserves exact precision for huge BigInts beyond Number.MAX_SAFE_INTEGER', () => {
			const big = 10n ** 50n
			const a = [big, 1n, -big]
			const b = [big, 1n, big]
			// big^2 + 1 - big^2 = 1 (catastrophic cancellation in floating point, exact in BigInt)
			assert.equal(dotProductBigIntRecursive(a, b), 1n)

			const x = [2n ** 200n + 3n, -(2n ** 150n) + 7n]
			const y = [2n ** 200n - 3n, 2n ** 150n + 7n]
			// (2^200)^2 - 9 + 49 - (2^150)^2 = 2^400 - 2^300 + 40
			assert.equal(
				dotProductBigIntRecursive(x, y),
				(2n ** 400n) - (2n ** 300n) + 40n
			)
		})

		it('does not mutate input arrays', () => {
			const a = [10n, -20n, 30n, 40n]
			const b = [1n, 2n, 3n, 4n]
			const aCopy = [...a]
			const bCopy = [...b]
			const res = dotProductBigIntRecursive(a, b)
			assert.equal(res, 220n)
			assert.deepEqual(a, aCopy)
			assert.deepEqual(b, bCopy)
		})
	})

	describe('edge cases', () => {
		it('returns 0n for empty vectors', () => {
			assert.equal(dotProductBigIntRecursive([], []), 0n)
		})

		it('handles single-element vectors including 0, 1, and negatives', () => {
			assert.equal(dotProductBigIntRecursive([0n], [0n]), 0n)
			assert.equal(dotProductBigIntRecursive([1n], [1n]), 1n)
			assert.equal(dotProductBigIntRecursive([0n], [99999999999999999999n]), 0n)
			assert.equal(dotProductBigIntRecursive([-7n], [9n]), -63n)
			assert.equal(dotProductBigIntRecursive([-7n], [-9n]), 63n)
		})

		it('returns 0n when either vector is all zeros', () => {
			const zeros = [0n, 0n, 0n, 0n, 0n]
			const vals = [12n, -34n, 56n, -78n, 90n]
			assert.equal(dotProductBigIntRecursive(zeros, vals), 0n)
			assert.equal(dotProductBigIntRecursive(vals, zeros), 0n)
		})

		it('handles large vectors without stack overflow (O(log n) recursion depth)', () => {
			const n = 50000
			const a = new Array(n)
			const b = new Array(n)
			for (let i = 0; i < n; i++) {
				const k = BigInt(i + 1)
				a[i] = k
				b[i] = k
			}
			const N = BigInt(n)
			// Closed-form sum of squares: n(n + 1)(2n + 1) / 6
			const expected = (N * (N + 1n) * (2n * N + 1n)) / 6n
			assert.equal(dotProductBigIntRecursive(a, b), expected)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when arguments are not Arrays', () => {
			const nonArrays = [
				null,
				undefined,
				0,
				123n,
				'123',
				{},
				{ length: 1, 0: 1n },
				new BigInt64Array([1n]),
			]
			for (const bad of nonArrays) {
				assert.throws(() => dotProductBigIntRecursive(bad, [1n]), TypeError)
				assert.throws(() => dotProductBigIntRecursive([1n], bad), TypeError)
			}
		})

		it('throws RangeError when vector lengths differ', () => {
			assert.throws(() => dotProductBigIntRecursive([], [1n]), RangeError)
			assert.throws(() => dotProductBigIntRecursive([1n], []), RangeError)
			assert.throws(
				() => dotProductBigIntRecursive([1n, 2n], [1n, 2n, 3n]),
				RangeError
			)
		})

		it('throws TypeError when any element is not a bigint', () => {
			assert.throws(() => dotProductBigIntRecursive([1], [1n]), TypeError)
			assert.throws(() => dotProductBigIntRecursive([1n], [1]), TypeError)
			assert.throws(
				() => dotProductBigIntRecursive([1n, 2n, '3'], [1n, 2n, 3n]),
				TypeError
			)
			assert.throws(
				() => dotProductBigIntRecursive([1n, 2n, 3n], [1n, null, 3n]),
				TypeError
			)
			assert.throws(
				() => dotProductBigIntRecursive([1n, undefined], [1n, 2n]),
				TypeError
			)
			assert.throws(
				() => dotProductBigIntRecursive([1n, true], [1n, 2n]),
				TypeError
			)
			assert.throws(
				() => dotProductBigIntRecursive([NaN], [1n]),
				TypeError
			)
		})

		it('throws TypeError for sparse arrays with holes', () => {
			const sparse = new Array(3)
			sparse[0] = 1n
			sparse[2] = 3n
			assert.throws(
				() => dotProductBigIntRecursive(sparse, [1n, 2n, 3n]),
				TypeError
			)
			assert.throws(
				() => dotProductBigIntRecursive([1n, 2n, 3n], sparse),
				TypeError
			)
		})
	})

	describe('cross-checks and algebraic identities', () => {
		it('matches naive iterative reference across lengths 0..65 and large values', () => {
			let seed = 42n
			for (let len = 0; len <= 65; len++) {
				const genA = makeDeterministicVector(len, seed, 10n ** 18n)
				seed = genA.nextSeed
				const genB = makeDeterministicVector(len, seed, 10n ** 18n)
				seed = genB.nextSeed

				const actual = dotProductBigIntRecursive(genA.vec, genB.vec)
				const expected = dotProductIterativeRef(genA.vec, genB.vec)
				assert.equal(actual, expected, `mismatch at length ${len}`)
			}
		})

		it('satisfies commutativity, bilinearity, and Cauchy-Schwarz inequality', () => {
			const a = [17n, -42n, 103n, 0n, -999999999999999999n, 55n, -8n]
			const b = [-3n, 88n, -19n, 777n, 123456789012345678n, -11n, 64n]
			const c = [5n, 12n, -33n, 4n, -7n, 21n, 9n]
			const k = -13n

			// Commutativity: a · b === b · a
			const ab = dotProductBigIntRecursive(a, b)
			const ba = dotProductBigIntRecursive(b, a)
			assert.equal(ab, ba)

			// Distributivity: (a + b) · c === a · c + b · c
			const aPlusB = a.map((v, i) => v + b[i])
			assert.equal(
				dotProductBigIntRecursive(aPlusB, c),
				dotProductBigIntRecursive(a, c) + dotProductBigIntRecursive(b, c)
			)

			// Scalar homogeneity: (k * a) · b === k * (a · b)
			const kA = a.map((v) => k * v)
			assert.equal(dotProductBigIntRecursive(kA, b), k * ab)

			// Cauchy-Schwarz: (a · b)^2 <= (a · a) * (b · b)
			const aa = dotProductBigIntRecursive(a, a)
			const bb = dotProductBigIntRecursive(b, b)
			assert.ok(aa > 0n)
			assert.ok(bb > 0n)
			assert.ok(ab * ab <= aa * bb)
		})

		it('matches closed-form convolution identity sum_{i=1..n} i*(n+1-i) = n(n+1)(n+2)/6', () => {
			for (const n of [1, 2, 7, 16, 100, 1023]) {
				const a = Array.from({ length: n }, (_, i) => BigInt(i + 1))
				const b = Array.from({ length: n }, (_, i) => BigInt(n - i))
				const N = BigInt(n)
				const expected = (N * (N + 1n) * (N + 2n)) / 6n
				assert.equal(dotProductBigIntRecursive(a, b), expected)
			}
		})
	})
})
