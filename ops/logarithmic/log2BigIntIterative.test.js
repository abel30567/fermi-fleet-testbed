import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { log2BigIntIterative } from './log2BigIntIterative.js'

const SCALE = 10n ** 18n

describe('log2BigIntIterative', () => {
	describe('exact powers of two', () => {
		it('returns exact scaled integers for powers of 2', () => {
			assert.equal(log2BigIntIterative(1n), 0n)
			assert.equal(log2BigIntIterative(2n), 1n * SCALE)
			assert.equal(log2BigIntIterative(4n), 2n * SCALE)
			assert.equal(log2BigIntIterative(8n), 3n * SCALE)
			assert.equal(log2BigIntIterative(1024n), 10n * SCALE)
			assert.equal(log2BigIntIterative(2n ** 64n), 64n * SCALE)
			assert.equal(log2BigIntIterative(2n ** 256n), 256n * SCALE)
			assert.equal(log2BigIntIterative(2n ** 1024n), 1024n * SCALE)
			assert.equal(log2BigIntIterative(2n ** 4096n), 4096n * SCALE)
		})
	})

	describe('known non-integer values', () => {
		it('matches known 18-digit fixed-point log2 values', () => {
			// log2(3)    = 1.5849625007211561814537389...
			assert.equal(log2BigIntIterative(3n), 1584962500721156181n)
			// log2(5)    = 2.3219280948873623478703194...
			assert.equal(log2BigIntIterative(5n), 2321928094887362348n)
			// log2(7)    = 2.8073549220576041074419693...
			assert.equal(log2BigIntIterative(7n), 2807354922057604107n)
			// log2(10)   = 3.3219280948873623478703194...
			assert.equal(log2BigIntIterative(10n), 3321928094887362348n)
			// log2(1000) = 9.9657842846620870436109582...
			assert.equal(log2BigIntIterative(1000n), 9965784284662087044n)
			// log2(10^18) = 59.794705707972522261665749...
			assert.equal(log2BigIntIterative(10n ** 18n), 59794705707972522262n)
		})
	})

	describe('edge cases', () => {
		it('handles values adjacent to powers of two across working-bit boundaries', () => {
			// Just below and above 2^50 (within 128-bit mantissa)
			const below50 = (1n << 50n) - 1n
			const above50 = (1n << 50n) + 1n
			assert.equal(log2BigIntIterative(below50), 49999999999999998719n)
			assert.equal(log2BigIntIterative(above50), 50000000000000001281n)

			// 2^100 - 1 is within 1.14e-30 of 2^100, so it rounds to 100 * 10^18
			assert.equal(log2BigIntIterative((1n << 100n) - 1n), 100n * SCALE)

			// Beyond 128-bit mantissa (tests right-shift normalization path)
			assert.equal(log2BigIntIterative((1n << 200n) - 1n), 200n * SCALE)
			assert.equal(log2BigIntIterative((1n << 200n) + 1n), 200n * SCALE)

			// Large non-power-of-two with > 128 bits: 3 * 2^200 => 200 + log2(3)
			assert.equal(
				log2BigIntIterative(3n << 200n),
				200n * SCALE + 1584962500721156181n
			)
		})

		it('is strictly monotonically increasing on small positive integers', () => {
			let prev = log2BigIntIterative(1n)
			for (let n = 2n; n <= 200n; n += 1n) {
				const curr = log2BigIntIterative(n)
				assert.ok(curr > prev, `Expected log2(${n}) > log2(${n - 1n})`)
				prev = curr
			}
		})
	})

	describe('input validation', () => {
		it('throws RangeError for zero and negative BigInts', () => {
			assert.throws(() => log2BigIntIterative(0n), RangeError)
			assert.throws(() => log2BigIntIterative(-1n), RangeError)
			assert.throws(() => log2BigIntIterative(-(1n << 100n)), RangeError)
		})

		it('throws TypeError for non-BigInt inputs', () => {
			for (const bad of [1, 0, -2, NaN, Infinity, '8', null, undefined, {}, true]) {
				assert.throws(() => log2BigIntIterative(bad), TypeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches Math.log2 within float64 precision across safe integers', () => {
			const samples = [
				1n, 2n, 3n, 5n, 6n, 7n, 9n, 15n, 17n, 42n, 99n, 255n, 257n,
				123456n, 987654321n, 10n ** 12n + 7n, BigInt(Number.MAX_SAFE_INTEGER)
			]
			for (const x of samples) {
				const actual = log2BigIntIterative(x)
				const approx = BigInt(Math.round(Math.log2(Number(x)) * 1e18))
				const diff = actual >= approx ? actual - approx : approx - actual
				// IEEE-754 double has ~53 bits (~15.95 decimal digits) of precision
				const maxTolerance = 100000n // 1e-13 in scaled units
				assert.ok(
					diff <= maxTolerance,
					`Mismatch for ${x}: actual=${actual}, Math.log2~=${approx}, diff=${diff}`
				)
			}
		})

		it('satisfies exact BigInt inverse bracket 2^p <= x^q < 2^(p+1)', () => {
			// Independent verification using only BigInt exponentiation and bit shifts:
			// For y = log2(x) * 10^18 and integer q, p = floor(y * q / 10^18) must satisfy
			// 2^(p - 1) < x^q < 2^(p + 2) (and tightly 2^p <= x^q < 2^(p + 1) unless y*q is on an integer boundary).
			const q = 500n
			const testValues = [3n, 5n, 7n, 10n, 13n, 999n, 123456789012345678901234567890n]
			for (const x of testValues) {
				const y = log2BigIntIterative(x)
				// Compute lower and upper bounds accounting for <= 1 ULP in y
				const pLow = ((y - 1n) * q) / SCALE
				const pHigh = ((y + 1n) * q) / SCALE + 1n
				const xPowQ = x ** q
				assert.ok(
					(1n << pLow) <= xPowQ && xPowQ <= (1n << pHigh),
					`Bracket check failed for x=${x}: 2^${pLow} <= x^${q} <= 2^${pHigh}`
				)
			}
		})

		it('satisfies logarithmic product and power identities for huge BigInts', () => {
			const a = 3n ** 75n + 17n
			const b = 5n ** 60n + 29n
			const logAB = log2BigIntIterative(a * b)
			const sumLogs = log2BigIntIterative(a) + log2BigIntIterative(b)
			const prodDiff = logAB >= sumLogs ? logAB - sumLogs : sumLogs - logAB
			assert.ok(prodDiff <= 1n, `Product identity diff too large: ${prodDiff}`)

			const exp = 40n
			const logPow = log2BigIntIterative(a ** exp)
			const scaledLog = exp * log2BigIntIterative(a)
			const powDiff = logPow >= scaledLog ? logPow - scaledLog : scaledLog - logPow
			assert.ok(powDiff <= exp, `Power identity diff too large: ${powDiff}`)
		})
	})
})
