import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { magnitudeBigIntIterative } from './magnitudeBigIntIterative.js'

const SCALE = 10n ** 18n
const SCALE_SQ = SCALE * SCALE

describe('magnitudeBigIntIterative', () => {
	it('computes exact integer magnitudes scaled by 10^18 for Pythagorean vectors', () => {
		assert.equal(magnitudeBigIntIterative([3n, 4n]), 5n * SCALE)
		assert.equal(magnitudeBigIntIterative([5n, 12n]), 13n * SCALE)
		assert.equal(magnitudeBigIntIterative([8n, 15n]), 17n * SCALE)
		assert.equal(magnitudeBigIntIterative([1n, 2n, 2n]), 3n * SCALE)
		assert.equal(magnitudeBigIntIterative([2n, 3n, 6n]), 7n * SCALE)
		assert.equal(magnitudeBigIntIterative([1n, 1n, 1n, 1n]), 2n * SCALE)
	})

	it('computes fixed-point scaled magnitudes for non-integer norms', () => {
		assert.equal(
			magnitudeBigIntIterative([1n, 1n]),
			1_414_213_562_373_095_048n,
		)
		assert.equal(
			magnitudeBigIntIterative([1n, 1n, 1n]),
			1_732_050_807_568_877_293n,
		)
		assert.equal(
			magnitudeBigIntIterative([1n, 2n]),
			2_236_067_977_499_789_696n,
		)
	})

	it('handles negative components and 1D vectors', () => {
		assert.equal(magnitudeBigIntIterative([-3n, -4n]), 5n * SCALE)
		assert.equal(magnitudeBigIntIterative([-3n, 4n]), 5n * SCALE)
		assert.equal(magnitudeBigIntIterative([3n, -4n]), 5n * SCALE)
		assert.equal(magnitudeBigIntIterative([7n]), 7n * SCALE)
		assert.equal(magnitudeBigIntIterative([-42n]), 42n * SCALE)
	})

	it('handles edge cases: empty vector, zero vectors, and high dimensions', () => {
		assert.equal(magnitudeBigIntIterative([]), 0n)
		assert.equal(magnitudeBigIntIterative([0n]), 0n)
		assert.equal(magnitudeBigIntIterative([0n, 0n, 0n]), 0n)

		const unit100 = Array.from({ length: 100 }, () => 1n)
		assert.equal(magnitudeBigIntIterative(unit100), 10n * SCALE)
	})

	it('maintains exact precision for arbitrarily large BigInt components', () => {
		const big = 10n ** 50n
		assert.equal(
			magnitudeBigIntIterative([3n * big, 4n * big]),
			5n * big * SCALE,
		)
		assert.equal(
			magnitudeBigIntIterative([-big, 0n, 0n]),
			big * SCALE,
		)
	})

	it('rejects invalid inputs with TypeError', () => {
		assert.throws(() => magnitudeBigIntIterative(null), TypeError)
		assert.throws(() => magnitudeBigIntIterative(undefined), TypeError)
		assert.throws(() => magnitudeBigIntIterative(123), TypeError)
		assert.throws(() => magnitudeBigIntIterative('3,4'), TypeError)
		assert.throws(() => magnitudeBigIntIterative({ 0: 3n, 1: 4n, length: 2 }), TypeError)
		assert.throws(() => magnitudeBigIntIterative(new BigInt64Array([3n, 4n])), TypeError)

		assert.throws(() => magnitudeBigIntIterative([3, 4]), TypeError)
		assert.throws(() => magnitudeBigIntIterative([3n, 4]), TypeError)
		assert.throws(() => magnitudeBigIntIterative([3n, '4']), TypeError)
		assert.throws(() => magnitudeBigIntIterative([3n, null]), TypeError)
		assert.throws(() => magnitudeBigIntIterative([3n, undefined]), TypeError)
		assert.throws(() => magnitudeBigIntIterative(new Array(2)), TypeError)
	})

	it('satisfies exact square-root bracket invariant as an independent check', () => {
		const vectors = [
			[1n],
			[1n, 1n],
			[2n, 5n, 11n],
			[-7n, 13n, -19n, 23n],
			[999_999_999_999_999_999n, 1n],
			[10n ** 30n + 7n, -(10n ** 30n) - 13n, 12345678901234567890123456789n],
			[2n ** 128n - 1n, 2n ** 127n + 5n],
		]

		for (const v of vectors) {
			const result = magnitudeBigIntIterative(v)
			const sumSq = v.reduce((acc, x) => acc + x * x, 0n)
			const target = sumSq * SCALE_SQ

			assert.ok(result >= 0n)
			assert.ok(result * result <= target, 'result^2 must be <= sumSq * 10^36')
			assert.ok(
				(result + 1n) * (result + 1n) > target,
				'(result + 1)^2 must be > sumSq * 10^36',
			)
		}
	})

	it('cross-checks against Math.hypot for safe-integer vectors', () => {
		const vectors = [
			[1n, 2n, 3n],
			[-10n, 25n, -30n, 40n],
			[123456n, 789012n],
			[1000000n, 1n, 1n, 1n],
		]

		for (const v of vectors) {
			const actual = Number(magnitudeBigIntIterative(v)) / 1e18
			const expected = Math.hypot(...v.map(Number))
			const relError = Math.abs(actual - expected) / expected
			assert.ok(
				relError < 1e-14,
				`Expected relative error < 1e-14 for ${v}, got ${relError}`,
			)
		}
	})

	it('satisfies the triangle inequality across vector pairs', () => {
		const pairs = [
			[[3n, 4n], [5n, 12n]],
			[[1n, 2n, 3n], [-4n, 5n, -6n]],
			[[10n ** 25n, 2n * 10n ** 25n], [-(10n ** 25n), 3n * 10n ** 25n]],
		]

		for (const [u, v] of pairs) {
			const sum = u.map((x, i) => x + v[i])
			const magSum = magnitudeBigIntIterative(sum)
			const magU = magnitudeBigIntIterative(u)
			const magV = magnitudeBigIntIterative(v)
			// Floor truncation on magU and magV can reduce magU + magV by at most 2 ULPs
			assert.ok(magSum <= magU + magV + 2n)
		}
	})
})
