import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { lnTypedRecursive } from './lnTypedRecursive.js'

describe('lnTypedRecursive', () => {
	it('handles empty Float64Array and returns a new instance', () => {
		const input = new Float64Array(0)
		const output = lnTypedRecursive(input)

		assert.ok(output instanceof Float64Array)
		assert.notEqual(output, input)
		assert.equal(output.length, 0)
	})

	it('handles single-element Float64Array', () => {
		const input = new Float64Array([Math.E])
		const output = lnTypedRecursive(input)

		assert.ok(output instanceof Float64Array)
		assert.equal(output.length, 1)
		assert.ok(Math.abs(output[0] - 1) < 1e-15)
	})

	it('handles even-length Float64Arrays', () => {
		const input = new Float64Array([1, Math.E, Math.E ** 2, Math.E ** 3])
		const output = lnTypedRecursive(input)
		const expected = [0, 1, 2, 3]

		assert.equal(output.length, expected.length)
		for (let i = 0; i < expected.length; i++) {
			assert.ok(Math.abs(output[i] - expected[i]) < 1e-14)
		}
	})

	it('handles odd-length Float64Arrays', () => {
		const input = new Float64Array([1, 2, 4, 8, 16, 32, 64])
		const output = lnTypedRecursive(input)

		assert.equal(output.length, input.length)
		for (let i = 0; i < input.length; i++) {
			assert.ok(Math.abs(output[i] - i * Math.LN2) < 1e-14)
		}
	})

	it('handles larger Float64Arrays (both odd and even lengths)', () => {
		for (const len of [256, 1025]) {
			const input = new Float64Array(len)
			for (let i = 0; i < len; i++) {
				input[i] = (i + 1) * 0.75
			}

			const output = lnTypedRecursive(input)
			assert.equal(output.length, len)
			for (let i = 0; i < len; i++) {
				assert.equal(output[i], Math.log(input[i]))
			}
		}
	})

	it('handles edge values: 1, Math.E, small fractions, and Infinity', () => {
		const input = new Float64Array([
			1,
			Math.E,
			0.5,
			1e-10,
			Number.MIN_VALUE,
			1e300,
			Infinity,
		])
		const output = lnTypedRecursive(input)

		assert.equal(output[0], 0)
		assert.equal(output[1], 1)
		assert.ok(Math.abs(output[2] - -Math.LN2) < 1e-15)
		assert.ok(Math.abs(output[3] - -10 * Math.LN10) < 1e-13)
		assert.equal(output[4], Math.log(Number.MIN_VALUE))
		assert.ok(Math.abs(output[5] - 300 * Math.LN10) < 1e-12)
		assert.equal(output[6], Infinity)
	})

	it('cross-checks inverse identity Math.exp(ln(x)) ≈ x', () => {
		const input = new Float64Array([
			1e-12,
			1e-6,
			0.001,
			0.25,
			1,
			Math.PI,
			Math.E,
			42.5,
			1e6,
			1e12,
		])
		const output = lnTypedRecursive(input)

		for (let i = 0; i < input.length; i++) {
			const reconstructed = Math.exp(output[i])
			const relErr = Math.abs(reconstructed - input[i]) / input[i]
			assert.ok(
				relErr < 1e-12,
				`Expected Math.exp(${output[i]}) ≈ ${input[i]}, got ${reconstructed} (relErr=${relErr})`,
			)
		}
	})

	it('does not mutate the input Float64Array', () => {
		const original = [0.25, 1, Math.E, 10, 100]
		const input = new Float64Array(original)
		const output = lnTypedRecursive(input)

		assert.notEqual(output, input)
		assert.deepEqual(Array.from(input), original)
	})

	it('throws RangeError for values <= 0 or NaN', () => {
		const invalidCases = [
			new Float64Array([0]),
			new Float64Array([-0]),
			new Float64Array([-1]),
			new Float64Array([-Infinity]),
			new Float64Array([NaN]),
			new Float64Array([1, 2, 3, 0, 5]),
			new Float64Array([1, 2, -0.0001, 4, 5]),
			new Float64Array([1, 2, 3, 4, NaN]),
		]

		for (const arr of invalidCases) {
			assert.throws(() => lnTypedRecursive(arr), RangeError)
		}
	})

	it('throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			[1, 2, 3],
			new Float32Array([1, 2, 3]),
			new Int32Array([1, 2, 3]),
			new Uint8Array([1, 2, 3]),
			null,
			undefined,
			42,
			'123',
			{ length: 1, 0: 1 },
		]

		for (const bad of invalidInputs) {
			assert.throws(() => lnTypedRecursive(bad), TypeError)
		}
	})
})
