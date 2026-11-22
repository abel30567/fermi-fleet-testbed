import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { nthRootBigIntIterative } from './nthRootBigIntIterative.js'

const SCALE = 10n ** 18n

/**
 * Independent invariant check verifying that `r` is the exact fixed-point
 * n-th root of `x` truncated toward zero:
 *   |r|^n <= |x| * 10^(18*n) < (|r| + 1)^n
 * and sign(r) matches sign(x).
 */
function assertExactFixedPointRoot(x, n, r) {
	if (x === 0n) {
		assert.equal(r, 0n)
		return
	}
	if (x < 0n) {
		assert.ok(r < 0n, `expected negative root for x=${x}, n=${n}, got ${r}`)
	} else {
		assert.ok(r > 0n, `expected positive root for x=${x}, n=${n}, got ${r}`)
	}

	const absX = x < 0n ? -x : x
	const absR = r < 0n ? -r : r
	const scaledTarget = absX * (SCALE ** n)

	assert.ok(
		absR ** n <= scaledTarget,
		`lower bound failed for x=${x}, n=${n}: ${absR}^${n} > ${scaledTarget}`
	)
	assert.ok(
		(absR + 1n) ** n > scaledTarget,
		`upper bound failed for x=${x}, n=${n}: (${absR}+1)^${n} <= ${scaledTarget}`
	)
}

