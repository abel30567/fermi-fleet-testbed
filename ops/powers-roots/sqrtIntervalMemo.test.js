import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
	sqrtIntervalMemo,
	nextDown,
	nextUp,
	getSqrtIntervalMemoStats,
	clearSqrtIntervalMemoCache,
} from './sqrtIntervalMemo.js'

/**
 * Independently decodes a finite non-negative IEEE-754 binary64 number into
 * exact rational dyadic form `m * 2^e` where `m >= 0n` is a BigInt.
 * Uses a standalone DataView independent of the module under test.
 *
 * @param {number} x
 * @returns {{ m: bigint, e: number }}
 */
function decodeBinary64(x) {
	if (x === 0) return { m: 0n, e: 0 }
	const buf = new ArrayBuffer(8)
	const view = new DataView(buf)
	view.setFloat64(0, x, false) // big-endian
	const bits = view.getBigUint64(0, false)
	const sign = Number((bits >> 63n) & 1n)
	if (sign !== 0) throw new Error(`Expected non-negative float, got ${x}`)
	const expBits = Number((bits >> 52n) & 0x7ffn)
	const frac = bits & ((1n << 52n) - 1n)
	if (expBits === 0) {
		// Subnormal: frac * 2^-1074
		return { m: frac, e: -1074 }
	}
	// Normal: (2^52 + frac) * 2^(expBits - 1023 - 52)
	return { m: (1n << 52n) + frac, e: expBits - 1075 }
}

/**
 * Exact BigInt comparison of `a^2` vs `x` for finite non-negative floats `a, x`.
 * Returns -1 if a^2 < x, 0 if a^2 === x, +1 if a^2 > x.
 * Zero floating-point rounding error.
 *
 * @param {number} a
 * @param {number} x
 * @returns {-1 | 0 | 1}
 */
function compareSquareExact(a, x) {
	if (a === 0 && x === 0) return 0
	if (a === 0) return -1
	if (x === 0) return 1

	const da = decodeBinary64(a)
	const dx = decodeBinary64(x)

	// Compare (da.m^2) * 2^(2*da.e) against dx.m * 2^dx.e
	let lhs = da.m * da.m
	let rhs = dx.m
	const expDiff = 2 * da.e - dx.e
	if (expDiff > 0) {
		lhs <<= BigInt(expDiff)
	} else if (expDiff < 0) {
		rhs <<= BigInt(-expDiff)
	}

	if (lhs < rhs) return -1
	if (lhs > rhs) return 1
	return 0
}

/**
 * Independently verifies both soundness (guaranteed enclosure) and optimality
 * (tightest 1-ULP outward rounding) for `sqrtIntervalMemo([xLo, xHi])`.
 *
 * @param {number} xLo
 * @param {number} xHi
 */
function assertOptimalEnclosure(xLo, xHi) {
	const [rLo, rHi] = sqrtIntervalMemo([xLo, xHi])
	assert.equal(typeof rLo, 'number')
	assert.equal(typeof rHi, 'number')
	assert.ok(Number.isFinite(rLo), `rLo must be finite for [${xLo}, ${xHi}]`)
	assert.ok(Number.isFinite(rHi), `rHi must be finite for [${xLo}, ${xHi}]`)
	assert.ok(rLo >= 0, `rLo must be >= 0 for [${xLo}, ${xHi}]`)
	assert.ok(rLo <= rHi, `rLo (${rLo}) must be <= rHi (${rHi}) for [${xLo}, ${xHi}]`)

	// Exact BigInt proof of enclosure: rLo^2 <= xLo and rHi^2 >= xHi
	assert.ok(
		compareSquareExact(rLo, xLo) <= 0,
		`Enclosure failed on lower bound: (${rLo})^2 > ${xLo}`,
	)
	assert.ok(
		compareSquareExact(rHi, xHi) >= 0,
		`Enclosure failed on upper bound: (${rHi})^2 < ${xHi}`,
	)

	// Exact BigInt proof of tightness:
	// nextUp(rLo)^2 > xLo (no larger float <= sqrt(xLo))
	assert.ok(
		compareSquareExact(nextUp(rLo), xLo) > 0,
		`Lower bound not tight: nextUp(${rLo})^2 <= ${xLo}`,
	)
	// For xHi > 0, nextDown(rHi)^2 < xHi (no smaller float >= sqrt(xHi))
	if (xHi > 0) {
		assert.ok(
			compareSquareExact(nextDown(rHi), xHi) < 0,
			`Upper bound not tight: nextDown(${rHi})^2 >= ${xHi}`,
		)
	} else {
		assert.ok(Object.is(rHi, 0))
	}
}

