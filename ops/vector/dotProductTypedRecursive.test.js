import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { dotProductTypedRecursive } from './dotProductTypedRecursive.js'

/**
 * Independent iterative dot product used as a reference oracle.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {number}
 */
function iterativeDotProduct(a, b) {
	let sum = 0
	for (let i = 0; i < a.length; i++) {
		sum += a[i] * b[i]
	}
	return sum
}

/**
 * Deterministic LCG-based vector generator producing values in [-10, 10].
 *
 * @param {number} length
 * @param {number} seed
 * @returns {Float64Array}
 */
function makeDeterministicVector(length, seed) {
	const out = new Float64Array(length)
	let state = seed >>> 0
	for (let i = 0; i < length; i++) {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		out[i] = (state / 0xffffffff) * 20 - 10
	}
	return out
}

describe('dotProductTypedRecursive', () => {
	describe('normal cases across lengths', () => {
		it('returns +0 for empty Float64Array inputs', () => {
			const result = dotProductTypedRecursive(
				new Float64Array(0),
				new Float64Array(0),
			)
			assert.equal(result, 0)
			assert.ok(Object.is(result, 0))
		})

		it('handles length 1 vectors', () => {
			assert.equal(
				dotProductTypedRecursive(
					new Float64Array([3.5]),
					new Float64Array([4]),
				),
				14,
			)
			const zeroResult = dotProductTypedRecursive(
				new Float64Array([-0]),
				new Float64Array([5]),
			)
			assert.ok(Object.is(zeroResult, 0))
		})

		it('handles even-length vectors (lengths 2, 4, 8)', () => {
			assert.equal(
				dotProductTypedRecursive(
					new Float64Array([1, 2]),
					new Float64Array([3, 4]),
				),
				11,
			)
			assert.equal(
				dotProductTypedRecursive(
					new Float64Array([1, 2, 3, 4]),
					new Float64Array([5, 6, 7, 8]),
				),
				70,
			)
			assert.equal(
				dotProductTypedRecursive(
					new Float64Array([1, 2, 3, 4, 5, 6, 7, 8]),
					new Float64Array([8, 7, 6, 5, 4, 3, 2, 1]),
				),
				120,
			)
		})

		it('handles odd-length vectors (lengths 3, 5, 7)', () => {
			assert.equal(
				dotProductTypedRecursive(
					new Float64Array([1, 2, 3]),
					new Float64Array([4, 5, 6]),
				),
				32,
			)
			assert.equal(
				dotProductTypedRecursive(
					new Float64Array([2, 0.5, 4, 1.5, 3]),
					new Float64Array([1, 2, 0.25, 2, 3]),
				),
				16,
			)
			assert.equal(
				dotProductTypedRecursive(
					new Float64Array([1, 1, 1, 1, 1, 1, 1]),
					new Float64Array([1, 2, 3, 4, 5, 6, 7]),
				),
				28,
			)
		})

		it('handles larger arrays (lengths 1000 and 4097)', () => {
			const n1 = 1000
			const a1 = new Float64Array(n1)
			const b1 = new Float64Array(n1)
			for (let i = 0; i < n1; i++) {
				a1[i] = i + 1
				b1[i] = 1
			}
			assert.equal(dotProductTypedRecursive(a1, b1), (n1 * (n1 + 1)) / 2)

			const n2 = 4097
			const a2 = new Float64Array(n2).fill(0.5)
			const b2 = new Float64Array(n2).fill(2)
			assert.equal(dotProductTypedRecursive(a2, b2), n2)
		})

		it('works correctly on Float64Array subarray views', () => {
			const backingA = new Float64Array([99, 1, 2, 3, 88])
			const backingB = new Float64Array([77, 4, 5, 6, 66])
			const subA = backingA.subarray(1, 4)
			const subB = backingB.subarray(1, 4)
			assert.equal(dotProductTypedRecursive(subA, subB), 32)
		})
	})

	describe('edge cases', () => {
		it('returns 0 for orthogonal vectors', () => {
			assert.equal(
				dotProductTypedRecursive(
					new Float64Array([1, 0, 0]),
					new Float64Array([0, 1, 0]),
				),
				0,
			)
			assert.equal(
				dotProductTypedRecursive(
					new Float64Array([1, 2, -1, 0]),
					new Float64Array([2, -1, 0, 5]),
				),
				0,
			)
		})

		it('handles negative and mixed-sign entries', () => {
			assert.equal(
				dotProductTypedRecursive(
					new Float64Array([-1, -2, -3]),
					new Float64Array([-4, -5, -6]),
				),
				32,
			)
			assert.equal(
				dotProductTypedRecursive(
					new Float64Array([-3, 4, -5, 6]),
					new Float64Array([2, -1, 3, -2]),
				),
				-37,
			)
		})

		it('handles aliasing when the same Float64Array is passed for both inputs', () => {
			const v = new Float64Array([3, -4, 12])
			assert.equal(dotProductTypedRecursive(v, v), 169)
		})

		it('does not mutate input Float64Arrays', () => {
			const a = new Float64Array([1.25, -2.5, 3.75, 4.125, -5.5])
			const b = new Float64Array([-6.25, 7.5, -8.75, 9.125, 10.5])
			const aCopy = new Float64Array(a)
			const bCopy = new Float64Array(b)

			dotProductTypedRecursive(a, b)

			assert.deepEqual(a, aCopy)
			assert.deepEqual(b, bCopy)
		})

		it('throws TypeError for non-Float64Array inputs', () => {
			const valid = new Float64Array([1, 2])
			const invalidInputs = [
				[1, 2],
				new Float32Array([1, 2]),
				new Int32Array([1, 2]),
				new Uint8Array([1, 2]),
				null,
				undefined,
				42,
				'1,2',
				{ 0: 1, 1: 2, length: 2 },
			]

			for (const bad of invalidInputs) {
				assert.throws(
					() => dotProductTypedRecursive(bad, valid),
					TypeError,
				)
				assert.throws(
					() => dotProductTypedRecursive(valid, bad),
					TypeError,
				)
			}
		})

		it('throws RangeError for mismatched vector lengths', () => {
			assert.throws(
				() =>
					dotProductTypedRecursive(
						new Float64Array([1, 2]),
						new Float64Array([1, 2, 3]),
					),
				RangeError,
			)
			assert.throws(
				() =>
					dotProductTypedRecursive(
						new Float64Array(0),
						new Float64Array([1]),
					),
				RangeError,
			)
		})

		it('throws RangeError for NaN or infinite elements', () => {
			const nonFiniteValues = [NaN, Infinity, -Infinity]
			for (const badVal of nonFiniteValues) {
				assert.throws(
					() =>
						dotProductTypedRecursive(
							new Float64Array([1, badVal, 3]),
							new Float64Array([1, 2, 3]),
						),
					RangeError,
				)
				assert.throws(
					() =>
						dotProductTypedRecursive(
							new Float64Array([1, 2, 3]),
							new Float64Array([1, 2, badVal]),
						),
					RangeError,
				)
			}
		})
	})

	describe('cross-checks and algebraic identities', () => {
		it('matches an independent iterative dot product across varied lengths', () => {
			const lengths = [0, 1, 2, 3, 7, 16, 63, 257, 1024]
			for (const len of lengths) {
				const a = makeDeterministicVector(len, 100 + len)
				const b = makeDeterministicVector(len, 2000 + len)
				const actual = dotProductTypedRecursive(a, b)
				const expected = iterativeDotProduct(a, b)
				const tolerance = 1e-11 * Math.max(1, Math.abs(expected))
				assert.ok(
					Math.abs(actual - expected) <= tolerance,
					`length=${len}: actual=${actual}, expected=${expected}`,
				)
			}
		})

		it('satisfies commutativity: dot(a, b) === dot(b, a)', () => {
			for (const len of [1, 5, 17, 128, 513]) {
				const a = makeDeterministicVector(len, 31 + len)
				const b = makeDeterministicVector(len, 97 + len)
				assert.equal(
					dotProductTypedRecursive(a, b),
					dotProductTypedRecursive(b, a),
				)
			}
		})

		it('satisfies linearity: dot(alpha*a + beta*b, c) == alpha*dot(a, c) + beta*dot(b, c)', () => {
			const len = 127
			const a = makeDeterministicVector(len, 11)
			const b = makeDeterministicVector(len, 22)
			const c = makeDeterministicVector(len, 33)
			const alpha = 2.75
			const beta = -1.625

			const combo = new Float64Array(len)
			for (let i = 0; i < len; i++) {
				combo[i] = alpha * a[i] + beta * b[i]
			}

			const lhs = dotProductTypedRecursive(combo, c)
			const rhs =
				alpha * dotProductTypedRecursive(a, c) +
				beta * dotProductTypedRecursive(b, c)
			const tolerance = 1e-11 * Math.max(1, Math.abs(rhs))
			assert.ok(
				Math.abs(lhs - rhs) <= tolerance,
				`lhs=${lhs}, rhs=${rhs}`,
			)
		})

		it('satisfies Cauchy-Schwarz inequality: |dot(a, b)|^2 <= dot(a, a) * dot(b, b)', () => {
			const a = makeDeterministicVector(200, 501)
			const b = makeDeterministicVector(200, 809)
			const ab = dotProductTypedRecursive(a, b)
			const aa = dotProductTypedRecursive(a, a)
			const bb = dotProductTypedRecursive(b, b)

			assert.ok(aa >= 0 && bb >= 0)
			assert.ok(ab * ab <= aa * bb * (1 + 1e-12))
		})
	})
})
