import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { arctanFloatIterative } from './arctanFloatIterative.js'

function assertClose(actual, expected, tol = 1e-14, message = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${message ? `${message}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`
	)
}

describe('arctanFloatIterative', () => {
	describe('exact and standard trigonometric values', () => {
		it('handles 0 and -0 preserving sign', () => {
			const posZero = arctanFloatIterative(0)
			const negZero = arctanFloatIterative(-0)
			assert.ok(Object.is(posZero, 0))
			assert.ok(Object.is(negZero, -0))
		})

		it('computes known angles for ±1, ±sqrt(3), ±1/sqrt(3)', () => {
			assertClose(arctanFloatIterative(1), Math.PI / 4, 1e-15, 'atan(1)')
			assertClose(arctanFloatIterative(-1), -Math.PI / 4, 1e-15, 'atan(-1)')
			assertClose(arctanFloatIterative(Math.sqrt(3)), Math.PI / 3, 1e-15, 'atan(sqrt(3))')
			assertClose(arctanFloatIterative(-Math.sqrt(3)), -Math.PI / 3, 1e-15, 'atan(-sqrt(3))')
			assertClose(arctanFloatIterative(1 / Math.sqrt(3)), Math.PI / 6, 1e-15, 'atan(1/sqrt(3))')
			assertClose(arctanFloatIterative(-1 / Math.sqrt(3)), -Math.PI / 6, 1e-15, 'atan(-1/sqrt(3))')
		})

		it('handles small and large magnitudes accurately', () => {
			const samples = [
				1e-15,
				-1e-15,
				1e-8,
				-1e-8,
				1e-4,
				-1e-4,
				0.05,
				-0.05,
				0.5,
				-0.5,
				0.999999,
				-0.999999,
				1.000001,
				-1.000001,
				10,
				-10,
				1e4,
				-1e4,
				1e12,
				-1e12,
				1e100,
				-1e100,
				Number.MAX_VALUE,
				-Number.MAX_VALUE,
				Number.MIN_VALUE,
				-Number.MIN_VALUE,
			]

			for (const x of samples) {
				assertClose(arctanFloatIterative(x), Math.atan(x), 1e-14, `atan(${x})`)
			}
		})
	})

	describe('cross-checks and mathematical identities', () => {
		it('matches Math.atan across a broad sweep of inputs', () => {
			for (let i = -200; i <= 200; i++) {
				const x = i * 0.137
				assertClose(arctanFloatIterative(x), Math.atan(x), 1e-14, `atan(${x})`)
			}
		})

		it('satisfies Math.tan(arctanFloatIterative(x)) ≈ x', () => {
			const inputs = [-100, -10, -2.5, -1, -0.5, -0.01, 0, 0.01, 0.5, 1, 2.5, 10, 100]
			for (const x of inputs) {
				const reconstructed = Math.tan(arctanFloatIterative(x))
				const tol = Math.max(1e-12, Math.abs(x) * 1e-12)
				assertClose(reconstructed, x, tol, `tan(atan(${x}))`)
			}
		})

		it('is an odd function: arctan(-x) === -arctan(x)', () => {
			const inputs = [1e-10, 0.01, 0.5, 1, 2, 42, 1e8]
			for (const x of inputs) {
				assert.equal(arctanFloatIterative(-x), -arctanFloatIterative(x))
			}
		})

		it('satisfies reciprocal identity arctan(x) + arctan(1/x) ≈ pi/2 for x > 0', () => {
			const inputs = [0.01, 0.25, 0.7, 1, 2.5, 100]
			for (const x of inputs) {
				assertClose(
					arctanFloatIterative(x) + arctanFloatIterative(1 / x),
					Math.PI / 2,
					1e-14,
					`atan(${x}) + atan(1/${x})`
				)
			}
		})
	})

	describe('edge cases and input validation', () => {
		it('handles ±Infinity and NaN', () => {
			assert.equal(arctanFloatIterative(Number.POSITIVE_INFINITY), Math.PI / 2)
			assert.equal(arctanFloatIterative(Number.NEGATIVE_INFINITY), -Math.PI / 2)
			assert.ok(Number.isNaN(arctanFloatIterative(Number.NaN)))
		})

		it('throws TypeError on non-number inputs', () => {
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
				Symbol('x'),
				() => 1,
			]

			for (const bad of invalidInputs) {
				assert.throws(() => arctanFloatIterative(bad), TypeError)
			}
		})
	})
})
