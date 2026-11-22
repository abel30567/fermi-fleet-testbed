import { describe, test } from 'node:test'
import assert from 'node:assert'
import { vectorAddTypedRecursive } from './vectorAddTypedRecursive.js'

/**
 * Independent iterative reference implementation for cross-checking.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Float64Array}
 */
function iterativeVectorAdd(a, b) {
	const out = new Float64Array(a.length)
	for (let i = 0; i < a.length; i++) {
		out[i] = a[i] + b[i]
	}
	return out
}

describe('vectorAddTypedRecursive', () => {
	describe('normal cases', () => {
		test('handles empty Float64Arrays', () => {
			const a = new Float64Array(0)
			const b = new Float64Array(0)
			const result = vectorAddTypedRecursive(a, b)
			assert.ok(result instanceof Float64Array)
			assert.strictEqual(result.length, 0)
			assert.deepStrictEqual(result, new Float64Array(0))
		})

		test('handles single-element vectors', () => {
			const a = new Float64Array([3.5])
			const b = new Float64Array([-1.25])
			const result = vectorAddTypedRecursive(a, b)
			assert.ok(result instanceof Float64Array)
			assert.deepStrictEqual(result, new Float64Array([2.25]))
		})

		test('handles even-length vectors', () => {
			const a = new Float64Array([1, 2, 3, 4])
			const b = new Float64Array([10, -20, 30.5, -40.25])
			const result = vectorAddTypedRecursive(a, b)
			assert.deepStrictEqual(result, new Float64Array([11, -18, 33.5, -36.25]))
		})

		test('handles odd-length vectors', () => {
			const a = new Float64Array([1.5, -2.5, 3, 4.25, -5.75])
			const b = new Float64Array([0.5, 2.5, -1, 0.75, 1.75])
			const result = vectorAddTypedRecursive(a, b)
			assert.deepStrictEqual(result, new Float64Array([2, 0, 2, 5, -4]))
		})

		test('handles larger vectors (power-of-two and non-power-of-two)', () => {
			for (const len of [1024, 1025, 4099]) {
				const a = new Float64Array(len)
				const b = new Float64Array(len)
				for (let i = 0; i < len; i++) {
					a[i] = i * 0.5
					b[i] = -i * 0.25 + 1
				}
				const result = vectorAddTypedRecursive(a, b)
				assert.strictEqual(result.length, len)
				for (let i = 0; i < len; i++) {
					assert.strictEqual(result[i], i * 0.25 + 1)
				}
			}
		})
	})

	describe('edge cases', () => {
		test('zero vector identity (v + 0 = v and 0 + v = v)', () => {
			const v = new Float64Array([-123.456, 0, 789.012, -0.0001, 42])
			const zero = new Float64Array(v.length)
			assert.deepStrictEqual(vectorAddTypedRecursive(v, zero), v)
			assert.deepStrictEqual(vectorAddTypedRecursive(zero, v), v)
		})

		test('additive inverses (v + (-v) = 0)', () => {
			const v = new Float64Array([1, -2.5, 3.75, -1e9, 1e-9, 0])
			const negV = new Float64Array(v.map((x) => -x))
			const result = vectorAddTypedRecursive(v, negV)
			assert.deepStrictEqual(result, new Float64Array(v.length))
		})

		test('supports aliasing (same Float64Array passed for both arguments)', () => {
			const v = new Float64Array([1, -2, 3.5, 4])
			const result = vectorAddTypedRecursive(v, v)
			assert.deepStrictEqual(result, new Float64Array([2, -4, 7, 8]))
			assert.notStrictEqual(result, v)
		})

		test('does not mutate inputs and returns a distinct Float64Array', () => {
			const a = new Float64Array([10, 20, 30, 40, 50])
			const b = new Float64Array([1, 2, 3, 4, 5])
			const aSnap = new Float64Array(a)
			const bSnap = new Float64Array(b)

			const result = vectorAddTypedRecursive(a, b)
			assert.notStrictEqual(result, a)
			assert.notStrictEqual(result, b)
			assert.deepStrictEqual(a, aSnap)
			assert.deepStrictEqual(b, bSnap)

			result[0] = 999
			assert.deepStrictEqual(a, aSnap)
			assert.deepStrictEqual(b, bSnap)
		})

		test('throws TypeError for non-Float64Array inputs', () => {
			const valid = new Float64Array([1, 2, 3])
			const invalidInputs = [
				[1, 2, 3],
				new Float32Array([1, 2, 3]),
				new Int32Array([1, 2, 3]),
				new Uint8Array([1, 2, 3]),
				null,
				undefined,
				42,
				'123',
				{ 0: 1, 1: 2, 2: 3, length: 3 },
			]

			for (const invalid of invalidInputs) {
				assert.throws(
					() => vectorAddTypedRecursive(invalid, valid),
					TypeError,
				)
				assert.throws(
					() => vectorAddTypedRecursive(valid, invalid),
					TypeError,
				)
			}
		})

		test('throws RangeError for mismatched lengths', () => {
			assert.throws(
				() =>
					vectorAddTypedRecursive(
						new Float64Array([1, 2]),
						new Float64Array([1, 2, 3]),
					),
				RangeError,
			)
			assert.throws(
				() =>
					vectorAddTypedRecursive(
						new Float64Array(0),
						new Float64Array([0]),
					),
				RangeError,
			)
		})

		test('throws RangeError for NaN and non-finite values', () => {
			const badValues = [NaN, Infinity, -Infinity]
			for (const bad of badValues) {
				// Position: start, middle, end
				for (const pos of [0, 2, 4]) {
					const aBad = new Float64Array([1, 2, 3, 4, 5])
					const bOk = new Float64Array([1, 2, 3, 4, 5])
					aBad[pos] = bad
					assert.throws(
						() => vectorAddTypedRecursive(aBad, bOk),
						RangeError,
					)
					assert.throws(
						() => vectorAddTypedRecursive(bOk, aBad),
						RangeError,
					)
				}
			}
		})
	})

	describe('cross-checks and algebraic laws', () => {
		test('matches independent iterative loop across varied lengths and values', () => {
			const lengths = [0, 1, 2, 3, 7, 16, 63, 256, 1023]
			for (const len of lengths) {
				const a = new Float64Array(len)
				const b = new Float64Array(len)
				for (let i = 0; i < len; i++) {
					a[i] = Math.sin(i * 1.13) * 100
					b[i] = Math.cos(i * 0.71) * 50
				}
				const expected = iterativeVectorAdd(a, b)
				const actual = vectorAddTypedRecursive(a, b)
				assert.deepStrictEqual(actual, expected)
			}
		})

		test('satisfies commutativity: a + b === b + a', () => {
			const a = new Float64Array(137)
			const b = new Float64Array(137)
			for (let i = 0; i < a.length; i++) {
				a[i] = (i - 68) * 1.37
				b[i] = ((i * 17) % 29) - 14.25
			}
			assert.deepStrictEqual(
				vectorAddTypedRecursive(a, b),
				vectorAddTypedRecursive(b, a),
			)
		})

		test('satisfies associativity: (a + b) + c === a + (b + c)', () => {
			// Exact associativity for integer-representable Float64 values
			const a = new Float64Array([1, -5, 12, 0, 100, -42, 7])
			const b = new Float64Array([-3, 8, -12, 99, -50, 19, 3])
			const c = new Float64Array([2, -3, 5, -99, 25, 23, -10])

			const left = vectorAddTypedRecursive(vectorAddTypedRecursive(a, b), c)
			const right = vectorAddTypedRecursive(a, vectorAddTypedRecursive(b, c))
			assert.deepStrictEqual(left, right)

			// Floating-point associativity within tolerance
			const af = new Float64Array(65)
			const bf = new Float64Array(65)
			const cf = new Float64Array(65)
			for (let i = 0; i < 65; i++) {
				af[i] = Math.sin(i + 1)
				bf[i] = Math.cos(i + 2)
				cf[i] = Math.sin(i * 2 + 3)
			}
			const leftF = vectorAddTypedRecursive(vectorAddTypedRecursive(af, bf), cf)
			const rightF = vectorAddTypedRecursive(af, vectorAddTypedRecursive(bf, cf))
			for (let i = 0; i < 65; i++) {
				assert.ok(
					Math.abs(leftF[i] - rightF[i]) < 1e-12,
					`associativity mismatch at index ${i}: ${leftF[i]} vs ${rightF[i]}`,
				)
			}
		})
	})
})
