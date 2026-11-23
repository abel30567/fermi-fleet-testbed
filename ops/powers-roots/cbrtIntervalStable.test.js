import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cbrtIntervalStable } from './cbrtIntervalStable.js'

const buf = new ArrayBuffer(8)
const view = new DataView(buf)

/**
 * Converts a finite binary64 number into its exact dyadic rational `mantissa * 2^exp`.
 * Completely independent of the floating-point arithmetic used in the implementation.
 * @param {number} x
 * @returns {{ m: bigint, e: number }}
 */
function toExactDyadic(x) {
	if (x === 0) return { m: 0n, e: 0 }
	view.setFloat64(0, x, false)
	const bits = view.getBigUint64(0, false)
	const sign = (bits >> 63n) === 1n ? -1n : 1n
	const biasedExp = Number((bits >> 52n) & 0x7ffn)
	const frac = bits & 0x000fffffffffffffn
	if (biasedExp === 0) {
		// Subnormal: value = sign * frac * 2^(-1074)
		return { m: sign * frac, e: -1074 }
	}
	// Normal: value = sign * (2^52 + frac) * 2^(biasedExp - 1023 - 52)
	return { m: sign * ((1n << 52n) + frac), e: biasedExp - 1075 }
}

/**
 * Exact BigInt comparison of `y^3` against `x` for finite binary64 `y` and `x`.
 * Returns -1 if `y^3 < x`, 0 if `y^3 === x`, 1 if `y^3 > x`.
 * @param {number} y
 * @param {number} x
 * @returns {-1 | 0 | 1}
 */
function exactCompareCubeBigInt(y, x) {
	const dy = toExactDyadic(y)
	const dx = toExactDyadic(x)
	const lhsM = dy.m * dy.m * dy.m
	const lhsE = 3 * dy.e
	const rhsM = dx.m
	const rhsE = dx.e

	if (lhsM === 0n && rhsM === 0n) return 0
	if (lhsM === 0n) return rhsM > 0n ? -1 : 1
	if (rhsM === 0n) return lhsM > 0n ? 1 : -1

	let a = lhsM
	let b = rhsM
	if (lhsE > rhsE) {
		a <<= BigInt(lhsE - rhsE)
	} else if (rhsE > lhsE) {
		b <<= BigInt(rhsE - lhsE)
	}
	if (a < b) return -1
	if (a > b) return 1
	return 0
}

/**
 * Returns the adjacent IEEE-754 binary64 float toward +Infinity.
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
	if (x === Infinity || Number.isNaN(x)) return x
	if (x === -Infinity) return -Number.MAX_VALUE
	if (x === 0) return Number.MIN_VALUE
	view.setFloat64(0, x, false)
	const bits = view.getBigUint64(0, false)
	const nextBits = x > 0 ? bits + 1n : bits - 1n
	view.setBigUint64(0, nextBits, false)
	return view.getFloat64(0, false)
}

/**
 * Returns the adjacent IEEE-754 binary64 float toward -Infinity.
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
	return -nextUp(-x)
}

/**
 * Asserts via the independent BigInt oracle that `[outLo, outHi]` is both a sound
 * AND optimally tight outward-rounded enclosure of `cbrt([lo, hi])`.
 * @param {[number, number]} input
 */
function assertOptimalEnclosure(input) {
	const [lo, hi] = input
	const [outLo, outHi] = cbrtIntervalStable(input)

	assert.ok(outLo <= outHi, `expected outLo (${outLo}) <= outHi (${outHi}) for [${lo}, ${hi}]`)

	if (Number.isFinite(lo)) {
		assert.ok(
			exactCompareCubeBigInt(outLo, lo) <= 0,
			`lower bound enclosure failed: (${outLo})^3 > ${lo}`,
		)
		assert.ok(
			exactCompareCubeBigInt(nextUp(outLo), lo) > 0,
			`lower bound not tight: nextUp(${outLo})^3 <= ${lo}`,
		)
	} else {
		assert.equal(outLo, lo)
	}

	if (Number.isFinite(hi)) {
		assert.ok(
			exactCompareCubeBigInt(outHi, hi) >= 0,
			`upper bound enclosure failed: (${outHi})^3 < ${hi}`,
		)
		assert.ok(
			exactCompareCubeBigInt(nextDown(outHi), hi) < 0,
			`upper bound not tight: nextDown(${outHi})^3 >= ${hi}`,
		)
	} else {
		assert.equal(outHi, hi)
	}
}

