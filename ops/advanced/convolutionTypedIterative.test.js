import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { convolutionTypedIterative } from './convolutionTypedIterative.js'

/**
 * Asserts two Float64Arrays have equal length and element-wise closeness within eps.
 *
 * @param {Float64Array} actual
 * @param {Float64Array | number[]} expected
 * @param {number} [eps=1e-12]
 */
function assertCloseArray(actual, expected, eps = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array')
	assert.equal(actual.length, expected.length, 'array lengths must match')
	for (let i = 0; i < actual.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		assert.ok(
			diff <= eps,
			`index ${i}: expected ${expected[i]}, got ${actual[i]} (diff=${diff})`,
		)
	}
}

/**
 * Evaluates polynomial sum_{k=0}^{n-1} coeffs[k] * x^k using Horner's method.
 *
 * @param {Float64Array} coeffs
 * @param {number} x
 * @returns {number}
 */
function evalPoly(coeffs, x) {
	let acc = 0
	for (let i = coeffs.length - 1; i >= 0; i--) {
		acc = acc * x + coeffs[i]
	}
	return acc
}

describe('convolutionTypedIterative', () => {
	describe('normal cases', () => {
		it('computes full convolution of equal-length signals', () => {
			const a = new Float64Array([1, 2, 3])
			const b = new Float64Array([4, 5, 6])
			const out = convolutionTypedIterative(a, b)
			assert.ok(out instanceof Float64Array)
			assert.deepEqual(out, new Float64Array([4, 13, 28, 27, 18]))
		})

		it('computes full convolution of different-length signals', () => {
			const signal = new Float64Array([1, 0, 2, 3, 4])
			const kernel = new Float64Array([0.5, 0.25])
			const out = convolutionTypedIterative(signal, kernel)
			assertCloseArray(out, [0.5, 0.25, 1, 2, 2.75, 1])
		})

		it('handles negative and fractional floating-point values', () => {
			const a = new Float64Array([-1.5, 2.25, -0.5])
			const b = new Float64Array([0.5, -4])
			const out = convolutionTypedIterative(a, b)
			assertCloseArray(out, [-0.75, 7.125, -9.25, 2])
		})

		it('supports "full", "same", and "valid" modes', () => {
			const a = new Float64Array([1, 2, 3, 4, 5])
			const b = new Float64Array([1, 0, -1])

			const full = convolutionTypedIterative(a, b, 'full')
			const same = convolutionTypedIterative(a, b, 'same')
			const valid = convolutionTypedIterative(a, b, 'valid')

			assert.deepEqual(full, new Float64Array([1, 2, 2, 2, 2, -4, -5]))
			assert.deepEqual(same, new Float64Array([2, 2, 2, 2, -4]))
			assert.deepEqual(valid, new Float64Array([2, 2, 2]))
		})

		it('supports "same" mode with even-length kernel', () => {
			const a = new Float64Array([1, 2, 3, 4])
			const b = new Float64Array([1, 1])
			// full = [1, 3, 5, 7, 4], offset = floor((2 - 1)/2) = 0, len = 4
			const same = convolutionTypedIterative(a, b, 'same')
			assert.deepEqual(same, new Float64Array([1, 3, 5, 7]))
		})

		it('does not mutate input Float64Arrays', () => {
			const a = new Float64Array([2, -3, 5])
			const b = new Float64Array([7, 11])
			const aCopy = new Float64Array(a)
			const bCopy = new Float64Array(b)

			const out = convolutionTypedIterative(a, b)
			assert.deepEqual(a, aCopy)
			assert.deepEqual(b, bCopy)
			assert.notEqual(out, a)
			assert.notEqual(out, b)
		})
	})

	describe('edge cases', () => {
		it('returns empty Float64Array when either or both inputs are empty', () => {
			const empty = new Float64Array(0)
			const nonEmpty = new Float64Array([1, 2, 3])

			for (const mode of ['full', 'same', 'valid']) {
				assert.deepEqual(
					convolutionTypedIterative(empty, nonEmpty, mode),
					new Float64Array(0),
				)
				assert.deepEqual(
					convolutionTypedIterative(nonEmpty, empty, mode),
					new Float64Array(0),
				)
				assert.deepEqual(
					convolutionTypedIterative(empty, empty, mode),
					new Float64Array(0),
				)
			}
		})

		it('returns empty Float64Array in "valid" mode when kernel is longer than signal', () => {
			const a = new Float64Array([1, 2])
			const b = new Float64Array([1, 2, 3, 4])
			assert.deepEqual(
				convolutionTypedIterative(a, b, 'valid'),
				new Float64Array(0),
			)
		})

		it('handles single-element inputs', () => {
			const a = new Float64Array([3.5])
			const b = new Float64Array([-2])
			assert.deepEqual(
				convolutionTypedIterative(a, b),
				new Float64Array([-7]),
			)
			assert.deepEqual(
				convolutionTypedIterative(a, b, 'same'),
				new Float64Array([-7]),
			)
			assert.deepEqual(
				convolutionTypedIterative(a, b, 'valid'),
				new Float64Array([-7]),
			)
		})

		it('treats unit impulse [1] as identity and shifted impulse as delay', () => {
			const signal = new Float64Array([4, -1, 7.5, 0, 2])
			const delta = new Float64Array([1])
			const shiftedDelta = new Float64Array([0, 0, 1])

			assert.deepEqual(convolutionTypedIterative(signal, delta), signal)
			assert.deepEqual(
				convolutionTypedIterative(signal, shiftedDelta),
				new Float64Array([0, 0, 4, -1, 7.5, 0, 2]),
			)
		})

		it('avoids negative zero (-0) in output', () => {
			const a = new Float64Array([-1, -2, -3])
			const b = new Float64Array([0, 0])
			const out = convolutionTypedIterative(a, b)
			for (let i = 0; i < out.length; i++) {
				assert.ok(Object.is(out[i], 0), `expected +0 at index ${i}`)
			}
		})

		it('handles Float64Array subarray views with non-zero byteOffset', () => {
			const buf = new Float64Array([99, 1, 2, 3, 88, 4, 5, 77])
			const a = buf.subarray(1, 4) // [1, 2, 3]
			const b = buf.subarray(5, 7) // [4, 5]
			assert.deepEqual(
				convolutionTypedIterative(a, b),
				new Float64Array([4, 13, 22, 15]),
			)
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when a or b is not a Float64Array', () => {
			const valid = new Float64Array([1, 2])
			const invalidInputs = [
				[1, 2],
				new Float32Array([1, 2]),
				new Int32Array([1, 2]),
				null,
				undefined,
				42,
				'12',
				{ 0: 1, length: 1 },
			]

			for (const bad of invalidInputs) {
				assert.throws(
					() => convolutionTypedIterative(bad, valid),
					TypeError,
				)
				assert.throws(
					() => convolutionTypedIterative(valid, bad),
					TypeError,
				)
			}
		})

		it('throws TypeError or RangeError for invalid mode', () => {
			const a = new Float64Array([1, 2])
			const b = new Float64Array([3, 4])

			assert.throws(() => convolutionTypedIterative(a, b, 123), TypeError)
			assert.throws(() => convolutionTypedIterative(a, b, null), TypeError)
			assert.throws(
				() => convolutionTypedIterative(a, b, 'circular'),
				RangeError,
			)
			assert.throws(() => convolutionTypedIterative(a, b, ''), RangeError)
		})

		it('throws RangeError when inputs contain NaN or Infinity', () => {
			const valid = new Float64Array([1, 2])
			const empty = new Float64Array(0)
			const badValues = [NaN, Infinity, -Infinity]

			for (const bad of badValues) {
				assert.throws(
					() =>
						convolutionTypedIterative(
							new Float64Array([1, bad]),
							valid,
						),
					RangeError,
				)
				assert.throws(
					() =>
						convolutionTypedIterative(
							valid,
							new Float64Array([bad, 1]),
						),
					RangeError,
				)
				assert.throws(
					() =>
						convolutionTypedIterative(
							new Float64Array([bad]),
							empty,
						),
					RangeError,
				)
			}
		})
	})

	describe('mathematical cross-checks', () => {
		it('satisfies commutativity: a * b === b * a', () => {
			const a = new Float64Array([1.25, -3.5, 0.75, 4.125, -2])
			const b = new Float64Array([-0.5, 2.75, 1.5])
			assertCloseArray(
				convolutionTypedIterative(a, b),
				convolutionTypedIterative(b, a),
			)
		})

		it('satisfies associativity: (a * b) * c === a * (b * c)', () => {
			const a = new Float64Array([1, -2, 3.5])
			const b = new Float64Array([0.5, 1.5, -1, 2])
			const c = new Float64Array([-3, 0.25, 4])

			const left = convolutionTypedIterative(
				convolutionTypedIterative(a, b),
				c,
			)
			const right = convolutionTypedIterative(
				a,
				convolutionTypedIterative(b, c),
			)
			assertCloseArray(left, right, 1e-11)
		})

		it('satisfies distributivity: a * (b + c) === (a * b) + (a * c)', () => {
			const a = new Float64Array([2, -1, 0.5, 3])
			const b = new Float64Array([1, 4, -2])
			const c = new Float64Array([-3, 2, 5])
			const bPlusC = Float64Array.from(b, (v, i) => v + c[i])

			const lhs = convolutionTypedIterative(a, bPlusC)
			const ab = convolutionTypedIterative(a, b)
			const ac = convolutionTypedIterative(a, c)
			const rhs = Float64Array.from(ab, (v, i) => v + ac[i])

			assertCloseArray(lhs, rhs)
		})

		it('satisfies the sum property: sum(a * b) === sum(a) * sum(b)', () => {
			const a = new Float64Array([1.2, -3.4, 5.6, -7.8, 9.1, -0.3])
			const b = new Float64Array([-2.5, 4.25, -1.75, 3.5])
			const conv = convolutionTypedIterative(a, b)

			const sum = (arr) => arr.reduce((acc, v) => acc + v, 0)
			const expected = sum(a) * sum(b)
			const actual = sum(conv)
			assert.ok(
				Math.abs(actual - expected) < 1e-11,
				`expected sum ${expected}, got ${actual}`,
			)
		})

		it('matches polynomial multiplication evaluated independently at multiple points', () => {
			// P(x) = 3 - 2x + 0.5x^2 + 4x^3 - x^4
			const p = new Float64Array([3, -2, 0.5, 4, -1])
			// Q(x) = -1.5 + 2.5x - 3x^2 + 0.25x^3
			const q = new Float64Array([-1.5, 2.5, -3, 0.25])
			const pq = convolutionTypedIterative(p, q)

			const samplePoints = [-3, -1.5, -1, 0, 0.5, 1, 2, 3.25]
			for (const x of samplePoints) {
				const expected = evalPoly(p, x) * evalPoly(q, x)
				const actual = evalPoly(pq, x)
				assert.ok(
					Math.abs(actual - expected) <= 1e-10 * (1 + Math.abs(expected)),
					`at x=${x}: expected ${expected}, got ${actual}`,
				)
			}
		})
	})
})
