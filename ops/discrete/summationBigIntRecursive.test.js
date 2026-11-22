import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { summationBigIntRecursive } from './summationBigIntRecursive.js'

const SCALE_1E18 = 10n ** 18n

/**
 * Independent iterative reference summation for cross-checking.
 * @param {readonly bigint[]} items
 * @returns {bigint}
 */
function iterativeSum(items) {
	let acc = 0n
	for (let i = 0; i < items.length; i++) {
		acc += items[i]
	}
	return acc
}

describe('summationBigIntRecursive — array form', () => {
	test('empty array returns 0n', () => {
		assert.equal(summationBigIntRecursive([]), 0n)
	})

	test('single-element arrays', () => {
		assert.equal(summationBigIntRecursive([0n]), 0n)
		assert.equal(summationBigIntRecursive([42n]), 42n)
		assert.equal(summationBigIntRecursive([-99n]), -99n)
	})

	test('normal positive, negative, and cancelling arrays', () => {
		assert.equal(summationBigIntRecursive([1n, 2n, 3n, 4n, 5n]), 15n)
		assert.equal(summationBigIntRecursive([-10n, -20n, -30n]), -60n)
		assert.equal(summationBigIntRecursive([-5n, 3n, 2n, -10n, 10n]), 0n)
		assert.equal(summationBigIntRecursive([7n, -3n]), 4n)
	})

	test('huge BigInts well beyond Number.MAX_SAFE_INTEGER', () => {
		const big = 10n ** 100n
		const huge = [big, big + 1n, big + 2n, -big, 2n ** 256n - 1n]
		assert.equal(
			summationBigIntRecursive(huge),
			2n * big + 3n + (2n ** 256n - 1n)
		)
	})

	test('fixed-point BigInt values scaled by 10^18 preserve exact precision', () => {
		// 0.1 + 0.2 + 0.3 + 0.4 == 1.0 exactly in 10^18 fixed-point
		const tenths = [
			10n ** 17n,
			2n * 10n ** 17n,
			3n * 10n ** 17n,
			4n * 10n ** 17n
		]
		assert.equal(summationBigIntRecursive(tenths), SCALE_1E18)

		// 1000 copies of 1/1000 scaled by 10^18 == 10^18 exactly
		const thousandths = Array.from({ length: 1000 }, () => SCALE_1E18 / 1000n)
		assert.equal(summationBigIntRecursive(thousandths), SCALE_1E18)
	})

	test('large array verifies O(log n) recursion depth without stack overflow', () => {
		const n = 20_000
		const items = Array.from({ length: n }, (_, i) => BigInt(i + 1))
		const gauss = (BigInt(n) * BigInt(n + 1)) / 2n
		assert.equal(summationBigIntRecursive(items), gauss)
		assert.equal(summationBigIntRecursive(items), iterativeSum(items))
	})

	test('cross-check against iterative loop across varied lengths and signs', () => {
		// Deterministic LCG BigInt generator
		let seed = 0x123456789abcdef0n
		const mod = 1n << 64n
		const nextBigInt = () => {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) % mod
			return (seed - (mod >> 1n)) * 10n ** 20n
		}

		for (const len of [0, 1, 2, 3, 4, 7, 8, 15, 16, 31, 100, 1001]) {
			const arr = Array.from({ length: len }, nextBigInt)
			assert.equal(summationBigIntRecursive(arr), iterativeSum(arr))
		}
	})
})

