import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { log2BigIntRecursive, SCALE } from './log2BigIntRecursive.js'

/**
 * Independent iterative reference implementation of log2(n) using the analytic
 * atanh Taylor series for ln(x) = 2 * sum_{k=0}^inf ((x-1)/(x+1))^(2k+1) / (2k+1),
 * computing log2(n) = floor(log2(n)) + ln(m) / ln(2) in 36-digit decimal fixed-point.
 */
function referenceLog2ViaAtanh(n) {
	const PREC = 10n ** 36n

	// Iterative bit length (no recursion)
	let k = 0n
	let tmp = n
	while (tmp > 1n) {
		tmp >>= 1n
		k += 1n
	}

	// Iterative atanh series for ln(num / den) where 1 <= num / den <= 2
	function lnRatio(num, den) {
		// z = (num - den) / (num + den), scaled by PREC
		const a = num - den
		const b = num + den
		if (a === 0n) return 0n
		const a2 = a * a
		const b2 = b * b

		let term = (a * PREC) / b
		let sum = term
		let j = 1n
		while (term > 0n) {
			term = (term * a2) / b2
			const contrib = term / (2n * j + 1n)
			if (contrib === 0n) break
			sum += contrib
			j += 1n
		}
		return 2n * sum
	}

	const ln2 = lnRatio(2n, 1n)
	// Reduce n / 2^k to a ratio with manageable numerator/denominator (>= 160 bits of precision)
	let num
	let den
	if (k <= 160n) {
		num = n
		den = 1n << k
	} else {
		num = n >> (k - 160n)
		den = 1n << 160n
	}

	const lnM = lnRatio(num, den)
	// round((lnM * SCALE) / ln2)
	const fracScaled = (lnM * SCALE + ln2 / 2n) / ln2
	return k * SCALE + fracScaled
}