describe('nthRootBigIntIterative', () => {
	test('exact perfect roots', () => {
		assert.equal(nthRootBigIntIterative(4n, 2n), 2n * SCALE)
		assert.equal(nthRootBigIntIterative(9n, 2n), 3n * SCALE)
		assert.equal(nthRootBigIntIterative(27n, 3n), 3n * SCALE)
		assert.equal(nthRootBigIntIterative(16n, 4n), 2n * SCALE)
		assert.equal(nthRootBigIntIterative(1024n, 10n), 2n * SCALE)
		assert.equal(nthRootBigIntIterative(10n ** 30n, 6n), 100000n * SCALE)
	})

	test('non-integer roots with 18-digit fixed-point precision', () => {
		// sqrt(2) = 1.41421356237309504880... -> floor at 18 decimals: 1414213562373095048n
		assert.equal(nthRootBigIntIterative(2n, 2n), 1414213562373095048n)
		// cbrt(2) = 1.25992104989487316476... -> floor at 18 decimals: 1259921049894873164n
		assert.equal(nthRootBigIntIterative(2n, 3n), 1259921049894873164n)
		// sqrt(3) = 1.73205080756887729352... -> floor at 18 decimals: 1732050807568877293n
		assert.equal(nthRootBigIntIterative(3n, 2n), 1732050807568877293n)
		// 5th root of 10 = 1.58489319246111348520... -> 1584893192461113485n
		assert.equal(nthRootBigIntIterative(10n, 5n), 1584893192461113485n)
	})

	test('edge cases: n=1n, x=0n, x=1n, x=-1n', () => {
		assert.equal(nthRootBigIntIterative(0n, 1n), 0n)
		assert.equal(nthRootBigIntIterative(0n, 2n), 0n)
		assert.equal(nthRootBigIntIterative(0n, 7n), 0n)

		assert.equal(nthRootBigIntIterative(1n, 1n), SCALE)
		assert.equal(nthRootBigIntIterative(1n, 2n), SCALE)
		assert.equal(nthRootBigIntIterative(1n, 50n), SCALE)

		assert.equal(nthRootBigIntIterative(42n, 1n), 42n * SCALE)
		assert.equal(nthRootBigIntIterative(-42n, 1n), -42n * SCALE)
		assert.equal(nthRootBigIntIterative(-1n, 1n), -SCALE)
		assert.equal(nthRootBigIntIterative(-1n, 3n), -SCALE)
		assert.equal(nthRootBigIntIterative(-1n, 99n), -SCALE)
	})

	test('negative x with odd n', () => {
		assert.equal(nthRootBigIntIterative(-8n, 3n), -2n * SCALE)
		assert.equal(nthRootBigIntIterative(-27n, 3n), -3n * SCALE)
		assert.equal(nthRootBigIntIterative(-32n, 5n), -2n * SCALE)
		assert.equal(nthRootBigIntIterative(-2n, 3n), -1259921049894873164n)
		assert.equal(nthRootBigIntIterative(-10n, 5n), -1584893192461113485n)
	})

	test('very large BigInt values beyond IEEE-754 double range', () => {
		const largeX = 1234567890123456789012345678901234567890n
		for (const n of [2n, 3n, 5n, 13n]) {
			const r = nthRootBigIntIterative(largeX, n)
			assertExactFixedPointRoot(largeX, n, r)
		}

		const largeNegX = -(10n ** 100n + 7n)
		for (const n of [3n, 7n, 11n]) {
			const r = nthRootBigIntIterative(largeNegX, n)
			assertExactFixedPointRoot(largeNegX, n, r)
		}

		// Exact huge perfect power: (2^200)^5 = 2^1000
		assert.equal(nthRootBigIntIterative(1n << 1000n, 5n), (1n << 200n) * SCALE)
	})

	test('negative x with even n throws RangeError', () => {
		assert.throws(() => nthRootBigIntIterative(-1n, 2n), RangeError)
		assert.throws(() => nthRootBigIntIterative(-16n, 4n), RangeError)
		assert.throws(() => nthRootBigIntIterative(-100n, 2n), RangeError)
		assert.throws(() => nthRootBigIntIterative(-(10n ** 50n), 100n), RangeError)
	})

	test('n <= 0n throws RangeError', () => {
		assert.throws(() => nthRootBigIntIterative(4n, 0n), RangeError)
		assert.throws(() => nthRootBigIntIterative(0n, 0n), RangeError)
		assert.throws(() => nthRootBigIntIterative(4n, -1n), RangeError)
		assert.throws(() => nthRootBigIntIterative(4n, -3n), RangeError)
		assert.throws(() => nthRootBigIntIterative(-8n, -3n), RangeError)
	})

	test('invalid argument types throw TypeError', () => {
		assert.throws(() => nthRootBigIntIterative(4, 2n), TypeError)
		assert.throws(() => nthRootBigIntIterative(4n, 2), TypeError)
		assert.throws(() => nthRootBigIntIterative('4', 2n), TypeError)
		assert.throws(() => nthRootBigIntIterative(4n, '2'), TypeError)
		assert.throws(() => nthRootBigIntIterative(null, 2n), TypeError)
		assert.throws(() => nthRootBigIntIterative(4n, undefined), TypeError)
		assert.throws(() => nthRootBigIntIterative(NaN, 2n), TypeError)
		assert.throws(() => nthRootBigIntIterative(4n, {}), TypeError)
	})

	test('cross-check exact BigInt inequality bounds and Math.pow agreement', () => {
		const cases = [
			[2n, 2n],
			[5n, 2n],
			[10n, 3n],
			[100n, 4n],
			[123456n, 5n],
			[999999999n, 7n],
			[2n ** 40n, 3n],
			[-7n, 3n],
			[-12345n, 5n],
			[-999999n, 7n],
		]

		for (const [x, n] of cases) {
			const r = nthRootBigIntIterative(x, n)

			// 1. Exact algebraic bracket verification: |r|^n <= |x| * 10^(18n) < (|r|+1)^n
			assertExactFixedPointRoot(x, n, r)

			// 2. Independent floating-point cross-check via Math.pow
			const expectedApprox =
				Math.sign(Number(x)) * Math.pow(Math.abs(Number(x)), 1 / Number(n))
			const actualFloat = Number(r) / 1e18
			const relError = Math.abs(actualFloat - expectedApprox) / Math.abs(expectedApprox)
			assert.ok(
				relError < 1e-12,
				`Math.pow cross-check failed for x=${x}, n=${n}: actual=${actualFloat}, expected=${expectedApprox}, relError=${relError}`
			)
		}
	})
})
