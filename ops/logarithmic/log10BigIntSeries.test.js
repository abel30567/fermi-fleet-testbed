import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { log10BigIntSeries } from './log10BigIntSeries.js'

const SCALE = 10n ** 18n

describe('log10BigIntSeries', () => {
	test('exact powers of 10 return exact k * 10^18', () => {
		const exponents = [0n, 1n, 2n, 3n, 6n, 18n, 50n, 100n, 250n]
		for (const k of exponents) {
			assert.equal(log10BigIntSeries(10n ** k), k * SCALE)
		}
	})

	test('matches known 18-digit base-10 logarithm values', () => {
		// log10(2) = 0.30102999566398119521373889...
		assert.equal(log10BigIntSeries(2n), 301029995663981195n)
		// log10(3) = 0.47712125471966243729502790...
		assert.equal(log10BigIntSeries(3n), 477121254719662437n)
		// log10(5) = 0.69897000433601880478626110...
		assert.equal(log10BigIntSeries(5n), 698970004336018805n)
		// log10(7) = 0.84509804001425683071221625...
		assert.equal(log10BigIntSeries(7n), 845098040014256831n)
		// log10(8) = 3 * log10(2) = 0.90308998699194358564121668...
		assert.equal(log10BigIntSeries(8n), 903089986991943586n)
		// log10(9) = 2 * log10(3) = 0.95424250943932487459005580...
		assert.equal(log10BigIntSeries(9n), 954242509439324875n)
	})

	test('edge cases near powers of 10 and very large BigInts', () => {
		// log10(1 + 10^-10) = 10^-10 / ln(10) ≈ 4.3429448190e-11 -> 43429448n
		assert.equal(log10BigIntSeries(10n ** 10n + 1n), 10n * SCALE + 43429448n)

		// log10(10^18 + 1) ≈ 18 + 0.43429e-18 -> rounds to 18 * 10^18
		assert.equal(log10BigIntSeries(10n ** 18n + 1n), 18n * SCALE)

		// log10(10^18 + 2) ≈ 18 + 0.86859e-18 -> rounds to 18 * 10^18 + 1
		assert.equal(log10BigIntSeries(10n ** 18n + 2n), 18n * SCALE + 1n)

		// Extremely close to 10^50 from above and below
		assert.equal(log10BigIntSeries(10n ** 50n + 1n), 50n * SCALE)
		assert.equal(log10BigIntSeries(10n ** 50n - 1n), 50n * SCALE)

		// Huge non-power-of-10: 2^1000 -> 1000 * log10(2) ≈ 301.029995663981195214
		assert.equal(log10BigIntSeries(2n ** 1000n), 301029995663981195214n)
	})

	test('cross-check: logarithm product and power identities', () => {
		const pairs = [
			[2n, 5n],
			[2n, 3n],
			[7n, 13n],
			[123456789n, 987654321n],
			[10n ** 25n + 7n, 3n ** 40n],
			[2n ** 128n - 1n, 5n ** 64n + 3n],
		]

		for (const [a, b] of pairs) {
			const lhs = log10BigIntSeries(a * b)
			const rhs = log10BigIntSeries(a) + log10BigIntSeries(b)
			const diff = lhs >= rhs ? lhs - rhs : rhs - lhs
			assert.ok(
				diff <= 1n,
				`Expected |log10(${a}*${b}) - (log10(${a}) + log10(${b}))| <= 1n, got diff=${diff}`,
			)
		}

		// Power identity: log10(a^m) ≈ m * log10(a)
		const base = 17n
		const logBase = log10BigIntSeries(base)
		for (const m of [2n, 5n, 19n, 64n]) {
			const lhs = log10BigIntSeries(base ** m)
			const rhs = m * logBase
			const diff = lhs >= rhs ? lhs - rhs : rhs - lhs
			assert.ok(
				diff <= m,
				`Expected |log10(${base}^${m}) - ${m}*log10(${base})| <= ${m}, got diff=${diff}`,
			)
		}
	})

	test('cross-check: Math.log10 agreement across IEEE-754 range', () => {
		const values = [
			1n,
			2n,
			3n,
			4n,
			5n,
			6n,
			7n,
			9n,
			11n,
			42n,
			99n,
			101n,
			999n,
			1024n,
			65537n,
			123456789012345n,
			9007199254740991n, // Number.MAX_SAFE_INTEGER
		]

		for (const n of values) {
			const got = Number(log10BigIntSeries(n)) / 1e18
			const expected = Math.log10(Number(n))
			const err = Math.abs(got - expected)
			assert.ok(
				err < 1e-14,
				`For n=${n}, got=${got}, expected=${expected}, err=${err}`,
			)
		}
	})

	test('cross-check: independent pure-integer inequality 10^p <= n^q < 10^(p+1)', () => {
		// Independent of logarithms, series, and floating-point arithmetic:
		// If y = log10BigIntSeries(n) and p = floor(y * q / 10^18),
		// then p/q <= log10(n) < (p+1)/q  <==>  10^p <= n^q < 10^(p+1)
		// (when y * q / 10^18 is not on an exact rounding boundary).
		const q = 500n
		const samples = [2n, 3n, 7n, 19n, 123n, 99991n, 2n ** 64n + 1n]

		for (const n of samples) {
			const y = log10BigIntSeries(n)
			const p = (y * q) / SCALE
			const nPowQ = n ** q
			assert.ok(
				10n ** p <= nPowQ && nPowQ < 10n ** (p + 1n),
				`Integer bracket failed for n=${n}, p=${p}, q=${q}`,
			)
		}
	})

	test('strict monotonicity on consecutive integers', () => {
		let prev = log10BigIntSeries(1n)
		for (let i = 2n; i <= 50n; i++) {
			const curr = log10BigIntSeries(i)
			assert.ok(curr > prev, `Expected log10(${i}) > log10(${i - 1n})`)
			prev = curr
		}
	})

	test('input validation throws TypeError for non-BigInt and RangeError for <= 0n', () => {
		const invalidTypes = [
			1,
			10,
			2.5,
			0,
			-1,
			NaN,
			Infinity,
			-Infinity,
			'10',
			'10n',
			null,
			undefined,
			true,
			false,
			{},
			[],
			Symbol('10'),
		]

		for (const bad of invalidTypes) {
			assert.throws(() => log10BigIntSeries(bad), TypeError)
		}

		const invalidRange = [0n, -1n, -10n, -(10n ** 50n)]
		for (const bad of invalidRange) {
			assert.throws(() => log10BigIntSeries(bad), RangeError)
		}
	})
})
