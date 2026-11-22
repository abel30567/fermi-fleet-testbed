import { describe, test } from 'node:test'
import assert from 'node:assert'
import { arccosTypedSeries } from './arccosTypedSeries.js'

const TOL = 1e-14

describe('arccosTypedSeries', () => {
	test('computes standard trigonometric values accurately and does not mutate input', () => {
		const input = new Float64Array([
			-1,
			-Math.SQRT1_2,
			-0.5,
			0,
			0.5,
			Math.SQRT1_2,
			Math.sqrt(3) / 2,
			1,
		])
		const snapshot = new Float64Array(input)
		const expected = [
			Math.PI,
			(3 * Math.PI) / 4,
			(2 * Math.PI) / 3,
			Math.PI / 2,
			Math.PI / 3,
			Math.PI / 4,
			Math.PI / 6,
			0,
		]

		const result = arccosTypedSeries(input)
		assert.ok(result instanceof Float64Array)
		assert.strictEqual(result.length, input.length)
		assert.deepStrictEqual(input, snapshot)

		for (let i = 0; i < expected.length; i++) {
			assert.ok(
				Math.abs(result[i] - expected[i]) <= TOL,
				`index ${i}: expected ${expected[i]}, got ${result[i]}`,
			)
		}
	})

	test('handles empty Float64Array', () => {
		const empty = new Float64Array(0)
		const result = arccosTypedSeries(empty)
		assert.ok(result instanceof Float64Array)
		assert.strictEqual(result.length, 0)
	})

	test('handles boundary, signed zero, and branch-transition edge cases', () => {
		const input = new Float64Array([
			0,
			-0,
			0.5,
			-0.5,
			0.5 - 1e-12,
			0.5 + 1e-12,
			-0.5 - 1e-12,
			-0.5 + 1e-12,
			1,
			-1,
			1e-15,
			-1e-15,
		])
		const result = arccosTypedSeries(input)

		assert.strictEqual(result[0], Math.PI / 2)
		assert.strictEqual(result[1], Math.PI / 2)
		assert.strictEqual(result[8], 0)
		assert.strictEqual(result[9], Math.PI)

		for (let i = 0; i < input.length; i++) {
			const ref = Math.acos(input[i])
			assert.ok(
				Math.abs(result[i] - ref) <= TOL,
				`x=${input[i]}: expected ${ref}, got ${result[i]}`,
			)
		}
	})

	test('maintains high precision very close to +1 and -1', () => {
		const nearEndpoints = new Float64Array([
			1 - 1e-15,
			1 - Number.EPSILON,
			1 - 1e-12,
			1 - 1e-8,
			1 - 1e-4,
			-1 + 1e-15,
			-1 + Number.EPSILON,
			-1 + 1e-12,
			-1 + 1e-8,
			-1 + 1e-4,
		])
		const result = arccosTypedSeries(nearEndpoints)

		for (let i = 0; i < nearEndpoints.length; i++) {
			const x = nearEndpoints[i]
			const ref = Math.acos(x)
			assert.ok(
				Math.abs(result[i] - ref) <= TOL,
				`x=${x}: expected ${ref}, got ${result[i]}`,
			)
			assert.ok(
				Math.abs(Math.cos(result[i]) - x) <= TOL,
				`cos(arccos(${x})) = ${Math.cos(result[i])} deviates from ${x}`,
			)
		}
	})

	test('returns NaN for out-of-domain values, NaN, and infinities', () => {
		const input = new Float64Array([
			1.0000000000000002,
			-1.0000000000000002,
			1.5,
			-1.5,
			100,
			-100,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
		])
		const result = arccosTypedSeries(input)

		assert.strictEqual(result.length, input.length)
		for (let i = 0; i < input.length; i++) {
			assert.ok(
				Number.isNaN(result[i]),
				`expected NaN for input[${i}]=${input[i]}, got ${result[i]}`,
			)
		}
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			null,
			undefined,
			[0, 0.5, 1],
			new Float32Array([0, 0.5]),
			new Int32Array([0, 1]),
			new Uint8Array([0, 1]),
			0.5,
			'0.5',
			{ 0: 0.5, length: 1 },
		]

		for (const bad of invalidInputs) {
			assert.throws(
				() => arccosTypedSeries(bad),
				{ name: 'TypeError' },
				`expected TypeError for ${String(bad)}`,
			)
		}
	})

	test('cross-checks against Math.acos, cos(y) == x, symmetry, and monotonicity across [-1, 1]', () => {
		const n = 2001
		const xs = new Float64Array(n)
		for (let i = 0; i < n; i++) {
			xs[i] = -1 + (2 * i) / (n - 1)
		}

		const ys = arccosTypedSeries(xs)

		for (let i = 0; i < n; i++) {
			const x = xs[i]
			const y = ys[i]
			const ref = Math.acos(x)

			assert.ok(
				Math.abs(y - ref) <= TOL,
				`Math.acos mismatch at x=${x}: got ${y}, ref ${ref}`,
			)
			assert.ok(
				Math.abs(Math.cos(y) - x) <= TOL,
				`cos(y) mismatch at x=${x}: cos(${y})=${Math.cos(y)}`,
			)

			// Symmetry: arccos(-x) + arccos(x) === pi
			const ySym = ys[n - 1 - i]
			assert.ok(
				Math.abs(y + ySym - Math.PI) <= TOL,
				`symmetry mismatch at x=${x}: ${y} + ${ySym} != pi`,
			)

			// Strict monotonicity: arccos decreases as x increases
			if (i > 0) {
				assert.ok(
					y < ys[i - 1],
					`monotonicity violated at i=${i}: y[${i}]=${y} >= y[${i - 1}]=${ys[i - 1]}`,
				)
			}
		}
	})
})
