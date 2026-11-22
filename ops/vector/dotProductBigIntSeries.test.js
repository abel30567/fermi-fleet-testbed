import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { dotProductBigIntSeries } from './dotProductBigIntSeries.js'

/**
 * Independent reference computation via the polarization identity:
 *   a · b = (||a + b||^2 - ||a - b||^2) / 4
 *
 * @param {readonly bigint[]} a
 * @param {readonly bigint[]} b
 * @returns {bigint}
 */
function dotProductPolarization(a, b) {
	let normSumSq = 0n
	let normDiffSq = 0n
	for (let i = 0; i < a.length; i++) {
		const s = a[i] + b[i]
		const d = a[i] - b[i]
		normSumSq += s * s
		normDiffSq += d * d
	}
	const numerator = normSumSq - normDiffSq
	assert.equal(numerator % 4n, 0n)
	return numerator / 4n
}

describe('dotProductBigIntSeries', () => {
	test('computes exact dot product for normal vectors', () => {
		assert.equal(dotProductBigIntSeries([1n, 2n, 3n], [4n, 5n, 6n]), 32n)
		assert.equal(dotProductBigIntSeries([-3n, 7n, -2n], [4n, -5n, 6n]), -59n)
		assert.equal(dotProductBigIntSeries([42n], [-3n]), -126n)
	})

	test('satisfies commutativity and bilinearity', () => {
		const a = [3n, -7n, 11n, 0n, 5n]
		const b = [-2n, 4n, 9n, -8n, 1n]
		const c = [6n, 1n, -3n, 2n, -4n]
		const k = -17n

		assert.equal(
			dotProductBigIntSeries(a, b),
			dotProductBigIntSeries(b, a)
		)

		const bPlusC = b.map((v, i) => v + c[i])
		assert.equal(
			dotProductBigIntSeries(a, bPlusC),
			dotProductBigIntSeries(a, b) + dotProductBigIntSeries(a, c)
		)

		const scaledA = a.map((v) => k * v)
		assert.equal(
			dotProductBigIntSeries(scaledA, b),
			k * dotProductBigIntSeries(a, b)
		)
	})

	test('handles edge cases: empty, zero, and orthogonal vectors', () => {
		assert.equal(dotProductBigIntSeries([], []), 0n)
		assert.equal(dotProductBigIntSeries([0n, 0n, 0n], [0n, 0n, 0n]), 0n)
		assert.equal(
			dotProductBigIntSeries([0n, 0n, 0n], [123n, -456n, 789n]),
			0n
		)
		assert.equal(dotProductBigIntSeries([1n, 0n, 0n], [0n, 1n, 0n]), 0n)
		assert.equal(dotProductBigIntSeries([3n, -4n], [4n, 3n]), 0n)
		assert.equal(dotProductBigIntSeries([2n, -1n, 3n], [1n, 5n, 1n]), 0n)
	})

	test('preserves exactness for very large BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
		const bigA = 10n ** 30n + 7n
		const bigB = 10n ** 30n + 11n
		const expected = bigA * bigB + (-bigA) * (bigB - 2n)
		assert.equal(
			dotProductBigIntSeries([bigA, -bigA], [bigB, bigB - 2n]),
			expected
		)
		assert.equal(expected, 2n * bigA)

		// Catastrophic cancellation test that would lose precision in IEEE-754 floats
		const huge = 1n << 128n
		assert.equal(
			dotProductBigIntSeries([huge + 1n, -huge], [1n, 1n]),
			1n
		)
	})

	test('does not mutate input arrays', () => {
		const a = [1n, -2n, 3n]
		const b = [4n, 5n, -6n]
		const aCopy = [...a]
		const bCopy = [...b]
		dotProductBigIntSeries(a, b)
		assert.deepEqual(a, aCopy)
		assert.deepEqual(b, bCopy)
	})

	test('rejects invalid inputs with appropriate errors', () => {
		// Non-array inputs
		for (const invalid of [null, undefined, 123n, 42, '123', {}, new BigInt64Array([1n])]) {
			assert.throws(() => dotProductBigIntSeries(invalid, [1n]), TypeError)
			assert.throws(() => dotProductBigIntSeries([1n], invalid), TypeError)
		}

		// Mismatched lengths
		assert.throws(() => dotProductBigIntSeries([1n, 2n], [1n]), RangeError)
		assert.throws(() => dotProductBigIntSeries([], [0n]), RangeError)

		// Non-BigInt elements (including sparse array holes and zero-multiplied bad elements)
		for (const bad of [1, '2', null, undefined, NaN, true, {}, Symbol('x')]) {
			assert.throws(() => dotProductBigIntSeries([bad], [1n]), TypeError)
			assert.throws(() => dotProductBigIntSeries([0n], [bad]), TypeError)
		}

		const sparse = new Array(2)
		sparse[0] = 1n
		assert.throws(() => dotProductBigIntSeries(sparse, [1n, 2n]), TypeError)
		assert.throws(() => dotProductBigIntSeries([1n, 2n], sparse), TypeError)
	})

	test('cross-checks against polarization identity (||a+b||^2 - ||a-b||^2) / 4', () => {
		const pairs = [
			[[], []],
			[[1n, 2n, 3n, 4n], [5n, -6n, 7n, -8n]],
			[[3n, -4n, 12n], [4n, 3n, 0n]],
			[
				[10n ** 25n + 3n, -(10n ** 24n) - 9n, (1n << 96n) + 17n],
				[(1n << 80n) - 5n, 10n ** 22n + 11n, -(1n << 95n) + 23n]
			]
		]

		for (const [a, b] of pairs) {
			assert.equal(
				dotProductBigIntSeries(a, b),
				dotProductPolarization(a, b)
			)
		}
	})

	test('cross-checks against closed-form arithmetic series identities', () => {
		const n = 500n
		const seq = Array.from({ length: Number(n) }, (_, i) => BigInt(i + 1))
		const rev = [...seq].reverse()

		// Σ_{k=1}^n k^2 = n(n + 1)(2n + 1) / 6
		const expectedSumSquares = (n * (n + 1n) * (2n * n + 1n)) / 6n
		assert.equal(dotProductBigIntSeries(seq, seq), expectedSumSquares)

		// Σ_{k=1}^n k(n + 1 - k) = n(n + 1)(n + 2) / 6
		const expectedConvolved = (n * (n + 1n) * (n + 2n)) / 6n
		assert.equal(dotProductBigIntSeries(seq, rev), expectedConvolved)
	})
})