describe('sqrtIntervalMemo', () => {
	beforeEach(() => {
		clearSqrtIntervalMemoCache()
	})

	it('handles zero and negative zero cleanly without returning -0', () => {
		const cases = [
			[0, 0],
			[-0, 0],
			[0, -0],
			[-0, -0],
		]
		for (const interval of cases) {
			const [lo, hi] = sqrtIntervalMemo(interval)
			assert.ok(Object.is(lo, 0), `expected +0 for lo, got ${lo}`)
			assert.ok(Object.is(hi, 0), `expected +0 for hi, got ${hi}`)
		}

		const [lo, hi] = sqrtIntervalMemo([-0, 4])
		assert.ok(Object.is(lo, 0))
		assert.equal(hi, 2)
	})

	it('returns exact point intervals for perfect squares (integer, dyadic, large, subnormal)', () => {
		const exactPairs = [
			[0, 0],
			[1, 1],
			[4, 2],
			[9, 3],
			[16, 4],
			[100, 10],
			[1024, 32],
			[1048576, 1024],
			[1e12, 1e6],
			[0.25, 0.5],
			[0.0625, 0.25],
			[2.25, 1.5],
			[6.25, 2.5],
			[2 ** 52, 2 ** 26],
			[2 ** 1000, 2 ** 500],
			[2 ** -1000, 2 ** -500],
			[Number.MIN_VALUE, 2 ** -537], // 2^-1074 has exact sqrt 2^-537
		]

		for (const [x, expected] of exactPairs) {
			const [lo, hi] = sqrtIntervalMemo([x, x])
			assert.equal(lo, expected, `lo mismatch for ${x}`)
			assert.equal(hi, expected, `hi mismatch for ${x}`)
			assertOptimalEnclosure(x, x)
		}
	})

	it('encloses non-square point intervals with tight 1-ULP outward rounding', () => {
		const nonSquares = [
			2,
			3,
			5,
			7,
			10,
			0.1,
			0.3,
			0.5,
			Math.PI,
			Math.E,
			1e-12,
			1e-13,
			1e13,
			2 * Number.MIN_VALUE,
			3 * Number.MIN_VALUE,
			Number.MAX_VALUE,
			nextDown(Number.MAX_VALUE),
			nextDown(1),
			nextUp(1),
			nextDown(4),
			nextUp(4),
		]

		for (const x of nonSquares) {
			const [lo, hi] = sqrtIntervalMemo([x, x])
			assert.ok(lo < hi, `expected strictly wider interval for non-square ${x}`)
			assert.equal(nextUp(lo), hi, `expected 1-ULP width for non-square ${x}`)
			assertOptimalEnclosure(x, x)
		}
	})

	it('handles normal intervals spanning multiple regimes', () => {
		const intervals = [
			[0, 1],
			[1, 4],
			[2, 3],
			[0.25, 2.25],
			[0.1, 0.9],
			[10, 1000],
			[1e-200, 1e200],
			[Number.MIN_VALUE, Number.MAX_VALUE],
			[0, Number.MAX_VALUE],
			[2 ** -1022 - Number.MIN_VALUE, 2 ** -1022 + Number.MIN_VALUE],
			[2 ** 900, 2 ** 901],
			[2 ** -901, 2 ** -900],
		]

		for (const [xLo, xHi] of intervals) {
			assertOptimalEnclosure(xLo, xHi)
		}
	})

	it('validates nextDown and nextUp at IEEE-754 boundaries', () => {
		assert.equal(nextUp(0), Number.MIN_VALUE)
		assert.equal(nextUp(-0), Number.MIN_VALUE)
		assert.equal(nextDown(0), -Number.MIN_VALUE)
		assert.equal(nextDown(-0), -Number.MIN_VALUE)
		assert.ok(Object.is(nextDown(Number.MIN_VALUE), 0))
		assert.ok(Object.is(nextUp(-Number.MIN_VALUE), 0))
		assert.equal(nextUp(1), 1 + Number.EPSILON)
		assert.equal(nextDown(1), 1 - Number.EPSILON / 2)
		assert.equal(nextUp(Number.MAX_VALUE), Infinity)
		assert.equal(nextDown(Infinity), Number.MAX_VALUE)
		assert.equal(nextUp(-Infinity), -Number.MAX_VALUE)
		assert.equal(nextDown(-Infinity), -Infinity)
		assert.ok(Number.isNaN(nextUp(NaN)))
		assert.ok(Number.isNaN(nextDown(NaN)))
	})

	it('throws RangeError on negative domain inputs', () => {
		const negativeCases = [
			[-1, 4],
			[-4, -1],
			[-Number.MIN_VALUE, 0],
			[-Number.MIN_VALUE, 1],
			[-1e-300, 1e-300],
			[-Number.MAX_VALUE, Number.MAX_VALUE],
		]

		for (const interval of negativeCases) {
			assert.throws(
				() => sqrtIntervalMemo(interval),
				{ name: 'RangeError' },
				`Expected RangeError for ${JSON.stringify(interval)}`,
			)
		}
	})

	it('throws TypeError or RangeError on malformed and invalid inputs', () => {
		const typeErrors = [
			null,
			undefined,
			4,
			'4',
			{ lo: 1, hi: 2 },
			new Float64Array([1, 2]),
			[],
			[1],
			[1, 2, 3],
			['1', 4],
			[1, '4'],
			[null, 4],
			[1, undefined],
			[1n, 4n],
			[true, 4],
		]

		for (const bad of typeErrors) {
			assert.throws(
				() => sqrtIntervalMemo(bad),
				{ name: 'TypeError' },
				`Expected TypeError for ${String(bad)}`,
			)
		}

		const rangeErrors = [
			[4, 1],
			[nextUp(1), 1],
			[NaN, 4],
			[1, NaN],
			[NaN, NaN],
			[0, Infinity],
			[-Infinity, 4],
			[Infinity, Infinity],
			[-Infinity, -Infinity],
		]

		for (const bad of rangeErrors) {
			assert.throws(
				() => sqrtIntervalMemo(bad),
				{ name: 'RangeError' },
				`Expected RangeError for ${JSON.stringify(bad)}`,
			)
		}
	})

	it('uses precomputed integer table, endpoint cache, and interval memoization correctly', () => {
		// 1. Precomputed table hit for integer endpoints in [0, 1024]
		const r1 = sqrtIntervalMemo([2, 1024])
		assert.equal(r1[1], 32)
		let st = getSqrtIntervalMemoStats()
		assert.equal(st.intervalCacheHits, 0)
		assert.equal(st.tableHits, 2)
		assert.equal(st.endpointCacheHits, 0)
		assert.equal(st.computations, 0)
		assert.equal(st.intervalCacheSize, 1)

		// 2. Interval memoization hit on repeated call
		const r2 = sqrtIntervalMemo([2, 1024])
		assert.deepEqual(r2, r1)
		assert.notEqual(r2, r1, 'must return a fresh array copy')
		st = getSqrtIntervalMemoStats()
		assert.equal(st.intervalCacheHits, 1)
		assert.equal(st.tableHits, 2)

		// 3. Mutating returned array must not corrupt cache
		r2[0] = -999
		r2[1] = -999
		const r3 = sqrtIntervalMemo([2, 1024])
		assert.deepEqual(r3, r1)

		// 4. Endpoint memoization across overlapping non-table intervals
		sqrtIntervalMemo([1.5, 2.5])
		st = getSqrtIntervalMemoStats()
		assert.equal(st.computations, 2)
		assert.equal(st.endpointCacheHits, 0)

		sqrtIntervalMemo([1.5, 3.5])
		st = getSqrtIntervalMemoStats()
		assert.equal(st.computations, 3)
		assert.equal(st.endpointCacheHits, 1)

		// 5. 1-ULP adjacent intervals must NOT collide in cache keys
		const a = sqrtIntervalMemo([2, 3])
		const b = sqrtIntervalMemo([2, nextUp(3)])
		assert.ok(b[1] >= a[1])
		assertOptimalEnclosure(2, nextUp(3))
		const c = sqrtIntervalMemo([nextUp(2), 3])
		assert.ok(c[0] >= a[0])
		assertOptimalEnclosure(nextUp(2), 3)

		// 6. Cache clear resets dynamic caches and counters
		clearSqrtIntervalMemoCache()
		st = getSqrtIntervalMemoStats()
		assert.equal(st.intervalCacheSize, 0)
		assert.equal(st.endpointCacheSize, 0)
		assert.equal(st.intervalCacheHits, 0)
		assert.equal(st.tableHits, 0)
	})

	it('bounds memoization cache size via LRU eviction', () => {
		const { maxIntervalCacheSize, maxEndpointCacheSize } = getSqrtIntervalMemoStats()
		const total = maxIntervalCacheSize + 150
		for (let i = 0; i < total; i++) {
			const x = 1025.5 + i
			const [lo, hi] = sqrtIntervalMemo([x, x + 0.25])
			assert.ok(lo * lo <= x)
			assert.ok(hi * hi >= x + 0.25)
		}
		const st = getSqrtIntervalMemoStats()
		assert.equal(st.intervalCacheSize, maxIntervalCacheSize)
		assert.equal(st.endpointCacheSize, maxEndpointCacheSize)
	})

	it('cross-check: every precomputed integer 0..1024 satisfies exact BigInt optimal enclosure', () => {
		for (let n = 0; n <= 1024; n++) {
			assertOptimalEnclosure(n, n)
			const root = Math.round(Math.sqrt(n))
			const [lo, hi] = sqrtIntervalMemo([n, n])
			if (root * root === n) {
				assert.equal(lo, root)
				assert.equal(hi, root)
			} else {
				assert.equal(nextUp(lo), hi)
			}
		}
	})

	it('cross-check: dense point sampling and monotonicity across intervals', () => {
		const testIntervals = [
			[0, 10],
			[0.001, 0.01],
			[1.23456789, 9.87654321],
			[1e-20, 1e-10],
			[1e10, 1e20],
			[999.5, 1050.5],
		]

		const SAMPLES = 250
		for (const [xLo, xHi] of testIntervals) {
			const [rLo, rHi] = sqrtIntervalMemo([xLo, xHi])
			assertOptimalEnclosure(xLo, xHi)

			// Squaring bounds check in standard floating point where safe
			assert.ok(rLo * rLo <= xLo, `rLo^2 <= xLo failed for [${xLo}, ${xHi}]`)
			assert.ok(rHi * rHi >= xHi, `rHi^2 >= xHi failed for [${xLo}, ${xHi}]`)

			for (let i = 0; i <= SAMPLES; i++) {
				const t = i / SAMPLES
				const x = xLo + (xHi - xLo) * t
				const clamped = Math.min(xHi, Math.max(xLo, x))
				const s = Math.sqrt(clamped)
				assert.ok(
					s >= rLo && s <= rHi,
					`Sample sqrt(${clamped})=${s} outside [${rLo}, ${rHi}]`,
				)

				// Inclusion monotonicity for sub-intervals [xLo, clamped] and [clamped, xHi]
				const [subLo1, subHi1] = sqrtIntervalMemo([xLo, clamped])
				assert.ok(subLo1 >= rLo && subHi1 <= rHi)
				const [subLo2, subHi2] = sqrtIntervalMemo([clamped, xHi])
				assert.ok(subLo2 >= rLo && subHi2 <= rHi)
			}
		}
	})
})