describe('cbrtIntervalStable', () => {
	it('returns exact point intervals for exact binary64 cubes', () => {
		const exactCases = [
			[0, 0],
			[1, 1],
			[-1, -1],
			[8, 2],
			[-8, -2],
			[27, 3],
			[-27, -3],
			[64, 4],
			[1000, 10],
			[-1000, -10],
			[0.125, 0.5],
			[-0.125, -0.5],
			[2 ** 300, 2 ** 100],
			[-(2 ** 300), -(2 ** 100)],
			[2 ** -300, 2 ** -100],
			[2 ** 1023, 2 ** 341],
			[Number.MIN_VALUE, 2 ** -358], // 2^-1074 = (2^-358)^3
			[-Number.MIN_VALUE, -(2 ** -358)],
		]

		for (const [x, root] of exactCases) {
			assert.deepEqual(cbrtIntervalStable([x, x]), [root, root])
			assertOptimalEnclosure([x, x])
		}
	})

	it('normalizes negative zero to positive zero', () => {
		const [lo, hi] = cbrtIntervalStable([-0, -0])
		assert.ok(Object.is(lo, 0))
		assert.ok(Object.is(hi, 0))

		const [lo2, hi2] = cbrtIntervalStable([-0, 8])
		assert.ok(Object.is(lo2, 0))
		assert.equal(hi2, 2)

		const [lo3, hi3] = cbrtIntervalStable([-8, -0])
		assert.equal(lo3, -2)
		assert.ok(Object.is(hi3, 0))
	})

	it('encloses non-cube point intervals tightly within 1 ULP', () => {
		const nonCubes = [
			2, -2, 3, -3, 0.1, -0.1, 0.001, -0.001,
			Math.PI, -Math.PI, Math.E,
			1 + Number.EPSILON, 1 - Number.EPSILON / 2,
			nextDown(8), nextUp(8),
			nextDown(27), nextUp(27),
			Number.MAX_VALUE, -Number.MAX_VALUE,
			Number.EPSILON, -Number.EPSILON,
			2 * Number.MIN_VALUE, -2 * Number.MIN_VALUE,
			(1 - 2 ** -52) * 2 ** -1022, // largest subnormal
			-((1 - 2 ** -52) * 2 ** -1022),
		]

		for (const x of nonCubes) {
			const [lo, hi] = cbrtIntervalStable([x, x])
			assert.equal(hi, nextUp(lo), `expected 1-ULP tight bracket for non-cube ${x}`)
			assertOptimalEnclosure([x, x])
		}
	})

	it('handles wide intervals, negative intervals, and intervals spanning zero', () => {
		const intervals = [
			[8, 27],
			[-27, -8],
			[-27, 8],
			[-8, 27],
			[-1, 1],
			[-2, 3],
			[0.1, 0.2],
			[-0.2, -0.1],
			[-Number.MAX_VALUE, Number.MAX_VALUE],
			[-Number.MIN_VALUE, Number.MIN_VALUE],
			[0, Number.MIN_VALUE],
			[-Number.MIN_VALUE, 0],
			[Number.MIN_VALUE, Number.MAX_VALUE],
		]

		for (const iv of intervals) {
			assertOptimalEnclosure(iv)
		}

		assert.deepEqual(cbrtIntervalStable([8, 27]), [2, 3])
		assert.deepEqual(cbrtIntervalStable([-27, -8]), [-3, -2])
		assert.deepEqual(cbrtIntervalStable([-27, 8]), [-3, 2])
	})

	it('handles infinite bounds correctly', () => {
		assert.deepEqual(cbrtIntervalStable([-Infinity, Infinity]), [-Infinity, Infinity])
		assert.deepEqual(cbrtIntervalStable([-Infinity, 0]), [-Infinity, 0])
		assert.deepEqual(cbrtIntervalStable([0, Infinity]), [0, Infinity])
		assert.deepEqual(cbrtIntervalStable([-Infinity, 8]), [-Infinity, 2])
		assert.deepEqual(cbrtIntervalStable([-27, Infinity]), [-3, Infinity])
		assert.deepEqual(cbrtIntervalStable([-Infinity, -Infinity]), [-Infinity, -Infinity])
		assert.deepEqual(cbrtIntervalStable([Infinity, Infinity]), [Infinity, Infinity])
		assertOptimalEnclosure([-Infinity, 2])
		assertOptimalEnclosure([-2, Infinity])
	})

	it('handles hard-to-round values adjacent to exact cubes of 53-bit floats', () => {
		// Values whose cube root lies extraordinarily close to a binary64 float or midpoint.
		const roots = [
			1 + Number.EPSILON,
			1 + 3 * Number.EPSILON,
			nextDown(2),
			1.2599210498948732, // near cbrt(2)
			1.4422495703074083, // near cbrt(3)
			1.5,
			1.75,
			2 ** -100 * (1 + Number.EPSILON),
			2 ** 100 * (1 + Number.EPSILON),
		]

		for (const r of roots) {
			const c = r * r * r
			if (!Number.isFinite(c) || c === 0) continue
			for (const x of [nextDown(c), c, nextUp(c), -nextUp(c), -c, -nextDown(c)]) {
				assertOptimalEnclosure([x, x])
			}
		}
	})

	it('satisfies odd symmetry and inclusion isotonicity', () => {
		const pairs = [
			[[1, 5], [0, 10]],
			[[-3, 2], [-8, 27]],
			[[-100, -50], [-1000, -1]],
			[[Number.MIN_VALUE, 1e-300], [0, 1]],
		]

		for (const [inner, outer] of pairs) {
			const [inLo, inHi] = cbrtIntervalStable(inner)
			const [outLo, outHi] = cbrtIntervalStable(outer)
			assert.ok(outLo <= inLo && inHi <= outHi, 'inclusion isotonicity must hold')

			const [symLo, symHi] = cbrtIntervalStable([-inner[1], -inner[0]])
			assert.equal(symLo, -inHi)
			assert.equal(symHi, -inLo)
		}
	})

	it('cross-checks a deterministic sweep across all exponent regimes against exact BigInt oracle', () => {
		// Deterministic xorshift64* PRNG for reproducible full-range coverage
		let state = 0x9e3779b97f4a7c15n
		function nextU64() {
			state ^= state >> 12n
			state ^= (state << 25n) & 0xffffffffffffffffn
			state ^= state >> 27n
			return (state * 0x2545f4914f6cdd1dn) & 0xffffffffffffffffn
		}

		// Sweep exponents from subnormal (-1074) up to max normal (1023)
		const samples = []
		for (let exp = -1074; exp <= 1023; exp += 13) {
			const mant = nextU64() & 0x000fffffffffffffn
			let val
			if (exp < -1022) {
				// Subnormal
				const subBits = 1n << BigInt(exp + 1074)
				const mixed = subBits | (mant & (subBits - 1n))
				view.setBigUint64(0, mixed, false)
				val = view.getFloat64(0, false)
			} else {
				const bits = (BigInt(exp + 1023) << 52n) | mant
				view.setBigUint64(0, bits, false)
				val = view.getFloat64(0, false)
			}
			samples.push(val, -val)
		}

		for (const x of samples) {
			assertOptimalEnclosure([x, x])
		}

		// Also test 100 random non-degenerate intervals across the samples
		for (let i = 0; i < 100; i++) {
			const a = samples[Number(nextU64() % BigInt(samples.length))]
			const b = samples[Number(nextU64() % BigInt(samples.length))]
			assertOptimalEnclosure(a <= b ? [a, b] : [b, a])
		}
	})

	it('validates input shape, types, NaN, and interval ordering', () => {
		assert.throws(() => cbrtIntervalStable(null), TypeError)
		assert.throws(() => cbrtIntervalStable(undefined), TypeError)
		assert.throws(() => cbrtIntervalStable(8), TypeError)
		assert.throws(() => cbrtIntervalStable([]), TypeError)
		assert.throws(() => cbrtIntervalStable([1]), TypeError)
		assert.throws(() => cbrtIntervalStable([1, 2, 3]), TypeError)
		assert.throws(() => cbrtIntervalStable(['1', 2]), TypeError)
		assert.throws(() => cbrtIntervalStable([1, '2']), TypeError)
		assert.throws(() => cbrtIntervalStable([1n, 2n]), TypeError)

		assert.throws(() => cbrtIntervalStable([NaN, 1]), RangeError)
		assert.throws(() => cbrtIntervalStable([1, NaN]), RangeError)
		assert.throws(() => cbrtIntervalStable([NaN, NaN]), RangeError)
		assert.throws(() => cbrtIntervalStable([2, 1]), RangeError)
		assert.throws(() => cbrtIntervalStable([1, -1]), RangeError)
		assert.throws(() => cbrtIntervalStable([Infinity, -Infinity]), RangeError)
	})
})
