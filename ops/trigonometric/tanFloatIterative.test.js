import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { tanFloatIterative } from './tanFloatIterative.js'

/**
 * Helper to assert two numbers are within an absolute or relative tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [relTol=1e-12]
 * @param {number} [absTol=1e-14]
 * @param {string} [label='']
 */
function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-14, label = '') {
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.abs(expected))
	assert.ok(
		diff <= limit,
		`${label ? `${label}: ` : ''}expected ${actual} to be close to ${expected} (diff=${diff}, limit=${limit})`,
	)
}

describe('tanFloatIterative', () => {
	describe('exact and standard angles', () => {
		test('computes standard reference angles accurately', () => {
			assert.equal(tanFloatIterative(0), 0)
			assertClose(tanFloatIterative(Math.PI / 6), 1 / Math.sqrt(3), 1e-14, 1e-15, 'pi/6')
			assertClose(tanFloatIterative(Math.PI / 4), 1, 1e-14, 1e-15, 'pi/4')
			assertClose(tanFloatIterative(Math.PI / 3), Math.sqrt(3), 1e-14, 1e-15, 'pi/3')
			assertClose(tanFloatIterative(-Math.PI / 6), -1 / Math.sqrt(3), 1e-14, 1e-15, '-pi/6')
			assertClose(tanFloatIterative(-Math.PI / 4), -1, 1e-14, 1e-15, '-pi/4')
			assertClose(tanFloatIterative(-Math.PI / 3), -Math.sqrt(3), 1e-14, 1e-15, '-pi/3')
			assertClose(tanFloatIterative(Math.PI), Math.tan(Math.PI), 1e-12, 1e-15, 'pi')
			assertClose(tanFloatIterative(-Math.PI), Math.tan(-Math.PI), 1e-12, 1e-15, '-pi')
			assertClose(tanFloatIterative(2 * Math.PI), Math.tan(2 * Math.PI), 1e-12, 1e-15, '2*pi')
		})

		test('satisfies odd-function symmetry tan(-x) === -tan(x)', () => {
			const samples = [0.1, 0.5, 1.0, 1.5, 2.3, 4.7, 10.5, 100.25]
			for (const x of samples) {
				assertClose(tanFloatIterative(-x), -tanFloatIterative(x), 1e-14, 1e-15, `symmetry(${x})`)
			}
		})

		test('satisfies pi-periodicity tan(x + k*pi) ≈ tan(x)', () => {
			const x = 0.6
			const base = tanFloatIterative(x)
			for (const k of [-10, -3, -1, 1, 2, 7, 50]) {
				assertClose(tanFloatIterative(x + k * Math.PI), base, 1e-12, 1e-13, `period(k=${k})`)
			}
		})
	})

	describe('large angles and near asymptotes', () => {
		test('handles large positive and negative angles', () => {
			const largeAngles = [50, -50, 100, -100, 1000, -1000, 1e4, -1e4, 1e6, -1e6]
			for (const x of largeAngles) {
				assertClose(tanFloatIterative(x), Math.tan(x), 1e-10, 1e-12, `large(${x})`)
			}
		})

		test('handles angles near odd-pi/2 asymptotes accurately', () => {
			const nearAsymptotes = [
				Math.PI / 2 - 1e-4,
				Math.PI / 2 + 1e-4,
				Math.PI / 2 - 1e-7,
				Math.PI / 2 + 1e-7,
				Math.PI / 2,
				-Math.PI / 2,
				-Math.PI / 2 + 1e-6,
				-Math.PI / 2 - 1e-6,
				(3 * Math.PI) / 2 - 1e-5,
				(3 * Math.PI) / 2 + 1e-5,
				(-5 * Math.PI) / 2 + 1e-5,
			]

			for (const x of nearAsymptotes) {
				const actual = tanFloatIterative(x)
				const expected = Math.tan(x)
				assert.equal(Math.sign(actual), Math.sign(expected), `sign mismatch at x=${x}`)
				assertClose(actual, expected, 1e-11, 1e-12, `asymptote(${x})`)
			}
		})
	})

	describe('edge cases and input validation', () => {
		test('preserves signed zero (+0 and -0)', () => {
			assert.ok(Object.is(tanFloatIterative(0), 0))
			assert.ok(Object.is(tanFloatIterative(-0), -0))
		})

		test('handles very small and subnormal values where tan(x) ≈ x', () => {
			const tinyValues = [1e-12, -1e-12, 1e-100, -1e-100, Number.MIN_VALUE, -Number.MIN_VALUE]
			for (const x of tinyValues) {
				assert.equal(tanFloatIterative(x), x, `tiny(${x})`)
			}
		})

		test('returns NaN for NaN, Infinity, and -Infinity', () => {
			assert.ok(Number.isNaN(tanFloatIterative(Number.NaN)))
			assert.ok(Number.isNaN(tanFloatIterative(Number.POSITIVE_INFINITY)))
			assert.ok(Number.isNaN(tanFloatIterative(Number.NEGATIVE_INFINITY)))
		})

		test('throws TypeError for non-number inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				'0',
				'1.5',
				true,
				false,
				{},
				[],
				[1],
				1n,
				Symbol('angle'),
				() => 0,
			]

			for (const invalid of invalidInputs) {
				assert.throws(() => tanFloatIterative(invalid), { name: 'TypeError' })
			}
		})
	})

	describe('cross-checks against Math.tan and Math.sin / Math.cos', () => {
		test('matches Math.tan and Math.sin(x) / Math.cos(x) across a sweep of angles', () => {
			for (let i = -200; i <= 200; i++) {
				// Use irrational-step grid to sample densely across quadrants and near poles
				const x = i * 0.037
				const actual = tanFloatIterative(x)
				const refTan = Math.tan(x)
				const refRatio = Math.sin(x) / Math.cos(x)

				assertClose(actual, refTan, 1e-13, 1e-14, `Math.tan(${x})`)
				assertClose(actual, refRatio, 1e-13, 1e-14, `sin/cos(${x})`)
			}
		})
	})
})
