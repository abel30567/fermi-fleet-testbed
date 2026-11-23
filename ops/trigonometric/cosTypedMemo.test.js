import { describe, it } from 'node:test'
import assert from 'node:assert'
import { cosTypedMemo } from './cosTypedMemo.js'

describe('cosTypedMemo', () => {
	it('computes element-wise cosine for normal Float64Array inputs', () => {
		const input = new Float64Array([0, 0.5, 1, 1.5, 2, 3.14])
		const snapshot = new Float64Array(input)
		const result = cosTypedMemo(input)

		assert.ok(result instanceof Float64Array)
		assert.strictEqual(result.length, input.length)
		assert.notStrictEqual(result, input)
		assert.deepStrictEqual(input, snapshot)

		for (let i = 0; i < input.length; i += 1) {
			assert.strictEqual(result[i], Math.cos(input[i]))
		}
	})

	it('handles empty Float64Array input', () => {
		const input = new Float64Array(0)
		const result = cosTypedMemo(input)

		assert.ok(result instanceof Float64Array)
		assert.strictEqual(result.length, 0)
		assert.notStrictEqual(result, input)
	})

	it('handles Float64Array subarray views with non-zero byteOffset', () => {
		const buffer = new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT * 5)
		const full = new Float64Array(buffer)
		full.set([10, 0, Math.PI / 3, Math.PI, 20])
		const view = new Float64Array(buffer, Float64Array.BYTES_PER_ELEMENT, 3)

		const result = cosTypedMemo(view)
		assert.strictEqual(result.length, 3)
		for (let i = 0; i < view.length; i += 1) {
			assert.strictEqual(result[i], Math.cos(view[i]))
		}
	})

	it('throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			undefined,
			null,
			42,
			'0',
			true,
			{},
			[0, 1, 2],
			new Float32Array([0, 1]),
			new Int32Array([0, 1]),
			new Uint8Array([0, 1]),
			new ArrayBuffer(16),
		]

		for (const bad of invalidInputs) {
			assert.throws(() => cosTypedMemo(bad), TypeError)
		}

		assert.throws(() => cosTypedMemo(), TypeError)
	})

	it('handles precomputed special angles accurately', () => {
		const angles = new Float64Array([
			0,
			-0,
			Math.PI / 6,
			Math.PI / 4,
			Math.PI / 3,
			Math.PI / 2,
			(2 * Math.PI) / 3,
			(3 * Math.PI) / 4,
			(5 * Math.PI) / 6,
			Math.PI,
			(3 * Math.PI) / 2,
			2 * Math.PI,
		])

		const result = cosTypedMemo(angles)

		assert.strictEqual(result[0], 1)
		assert.strictEqual(result[1], 1)
		assert.ok(Math.abs(result[2] - Math.sqrt(3) / 2) < 1e-15)
		assert.ok(Math.abs(result[3] - Math.SQRT1_2) < 1e-15)
		assert.ok(Math.abs(result[4] - 0.5) < 1e-15)
		assert.ok(Math.abs(result[5]) < 1e-15)
		assert.strictEqual(result[9], -1)
		assert.strictEqual(result[11], 1)

		for (let i = 0; i < angles.length; i += 1) {
			assert.strictEqual(result[i], Math.cos(angles[i]))
		}
	})

	it('handles negative, tiny, and large angles', () => {
		const angles = new Float64Array([
			-Math.PI / 6,
			-Math.PI / 4,
			-Math.PI / 2,
			-Math.PI,
			-2 * Math.PI,
			-12.345,
			1e-15,
			-1e-15,
			Number.MIN_VALUE,
			1e6,
			-1e6,
		])

		const result = cosTypedMemo(angles)

		for (let i = 0; i < angles.length; i += 1) {
			assert.strictEqual(result[i], Math.cos(angles[i]))
		}
	})

	it('returns NaN for NaN, Infinity, and -Infinity without breaking subsequent calls', () => {
		const input = new Float64Array([
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			0,
			Math.PI,
		])

		const result = cosTypedMemo(input)

		assert.ok(Number.isNaN(result[0]))
		assert.ok(Number.isNaN(result[1]))
		assert.ok(Number.isNaN(result[2]))
		assert.strictEqual(result[3], 1)
		assert.strictEqual(result[4], -1)
	})

	it('memoizes repeated values across elements and calls without output aliasing', () => {
		const repeated = new Float64Array([0.73, -0.73, 0.73, 1.91, -1.91, 0.73])
		const first = cosTypedMemo(repeated)
		const second = cosTypedMemo(repeated)

		assert.notStrictEqual(first, second)
		assert.deepStrictEqual(first, second)
		assert.strictEqual(first[0], first[1])
		assert.strictEqual(first[0], first[2])
		assert.strictEqual(first[3], first[4])

		// Mutating a returned array must not corrupt cached values.
		first[0] = 999
		const third = cosTypedMemo(repeated)
		assert.strictEqual(third[0], Math.cos(0.73))
	})

	it('handles memoization cache eviction cleanly above cache capacity', () => {
		const size = 5000
		const largeInput = new Float64Array(size)
		for (let i = 0; i < size; i += 1) {
			largeInput[i] = i * 0.00137 + 0.0001
		}

		const firstPass = cosTypedMemo(largeInput)
		const secondPass = cosTypedMemo(largeInput)

		for (let i = 0; i < size; i += 1) {
			const expected = Math.cos(largeInput[i])
			assert.strictEqual(firstPass[i], expected)
			assert.strictEqual(secondPass[i], expected)
		}
	})

	it('cross-checks against Math.cos, even symmetry, periodicity, and Pythagorean identity', () => {
		const sample = new Float64Array(201)
		const negated = new Float64Array(201)
		const shifted2Pi = new Float64Array(201)
		const shiftedPi = new Float64Array(201)

		for (let i = 0; i < sample.length; i += 1) {
			const x = (i - 100) * 0.13
			sample[i] = x
			negated[i] = -x
			shifted2Pi[i] = x + 2 * Math.PI
			shiftedPi[i] = x + Math.PI
		}

		const cosX = cosTypedMemo(sample)
		const cosNegX = cosTypedMemo(negated)
		const cosShift2Pi = cosTypedMemo(shifted2Pi)
		const cosShiftPi = cosTypedMemo(shiftedPi)

		for (let i = 0; i < sample.length; i += 1) {
			const x = sample[i]
			// Direct cross-check against Math.cos
			assert.strictEqual(cosX[i], Math.cos(x))
			// Even-function symmetry: cos(-x) === cos(x)
			assert.strictEqual(cosNegX[i], cosX[i])
			// Periodicity: cos(x + 2*pi) === cos(x) within floating-point tolerance
			assert.ok(Math.abs(cosShift2Pi[i] - cosX[i]) < 1e-12)
			// Half-period reflection: cos(x + pi) === -cos(x)
			assert.ok(Math.abs(cosShiftPi[i] + cosX[i]) < 1e-12)
			// Pythagorean identity: cos^2(x) + sin^2(x) === 1
			const sinX = Math.sin(x)
			assert.ok(Math.abs(cosX[i] * cosX[i] + sinX * sinX - 1) < 1e-12)
		}
	})
})
