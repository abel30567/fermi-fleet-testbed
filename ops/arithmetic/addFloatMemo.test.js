import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { addFloatMemo, createAddFloatMemo } from './addFloatMemo.js'

/**
 * Independent IEEE-754 binary64 addition implemented from raw 64-bit bit patterns
 * using exact arbitrary-precision BigInt arithmetic and round-to-nearest-ties-to-even.
 * Does not use JavaScript's `+` operator on floating-point values.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function referenceIeee754Add(a, b) {
	const buf = new ArrayBuffer(8)
	const f64 = new Float64Array(buf)
	const u64 = new BigUint64Array(buf)

	const toBits = (x) => {
		f64[0] = x
		return u64[0]
	}
	const fromBits = (bits) => {
		u64[0] = bits
		return f64[0]
	}

	const unpack = (x) => {
		const bits = toBits(x)
		const sign = bits >> 63n
		const exp = Number((bits >> 52n) & 0x7ffn)
		const frac = bits & 0xfffffffffffffn
		return { sign, exp, frac }
	}

	const ua = unpack(a)
	const ub = unpack(b)

	// NaN
	if ((ua.exp === 0x7ff && ua.frac !== 0n) || (ub.exp === 0x7ff && ub.frac !== 0n)) {
		return NaN
	}
	// Infinities
	if (ua.exp === 0x7ff && ub.exp === 0x7ff) {
		return ua.sign === ub.sign ? a : NaN
	}
	if (ua.exp === 0x7ff) return a
	if (ub.exp === 0x7ff) return b

	// Zeros
	const aZero = ua.exp === 0 && ua.frac === 0n
	const bZero = ub.exp === 0 && ub.frac === 0n
	if (aZero && bZero) {
		return ua.sign === 1n && ub.sign === 1n ? -0 : +0
	}
	if (aZero) return b
	if (bZero) return a

	// Exact binary significand * 2^e
	const toExact = ({ sign, exp, frac }) => {
		const mag = exp === 0 ? frac : (1n << 52n) | frac
		const m = sign === 1n ? -mag : mag
		const e = exp === 0 ? -1074 : exp - 1075
		return { m, e }
	}

	const ea = toExact(ua)
	const eb = toExact(ub)
	const eMin = Math.min(ea.e, eb.e)
	const exactM =
		(ea.m << BigInt(ea.e - eMin)) + (eb.m << BigInt(eb.e - eMin))

	// Exact cancellation yields +0 in IEEE-754 roundTiesToEven
	if (exactM === 0n) return +0

	const outSign = exactM < 0n ? 1n : 0n
	const absM = exactM < 0n ? -exactM : exactM
	const bitLen = absM.toString(2).length
	const unbiasedExp = eMin + bitLen - 1

	let targetExp = Math.max(unbiasedExp - 52, -1074)
	const shift = targetExp - eMin

	let sig
	if (shift <= 0) {
		sig = absM << BigInt(-shift)
	} else {
		const q = absM >> BigInt(shift)
		const rem = absM & ((1n << BigInt(shift)) - 1n)
		const half = 1n << BigInt(shift - 1)
		const roundUp = rem > half || (rem === half && (q & 1n) === 1n)
		sig = roundUp ? q + 1n : q
	}

	if (sig === 1n << 53n) {
		sig >>= 1n
		targetExp += 1
	}

	let expBits
	let fracBits
	if (targetExp === -1074 && sig < 1n << 52n) {
		expBits = 0n
		fracBits = sig
	} else {
		const biasedExp = targetExp + 1075
		if (biasedExp >= 0x7ff) {
			expBits = 0x7ffn
			fracBits = 0n
		} else {
			expBits = BigInt(biasedExp)
			fracBits = sig & 0xfffffffffffffn
		}
	}

	return fromBits((outSign << 63n) | (expBits << 52n) | fracBits)
}

/**
 * Asserts bit-exact IEEE-754 equality (including distinguishing +0 from -0 and matching NaN).
 */
function assertBitEqual(actual, expected, message) {
	if (Number.isNaN(expected)) {
		assert.equal(Number.isNaN(actual), true, message ?? `Expected NaN, got ${actual}`)
		return
	}
	assert.equal(
		Object.is(actual, expected),
		true,
		message ?? `Expected ${Object.is(expected, -0) ? '-0' : expected}, got ${Object.is(actual, -0) ? '-0' : actual}`,
	)
}

