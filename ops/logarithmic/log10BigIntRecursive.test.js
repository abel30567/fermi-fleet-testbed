import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { log10BigIntRecursive, SCALE } from './log10BigIntRecursive.js'

/**
 * Independent high-precision reference implementation using base-2 scaling
 * and the iterative atanh Taylor series for ln(x) / ln(10).
 * Completely independent of the recursive base-10 squaring algorithm.
 */
function referenceLog10ViaAtanh(n) {
	const PREC = 10n ** 40n

	// ln((1 + num/den) / (1 - num/den)) = 2 * sum_{j>=0} (num/den)^(2j+1) / (2j+1)
	// For r = a / b: y = (a - b) / (a + b), so num = a - b, den = a + b.
	function lnRatio(a, b) {
		const num = a - b
		const den = a + b
		const numSq = num * num
		const denSq = den * den
		let term = (2n * PREC * num) / den
		let sum = term
		for (let k = 3n; term !== 0n; k += 2n) {
			term = (term * numSq) / denSq
			const delta = term / k
			if (delta === 0n) break
			sum += delta
		}
		return sum
	}

	const ln2 = lnRatio(2n, 1n)
	// ln(10) = 3 * ln(2) + ln(5 / 4)
	const ln10 = 3n * ln2 + lnRatio(5n, 4n)

	// Find bit length e = floor(log2(n))
	const e = BigInt(n.toString(2).length - 1)
	const pow2 = 1n << e
	// n = 2^e * (n / 2^e), with 1 <= n / 2^e < 2
	const lnN = e * ln2 + lnRatio(n, pow2)

	// round((lnN / ln10) * SCALE)
	return (lnN * SCALE + ln10 / 2n) / ln10
}

