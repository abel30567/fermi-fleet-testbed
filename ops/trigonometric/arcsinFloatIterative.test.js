import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { arcsinFloatIterative } from './arcsinFloatIterative.js'

const TOLERANCE = 1e-14

function assertClose(actual, expected, tolerance = TOLERANCE, message) {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tolerance,
		message ?? `Expected ${actual} to be within ${tolerance} of ${expected} (diff=${diff})`
	)
}

describe('arcsinFloatIterative', () => {
	describe('normal cases', () => {
		it('computes exact/known trigonometric values', () => {
			assert.equal(arcsinFloatIterative(0), 0)
			assertClose(arcsinFloatIterative(0.5), Math.PI / 6)
			assertClose(arcsinFloatIterative(-0.5), -Math.PI / 6)
			assertClose(arcsinFloatIterative(Math.SQRT1_2), Math.PI / 4)
			assertClose(arcsinFloatIterative(-Math.SQRT1_2), -Math.PI / 4)
			assertClose(arcsinFloatIterative(Math.sqrt(3) / 2), Math.PI / 3)
			assertClose(arcsinFloatIterative(-Math.sqrt(3) / 2), -Math.PI / 3)
			assertClose(arcsinFloatIterative(1), Math.PI / 2)
			assertClose(arcsinFloatIterative(-1), -Math.PI / 2)
		})

		it('handles values near ±1 accurately via range reduction', () => {
			const nearOneValues = [
				0.9,
				0.99,
				0.9999,
				0.999999,
				1 - 1e-10,
				1 - 1e-14,
				1 - Number.EPSILON,
				-0.9,
				-0.99,
				-0.9999,
				-0.999999,
				-(1 - 1e-10),
				-(1 - 1e-14),
				-(1 - Number.EPSILON)
			]

			for (const x of nearOneValues) {
				const actual = arcsinFloatIterative(x)
				const expected = Math.asin(x)
				assertClose(actual, expected, 1e-14, `Failed near ±1 for x=${x}`)
			}
		})

		it('handles continuity across the |x| = 0.5 range-reduction boundary', () => {
			const boundaryValues = [
				0.5 - Number.EPSILON,
				0.5,
				0.5 + Number.EPSILON,
				-(0.5 - Number.EPSILON),
				-0.5,
				-(0.5 + Number.EPSILON)
			]

			for (const x of boundaryValues) {
				assertClose(arcsinFloatIterative(x), Math.asin(x), 1e-15, `Boundary mismatch at x=${x}`)
			}
		})

		it('satisfies odd symmetry arcsin(-x) === -arcsin(x)', () => {
			const samples = [0.001, 0.123456, 0.5, 0.75, 0.99999, 1]
			for (const x of samples) {
				assert.equal(arcsinFloatIterative(-x), -arcsinFloatIterative(x))
			}
		})
	})

	describe('edge cases', () => {
		it('preserves signed zero (+0 and -0)', () => {
			assert.ok(Object.is(arcsinFloatIterative(0), 0))
			assert.ok(Object.is(arcsinFloatIterative(-0), -0))
		})

		it('handles very small and subnormal numbers without underflow errors', () => {
			const tinyValues = [1e-12, -1e-12, 1e-100, -1e-100, Number.MIN_VALUE, -Number.MIN_VALUE]
			for (const x of tinyValues) {
				assert.equal(arcsinFloatIterative(x), Math.asin(x))
			}
		})

		it('returns NaN for NaN input', () => {
			assert.ok(Number.isNaN(arcsinFloatIterative(NaN)))
		})

		it('throws RangeError for out-of-domain values |x| > 1 and ±Infinity', () => {
			const outOfDomain = [
				1.0000000000000002,
				-1.0000000000000002,
				1.5,
				-1.5,
				2,
				-2,
				1e308,
				-1e308,
				Infinity,
				-Infinity
			]

			for (const x of outOfDomain) {
				assert.throws(
					() => arcsinFloatIterative(x),
					{ name: 'RangeError' },
					`Expected RangeError for x=${x}`
				)
			}
		})

		it('throws TypeError for non-number inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				'0.5',
				'0',
				'',
				true,
				false,
				0n,
				1n,
				{},
				[],
				[0.5],
				Symbol('x'),
				() => 0,
				new Number(0.5)
			]

			for (const input of invalidInputs) {
				assert.throws(
					() => arcsinFloatIterative(input),
					{ name: 'TypeError' },
					`Expected TypeError for input of type ${typeof input}`
				)
			}
		})
	})

	describe('cross-checks', () => {
		it('matches Math.asin and satisfies Math.sin(arcsin(x)) ≈ x across [-1, 1]', () => {
			const steps = 200
			for (let i = 0; i <= steps; i++) {
				const x = -1 + (2 * i) / steps
				const actual = arcsinFloatIterative(x)
				const expected = Math.asin(x)

				assert.ok(
					actual >= -Math.PI / 2 && actual <= Math.PI / 2,
					`Result ${actual} out of [-pi/2, pi/2] for x=${x}`
				)
				assertClose(actual, expected, 1e-14, `Math.asin mismatch at x=${x}`)
				assertClose(Math.sin(actual), x, 1e-14, `sin(arcsin(x)) mismatch at x=${x}`)
			}
		})
	})
})
