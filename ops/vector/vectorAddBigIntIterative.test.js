import { describe, test } from 'node:test'
import assert from 'node:assert'
import { vectorAddBigIntIterative } from './vectorAddBigIntIterative.js'

const SCALE = 10n ** 18n

describe('vectorAddBigIntIterative', () => {
	test('adds small positive BigInt vectors', () => {
		assert.deepStrictEqual(
			vectorAddBigIntIterative([1n, 2n, 3n], [4n, 5n, 6n]),
			[5n, 7n, 9n],
		)
	})

	test('adds negative and mixed-sign BigInt vectors including cancellation', () => {
		assert.deepStrictEqual(
			vectorAddBigIntIterative([-10n, 0n, 42n, -7n], [10n, -5n, -12n, -3n]),
			[0n, -5n, 30n, -10n],
		)
	})

	test('preserves exact arithmetic for fixed-point BigInt vectors scaled by 10^18', () => {
		// 1.5, -0.25, 0.000000000000000001
		const a = [15n * 10n ** 17n, -25n * 10n ** 16n, 1n]
		// 2.25, 0.75, 0.999999999999999999
		const b = [225n * 10n ** 16n, 75n * 10n ** 16n, SCALE - 1n]
		// Expected: 3.75, 0.5, 1.0
		const expected = [375n * 10n ** 16n, 5n * 10n ** 17n, SCALE]
		assert.deepStrictEqual(vectorAddBigIntIterative(a, b), expected)
	})

	test('handles arbitrary-precision BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
		const hugeA = 2n ** 128n + 123456789012345678901234567890n
		const hugeB = 2n ** 128n - 123456789012345678901234567890n
		const negHuge = -(10n ** 50n)
		assert.deepStrictEqual(
			vectorAddBigIntIterative([hugeA, negHuge], [hugeB, 10n ** 50n + 1n]),
			[2n ** 129n, 1n],
		)
	})

	test('handles empty vectors and single-element vectors', () => {
		assert.deepStrictEqual(vectorAddBigIntIterative([], []), [])
		assert.deepStrictEqual(vectorAddBigIntIterative([99n], [-100n]), [-1n])
	})

	test('satisfies additive identity with zero vector and does not mutate inputs', () => {
		const a = [3n, -8n, 10n ** 25n]
		const zero = [0n, 0n, 0n]
		const aSnapshot = [...a]
		const zeroSnapshot = [...zero]

		const res = vectorAddBigIntIterative(a, zero)
		assert.deepStrictEqual(res, a)
		assert.notStrictEqual(res, a)
		assert.deepStrictEqual(a, aSnapshot)
		assert.deepStrictEqual(zero, zeroSnapshot)
	})

	test('throws TypeError for non-array arguments', () => {
		for (const bad of [null, undefined, 42n, '123', {}, new BigInt64Array([1n])]) {
			assert.throws(() => vectorAddBigIntIterative(bad, [1n]), TypeError)
			assert.throws(() => vectorAddBigIntIterative([1n], bad), TypeError)
		}
	})

	test('throws RangeError for mismatched vector lengths', () => {
		assert.throws(() => vectorAddBigIntIterative([1n, 2n], [1n]), RangeError)
		assert.throws(() => vectorAddBigIntIterative([], [0n]), RangeError)
	})

	test('throws TypeError for non-bigint elements and sparse arrays', () => {
		assert.throws(() => vectorAddBigIntIterative([1, 2n], [3n, 4n]), TypeError)
		assert.throws(() => vectorAddBigIntIterative([1n, '2'], [3n, 4n]), TypeError)
		assert.throws(() => vectorAddBigIntIterative([1n, 2n], [3n, null]), TypeError)
		assert.throws(() => vectorAddBigIntIterative([1n, 2n], [3n, undefined]), TypeError)
		assert.throws(() => vectorAddBigIntIterative([1n, NaN], [3n, 4n]), TypeError)
		assert.throws(() => vectorAddBigIntIterative([1n, true], [3n, 4n]), TypeError)

		const sparse = new Array(2)
		sparse[0] = 1n
		assert.throws(() => vectorAddBigIntIterative(sparse, [1n, 2n]), TypeError)
		assert.throws(() => vectorAddBigIntIterative([1n, 2n], sparse), TypeError)
	})

	test('independent cross-check: matches recursive reference and vector space axioms', () => {
		// Deterministic LCG for reproducible BigInt test vectors
		let state = 0x5eed123456789abcn
		const nextBigInt = () => {
			state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
			return (state - (1n << 63n)) * SCALE + (state % SCALE)
		}

		// Independent recursive reference implementation
		const recursiveRef = (u, v, idx = 0, acc = []) => {
			if (idx === u.length) return acc
			acc.push(u[idx] + v[idx])
			return recursiveRef(u, v, idx + 1, acc)
		}

		const sum = (vec) => vec.reduce((s, x) => s + x, 0n)

		for (const n of [0, 1, 5, 32, 128]) {
			const a = Array.from({ length: n }, nextBigInt)
			const b = Array.from({ length: n }, nextBigInt)
			const c = Array.from({ length: n }, nextBigInt)
			const negA = a.map((x) => -x)

			const ab = vectorAddBigIntIterative(a, b)

			// 1. Matches independent recursive reference
			assert.deepStrictEqual(ab, recursiveRef(a, b))

			// 2. Commutativity: a + b === b + a
			assert.deepStrictEqual(ab, vectorAddBigIntIterative(b, a))

			// 3. Associativity: (a + b) + c === a + (b + c)
			assert.deepStrictEqual(
				vectorAddBigIntIterative(ab, c),
				vectorAddBigIntIterative(a, vectorAddBigIntIterative(b, c)),
			)

			// 4. Additive inverse: a + (-a) === 0
			assert.deepStrictEqual(
				vectorAddBigIntIterative(a, negA),
				Array.from({ length: n }, () => 0n),
			)

			// 5. Linearity of component sum: sum(a + b) === sum(a) + sum(b)
			assert.strictEqual(sum(ab), sum(a) + sum(b))
		}
	})
})
