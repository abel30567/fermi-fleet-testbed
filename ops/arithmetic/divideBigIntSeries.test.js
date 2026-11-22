import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { divideBigIntSeries } from './divideBigIntSeries.js'

const SCALE = 10n ** 18n

/**
 * Independent reference oracle using native BigInt division and remainder
 * with round-half-away-from-zero semantics.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function referenceDivideScaled(a, b) {
	if (a === 0n) return 0n
	const negative = (a < 0n) !== (b < 0n)
	const absA = a < 0n ? -a : a
	const absB = b < 0n ? -b : b
	const scaled = absA * SCALE
	let q = scaled / absB
	const rem = scaled % absB
	if (rem * 2n >= absB) {
		q += 1n
	}
	return negative && q !== 0n ? -q : q
}

describe('divideBigIntSeries', () => {
	describe('normal cases', () => {
		it('computes exact integer quotients scaled by 10^18', () => {
			assert.equal(divideBigIntSeries(0n, 1n), 0n)
			assert.equal(divideBigIntSeries(0n, -7n), 0n)
			assert.equal(divideBigIntSeries(1n, 1n), SCALE)
			assert.equal(divideBigIntSeries(6n, 3n), 2n * SCALE)
			assert.equal(divideBigIntSeries(100n, 4n), 25n * SCALE)
			assert.equal(divideBigIntSeries(42n, 1n), 42n * SCALE)
		})

		it('computes exact terminating decimal fractions', () => {
			assert.equal(divideBigIntSeries(1n, 2n), 500_000_000_000_000_000n)
			assert.equal(divideBigIntSeries(1n, 4n), 250_000_000_000_000_000n)
			assert.equal(divideBigIntSeries(3n, 8n), 375_000_000_000_000_000n)
			assert.equal(divideBigIntSeries(1n, 5n), 200_000_000_000_000_000n)
			assert.equal(divideBigIntSeries(1n, SCALE), 1n)
		})

		it('computes repeating fractions with exact nearest rounding', () => {
			assert.equal(divideBigIntSeries(1n, 3n), 333_333_333_333_333_333n)
			assert.equal(divideBigIntSeries(2n, 3n), 666_666_666_666_666_667n)
			assert.equal(divideBigIntSeries(1n, 7n), 142_857_142_857_142_857n)
			assert.equal(divideBigIntSeries(22n, 7n), 3_142_857_142_857_142_857n)
			assert.equal(divideBigIntSeries(355n, 113n), 3_141_592_920_353_982_301n)
			assert.equal(divideBigIntSeries(1n, 6n), 166_666_666_666_666_667n)
			assert.equal(divideBigIntSeries(5n, 6n), 833_333_333_333_333_333n)
		})
	})

	describe('edge cases', () => {
		it('handles all sign combinations accurately', () => {
			assert.equal(divideBigIntSeries(-1n, 3n), -333_333_333_333_333_333n)
			assert.equal(divideBigIntSeries(1n, -3n), -333_333_333_333_333_333n)
			assert.equal(divideBigIntSeries(-1n, -3n), 333_333_333_333_333_333n)
			assert.equal(divideBigIntSeries(-2n, 3n), -666_666_666_666_666_667n)
			assert.equal(divideBigIntSeries(2n, -3n), -666_666_666_666_666_667n)
			assert.equal(divideBigIntSeries(-2n, -3n), 666_666_666_666_666_667n)
			assert.equal(divideBigIntSeries(-22n, 7n), -3_142_857_142_857_142_857n)
		})

		it('rounds exact half-integer midpoints away from zero', () => {
			// Exact +0.5 ulp -> +1n; exact -0.5 ulp -> -1n
			assert.equal(divideBigIntSeries(1n, 2n * SCALE), 1n)
			assert.equal(divideBigIntSeries(-1n, 2n * SCALE), -1n)
			assert.equal(divideBigIntSeries(1n, -2n * SCALE), -1n)
			assert.equal(divideBigIntSeries(-1n, -2n * SCALE), 1n)

			// Exact +1.5 ulp -> +2n; exact -1.5 ulp -> -2n
			assert.equal(divideBigIntSeries(3n, 2n * SCALE), 2n)
			assert.equal(divideBigIntSeries(-3n, 2n * SCALE), -2n)

			// Just below 0.5 ulp -> 0n
			assert.equal(divideBigIntSeries(1n, 2n * SCALE + 1n), 0n)
			assert.equal(divideBigIntSeries(-1n, 2n * SCALE + 1n), 0n)

			// Just above 0.5 ulp -> +-1n
			assert.equal(divideBigIntSeries(1n, 2n * SCALE - 1n), 1n)
			assert.equal(divideBigIntSeries(-1n, 2n * SCALE - 1n), -1n)
		})

		it('handles divisors near powers of two (normalization boundaries d = 1/2 and d -> 1)', () => {
			const powers = [1n, 2n, 4n, 8n, 1n << 63n, 1n << 64n, 1n << 128n, 1n << 512n]
			for (const p of powers) {
				const candidates = p > 1n ? [p - 1n, p, p + 1n] : [p]
				for (const d of candidates) {
					const a = d * 3n + (d >> 1n) + 1n
					assert.equal(
						divideBigIntSeries(a, d),
						referenceDivideScaled(a, d),
						`Failed for a=${a}, d=${d}`
					)
				}
			}
		})

		it('handles underflow to 0n when |a / b| < 0.5 * 10^-18', () => {
			assert.equal(divideBigIntSeries(1n, 10n ** 30n), 0n)
			assert.equal(divideBigIntSeries(-1n, 10n ** 30n), 0n)
			assert.equal(divideBigIntSeries(999n, 10n ** 25n), 0n)
		})

		it('handles very large BigInts (hundreds of bits)', () => {
			// Huge numerator, small denominator
			const hugeA = (1n << 600n) + 12345678901234567890n
			assert.equal(
				divideBigIntSeries(hugeA, 7n),
				referenceDivideScaled(hugeA, 7n)
			)

			// Huge denominator with bit length >> working precision (tests shift < 0 path)
			const hugeB = (1n << 512n) - 1n
			const hugeNum = (1n << 515n) + 987654321n
			assert.equal(
				divideBigIntSeries(hugeNum, hugeB),
				referenceDivideScaled(hugeNum, hugeB)
			)
			assert.equal(
				divideBigIntSeries(-hugeNum, hugeB),
				referenceDivideScaled(-hugeNum, hugeB)
			)

			// Nearly equal huge numbers where quotient ≈ 1
			const nearA = 10n ** 120n + 10n ** 102n
			const nearB = 10n ** 120n
			assert.equal(divideBigIntSeries(nearA, nearB), SCALE + 1n)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when a or b is not a bigint', () => {
			const invalidValues = [
				0,
				1,
				3.14,
				NaN,
				Infinity,
				'1',
				null,
				undefined,
				true,
				false,
				{},
				[],
				Symbol('x'),
			]
			for (const bad of invalidValues) {
				assert.throws(() => divideBigIntSeries(bad, 1n), TypeError)
				assert.throws(() => divideBigIntSeries(1n, bad), TypeError)
			}
			assert.throws(() => divideBigIntSeries(), TypeError)
		})

		it('throws RangeError when divisor b is 0n', () => {
			assert.throws(() => divideBigIntSeries(1n, 0n), RangeError)
			assert.throws(() => divideBigIntSeries(-1n, 0n), RangeError)
			assert.throws(() => divideBigIntSeries(0n, 0n), RangeError)
			assert.throws(() => divideBigIntSeries(10n ** 50n, 0n), RangeError)
		})
	})

	describe('cross-checks and mathematical identities', () => {
		it('matches exact scaled division oracle and satisfies |q * b - a * 10^18| <= |b| / 2', () => {
			const pairs = [
				[1n, 3n],
				[2n, 3n],
				[1n, 7n],
				[22n, 7n],
				[355n, 113n],
				[-355n, 113n],
				[355n, -113n],
				[-355n, -113n],
				[10n ** 40n + 7n, 10n ** 20n + 3n],
				[-(10n ** 50n) - 13n, 999_999_999_989n],
				[123456789012345678901234567890n, 98765432109876543210987654321n],
				[1n << 300n, (1n << 299n) + 1n],
				[(1n << 300n) - 1n, (1n << 300n) + 1n],
				[7n, 10n ** 20n],
				[5n, 10n ** 19n],
			]

			// Also add a deterministic PRNG sweep over varied magnitudes
			let seed = 0x123456789abcdef0123456789abcdefn
			const nextRand = () => {
				seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 128n) - 1n)
				return seed
			}
			for (let i = 0; i < 100; i++) {
				const rawA = nextRand() >> BigInt(i % 96)
				const rawB = (nextRand() >> BigInt((i * 7) % 96)) + 1n
				const a = i % 2 === 0 ? rawA : -rawA
				const b = i % 3 === 0 ? -rawB : rawB
				pairs.push([a, b])
			}

			for (const [a, b] of pairs) {
				const q = divideBigIntSeries(a, b)
				const expected = referenceDivideScaled(a, b)
				assert.equal(q, expected, `Oracle mismatch for (${a}, ${b})`)

				// Exact nearest-integer identity: |q * b - a * 10^18| * 2 <= |b|
				const diff = q * b - a * SCALE
				const absDiff = diff < 0n ? -diff : diff
				const absB = b < 0n ? -b : b
				assert.ok(
					absDiff * 2n <= absB,
					`Identity violated for (${a}, ${b}): 2*|q*b - a*10^18|=${absDiff * 2n} > |b|=${absB}`
				)

				// Compare with truncated native division (a * 10^18) / b (differs by at most 1 ulp)
				const trunc = (a * SCALE) / b
				const ulpDiff = q >= trunc ? q - trunc : trunc - q
				assert.ok(
					ulpDiff <= 1n,
					`Exceeded 1 ulp vs truncated division for (${a}, ${b}): q=${q}, trunc=${trunc}`
				)
			}
		})

		it('satisfies sign-symmetry and scale-invariance identities', () => {
			const samples = [
				[17n, 29n],
				[10n ** 35n + 3n, 10n ** 12n + 7n],
				[355n, 113n],
				[1n, 2n * SCALE],
			]
			const factors = [2n, 7n, 10n ** 15n, (1n << 127n) - 1n]

			for (const [a, b] of samples) {
				const q = divideBigIntSeries(a, b)
				assert.equal(divideBigIntSeries(-a, b), -q)
				assert.equal(divideBigIntSeries(a, -b), -q)
				assert.equal(divideBigIntSeries(-a, -b), q)

				for (const k of factors) {
					assert.equal(divideBigIntSeries(a * k, b * k), q)
					assert.equal(divideBigIntSeries(a * -k, b * -k), q)
				}
			}
		})

		it('converges Fibonacci ratios F_{n+1}/F_n to the golden ratio phi * 10^18', () => {
			let fPrev = 1n
			let fCurr = 1n
			for (let i = 0; i < 120; i++) {
				const next = fPrev + fCurr
				fPrev = fCurr
				fCurr = next
			}
			// Golden ratio phi = (1 + sqrt(5)) / 2 = 1.618033988749894848204586834...
			const phiScaled = 1_618_033_988_749_894_848n
			assert.equal(divideBigIntSeries(fCurr, fPrev), phiScaled)
		})
	})
})