describe('addFloatMemo', () => {
	beforeEach(() => {
		addFloatMemo.clearCache()
	})

	describe('normal cases', () => {
		it('adds small positive and negative integers from the precomputed table', () => {
			assert.equal(addFloatMemo(2, 3), 5)
			assert.equal(addFloatMemo(-10, 4), -6)
			assert.equal(addFloatMemo(-64, 64), 0)
			assert.equal(addFloatMemo(64, 64), 128)
			assert.equal(addFloatMemo(-64, -64), -128)
		})

		it('adds decimal floating-point values accurately per IEEE-754', () => {
			assert.equal(addFloatMemo(0.1, 0.2), 0.1 + 0.2)
			assert.equal(addFloatMemo(1.5, 2.25), 3.75)
			assert.equal(addFloatMemo(-3.14159, 2.71828), -3.14159 + 2.71828)
			assert.equal(addFloatMemo(1000.125, -0.125), 1000)
		})

		it('handles cancellation to +0 for opposite non-zero operands', () => {
			assertBitEqual(addFloatMemo(42, -42), +0)
			assertBitEqual(addFloatMemo(-42, 42), +0)
			assertBitEqual(addFloatMemo(3.5, -3.5), +0)
			assertBitEqual(addFloatMemo(-1e-300, 1e-300), +0)
		})
	})

	describe('edge cases', () => {
		it('preserves IEEE-754 signed zero semantics', () => {
			assertBitEqual(addFloatMemo(+0, +0), +0)
			assertBitEqual(addFloatMemo(+0, -0), +0)
			assertBitEqual(addFloatMemo(-0, +0), +0)
			assertBitEqual(addFloatMemo(-0, -0), -0)
			assertBitEqual(addFloatMemo(-0, 5), 5)
			assertBitEqual(addFloatMemo(5, -0), 5)
			assertBitEqual(addFloatMemo(-0, -5), -5)
			assertBitEqual(addFloatMemo(+0, -Number.MIN_VALUE), -Number.MIN_VALUE)
			assertBitEqual(addFloatMemo(-0, Number.MIN_VALUE), Number.MIN_VALUE)
		})

		it('handles Infinity and -Infinity correctly', () => {
			assertBitEqual(addFloatMemo(Infinity, 1), Infinity)
			assertBitEqual(addFloatMemo(1, Infinity), Infinity)
			assertBitEqual(addFloatMemo(-Infinity, 1), -Infinity)
			assertBitEqual(addFloatMemo(1, -Infinity), -Infinity)
			assertBitEqual(addFloatMemo(Infinity, Infinity), Infinity)
			assertBitEqual(addFloatMemo(-Infinity, -Infinity), -Infinity)
			assertBitEqual(addFloatMemo(Infinity, -Infinity), NaN)
			assertBitEqual(addFloatMemo(-Infinity, Infinity), NaN)
			assertBitEqual(addFloatMemo(Infinity, +0), Infinity)
			assertBitEqual(addFloatMemo(Infinity, -0), Infinity)
			assertBitEqual(addFloatMemo(-Infinity, +0), -Infinity)
			assertBitEqual(addFloatMemo(-Infinity, -0), -Infinity)
		})

		it('propagates NaN in all combinations', () => {
			assertBitEqual(addFloatMemo(NaN, 0), NaN)
			assertBitEqual(addFloatMemo(0, NaN), NaN)
			assertBitEqual(addFloatMemo(NaN, -0), NaN)
			assertBitEqual(addFloatMemo(NaN, 123.456), NaN)
			assertBitEqual(addFloatMemo(123.456, NaN), NaN)
			assertBitEqual(addFloatMemo(NaN, Infinity), NaN)
			assertBitEqual(addFloatMemo(-Infinity, NaN), NaN)
			assertBitEqual(addFloatMemo(NaN, NaN), NaN)
		})

		it('handles subnormal numbers accurately including carry into normal range', () => {
			const minSub = Number.MIN_VALUE // 2^-1074
			const maxSub = 2.225073858507201e-308 // (2^52 - 1) * 2^-1074
			const minNormal = 2.2250738585072014e-308 // 2^-1022

			assertBitEqual(addFloatMemo(minSub, minSub), minSub * 2)
			assertBitEqual(addFloatMemo(minSub, -minSub), +0)
			assertBitEqual(addFloatMemo(maxSub, minSub), minNormal)
			assertBitEqual(addFloatMemo(-maxSub, -minSub), -minNormal)
			assertBitEqual(addFloatMemo(minSub, 1), 1)
		})

		it('handles large floats, precision limits, and overflow to ±Infinity', () => {
			assertBitEqual(addFloatMemo(Number.MAX_VALUE, Number.MAX_VALUE), Infinity)
			assertBitEqual(addFloatMemo(-Number.MAX_VALUE, -Number.MAX_VALUE), -Infinity)
			assertBitEqual(addFloatMemo(Number.MAX_VALUE, -Number.MAX_VALUE), +0)
			assertBitEqual(addFloatMemo(Number.MAX_VALUE, 1), Number.MAX_VALUE)
			assertBitEqual(addFloatMemo(Number.MAX_SAFE_INTEGER, 1), 9007199254740992)
			// Round-to-nearest-ties-to-even at 2^53: 2^53 + 1 rounds to 2^53 (even), 2^53 + 3 rounds to 2^53 + 4 (even)
			assertBitEqual(addFloatMemo(9007199254740992, 1), 9007199254740992)
			assertBitEqual(addFloatMemo(9007199254740992, 3), 9007199254740996)
		})
	})

	describe('table-driven and memoization behavior', () => {
		it('routes special values to the special table and small integers to the integer table', () => {
			addFloatMemo(NaN, 1)
			addFloatMemo(-0, -0)
			addFloatMemo(Infinity, -Infinity)
			addFloatMemo(12, -7)
			addFloatMemo(-64, 64)

			const stats = addFloatMemo.getStats()
			assert.equal(stats.specialTableHits, 3)
			assert.equal(stats.intTableHits, 2)
			assert.equal(stats.cacheHits, 0)
			assert.equal(stats.cacheMisses, 0)
			assert.equal(stats.cacheSize, 0)
		})

		it('memoizes general float64 pairs and shares entries across commutative operand order', () => {
			const r1 = addFloatMemo(1.25, 3.75)
			assert.equal(r1, 5)
			assert.equal(addFloatMemo.getStats().cacheMisses, 1)
			assert.equal(addFloatMemo.getStats().cacheHits, 0)

			// Exact repeat hits cache
			const r2 = addFloatMemo(1.25, 3.75)
			assert.equal(r2, 5)
			assert.equal(addFloatMemo.getStats().cacheHits, 1)

			// Reversed operand order hits the same canonical cache entry
			const r3 = addFloatMemo(3.75, 1.25)
			assert.equal(r3, 5)
			assert.equal(addFloatMemo.getStats().cacheHits, 2)
			assert.equal(addFloatMemo.getStats().cacheSize, 1)
		})

		it('distinguishes closely spaced floats and distinct bit patterns in cache keys', () => {
			const a = 1.0
			const b = 1.0 + Number.EPSILON
			const r1 = addFloatMemo(a, 0.5)
			const r2 = addFloatMemo(b, 0.5)
			assert.notEqual(r1, r2)
			assert.equal(addFloatMemo.getStats().cacheSize, 2)
			assert.equal(addFloatMemo.getStats().cacheMisses, 2)
		})

		it('enforces bounded LRU eviction correctly', () => {
			const memo = createAddFloatMemo({ maxCacheSize: 2 })

			memo(1.1, 2.2) // miss, cache: [(1.1,2.2)]
			memo(3.3, 4.4) // miss, cache: [(1.1,2.2), (3.3,4.4)]
			memo(1.1, 2.2) // hit (refreshes recency), cache: [(3.3,4.4), (1.1,2.2)]
			memo(5.5, 6.6) // miss (evicts (3.3,4.4)), cache: [(1.1,2.2), (5.5,6.6)]

			let stats = memo.getStats()
			assert.equal(stats.cacheSize, 2)
			assert.equal(stats.cacheMisses, 3)
			assert.equal(stats.cacheHits, 1)
			assert.equal(stats.evictions, 1)

			// (1.1, 2.2) must still be cached
			memo(1.1, 2.2)
			assert.equal(memo.getStats().cacheHits, 2)

			// (3.3, 4.4) was evicted, so calling it again is a miss
			memo(3.3, 4.4)
			stats = memo.getStats()
			assert.equal(stats.cacheMisses, 4)
			assert.equal(stats.evictions, 2)
		})

		it('supports maxCacheSize = 0 (table-only mode without caching)', () => {
			const memo = createAddFloatMemo({ maxCacheSize: 0 })
			assert.equal(memo(1.5, 2.5), 4)
			assert.equal(memo(1.5, 2.5), 4)
			const stats = memo.getStats()
			assert.equal(stats.cacheSize, 0)
			assert.equal(stats.cacheMisses, 2)
			assert.equal(stats.cacheHits, 0)
		})

		it('clears cache and resets stats via clearCache()', () => {
			addFloatMemo(1.25, 2.5)
			addFloatMemo(1.25, 2.5)
			assert.equal(addFloatMemo.getStats().cacheSize, 1)
			addFloatMemo.clearCache()
			const stats = addFloatMemo.getStats()
			assert.deepEqual(stats, {
				specialTableHits: 0,
				intTableHits: 0,
				cacheHits: 0,
				cacheMisses: 0,
				evictions: 0,
				cacheSize: 0,
				maxCacheSize: 4096,
			})
		})
	})

	describe('input validation', () => {
		const invalidInputs = [
			['undefined', undefined],
			['null', null],
			['string', '1.5'],
			['boolean', true],
			['bigint', 1n],
			['object', {}],
			['array', [1]],
			['boxed Number', new Number(1)],
			['symbol', Symbol('x')],
			['function', () => 1],
		]

		for (const [label, badValue] of invalidInputs) {
			it(`throws TypeError when first operand is ${label}`, () => {
				assert.throws(() => addFloatMemo(badValue, 1), TypeError)
			})

			it(`throws TypeError when second operand is ${label}`, () => {
				assert.throws(() => addFloatMemo(1, badValue), TypeError)
			})
		}

		it('throws TypeError when called with missing arguments', () => {
			assert.throws(() => addFloatMemo(), TypeError)
			assert.throws(() => addFloatMemo(1), TypeError)
		})

		it('validates createAddFloatMemo options', () => {
			assert.throws(() => createAddFloatMemo(null), TypeError)
			assert.throws(() => createAddFloatMemo('bad'), TypeError)
			assert.throws(() => createAddFloatMemo({ maxCacheSize: '10' }), TypeError)
			assert.throws(() => createAddFloatMemo({ maxCacheSize: -1 }), RangeError)
			assert.throws(() => createAddFloatMemo({ maxCacheSize: 1.5 }), RangeError)
			assert.throws(() => createAddFloatMemo({ maxCacheSize: Infinity }), RangeError)
			assert.throws(() => createAddFloatMemo({ maxCacheSize: NaN }), RangeError)
		})
	})

	describe('independent cross-check against BigInt IEEE-754 reference adder', () => {
		it('matches bit-for-bit across a comprehensive matrix of float64 values', () => {
			const samples = [
				NaN,
				Infinity,
				-Infinity,
				+0,
				-0,
				Number.MIN_VALUE,
				-Number.MIN_VALUE,
				Number.MIN_VALUE * 3,
				2.225073858507201e-308, // max subnormal
				-2.225073858507201e-308,
				2.2250738585072014e-308, // min normal
				-2.2250738585072014e-308,
				1e-100,
				-1e-100,
				0.1,
				0.2,
				-0.3,
				1,
				-1,
				1 + Number.EPSILON,
				64,
				-64,
				65,
				-65,
				Math.PI,
				-Math.E,
				9007199254740991, // MAX_SAFE_INTEGER
				9007199254740992, // 2^53
				9007199254740993,
				1e150,
				-1e150,
				Number.MAX_VALUE / 2,
				Number.MAX_VALUE,
				-Number.MAX_VALUE,
			]

			for (const a of samples) {
				for (const b of samples) {
					const expected = referenceIeee754Add(a, b)
					const actual = addFloatMemo(a, b)
					const commuted = addFloatMemo(b, a)
					assertBitEqual(actual, expected, `Mismatch for (${a}, ${b})`)
					assertBitEqual(commuted, expected, `Commutativity mismatch for (${b}, ${a})`)
				}
			}
		})

		it('matches bit-for-bit across deterministic pseudo-random IEEE-754 bit patterns', () => {
			const buf = new ArrayBuffer(8)
			const f64 = new Float64Array(buf)
			const u64 = new BigUint64Array(buf)

			// Deterministic SplitMix64 PRNG
			let state = 0x123456789abcdef0n
			const nextU64 = () => {
				state = (state + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn
				let z = state
				z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn
				z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn
				return (z ^ (z >> 31n)) & 0xffffffffffffffffn
			}

			for (let i = 0; i < 500; i += 1) {
				u64[0] = nextU64()
				const a = f64[0]
				u64[0] = nextU64()
				const b = f64[0]

				const expected = referenceIeee754Add(a, b)
				const actual = addFloatMemo(a, b)
				assertBitEqual(actual, expected, `Random pair #${i} mismatch for (${a}, ${b})`)
			}
		})
	})
})
