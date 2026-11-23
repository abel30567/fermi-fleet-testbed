import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { log2BigIntSeries } from './log2BigIntSeries.js'

const SCALE = 10n ** 18n

/**
 * Independent reference implementation of fixed-point log2(n) * 10^18 using
 * binary bit-by-bit squaring (no Taylor/artanh series and no ln(2) constant).
 *
 * For n = 2^k * m with 1 <= m < 2, repeatedly squares m:
 *   if m^2 >= 2, emit fractional bit 1 and set m = m^2 / 2;
 *   otherwise emit bit 0 and set m = m^2.
 */
function referenceLog2BinarySquaring(n, fracBits = 96) {
	const hex = n.toString(16)
	const k = (hex.length - 1) * 4 + (32 - Math.clz32(parseInt(hex[0], 16))) - 1

	const precisionBits = fracBits + 32
	const one = 1n << BigInt(precisionBits)
	const two = one << 1n

	// Fixed-point m = round(n * 2^(precisionBits - k))
	let m
	if (k <= precisionBits) {
		m = n << BigInt(precisionBits - k)
	} else {
		const shift = BigInt(k - precisionBits)
		m = (n + (1n << (shift - 1n))) >> shift
	}

	let frac = 0n
	for (let i = 0; i < fracBits; i++) {
		m = (m * m) >> BigInt(precisionBits)
		frac <<= 1n
		if (m >= two) {
			frac |= 1n
			m >>= 1n
		}
	}

	const denom = 1n << BigInt(fracBits)
	const fracScaled = (frac * SCALE + denom / 2n) / denom
	return BigInt(k) * SCALE + fracScaled
}

