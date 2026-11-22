import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { arccosFloatIterative } from './arccosFloatIterative.js'

const TOLERANCE = 1e-14

function assertClose(actual, expected, tol = TOLERANCE, message) {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		message ?? `Expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`,
	)
}

describe('arccosFloatIterative', () => {
	describe('exact and special values', () => {
		it('handles -1, -0.5, 0, -0, 0.5, and 1', () => {
			assert.equal(arccosFloatIterative(1), 0)
			assert.equal(arccosFloatIterative(-1), Math.PI)
			assert.equal(arccosFloatIterative(0), Math.PI / 2)
			assert.equal(arccosFloatIterative(-0), Math.PI / 2)
			assertClose(arccosFloatIterative(0.5), Math.PI / 3)
			assertClose(arccosFloatIterative(-0.5), (2 * Math.PI) / 3)
		})

		it('handles standard trigonometric ratios', () => {
			assertClose(arccosFloatIterative(Math.SQRT1_2), Math.PI / 4)
			assertClose(arccosFloatIterative(-Math.SQRT1_2), (3 * Math.PI) / 4)
			assertClose(arccosFloatIterative(Math.sqrt(3) / 2), Math.PI / 6)
			assertClose(arccosFloatIterative(-Math.sqrt(3) / 2), (5 * Math.PI) / 6)
		})
	})

	describe('values near domain boundaries (±1) and branch transitions (±0.5)', () => {
		it('maintains high precision near +1 and -1', () => {
			const nearOnes = [
				1 - 1e-15,
				1 - 1e-12,
				1 - 1e-8,
				1 - 1e-4,
				0.999,
				-0.999,
				-1 + 1e-4,
				-1 + 1e-8,
				-1 + 1e-12,
				-1 + 1e-15,
				1 - Number.EPSILON / 2,
				-1 + Number.EPSILON / 2,
			]

			for (const x of nearOnes) {
				const actual = arccosFloatIterative(x)
				const expected = Math.acos(x)
				assertClose(actual, expected, 1e-14, `Failed near boundary for x=${x}`)
				assert.ok(actual >= 0 && actual <= Math.PI, `Out of [0, pi] for x=${x}: ${actual}`)
			}
		})

		it('is continuous across the ±0.5 half-angle reduction thresholds', () => {
			const transitionPoints = [
				-0.5 - 1e-12,
				-0.5 - 1e-6,
				-0.5,
				-0.5 + 1e-6,
				-0.5 + 1e-12,
				0.5 - 1e-12,
				0.5 - 1e-6,
				0.5,
				0.5 + 1e-6,
				0.5 + 1e-12,
			]

			for (const x of transitionPoints) {
				assertClose(arccosFloatIterative(x), Math.acos(x), 1e-14, `Mismatch at x=${x}`)
			}
		})
	})

	describe('cross-checks against Math.acos and Math.cos identity', () => {
		it('matches Math.acos and satisfies cos(arccos(x)) ≈ x across [-1, 1]', () => {
			const steps = 200
			for (let i = 0; i <= steps; i++) {
				const x = -1 + (2 * i) / steps
				const angle = arccosFloatIterative(x)
				const ref = Math.acos(x)

				assertClose(angle, ref, 1e-14, `Math.acos mismatch at x=${x}`)
				assertClose(Math.cos(angle), x, 1e-14, `cos(arccos(x)) mismatch at x=${x}`)
				assert.ok(angle >= 0 && angle <= Math.PI, `Output out of range for x=${x}`)
			}
		})

		it('satisfies symmetry arccos(x) + arccos(-x) === pi', () => {
			const samples = [0.001, 0.123456, 0.4999, 0.5, 0.5001, 0.85, 0.999999]
			for (const x of samples) {
				assertClose(arccosFloatIterative(x) + arccosFloatIterative(-x), Math.PI, 1e-14)
			}
		})
	})

	describe('edge cases and input validation', () => {
		it('returns NaN for NaN input', () => {
			assert.ok(Number.isNaN(arccosFloatIterative(NaN)))
		})

		it('throws RangeError for out-of-domain values |x| > 1 and ±Infinity', () => {
			const outOfDomain = [
				1.000000000000001,
				-1.000000000000001,
				1.5,
				-1.5,
				2,
				-2,
				1e100,
				-1e100,
				Infinity,
				-Infinity,
			]

			for (const val of outOfDomain) {
				assert.throws(() => arccosFloatIterative(val), RangeError, `Expected RangeError for ${val}`)
			}
		})

		it('throws TypeError for non-number inputs', () => {
			const invalidInputs = [
				'0.5',
				'0',
				'',
				null,
				undefined,
				true,
				false,
				{},
				[],
				[0],
				Symbol('x'),
				0n,
				() => 0,
			]

			for (const val of invalidInputs) {
				assert.throws(() => arccosFloatIterative(val), TypeError)
			}
		})
	})
})