describe('log10BigIntRecursive', () => {
	it('exports SCALE = 10n ** 18n', () => {
		assert.equal(SCALE, 10n ** 18n)
	})

	it('throws TypeError for non-BigInt inputs', () => {
		const invalid = [1, 10, 0, -5, 3.14, NaN, Infinity, '10', null, undefined, {}, [], true]
		for (const val of invalid) {
			assert.throws(() => log10BigIntRecursive(val), TypeError)
		}
	})

	it('throws RangeError for zero and negative BigInts', () => {
		for (const val of [0n, -1n, -10n, -(10n ** 50n)]) {
			assert.throws(() => log10BigIntRecursive(val), RangeError)
		}
	})

	it('returns exact values for powers of 10 (including very large exponents)', () => {
		assert.equal(log10BigIntRecursive(1n), 0n)
		assert.equal(log10BigIntRecursive(10n), 1n * SCALE)
		assert.equal(log10BigIntRecursive(100n), 2n * SCALE)
		assert.equal(log10BigIntRecursive(1000n), 3n * SCALE)
		assert.equal(log10BigIntRecursive(10n ** 18n), 18n * SCALE)
		assert.equal(log10BigIntRecursive(10n ** 100n), 100n * SCALE)
		assert.equal(log10BigIntRecursive(10n ** 1000n), 1000n * SCALE)
		assert.equal(log10BigIntRecursive(10n ** 5000n), 5000n * SCALE)
	})

	it('matches known 18-digit high-precision constants exactly', () => {
		// log10(2) = 0.3010299956639811952137...
		assert.equal(log10BigIntRecursive(2n), 301029995663981195n)
		// log10(3) = 0.4771212547196624372950...
		assert.equal(log10BigIntRecursive(3n), 477121254719662437n)
		// log10(5) = 0.6989700043360188047862...
		assert.equal(log10BigIntRecursive(5n), 698970004336018805n)
		// log10(7) = 0.8450980400142568307122...
		assert.equal(log10BigIntRecursive(7n), 845098040014256831n)
		// log10(11) = 1.0413926851582250407501...
		assert.equal(log10BigIntRecursive(11n), 1041392685158225041n)
		// log10(2) + log10(5) === 1.0 exactly
		assert.equal(log10BigIntRecursive(2n) + log10BigIntRecursive(5n), SCALE)
	})

	it('handles tight sub-ULP rounding boundaries near powers of 10', () => {
		// log10(10^18 - 1) ~= 18 - 0.43429448e-18 -> rounds to 18 * SCALE
		assert.equal(log10BigIntRecursive(10n ** 18n - 1n), 18n * SCALE)
		// log10(10^18 - 2) ~= 18 - 0.86858896e-18 -> rounds to 18 * SCALE - 1
		assert.equal(log10BigIntRecursive(10n ** 18n - 2n), 18n * SCALE - 1n)
		// log10(10^18 + 1) ~= 18 + 0.43429448e-18 -> rounds to 18 * SCALE
		assert.equal(log10BigIntRecursive(10n ** 18n + 1n), 18n * SCALE)
		// log10(10^18 + 2) ~= 18 + 0.86858896e-18 -> rounds to 18 * SCALE + 1
		assert.equal(log10BigIntRecursive(10n ** 18n + 2n), 18n * SCALE + 1n)
		// Very close to 10^100
		assert.equal(log10BigIntRecursive(10n ** 100n - 1n), 100n * SCALE)
		assert.equal(log10BigIntRecursive(10n ** 100n + 1n), 100n * SCALE)
	})

	it('is strictly increasing across consecutive integers 1..200', () => {
		let prev = log10BigIntRecursive(1n)
		for (let i = 2n; i <= 200n; i++) {
			const curr = log10BigIntRecursive(i)
			assert.ok(curr > prev, `Expected log10(${i}) > log10(${i - 1n})`)
			prev = curr
		}
	})

	it('satisfies exact decade-shift and approximate product/power algebraic identities', () => {
		// Exact decade shift: log10(n * 10^k) === log10(n) + k * SCALE
		for (const base of [2n, 3n, 7n, 42n, 9876543210123456789n]) {
			const baseLog = log10BigIntRecursive(base)
			for (const shift of [1n, 5n, 25n, 200n]) {
				const shifted = log10BigIntRecursive(base * 10n ** shift)
				assert.equal(shifted, baseLog + shift * SCALE)
			}
		}

		// Product law: |log10(a * b) - (log10(a) + log10(b))| <= 1n
		const pairs = [
			[2n, 3n],
			[7n, 13n],
			[123456789n, 987654321n],
			[2n ** 100n + 1n, 3n ** 80n + 5n],
		]
		for (const [a, b] of pairs) {
			const lhs = log10BigIntRecursive(a * b)
			const rhs = log10BigIntRecursive(a) + log10BigIntRecursive(b)
			const diff = lhs >= rhs ? lhs - rhs : rhs - lhs
			assert.ok(diff <= 1n, `Product identity error ${diff} > 1n for (${a}, ${b})`)
		}

		// Power law: |log10(a^m) - m * log10(a)| <= m
		for (const [a, m] of [
			[2n, 100n],
			[3n, 75n],
			[17n, 50n],
		]) {
			const lhs = log10BigIntRecursive(a ** m)
			const rhs = m * log10BigIntRecursive(a)
			const diff = lhs >= rhs ? lhs - rhs : rhs - lhs
			assert.ok(diff <= m, `Power identity error ${diff} > ${m} for ${a}^${m}`)
		}
	})

	it('cross-checks against Math.log10 within IEEE-754 double precision tolerance', () => {
		const samples = [
			1n,
			2n,
			3n,
			4n,
			5n,
			6n,
			7n,
			8n,
			9n,
			10n,
			15n,
			42n,
			99n,
			101n,
			999n,
			1024n,
			65537n,
			1000000007n,
			9007199254740991n, // Number.MAX_SAFE_INTEGER
		]
		for (const n of samples) {
			const actual = Number(log10BigIntRecursive(n)) / 1e18
			const expected = Math.log10(Number(n))
			assert.ok(
				Math.abs(actual - expected) < 1e-14,
				`Mismatch for n=${n}: got ${actual}, Math.log10=${expected}`,
			)
		}
	})

	it('matches independent atanh-series BigInt reference to 0 ULP across small and huge inputs', () => {
		const cases = [
			2n,
			3n,
			5n,
			9n,
			17n,
			99n,
			101n,
			123456789012345678901234567890n,
			2n ** 256n,
			2n ** 1000n - 1n,
			3n ** 300n + 7n,
			10n ** 150n + 314159265358979323846n,
		]
		for (const n of cases) {
			const actual = log10BigIntRecursive(n)
			const expected = referenceLog10ViaAtanh(n)
			assert.equal(actual, expected, `0-ULP mismatch for n=${n}`)
		}
	})
})
