import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { log2BigIntLazy, SCALE } from './log2BigIntLazy.js'

const absBigInt = (x) => (x < 0n ? -x : x)

describe('log2BigIntLazy', () => {
	it('returns exact fixed-point results for powers of two', () => {
		assert.equal(log2BigIntLazy(1n), 0n)
		assert.equal(log2BigIntLazy(2n), 1n * SCALE)
		assert.equal(log2BigIntLazy(4n), 2n * SCALE)
		assert.equal(log2BigIntLazy(8n), 3n * SCALE)
		assert.equal(log2BigIntLazy(1024n), 10n * SCALE)
		assert.equal(log2BigIntLazy(1n << 64n), 64n * SCALE)
		assert.equal(log2BigIntLazy(1n << 256n), 256n * SCALE)
	})

	it('computes high-precision fixed-point values for non-powers of two', () => {
		// Reference values rounded to 18 decimal digits:
		// log2(3)  = 1.5849625007211561814537...
		// log2(5)  = 2.3219280948873623478703...
		// log2(6)  = 2.5849625007211561814537...
		// log2(7)  = 2.8073549220576041074419...
		// log2(9)  = 3.1699250014423123629074...
		// log2(10) = 3.3219280948873623478703...
		assert.equal(log2BigIntLazy(3n), 1_584_962_500_721_156_181n)
		assert.equal(log2BigIntLazy(5n), 2_321_928_094_887_362_348n)
		assert.equal(log2BigIntLazy(6n), 2_584_962_500_721_156_181n)
		assert.equal(log2BigIntLazy(7n), 2_807_354_922_057_604_107n)
		assert.equal(log2BigIntLazy(9n), 3_169_925_001_442_312_363n)
		assert.equal(log2BigIntLazy(10n), 3_321_928_094_887_362_348n)
	})

	it('handles huge BigInts accurately (both powers of two and non-powers)', () => {
		const pow1000 = 1n << 1000n
		assert.equal(log2BigIntLazy(pow1000), 1000n * SCALE)

		const pow10000 = 1n << 10000n
		assert.equal(log2BigIntLazy(pow10000), 10000n * SCALE)

		// 3 * 2^5000 => log2 = 5000 + log2(3)
		const threeTimesHugePow = 3n << 5000n
		assert.equal(
			log2BigIntLazy(threeTimesHugePow),
			5000n * SCALE + 1_584_962_500_721_156_181n
		)

		// 10^1000 => log2 = 1000 * log2(10) = 3321.9280948873623478703194...
		const tenPow1000 = 10n ** 1000n
		assert.equal(log2BigIntLazy(tenPow1000), 3321_928_094_887_362_347_870n)

		// 2^500 - 1 is within 2^-500 of 2^500, so rounded to 10^-18 it equals 500 * SCALE
		assert.equal(log2BigIntLazy((1n << 500n) - 1n), 500n * SCALE)

		// 2^10000 + 2^9940 = 2^10000 * (1 + 2^-60)
		// log2(1 + 2^-60) ≈ 2^-60 / ln(2) ≈ 1.2512e-18 -> rounds to +1n
		assert.equal(
			log2BigIntLazy((1n << 10000n) + (1n << 9940n)),
			10000n * SCALE + 1n
		)
	})

	it('supports custom fixed-point scale option', () => {
		assert.equal(log2BigIntLazy(8n, { scale: 1n }), 3n)
		assert.equal(log2BigIntLazy(3n, { scale: 1_000_000n }), 1_584_963n)
		assert.equal(
			log2BigIntLazy(3n, { scale: 10n ** 30n }),
			1_584_962_500_721_156_181_453_738_943_948n
		)
	})

	it('throws RangeError for zero and negative BigInts', () => {
		assert.throws(() => log2BigIntLazy(0n), RangeError)
		assert.throws(() => log2BigIntLazy(-1n), RangeError)
		assert.throws(() => log2BigIntLazy(-1024n), RangeError)
		assert.throws(() => log2BigIntLazy(-(1n << 200n)), RangeError)
	})

	it('throws TypeError for invalid input types and invalid options', () => {
		assert.throws(() => log2BigIntLazy(8), TypeError)
		assert.throws(() => log2BigIntLazy('8'), TypeError)
		assert.throws(() => log2BigIntLazy('1234'), TypeError)
		assert.throws(() => log2BigIntLazy(null), TypeError)
		assert.throws(() => log2BigIntLazy(undefined), TypeError)
		assert.throws(() => log2BigIntLazy(true), TypeError)
		assert.throws(() => log2BigIntLazy({}), TypeError)
		assert.throws(() => log2BigIntLazy(NaN), TypeError)

		// Invalid options fail eagerly even for iterable inputs
		assert.throws(() => log2BigIntLazy([1n, 2n], null), TypeError)
		assert.throws(() => log2BigIntLazy([1n, 2n], []), TypeError)
		assert.throws(() => log2BigIntLazy([1n, 2n], { scale: 10 }), TypeError)
		assert.throws(() => log2BigIntLazy([1n, 2n], { scale: 0n }), RangeError)
		assert.throws(() => log2BigIntLazy([1n, 2n], { scale: -10n }), RangeError)
	})

	it('consumes iterables and infinite generators strictly lazily', () => {
		let produced = 0
		function* infinitePowersOfTwo() {
			let value = 1n
			while (true) {
				produced++
				yield value
				value <<= 1n
			}
		}

		const stream = log2BigIntLazy(infinitePowersOfTwo())
		// Nothing pulled before first .next()
		assert.equal(produced, 0)

		assert.deepEqual(stream.next(), { value: 0n, done: false })
		assert.equal(produced, 1)

		assert.deepEqual(stream.next(), { value: 1n * SCALE, done: false })
		assert.equal(produced, 2)

		assert.deepEqual(stream.next(), { value: 2n * SCALE, done: false })
		assert.equal(produced, 3)

		// Works with empty iterable, Set, and BigUint64Array
		assert.deepEqual([...log2BigIntLazy([])], [])
		assert.deepEqual(
			[...log2BigIntLazy(new Set([1n, 2n, 4n, 8n]))],
			[0n, 1n * SCALE, 2n * SCALE, 3n * SCALE]
		)
		assert.deepEqual(
			[...log2BigIntLazy(new BigUint64Array([1n, 16n, 64n]))],
			[0n, 4n * SCALE, 6n * SCALE]
		)
	})

	it('validates elements lazily during iterable consumption', () => {
		let pulled = 0
		function* sourceWithInvalidTail() {
			pulled++
			yield 2n
			pulled++
			yield 4n
			pulled++
			yield 0n
			pulled++
			yield 8n
		}

		const gen = log2BigIntLazy(sourceWithInvalidTail())
		assert.equal(gen.next().value, 1n * SCALE)
		assert.equal(pulled, 1)
		assert.equal(gen.next().value, 2n * SCALE)
		assert.equal(pulled, 2)
		assert.throws(() => gen.next(), RangeError)
		assert.equal(pulled, 3)

		const badTypeGen = log2BigIntLazy([1n, 'not-a-bigint'])
		assert.equal(badTypeGen.next().value, 0n)
		assert.throws(() => badTypeGen.next(), TypeError)
	})

	it('cross-checks log2(a * b) ≈ log2(a) + log2(b) across small and huge BigInts', () => {
		const pairs = [
			[3n, 5n],
			[7n, 11n],
			[13n, 17n],
			[123456789n, 987654321n],
			[(1n << 100n) + 7n, (1n << 150n) + 19n],
			[10n ** 50n + 3n, 10n ** 80n + 7n],
			[(1n << 1000n) + 123456789n, (1n << 2000n) + 987654321n]
		]

		for (const [a, b] of pairs) {
			const lhs = log2BigIntLazy(a * b)
			const rhs = log2BigIntLazy(a) + log2BigIntLazy(b)
			// Independent rounding of log2(a), log2(b), and log2(a*b) can differ by at most 1 ULP
			assert.ok(
				absBigInt(lhs - rhs) <= 1n,
				`Expected |log2(${a}*${b}) - (log2(${a}) + log2(${b}))| <= 1n, got diff=${lhs - rhs}`
			)
		}
	})

	it('cross-checks against Math.log2 across a broad range of safe integers', () => {
		const samples = [
			1n,
			2n,
			3n,
			5n,
			7n,
			10n,
			15n,
			17n,
			42n,
			99n,
			100n,
			255n,
			257n,
			1000n,
			65535n,
			123456789n,
			9007199254740991n // Number.MAX_SAFE_INTEGER
		]

		const results = [...log2BigIntLazy(samples)]
		for (let i = 0; i < samples.length; i++) {
			const n = samples[i]
			const approxFromBigInt = Number(results[i]) / Number(SCALE)
			const expected = Math.log2(Number(n))
			assert.ok(
				Math.abs(approxFromBigInt - expected) < 1e-13,
				`Mismatch for ${n}: got ${approxFromBigInt}, Math.log2=${expected}`
			)
		}
	})
})
