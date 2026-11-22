import { describe, it } from 'node:test'
import assert from 'node:assert'
import { vectorAddBigIntIterative } from './vectorAddBigIntIterative.js'

describe('vectorAddBigIntIterative', () => {
	it('adds normal vectors of positive, negative, and mixed BigInts', () => {
		assert.deepStrictEqual(
			vectorAddBigIntIterative([1n, 2n, 3n], [4n, 5n, 6n]),
			[5n, 7n, 9n],
		)
		assert.deepStrictEqual(
			vectorAddBigIntIterative([-10n, 0n, 42n], [3n, -7n, -42n]),
			[-7n, -7n, 0n],
		)
		assert.deepStrictEqual(vectorAddBigIntIterative([99n], [-100n]), [-1n])
	})

	it('preserves exactness for fixed-point BigInt values scaled by 10^18', () => {
		const SCALE = 10n ** 18n
		const a = [1n * SCALE + 250000000000000000n, -3n * SCALE + 500000000000000000n]
		const b = [2n * SCALE + 750000000000000000n, 3n * SCALE - 500000000000000000n]
		assert.deepStrictEqual(vectorAddBigIntIterative(a, b), [4n * SCALE, 0n])
	})

	it('handles empty vectors', () => {
		assert.deepStrictEqual(vectorAddBigIntIterative([], []), [])
	})

	it('handles zero vectors (additive identity)', () => {
		const v = [12n, -34n, 0n, 567890123456789012345n]
		const zero = [0n, 0n, 0n, 0n]
		assert.deepStrictEqual(vectorAddBigIntIterative(v, zero), v)
		assert.deepStrictEqual(vectorAddBigIntIterative(zero, v), v)
		assert.deepStrictEqual(vectorAddBigIntIterative(zero, zero), zero)
	})

	it('handles additive inverses', () => {
		const v = [1n, -2n, 10n ** 18n, -(2n ** 150n), 0n]
		const negV = v.map((x) => -x)
		assert.deepStrictEqual(
			vectorAddBigIntIterative(v, negV),
			[0n, 0n, 0n, 0n, 0n],
		)
	})

	it('handles huge BigInts greater than 2^128 without overflow or precision loss', () => {
		const p128 = 2n ** 128n
		const p200 = 2n ** 200n
		const p256 = 2n ** 256n
		const a = [p128 + 1n, p200 - 7n, -p256, p256 - 1n]
		const b = [p128 + 2n, p200 + 7n, p256 + 12345n, 1n]
		assert.deepStrictEqual(vectorAddBigIntIterative(a, b), [
			2n * p128 + 3n,
			2n * p200,
			12345n,
			p256,
		])
	})

	it('does not mutate input vectors and returns a new array', () => {
		const a = [10n, 20n, 30n]
		const b = [1n, 2n, 3n]
		const aCopy = [...a]
		const bCopy = [...b]
		const result = vectorAddBigIntIterative(a, b)

		assert.deepStrictEqual(a, aCopy)
		assert.deepStrictEqual(b, bCopy)
		assert.notStrictEqual(result, a)
		assert.notStrictEqual(result, b)

		result[0] = 999n
		assert.deepStrictEqual(a, aCopy)
		assert.deepStrictEqual(b, bCopy)
	})

	it('throws RangeError on mismatched vector lengths', () => {
		assert.throws(() => vectorAddBigIntIterative([1n, 2n], [1n]), RangeError)
		assert.throws(() => vectorAddBigIntIterative([], [0n]), RangeError)
		assert.throws(() => vectorAddBigIntIterative([0n], []), RangeError)
	})

	it('throws TypeError on non-array inputs', () => {
		const invalidInputs = [
			null,
			undefined,
			123n,
			123,
			'123',
			{},
			{ length: 2, 0: 1n, 1: 2n },
			new BigInt64Array([1n, 2n]),
		]
		for (const bad of invalidInputs) {
			assert.throws(() => vectorAddBigIntIterative(bad, [1n, 2n]), TypeError)
			assert.throws(() => vectorAddBigIntIterative([1n, 2n], bad), TypeError)
		}
	})

	it('throws TypeError on non-BigInt elements and sparse arrays', () => {
		const invalidElements = [1, 0, -5, 1.5, NaN, '1', true, null, undefined, {}, []]
		for (const bad of invalidElements) {
			assert.throws(() => vectorAddBigIntIterative([1n, bad], [1n, 2n]), TypeError)
			assert.throws(() => vectorAddBigIntIterative([1n, 2n], [1n, bad]), TypeError)
		}

		// Sparse array holes should also be rejected
		const sparse = new Array(2)
		sparse[0] = 1n
		assert.throws(() => vectorAddBigIntIterative(sparse, [1n, 2n]), TypeError)
		assert.throws(() => vectorAddBigIntIterative([1n, 2n], sparse), TypeError)
	})

	it('cross-checks algebraic invariants (commutativity, associativity, sum-of-components) and independent computation', () => {
		// Deterministic pseudo-random BigInt generator (LCG) producing values across > 2^128 range
		let state = 0x123456789abcdef0123456789abcdef1n
		const MOD = 2n ** 140n
		const MUL = 6364136223846793005n
		const INC = 1442695040888963407n
		const nextBigInt = () => {
			state = (state * MUL + INC) % MOD
			return state - MOD / 2n
		}

		const sum = (vec) => vec.reduce((acc, x) => acc + x, 0n)

		for (const len of [0, 1, 5, 32, 128]) {
			const a = Array.from({ length: len }, nextBigInt)
			const b = Array.from({ length: len }, nextBigInt)
			const c = Array.from({ length: len }, nextBigInt)

			const ab = vectorAddBigIntIterative(a, b)
			const ba = vectorAddBigIntIterative(b, a)

			// Independent element-wise reference via Array.prototype.map
			const reference = a.map((x, i) => x + b[i])
			assert.deepStrictEqual(ab, reference)

			// Commutativity: a + b == b + a
			assert.deepStrictEqual(ab, ba)

			// Associativity: (a + b) + c == a + (b + c)
			const leftAssoc = vectorAddBigIntIterative(ab, c)
			const rightAssoc = vectorAddBigIntIterative(
				a,
				vectorAddBigIntIterative(b, c),
			)
			assert.deepStrictEqual(leftAssoc, rightAssoc)

			// Sum-of-components invariant: sum(a + b) == sum(a) + sum(b)
			assert.strictEqual(sum(ab), sum(a) + sum(b))
		}
	})
})