describe('log2BigIntSeries', () => {
	it('returns exact values for powers of two', () => {
		assert.equal(log2BigIntSeries(1n), 0n)
		assert.equal(log2BigIntSeries(2n), 1n * SCALE)
		assert.equal(log2BigIntSeries(4n), 2n * SCALE)
		assert.equal(log2BigIntSeries(8n), 3n * SCALE)
		assert.equal(log2BigIntSeries(1024n), 10n * SCALE)
		assert.equal(log2BigIntSeries(1n << 64n), 64n * SCALE)
		assert.equal(log2BigIntSeries(1n << 256n), 256n * SCALE)
		assert.equal(log2BigIntSeries(1n << 1024n), 1024n * SCALE)
	})

	it('matches known 18-digit high-precision constants', () => {
		// log2(3)  = 1.58496250072115618145...
		assert.equal(log2BigIntSeries(3n), 1_584_962_500_721_156_181n)
		// log2(5)  = 2.32192809488736234787...
		assert.equal(log2BigIntSeries(5n), 2_321_928_094_887_362_348n)
		// log2(7)  = 2.80735492205760410744...
		assert.equal(log2BigIntSeries(7n), 2_807_354_922_057_604_107n)
		// log2(10) = 3.32192809488736234787...
		assert.equal(log2BigIntSeries(10n), 3_321_928_094_887_362_348n)
		// log2(10^10) = 33.21928094887362347870...
		assert.equal(log2BigIntSeries(10n ** 10n), 33_219_280_948_873_623_479n)
		// log2(10^18) = 59.79470570797252226166...
		assert.equal(log2BigIntSeries(10n ** 18n), 59_794_705_707_972_522_262n)
	})

	it('handles values near powers of two and sqrt(2) switchover boundaries', () => {
		// 2^60 - 1: 60 - 1 / (2^60 * ln(2)) ≈ 60 - 1.25128e-18 -> rounds down by 1 ulp
		assert.equal(log2BigIntSeries((1n << 60n) - 1n), 60n * SCALE - 1n)
		// 2^60 + 1: 60 + 1 / (2^60 * ln(2)) ≈ 60 + 1.25128e-18 -> rounds up by 1 ulp
		assert.equal(log2BigIntSeries((1n << 60n) + 1n), 60n * SCALE + 1n)
		// 2^100 + 1: difference from 100 is ~1.14e-30 << 0.5e-18 -> rounds to 100 * SCALE
		assert.equal(log2BigIntSeries((1n << 100n) + 1n), 100n * SCALE)
		// 2^100 - 1: difference from 100 is ~1.14e-30 << 0.5e-18 -> rounds to 100 * SCALE
		assert.equal(log2BigIntSeries((1n << 100n) - 1n), 100n * SCALE)

		// Continuity across the m ~ sqrt(2) range-reduction threshold
		const boundaryValues = [1413n, 1414n, 1415n, 1414213562n, 1414213563n]
		for (const v of boundaryValues) {
			assert.equal(log2BigIntSeries(v), referenceLog2BinarySquaring(v))
		}
	})

	it('cross-checks against independent binary squaring reference', () => {
		const samples = [
			3n,
			6n,
			9n,
			15n,
			17n,
			99n,
			100n,
			127n,
			129n,
			999n,
			1023n,
			1025n,
			65537n,
			1_000_000_007n,
			(1n << 53n) - 1n,
			(1n << 53n) + 1n,
			(1n << 80n) + 1234567890123456789n,
			3n ** 50n,
			10n ** 40n,
			(1n << 200n) - 12345n,
		]
		for (const n of samples) {
			const actual = log2BigIntSeries(n)
			const expected = referenceLog2BinarySquaring(n)
			assert.equal(
				actual,
				expected,
				`Mismatch for n=${n}: got ${actual}, expected ${expected}`,
			)
		}
	})

	it('agrees with Math.log2 within floating-point precision for safe integers', () => {
		const safeValues = [1n, 2n, 3n, 10n, 42n, 1000n, 987654321n, 9007199254740991n]
		for (const n of safeValues) {
			const actual = Number(log2BigIntSeries(n)) / 1e18
			const expected = Math.log2(Number(n))
			assert.ok(
				Math.abs(actual - expected) < 1e-13,
				`Float mismatch for n=${n}: ${actual} vs ${expected}`,
			)
		}
	})

	it('satisfies logarithmic product, power, and monotonicity identities', () => {
		const pairs = [
			[3n, 5n],
			[7n, 13n],
			[123456789n, 987654321n],
			[10n ** 15n + 7n, 2n ** 40n + 3n],
		]
		for (const [a, b] of pairs) {
			const lhs = log2BigIntSeries(a * b)
			const rhs = log2BigIntSeries(a) + log2BigIntSeries(b)
			const diff = lhs >= rhs ? lhs - rhs : rhs - lhs
			assert.ok(
				diff <= 1n,
				`Product identity failed for (${a}, ${b}): diff=${diff}`,
			)
		}

		// Power identity: log2(a^m) == m * log2(a) within rounding tolerance
		for (const [a, m] of [
			[3n, 25n],
			[10n, 30n],
			[17n, 19n],
		]) {
			const lhs = log2BigIntSeries(a ** m)
			const rhs = m * log2BigIntSeries(a)
			const diff = lhs >= rhs ? lhs - rhs : rhs - lhs
			assert.ok(
				diff <= m,
				`Power identity failed for ${a}^${m}: diff=${diff}`,
			)
		}

		// Strict monotonicity for distinct small integers
		let prev = log2BigIntSeries(1n)
		for (let n = 2n; n <= 100n; n++) {
			const curr = log2BigIntSeries(n)
			assert.ok(curr > prev, `Expected log2(${n}) > log2(${n - 1n})`)
			prev = curr
		}
	})

	it('validates input type and domain', () => {
		for (const badType of [1, 2.5, '2', null, undefined, NaN, {}, []]) {
			assert.throws(() => log2BigIntSeries(badType), TypeError)
		}
		for (const nonPositive of [0n, -1n, -2n, -(1n << 100n)]) {
			assert.throws(() => log2BigIntSeries(nonPositive), RangeError)
		}
	})
})
