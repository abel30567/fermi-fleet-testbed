import { describe, it } from 'node:test'
import assert from 'node:assert'
import { cosTypedRecursive } from './cosTypedRecursive.js'

function assertClose(actual, expected, eps = 1e-12, message = '') {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		`${message ? `${message}: ` : ''}expected ${actual} to be within ${eps} of ${expected}`
	)
}

/**
 * Independent cosine approximation via Maclaurin / Taylor series:
 * cos(x) = sum_{k=0}^{terms-1} (-1)^k * x^(2k) / (2k)!
 */
function taylorCos(x, terms = 25) {
	let sum = 1
	let term = 1
	const x2 = x * x
	for (let k = 1; k < terms; k++) {
		term *= -x2 / ((2 * k - 1) * (2 * k))
		sum += term
	}
	return sum
}

describe('cosTypedRecursive', () => {
	describe('normal cases across array lengths', () => {
		it('handles empty Float64Array (length 0)', () => {
			const input = new Float64Array(0)
			const result = cosTypedRecursive(input)
			assert.ok(result instanceof Float64Array)
			assert.strictEqual(result.length, 0)
			assert.notStrictEqual(result, input)
		})

		it('handles single-element Float64Array (length 1)', () => {
			const input = new Float64Array([Math.PI / 3])
			const result = cosTypedRecursive(input)
			assert.ok(result instanceof Float64Array)
			assert.strictEqual(result.length, 1)
			assertClose(result[0], 0.5)
		})

		it('handles even-length Float64Arrays (lengths 2, 4, 8)', () => {
			for (const len of [2, 4, 8]) {
				const input = new Float64Array(len)
				for (let i = 0; i < len; i++) {
					input[i] = (i * Math.PI) / len
				}
				const result = cosTypedRecursive(input)
				assert.ok(result instanceof Float64Array)
				assert.strictEqual(result.length, len)
				for (let i = 0; i < len; i++) {
					assertClose(result[i], Math.cos(input[i]), 1e-15, `len=${len} i=${i}`)
				}
			}
		})

		it('handles odd-length Float64Arrays (lengths 3, 5, 7)', () => {
			for (const len of [3, 5, 7]) {
				const input = new Float64Array(len)
				for (let i = 0; i < len; i++) {
					input[i] = ((i - Math.floor(len / 2)) * Math.PI) / 4
				}
				const result = cosTypedRecursive(input)
				assert.ok(result instanceof Float64Array)
				assert.strictEqual(result.length, len)
				for (let i = 0; i < len; i++) {
					assertClose(result[i], Math.cos(input[i]), 1e-15, `len=${len} i=${i}`)
				}
			}
		})

		it('handles larger arrays (even and odd sizes)', () => {
			for (const len of [1024, 1025, 10000]) {
				const input = new Float64Array(len)
				for (let i = 0; i < len; i++) {
					input[i] = (i - len / 2) * 0.01
				}
				const result = cosTypedRecursive(input)
				assert.ok(result instanceof Float64Array)
				assert.strictEqual(result.length, len)
				for (let i = 0; i < len; i++) {
					assert.strictEqual(result[i], Math.cos(input[i]))
				}
			}
		})
	})

	describe('edge cases', () => {
		it('evaluates canonical angles accurately (0, -0, pi/2, pi, 2*pi, negatives)', () => {
			const input = new Float64Array([
				0,
				-0,
				Math.PI / 6,
				Math.PI / 4,
				Math.PI / 3,
				Math.PI / 2,
				Math.PI,
				(3 * Math.PI) / 2,
				2 * Math.PI,
				-Math.PI / 2,
				-Math.PI,
				-2 * Math.PI
			])
			const expected = [
				1,
				1,
				Math.sqrt(3) / 2,
				Math.SQRT1_2,
				0.5,
				0,
				-1,
				0,
				1,
				0,
				-1,
				1
			]
			const result = cosTypedRecursive(input)
			for (let i = 0; i < expected.length; i++) {
				assertClose(result[i], expected[i], 1e-12, `index ${i}`)
			}
		})

		it('preserves even-function symmetry cos(-x) === cos(x)', () => {
			const angles = [0.1, 0.7, 1.2345, 2.5, 4.2, 10.5, 1e-9]
			const pos = cosTypedRecursive(new Float64Array(angles))
			const neg = cosTypedRecursive(new Float64Array(angles.map((x) => -x)))
			for (let i = 0; i < angles.length; i++) {
				assert.strictEqual(pos[i], neg[i])
			}
		})

		it('does not mutate input Float64Array and returns a distinct buffer', () => {
			const original = [0, Math.PI / 4, Math.PI / 2, Math.PI, -1.5]
			const input = new Float64Array(original)
			const result = cosTypedRecursive(input)

			assert.notStrictEqual(result, input)
			assert.notStrictEqual(result.buffer, input.buffer)

			result[0] = 999
			for (let i = 0; i < original.length; i++) {
				assert.strictEqual(input[i], original[i])
			}
		})

		it('throws TypeError for non-Float64Array inputs', () => {
			const invalidInputs = [
				null,
				undefined,
				0,
				1.5,
				'0',
				true,
				{},
				[0, 1, 2],
				new Float32Array([0, 1]),
				new Int32Array([0, 1]),
				new Uint8Array([0, 1]),
				new ArrayBuffer(16)
			]

			for (const bad of invalidInputs) {
				assert.throws(
					() => cosTypedRecursive(bad),
					TypeError,
					`Expected TypeError for input ${String(bad)}`
				)
			}
		})

		it('throws RangeError for NaN, Infinity, and -Infinity elements', () => {
			const invalidArrays = [
				new Float64Array([NaN]),
				new Float64Array([Infinity]),
				new Float64Array([-Infinity]),
				new Float64Array([0, 1, NaN, 2]),
				new Float64Array([0, Infinity, 1, 2, 3]),
				new Float64Array([0, 1, 2, 3, -Infinity])
			]

			for (const bad of invalidArrays) {
				assert.throws(() => cosTypedRecursive(bad), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches Taylor series expansion over [-pi, pi]', () => {
			const count = 41
			const input = new Float64Array(count)
			for (let i = 0; i < count; i++) {
				input[i] = -Math.PI + (2 * Math.PI * i) / (count - 1)
			}

			const result = cosTypedRecursive(input)
			for (let i = 0; i < count; i++) {
				assertClose(
					result[i],
					taylorCos(input[i]),
					1e-12,
					`Taylor cross-check at x=${input[i]}`
				)
			}
		})

		it('matches sin(x + pi/2) and satisfies cos(x)^2 + sin(x)^2 === 1', () => {
			const input = new Float64Array([
				-5.3, -2.7, -1.1, -0.25, 0, 0.37, 1.2, 2.9, 6.1
			])
			const result = cosTypedRecursive(input)

			for (let i = 0; i < input.length; i++) {
				const x = input[i]
				assertClose(
					result[i],
					Math.sin(x + Math.PI / 2),
					1e-12,
					`sin(x + pi/2) cross-check at x=${x}`
				)
				const s = Math.sin(x)
				assertClose(
					result[i] * result[i] + s * s,
					1,
					1e-12,
					`Pythagorean identity at x=${x}`
				)
			}
		})
	})
})
