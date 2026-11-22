import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { arcsinFloatSeries } from './arcsinFloatSeries.js'

const EPS = 1e-15

function assertClose(actual, expected, tol = EPS, label = '') {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`${label ? label + ': ' : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`
	)
}

describe('arcsinFloatSeries', () => {
	describe('exact and special values', () => {
		it('preserves signed zero (+0 and -0)', () => {
			assert.ok(Object.is(arcsinFloatSeries(0), 0))
			assert.ok(Object.is(arcsinFloatSeries(-0), -0))
		})

		it('returns exact ±π/2 at endpoints ±1', () => {
			assert.equal(arcsinFloatSeries(1), Math.PI / 2)
			assert.equal(arcsinFloatSeries(-1), -Math.PI / 2)
		})

		it('matches known analytic values', () => {
			const cases = [
				[0.5, Math.PI / 6],
				[-0.5, -Math.PI / 6],
				[Math.SQRT1_2, Math.PI / 4],
				[-Math.SQRT1_2, -Math.PI / 4],
				[Math.sqrt(3) / 2, Math.PI / 3],
				[-Math.sqrt(3) / 2, -Math.PI / 3],
			]
			for (const [x, expected] of cases) {
				assertClose(arcsinFloatSeries(x), expected, 1e-15, `x=${x}`)
			}
		})
	})

	describe('boundary and extreme magnitude behavior', () => {
		it('is continuous across the |x| = 0.5 regime boundary', () => {
			const deltas = [1e-15, 1e-12, 1e-9, 1e-6, 1e-3]
			for (const d of deltas) {
				for (const s of [1, -1]) {
					const below = s * (0.5 - d)
					const above = s * (0.5 + d)
					assertClose(arcsinFloatSeries(below), Math.asin(below), 1e-15, `below ${below}`)
					assertClose(arcsinFloatSeries(above), Math.asin(above), 1e-15, `above ${above}`)
				}
			}
		})

		it('handles tiny and subnormal values accurately (arcsin(x) ≈ x)', () => {
			const tinies = [
				1e-7,
				1e-10,
				1e-15,
				1e-50,
				1e-150,
				Number.MIN_VALUE,
				-1e-7,
				-1e-15,
				-Number.MIN_VALUE,
			]
			for (const x of tinies) {
				const actual = arcsinFloatSeries(x)
				const expected = Math.asin(x)
				assertClose(actual, expected, Math.max(Math.abs(expected) * 1e-15, 1e-320), `tiny x=${x}`)
				assert.equal(Math.sign(actual), Math.sign(x))
			}
		})

		it('handles values very close to ±1 without catastrophic cancellation', () => {
			const offsets = [1e-2, 1e-4, 1e-6, 1e-9, 1e-12, 1e-14, 1e-15, Number.EPSILON, Number.EPSILON / 2]
			for (const eps of offsets) {
				for (const s of [1, -1]) {
					const x = s * (1 - eps)
					const actual = arcsinFloatSeries(x)
					const expected = Math.asin(x)
					assertClose(actual, expected, 1e-15, `near ±1 x=${x}`)
					assertClose(Math.sin(actual), x, 1e-15, `sin(arcsin(${x}))`)
				}
			}
		})
	})

	describe('cross-checks against Math.asin and sin(arcsin(x)) ≈ x', () => {
		it('matches Math.asin and round-trips through Math.sin across dense grid in [-1, 1]', () => {
			const steps = 2000
			for (let i = 0; i <= steps; i++) {
				const x = -1 + (2 * i) / steps
				const actual = arcsinFloatSeries(x)
				const expected = Math.asin(x)
				assertClose(actual, expected, 1e-15, `grid x=${x}`)
				assertClose(Math.sin(actual), x, 1e-15, `roundtrip x=${x}`)
			}
		})

		it('satisfies odd symmetry arcsin(-x) === -arcsin(x)', () => {
			const points = [0.001, 0.123456789, 0.4999999, 0.5, 0.5000001, 0.75, 0.999999, 1]
			for (const x of points) {
				assert.equal(arcsinFloatSeries(-x), -arcsinFloatSeries(x))
			}
		})

		it('is strictly monotonically increasing on [-1, 1]', () => {
			const steps = 1000
			let prev = arcsinFloatSeries(-1)
			for (let i = 1; i <= steps; i++) {
				const x = -1 + (2 * i) / steps
				const curr = arcsinFloatSeries(x)
				assert.ok(curr > prev, `expected monotonic increase at x=${x}: ${curr} > ${prev}`)
				prev = curr
			}
		})
	})

	describe('input validation', () => {
		it('throws RangeError for out-of-domain |x| > 1', () => {
			const outOfDomain = [
				1.0000000000000002,
				-1.0000000000000002,
				1 + Number.EPSILON,
				-1 - Number.EPSILON,
				1.5,
				-1.5,
				2,
				-100,
				Number.MAX_VALUE,
				-Number.MAX_VALUE,
			]
			for (const x of outOfDomain) {
				assert.throws(() => arcsinFloatSeries(x), RangeError, `expected RangeError for x=${x}`)
			}
		})

		it('throws RangeError for non-finite numbers (NaN, ±Infinity)', () => {
			for (const x of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
				assert.throws(() => arcsinFloatSeries(x), RangeError, `expected RangeError for x=${x}`)
			}
		})

		it('throws TypeError for non-number inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				'0.5',
				'0',
				true,
				false,
				{},
				[],
				[0.5],
				0n,
				Symbol('x'),
				() => 0,
			]
			for (const input of invalidInputs) {
				assert.throws(() => arcsinFloatSeries(input), TypeError)
			}
		})
	})
})