describe('log2BigIntRecursive', () => {
	test('exports SCALE equal to 10^18', () => {
		assert.equal(SCALE, 10n ** 18n)
	})

	test('exact powers of two', () => {
		const exponents = [0n, 1n, 2n, 3n, 4n, 8n, 10n, 31n, 32n, 53n, 64n, 128n, 256n, 1024n, 4096n, 10000n]
		for (const k of exponents) {
			const n = 1n << k
			assert.equal(
				log2BigIntRecursive(n),
				k * SCALE,
				`Expected exact log2(2^${k}) === ${k} * SCALE`
			)
		}
	})

	test('known high-precision constants (exact to 18 decimal places)', () => {
		// Verified to >25 decimal digits:
		// log2(3)   = 1.5849625007211561814537389...
		// log2(5)   = 2.3219280948873623478703194...
		// log2(6)   = 2.5849625007211561814537389...
		// log2(7)   = 2.8073549220576041074419693...
		// log2(9)   = 3.1699250014423123629074778...
		// log2(10)  = 3.3219280948873623478703194...
		// log2(100) = 6.6438561897747246957406388...
		// log2(1000)= 9.9657842846620870436109582...
		const cases = [
			[3n, 1584962500721156181n],
			[5n, 2321928094887362348n],
			[6n, 2584962500721156181n],
			[7n, 2807354922057604107n],
			[9n, 3169925001442312363n],
			[10n, 3321928094887362348n],
			[100n, 6643856189774724696n],
			[1000n, 9965784284662087044n],
		]
		for (const [input, expected] of cases) {
			assert.equal(
				log2BigIntRecursive(input),
				expected,
				`Mismatch for log2(${input})`
			)
		}
	})

	test('large BigInts and boundary rounding near powers of two', () => {
		// 2^1000 - 1 is within ~10^-301 of 2^1000, so fractional part rounds up and carries into integer part
		assert.equal(log2BigIntRecursive((1n << 1000n) - 1n), 1000n * SCALE)
		assert.equal(log2BigIntRecursive((1n << 1000n) + 1n), 1000n * SCALE)

		// 2^1000 * (1 - 2^-60): log2 ≈ 1000 - 2^-60 / ln(2) ≈ 1000 - 1.251245e-18 -> rounds to 1000 * SCALE - 1
		assert.equal(
			log2BigIntRecursive((1n << 1000n) - (1n << 940n)),
			1000n * SCALE - 1n
		)

		// 2^1000 * (1 + 2^-60): log2 ≈ 1000 + 2^-60 / ln(2) ≈ 1000 + 1.251245e-18 -> rounds to 1000 * SCALE + 1
		assert.equal(
			log2BigIntRecursive((1n << 1000n) + (1n << 940n)),
			1000n * SCALE + 1n
		)

		// 10^100: log2(10^100) = 100 * 3.3219280948873623478703194... = 332.192809488736234787...
		assert.equal(
			log2BigIntRecursive(10n ** 100n),
			332192809488736234787n
		)

		// 3 * 2^5000 = 5000 + log2(3)
		assert.equal(
			log2BigIntRecursive(3n << 5000n),
			5000n * SCALE + 1584962500721156181n
		)
	})

	test('cross-check against Math.log2 within floating-point tolerance', () => {
		const samples = [
			1n, 2n, 3n, 5n, 7n, 11n, 13n, 17n, 31n, 63n, 64n, 65n,
			127n, 255n, 999n, 1023n, 1025n, 65537n, 1000000n,
			9876543210123n, BigInt(Number.MAX_SAFE_INTEGER),
		]
		// IEEE-754 float64 has ~53 bits (~15.95 decimal digits), so allow 1e-14 relative/abs margin
		const MAX_FLOAT_DIFF = 10n ** 4n // 1e-14 in SCALE=10^18 units
		for (const n of samples) {
			const actual = log2BigIntRecursive(n)
			const approx = BigInt(Math.round(Math.log2(Number(n)) * 1e15)) * 1000n
			const diff = actual >= approx ? actual - approx : approx - actual
			assert.ok(
				diff <= MAX_FLOAT_DIFF,
				`log2(${n}): actual=${actual}, Math.log2 approx=${approx}, diff=${diff}`
			)
		}
	})

	test('cross-check against independent iterative atanh Taylor series reference', () => {
		const samples = [
			1n, 2n, 3n, 5n, 7n, 10n, 15n, 17n, 42n, 127n, 257n, 1023n,
			999983n,
			10n ** 30n + 7n,
			(1n << 200n) + (1n << 199n) + 123456789n,
			10n ** 300n,
			3n ** 200n,
			(1n << 1024n) - 12345678901234567890n,
		]
		for (const n of samples) {
			const actual = log2BigIntRecursive(n)
			const ref = referenceLog2ViaAtanh(n)
			assert.equal(
				actual,
				ref,
				`Mismatch vs atanh reference for n=${n}: actual=${actual}, ref=${ref}`
			)
		}
	})

	test('algebraic identities (shift, product, power, monotonicity, power-bracket)', () => {
		// Exact shift identity: log2(n << k) === log2(n) + k * SCALE
		for (const n of [3n, 13n, 999999937n, 10n ** 50n + 19n]) {
			const base = log2BigIntRecursive(n)
			for (const k of [1n, 7n, 64n, 512n]) {
				assert.equal(log2BigIntRecursive(n << k), base + k * SCALE)
			}
		}

		// Product identity: |log2(a * b) - (log2(a) + log2(b))| <= 1n
		const pairs = [
			[3n, 5n],
			[7n, 11n],
			[123456789n, 987654321n],
			[10n ** 40n + 3n, 10n ** 45n + 7n],
		]
		for (const [a, b] of pairs) {
			const lhs = log2BigIntRecursive(a * b)
			const rhs = log2BigIntRecursive(a) + log2BigIntRecursive(b)
			const diff = lhs >= rhs ? lhs - rhs : rhs - lhs
			assert.ok(diff <= 1n, `Product identity failed for (${a}, ${b}): diff=${diff}`)
		}

		// Power identity: |log2(a^m) - m * log2(a)| <= m
		for (const [a, m] of [[3n, 100n], [7n, 50n], [10n, 80n]]) {
			const lhs = log2BigIntRecursive(a ** m)
			const rhs = m * log2BigIntRecursive(a)
			const diff = lhs >= rhs ? lhs - rhs : rhs - lhs
			assert.ok(diff <= m, `Power identity failed for ${a}^${m}: diff=${diff}`)
		}

		// Strict monotonicity for 1..200
		let prev = log2BigIntRecursive(1n)
		for (let i = 2n; i <= 200n; i++) {
			const curr = log2BigIntRecursive(i)
			assert.ok(curr > prev, `Expected strictly increasing at ${i}`)
			prev = curr
		}

		// Inverse power bracket check: for q = 1000, 2^floor(q*log2(n)) <= n^q < 2^(floor(q*log2(n)) + 1)
		const q = 1000n
		for (const n of [3n, 5n, 10n, 123n, 999n]) {
			const y = log2BigIntRecursive(n)
			const p = (y * q) / SCALE
			const nPowQ = n ** q
			assert.ok(nPowQ >= (1n << p), `Lower bracket failed for n=${n}`)
			assert.ok(nPowQ < (1n << (p + 1n)), `Upper bracket failed for n=${n}`)
		}
	})

	test('input validation errors', () => {
		// Non-BigInt arguments must throw TypeError
		const invalidTypes = [1, 2, 0, -1, 2.5, NaN, Infinity, '2', null, undefined, true, false, {}, [2n]]
		for (const val of invalidTypes) {
			assert.throws(
				() => log2BigIntRecursive(val),
				{ name: 'TypeError' },
				`Expected TypeError for ${String(val)}`
			)
		}

		// Non-positive BigInt arguments must throw RangeError
		const invalidDomain = [0n, -1n, -2n, -1000n, -(10n ** 50n)]
		for (const val of invalidDomain) {
			assert.throws(
				() => log2BigIntRecursive(val),
				{ name: 'RangeError' },
				`Expected RangeError for ${val}`
			)
		}
	})
})
