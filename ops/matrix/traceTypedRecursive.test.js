import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { traceTypedRecursive } from './traceTypedRecursive.js'

/**
 * Independent iterative reference implementation of matrix trace.
 *
 * @param {Float64Array} matrix
 * @param {number} n
 * @returns {number}
 */
function iterativeTrace(matrix, n) {
	let sum = 0
	for (let i = 0; i < n; i++) {
		sum += matrix[i * n + i]
	}
	return sum
}

/**
 * Deterministic linear congruential generator for reproducible test matrices.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createPrng(seed) {
	let state = seed >>> 0
	return () => {
		state = (1664525 * state + 1013904223) >>> 0
		return state / 0x100000000
	}
}

describe('traceTypedRecursive', () => {
	describe('normal cases', () => {
		it('computes trace of a 1x1 matrix', () => {
			const m = new Float64Array([42.5])
			assert.equal(traceTypedRecursive(m), 42.5)
			assert.equal(traceTypedRecursive(m, 1), 42.5)
		})

		it('computes trace of a 2x2 matrix with inferred and explicit dimension', () => {
			// [ 1, 2 ]
			// [ 3, 4 ]
			const m = new Float64Array([1, 2, 3, 4])
			assert.equal(traceTypedRecursive(m), 5)
			assert.equal(traceTypedRecursive(m, 2), 5)
		})

		it('computes trace of a 3x3 matrix with mixed signs and decimals', () => {
			// [  1.5,  99, -10 ]
			// [  4.0, -2.25, 7 ]
			// [  8.0,  11,  3.75 ]
			const m = new Float64Array([1.5, 99, -10, 4.0, -2.25, 7, 8.0, 11, 3.75])
			assert.equal(traceTypedRecursive(m), 3)
			assert.equal(traceTypedRecursive(m, 3), 3)
		})

		it('computes trace of a 4x4 scaled identity matrix', () => {
			const n = 4
			const m = new Float64Array(n * n)
			for (let i = 0; i < n; i++) {
				m[i * n + i] = 2.5
			}
			assert.equal(traceTypedRecursive(m), 10)
			assert.equal(traceTypedRecursive(m, 4), 10)
		})

		it('ignores off-diagonal elements completely', () => {
			const m = new Float64Array([
				10, Number.NaN, Number.POSITIVE_INFINITY,
				Number.NEGATIVE_INFINITY, 20, 1e300,
				-1e300, 999999, 30,
			])
			assert.equal(traceTypedRecursive(m, 3), 60)
		})
	})

	describe('edge cases', () => {
		it('returns 0 for an empty 0x0 matrix', () => {
			const empty = new Float64Array(0)
			assert.equal(traceTypedRecursive(empty), 0)
			assert.equal(traceTypedRecursive(empty, 0), 0)
		})

		it('returns 0 for an all-zero matrix', () => {
			const zeros = new Float64Array(25)
			assert.equal(traceTypedRecursive(zeros), 0)
		})

		it('handles exact cancellation to 0', () => {
			const m = new Float64Array([
				100, 1, 2, 3,
				4, -50, 5, 6,
				7, 8, -30, 9,
				10, 11, 12, -20,
			])
			assert.equal(traceTypedRecursive(m), 0)
		})

		it('works on a Float64Array subarray view', () => {
			const backing = new Float64Array([999, 999, 2, 5, 7, 8, 999])
			const view = backing.subarray(2, 6) // [2, 5, 7, 8] -> 2x2 with trace 10
			assert.equal(traceTypedRecursive(view), 10)
			assert.equal(traceTypedRecursive(view, 2), 10)
		})

		it('propagates non-finite diagonal entries per IEEE-754', () => {
			const withNaN = new Float64Array([1, 0, 0, Number.NaN])
			assert.ok(Number.isNaN(traceTypedRecursive(withNaN)))

			const withInf = new Float64Array([Number.POSITIVE_INFINITY, 0, 0, 5])
			assert.equal(traceTypedRecursive(withInf), Number.POSITIVE_INFINITY)

			const withNegInf = new Float64Array([Number.NEGATIVE_INFINITY, 0, 0, 5])
			assert.equal(traceTypedRecursive(withNegInf), Number.NEGATIVE_INFINITY)
		})

		it('handles large dimension without stack overflow (O(log n) depth)', () => {
			const n = 512
			const m = new Float64Array(n * n)
			for (let i = 0; i < n; i++) {
				m[i * n + i] = i + 1
			}
			const expected = (n * (n + 1)) / 2
			assert.equal(traceTypedRecursive(m, n), expected)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-Float64Array matrix inputs', () => {
			const invalidMatrices = [
				null,
				undefined,
				42,
				'1234',
				{},
				[1, 2, 3, 4],
				[[1, 2], [3, 4]],
				new Float32Array([1, 2, 3, 4]),
				new Int32Array([1, 2, 3, 4]),
				new Uint8Array([1, 2, 3, 4]),
			]
			for (const bad of invalidMatrices) {
				assert.throws(
					() => traceTypedRecursive(bad),
					{ name: 'TypeError' },
					`Expected TypeError for input ${String(bad)}`
				)
			}
		})

		it('throws RangeError when matrix length is not a perfect square and n is omitted', () => {
			for (const len of [2, 3, 5, 6, 7, 8, 10]) {
				assert.throws(
					() => traceTypedRecursive(new Float64Array(len)),
					{ name: 'RangeError' },
					`Expected RangeError for non-square length ${len}`
				)
			}
		})

		it('throws TypeError when explicit n is not a number', () => {
			const m = new Float64Array(4)
			for (const badN of ['2', null, true, {}, []]) {
				assert.throws(
					() => traceTypedRecursive(m, badN),
					{ name: 'TypeError' },
					`Expected TypeError for dimension ${String(badN)}`
				)
			}
		})

		it('throws RangeError when explicit n is negative, non-integer, or non-finite', () => {
			const m = new Float64Array(4)
			for (const badN of [-1, -2, 1.5, 2.1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
				assert.throws(
					() => traceTypedRecursive(m, badN),
					{ name: 'RangeError' },
					`Expected RangeError for dimension ${String(badN)}`
				)
			}
		})

		it('throws RangeError when explicit n does not match matrix.length', () => {
			assert.throws(() => traceTypedRecursive(new Float64Array(4), 3), { name: 'RangeError' })
			assert.throws(() => traceTypedRecursive(new Float64Array(9), 2), { name: 'RangeError' })
			assert.throws(() => traceTypedRecursive(new Float64Array(0), 1), { name: 'RangeError' })
			assert.throws(() => traceTypedRecursive(new Float64Array(1), 0), { name: 'RangeError' })
		})
	})

	describe('cross-check against independent iterative computation', () => {
		it('matches iterative trace on integer-valued matrices across odd and even sizes', () => {
			const rand = createPrng(20261122)
			const sizes = [0, 1, 2, 3, 4, 5, 7, 8, 15, 16, 31, 64]

			for (const n of sizes) {
				const m = new Float64Array(n * n)
				for (let k = 0; k < m.length; k++) {
					m[k] = Math.floor(rand() * 201) - 100
				}
				const expected = iterativeTrace(m, n)
				assert.equal(traceTypedRecursive(m), expected)
				assert.equal(traceTypedRecursive(m, n), expected)
			}
		})

		it('matches iterative trace within floating-point tolerance on real-valued matrices', () => {
			const rand = createPrng(987654321)
			const sizes = [1, 3, 10, 33, 64, 100]

			for (const n of sizes) {
				const m = new Float64Array(n * n)
				for (let k = 0; k < m.length; k++) {
					m[k] = (rand() - 0.5) * 1000
				}
				const actual = traceTypedRecursive(m, n)
				const expected = iterativeTrace(m, n)
				assert.ok(
					Math.abs(actual - expected) <= 1e-10,
					`Size ${n}: recursive (${actual}) differed from iterative (${expected})`
				)
			}
		})
	})
})