describe('summationBigIntRecursive — range form & closed-form cross-checks', () => {
	test('empty range (start > end) returns 0n', () => {
		assert.equal(summationBigIntRecursive(5n, 2n), 0n)
		assert.equal(summationBigIntRecursive(1n, 0n, (k) => k * k), 0n)
	})

	test('single-point range (start === end)', () => {
		assert.equal(summationBigIntRecursive(7n, 7n), 7n)
		assert.equal(summationBigIntRecursive(-4n, -4n, (k) => k * k * k), -64n)
	})

	test('negative ranges and symmetric cancellation', () => {
		assert.equal(summationBigIntRecursive(-100n, 100n), 0n)
		assert.equal(summationBigIntRecursive(-5n, -1n), -15n)
	})

	test('cross-check against Gauss formula: sum_{k=1}^n k = n*(n+1)/2', () => {
		for (const n of [1n, 2n, 10n, 99n, 1000n, 10_000n]) {
			const expected = (n * (n + 1n)) / 2n
			assert.equal(summationBigIntRecursive(1n, n), expected)
		}
	})

	test('cross-check against sum of squares: sum_{k=1}^n k^2 = n*(n+1)*(2n+1)/6', () => {
		for (const n of [1n, 5n, 50n, 500n, 5000n]) {
			const expected = (n * (n + 1n) * (2n * n + 1n)) / 6n
			assert.equal(
				summationBigIntRecursive(1n, n, (k) => k * k),
				expected
			)
		}
	})

	test('cross-check against Nicomachus sum of cubes: (n*(n+1)/2)^2', () => {
		for (const n of [1n, 7n, 100n, 1000n]) {
			const tri = (n * (n + 1n)) / 2n
			assert.equal(
				summationBigIntRecursive(1n, n, (k) => k * k * k),
				tri * tri
			)
		}
	})

	test('cross-check against geometric series: sum_{k=0}^n 2^k = 2^(n+1) - 1', () => {
		const n = 200n
		assert.equal(
			summationBigIntRecursive(0n, n, (k) => 1n << k),
			(1n << (n + 1n)) - 1n
		)
	})

	test('range with huge BigInt offset computes midpoint without overflow', () => {
		const base = 10n ** 40n
		const count = 100n
		// sum_{k=base}^{base+count-1} k = count * base + count*(count-1)/2
		const expected = count * base + (count * (count - 1n)) / 2n
		assert.equal(
			summationBigIntRecursive(base, base + count - 1n),
			expected
		)
	})
})

describe('summationBigIntRecursive — input validation', () => {
	test('throws TypeError on wrong argument count', () => {
		assert.throws(() => summationBigIntRecursive(), TypeError)
		assert.throws(
			() => summationBigIntRecursive(1n, 2n, (k) => k, 4n),
			TypeError
		)
	})

	test('throws TypeError when single argument is not an array', () => {
		for (const bad of [null, undefined, 42, 42n, '123', {}, new Set([1n])]) {
			assert.throws(() => summationBigIntRecursive(bad), TypeError)
		}
	})

	test('throws TypeError on non-bigint array elements or sparse arrays', () => {
		assert.throws(() => summationBigIntRecursive([1n, 2, 3n]), TypeError)
		assert.throws(() => summationBigIntRecursive([1n, '2', 3n]), TypeError)
		assert.throws(() => summationBigIntRecursive([null]), TypeError)
		assert.throws(() => summationBigIntRecursive([undefined]), TypeError)
		assert.throws(() => summationBigIntRecursive([NaN]), TypeError)

		const sparse = new Array(4)
		sparse[0] = 1n
		sparse[3] = 2n
		assert.throws(() => summationBigIntRecursive(sparse), TypeError)
	})

	test('throws TypeError on invalid range bounds or termFn', () => {
		assert.throws(() => summationBigIntRecursive(1, 5n), TypeError)
		assert.throws(() => summationBigIntRecursive(1n, 5), TypeError)
		assert.throws(() => summationBigIntRecursive('1', '5'), TypeError)
		assert.throws(
			() => summationBigIntRecursive(1n, 5n, 'not-a-fn'),
			TypeError
		)
		assert.throws(() => summationBigIntRecursive(1n, 5n, null), TypeError)
		assert.throws(
			() => summationBigIntRecursive(1n, 5n, undefined),
			TypeError
		)
		assert.throws(
			() => summationBigIntRecursive(1n, 5n, () => 42),
			TypeError
		)
	})
})
