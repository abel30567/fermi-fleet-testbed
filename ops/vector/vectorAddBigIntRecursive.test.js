import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SCALE, vectorAddBigIntRecursive } from './vectorAddBigIntRecursive.js'

/**
 * Independent iterative reference implementation for cross-checking.
 *
 * @param {readonly bigint[]} a
 * @param {readonly bigint[]} b
 * @returns {bigint[]}
 */
function naiveVectorAdd(a, b) {
	const result = []
	for (let i = 0; i < a.length; i++) {
		result.push(a[i] + b[i])
	}
	return result
}

describe('vectorAddBigIntRecursive', () => {
	it('exports SCALE as 10n ** 18n', () => {
		assert.equal(SCALE, 10n ** 18n)
	})

	it('adds standard positive, negative, and mixed-sign BigInt vectors', () => {
		assert.deepEqual(
			vectorAddBigIntRecursive([1n, 2n, 3n], [4n, 5n, 6n]),
			[5n, 7n, 9n]
		)
		assert.deepEqual(
			vectorAddBigIntRecursive([-10n, 20n, -30n, 40n], [10n, -5n, -15n, -40n]),
			[0n, 15n, -45n, 0n]
		)
		assert.deepEqual(
			vectorAddBigIntRecursive([1n, 2n, 3n, 4n, 5n, 6n, 7n], [7n, 6n, 5n, 4n, 3n, 2n, 1n]),
			[8n, 8n, 8n, 8n, 8n, 8n, 8n]
		)
	})

	it('handles arbitrarily large BigInts without precision loss', () => {
		const big1 = (1n << 256n) + 123456789012345678901234567890n
		const big2 = (1n << 256n) - 123456789012345678901234567890n
		const hugePos = 10n ** 100n + 7n
		const hugeNeg = -(10n ** 100n) - 2n

		assert.deepEqual(
			vectorAddBigIntRecursive([big1, hugePos, -(1n << 512n)], [big2, hugeNeg, 1n << 512n]),
			[1n << 257n, 5n, 0n]
		)
	})

	it('handles fixed-point scaled BigInts (SCALE = 10^18) accurately and cross-checks against floating point', () => {
		// 1.5, -2.25, 0.125, 100.000000000000000001
		const a = [
			15n * 10n ** 17n,
			-225n * 10n ** 16n,
			125n * 10n ** 15n,
			100n * SCALE + 1n,
		]
		// 2.25, 3.75, -0.125, -0.000000000000000001
		const b = [
			225n * 10n ** 16n,
			375n * 10n ** 16n,
			-125n * 10n ** 15n,
			-1n,
		]

		const sum = vectorAddBigIntRecursive(a, b)
		assert.deepEqual(sum, [
			375n * 10n ** 16n,
			15n * 10n ** 17n,
			0n,
			100n * SCALE,
		])

		// Cross-check against JS floating-point arithmetic within tight tolerance
		const aFloat = [1.5, -2.25, 0.125, 100]
		const bFloat = [2.25, 3.75, -0.125, 0]
		for (let i = 0; i < sum.length; i++) {
			const scaledBack = Number(sum[i]) / Number(SCALE)
			assert.ok(
				Math.abs(scaledBack - (aFloat[i] + bFloat[i])) < 1e-12,
				`index ${i}: ${scaledBack} vs ${aFloat[i] + bFloat[i]}`
			)
		}
	})

	it('handles edge cases: empty, single-element, zero vector, and aliased inputs', () => {
		// Empty vectors
		assert.deepEqual(vectorAddBigIntRecursive([], []), [])

		// Single-element vectors
		assert.deepEqual(vectorAddBigIntRecursive([0n], [0n]), [0n])
		assert.deepEqual(vectorAddBigIntRecursive([1n], [-1n]), [0n])
		assert.deepEqual(vectorAddBigIntRecursive([42n], [58n]), [100n])

		// Zero vector additive identity
		const v = [-99n, 0n, 1n, 10n ** 30n]
		const zero = [0n, 0n, 0n, 0n]
		assert.deepEqual(vectorAddBigIntRecursive(v, zero), v)
		assert.deepEqual(vectorAddBigIntRecursive(zero, v), v)

		// Does not mutate input arrays and supports aliasing (a === b)
		const a = [1n, -2n, 3n]
		const b = [4n, 5n, -6n]
		const res = vectorAddBigIntRecursive(a, b)
		assert.deepEqual(a, [1n, -2n, 3n])
		assert.deepEqual(b, [4n, 5n, -6n])
		assert.notEqual(res, a)
		assert.notEqual(res, b)

		assert.deepEqual(vectorAddBigIntRecursive(a, a), [2n, -4n, 6n])
		assert.deepEqual(a, [1n, -2n, 3n])
	})

	it('handles large vectors without stack overflow (O(log n) recursion depth)', () => {
		const n = 100_000
		const a = new Array(n)
		const b = new Array(n)
		for (let i = 0; i < n; i++) {
			a[i] = BigInt(i) * 1_000_000_000_000n
			b[i] = BigInt(n - i) * 1_000_000_000_000n
		}

		const result = vectorAddBigIntRecursive(a, b)
		assert.equal(result.length, n)
		const expected = BigInt(n) * 1_000_000_000_000n
		for (let i = 0; i < n; i++) {
			assert.equal(result[i], expected)
		}
	})

	it('cross-checks against naive iterative reference across lengths 0..65 and satisfies vector-space identities', () => {
		// Deterministic LCG over BigInt for reproducible pseudo-random vectors
		let seed = 0x123456789abcdef0123456789abcdef0n
		const mod = 1n << 128n
		const nextBigInt = () => {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) % mod
			// Signed 128-bit centered value
			return seed - (1n << 127n)
		}

		for (let len = 0; len <= 65; len++) {
			const a = Array.from({ length: len }, () => nextBigInt())
			const b = Array.from({ length: len }, () => nextBigInt())
			const c = Array.from({ length: len }, () => nextBigInt())

			const ab = vectorAddBigIntRecursive(a, b)
			// Cross-check against naive iterative reference
			assert.deepEqual(ab, naiveVectorAdd(a, b))

			// Commutativity: a + b === b + a
			assert.deepEqual(ab, vectorAddBigIntRecursive(b, a))

			// Associativity: (a + b) + c === a + (b + c)
			assert.deepEqual(
				vectorAddBigIntRecursive(ab, c),
				vectorAddBigIntRecursive(a, vectorAddBigIntRecursive(b, c))
			)

			// Additive inverse: a + (-a) === 0
			const negA = a.map((x) => -x)
			assert.deepEqual(
				vectorAddBigIntRecursive(a, negA),
				Array.from({ length: len }, () => 0n)
			)

			// Scalar distributivity: k * (a + b) === (k * a) + (k * b)
			const k = -7n
			const kSum = ab.map((x) => k * x)
			const sumK = vectorAddBigIntRecursive(
				a.map((x) => k * x),
				b.map((x) => k * x)
			)
			assert.deepEqual(kSum, sumK)
		}
	})

	it('validates input types and dimensions strictly', () => {
		// Non-array inputs -> TypeError
		assert.throws(() => vectorAddBigIntRecursive(null, []), TypeError)
		assert.throws(() => vectorAddBigIntRecursive([], null), TypeError)
		assert.throws(() => vectorAddBigIntRecursive(undefined, []), TypeError)
		assert.throws(() => vectorAddBigIntRecursive('123', '456'), TypeError)
		assert.throws(() => vectorAddBigIntRecursive(123n, 456n), TypeError)
		assert.throws(() => vectorAddBigIntRecursive({}, {}), TypeError)
		assert.throws(
			() => vectorAddBigIntRecursive(new BigInt64Array([1n]), [1n]),
			TypeError
		)

		// Dimension mismatch -> RangeError
		assert.throws(() => vectorAddBigIntRecursive([], [1n]), RangeError)
		assert.throws(() => vectorAddBigIntRecursive([1n, 2n], [1n]), RangeError)
		assert.throws(() => vectorAddBigIntRecursive([1n], [1n, 2n, 3n]), RangeError)

		// Non-BigInt elements -> TypeError
		assert.throws(() => vectorAddBigIntRecursive([1], [1n]), TypeError)
		assert.throws(() => vectorAddBigIntRecursive([1n], [1]), TypeError)
		assert.throws(() => vectorAddBigIntRecursive([1n, '2', 3n], [1n, 2n, 3n]), TypeError)
		assert.throws(() => vectorAddBigIntRecursive([1n, 2n, 3n], [1n, 2n, null]), TypeError)
		assert.throws(() => vectorAddBigIntRecursive([1n, NaN, 3n], [1n, 2n, 3n]), TypeError)
		assert.throws(() => vectorAddBigIntRecursive([1n, 2n, undefined], [1n, 2n, 3n]), TypeError)
		assert.throws(() => vectorAddBigIntRecursive([1n, 2n, true], [1n, 2n, 3n]), TypeError)

		// Sparse arrays -> TypeError
		assert.throws(() => vectorAddBigIntRecursive(new Array(3), [1n, 2n, 3n]), TypeError)
		assert.throws(() => vectorAddBigIntRecursive([1n, 2n, 3n], new Array(3)), TypeError)
	})
})
