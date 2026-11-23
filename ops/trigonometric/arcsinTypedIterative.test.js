import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { arcsinTypedIterative } from './arcsinTypedIterative.js'

function assertClose(actual, expected, eps = 1e-12, message) {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		message ?? `Expected ${actual} to be within ${eps} of ${expected}`
	)
}

describe('arcsinTypedIterative', () => {
	it('computes exact/known trigonometric values element-wise', () => {
		const input = new Float64Array([
			-1,
			-Math.sqrt(3) / 2,
			-Math.SQRT1_2,
			-0.5,
			0,
			0.5,
			Math.SQRT1_2,
			Math.sqrt(3) / 2,
			1,
		])
		const expected = [
			-Math.PI / 2,
			-Math.PI / 3,
			-Math.PI / 4,
			-Math.PI / 6,
			0,
			Math.PI / 6,
			Math.PI / 4,
			Math.PI / 3,
			Math.PI / 2,
		]

		const result = arcsinTypedIterative(input)
		assert.ok(result instanceof Float64Array)
		assert.equal(result.length, input.length)
		for (let i = 0; i < expected.length; i += 1) {
			assertClose(result[i], expected[i], 1e-15)
		}
	})

	it('does not mutate the input array and returns a new Float64Array', () => {
		const input = new Float64Array([-0.5, 0, 0.5])
		const snapshot = new Float64Array(input)
		const result = arcsinTypedIterative(input)

		assert.notEqual(result, input)
		assert.deepEqual(input, snapshot)
	})

	it('handles edge cases: empty input, signed zero, subnormals, and boundary values', () => {
		const empty = arcsinTypedIterative(new Float64Array(0))
		assert.ok(empty instanceof Float64Array)
		assert.equal(empty.length, 0)

		const special = new Float64Array([-0, 0, Number.MIN_VALUE, -Number.MIN_VALUE, 1e-12, -1e-12])
		const res = arcsinTypedIterative(special)
		assert.ok(Object.is(res[0], -0), 'preserves -0')
		assert.ok(Object.is(res[1], 0), 'preserves +0')
		assert.equal(res[2], Number.MIN_VALUE)
		assert.equal(res[3], -Number.MIN_VALUE)
		assertClose(res[4], 1e-12, 1e-24)
		assertClose(res[5], -1e-12, 1e-24)
	})

	it('returns NaN for out-of-domain values, infinities, and NaN', () => {
		const input = new Float64Array([-2, -1.000001, 1.000001, 2, Infinity, -Infinity, NaN])
		const result = arcsinTypedIterative(input)

		assert.equal(result.length, input.length)
		for (let i = 0; i < result.length; i += 1) {
			assert.ok(Number.isNaN(result[i]), `Expected NaN at index ${i}, got ${result[i]}`)
		}
	})

	it('handles Float64Array views with non-zero byteOffset', () => {
		const full = new Float64Array([99, -1, 0, 0.5, 1, -99])
		const view = full.subarray(1, 5)
		const result = arcsinTypedIterative(view)

		assert.equal(result.length, 4)
		assertClose(result[0], -Math.PI / 2, 1e-15)
		assert.equal(result[1], 0)
		assertClose(result[2], Math.PI / 6, 1e-15)
		assertClose(result[3], Math.PI / 2, 1e-15)
	})

	it('validates that input is a Float64Array', () => {
		const invalidInputs = [
			null,
			undefined,
			[0, 0.5],
			new Float32Array([0, 0.5]),
			new Int32Array([0, 1]),
			0.5,
			'0.5',
			{ length: 1, 0: 0.5 },
		]

		for (const bad of invalidInputs) {
			assert.throws(() => arcsinTypedIterative(bad), TypeError)
		}
	})

	it('cross-checks against sin inverse, atan2 identity, and odd symmetry', () => {
		const n = 201
		const input = new Float64Array(n)
		const negated = new Float64Array(n)
		for (let i = 0; i < n; i += 1) {
			const x = -1 + (2 * i) / (n - 1)
			input[i] = x
			negated[i] = -x
		}

		const result = arcsinTypedIterative(input)
		const negResult = arcsinTypedIterative(negated)

		for (let i = 0; i < n; i += 1) {
			const x = input[i]
			const y = result[i]

			// Range check: arcsin(x) ∈ [-π/2, π/2]
			assert.ok(y >= -Math.PI / 2 && y <= Math.PI / 2)

			// Independent cross-check 1: sin(arcsin(x)) === x
			assertClose(Math.sin(y), x, 1e-14)

			// Independent cross-check 2: arcsin(x) === atan2(x, sqrt(1 - x^2))
			const viaAtan2 = Math.atan2(x, Math.sqrt(Math.max(0, 1 - x * x)))
			assertClose(y, viaAtan2, 1e-14)

			// Independent cross-check 3: odd symmetry arcsin(-x) === -arcsin(x)
			assertClose(negResult[i], -y, 1e-15)
		}
	})

	it('cross-checks against Maclaurin power series for |x| <= 0.5', () => {
		// arcsin(x) = sum_{k=0..inf} ((2k)! / (4^k (k!)^2 (2k+1))) * x^(2k+1)
		function arcsinSeries(x, terms = 30) {
			let sum = x
			let term = x
			const x2 = x * x
			for (let k = 1; k < terms; k += 1) {
				term *= ((2 * k - 1) * (2 * k - 1) * x2) / (2 * k * (2 * k + 1))
				sum += term
			}
			return sum
		}

		const input = new Float64Array([-0.5, -0.37, -0.2, -0.05, 0.05, 0.2, 0.37, 0.5])
		const result = arcsinTypedIterative(input)

		for (let i = 0; i < input.length; i += 1) {
			assertClose(result[i], arcsinSeries(input[i]), 1e-14)
		}
	})
})
