import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { log10FloatStable } from './log10FloatStable.js'

const f64Buf = new Float64Array(1)
const i64Buf = new BigInt64Array(f64Buf.buffer)

/**
 * Computes the ULP distance between two finite float64 numbers.
 * @param {number} a
 * @param {number} b
 * @returns {bigint}
 */
function ulpDistance(a, b) {
	if (a === b) return 0n
	f64Buf[0] = a
	let ia = i64Buf[0]
	if (ia < 0n) ia = 0x8000000000000000n - ia
	f64Buf[0] = b
	let ib = i64Buf[0]
	if (ib < 0n) ib = 0x8000000000000000n - ib
	return ia >= ib ? ia - ib : ib - ia
}

/**
 * Independent BigInt integer-bracketing oracle for log10(n) of a positive integer n.
 * Uses only exact BigInt exponentiation: finds the unique integer q such that
 * 10^q <= n^scale < 10^(q + 1), bounding log10(n) within [q/scale, (q+1)/scale].
 * Completely independent of Math.log10 and Math.log.
 * @param {bigint} n
 * @param {number} scale
 * @returns {[number, number]}
 */
function bigintLog10Bounds(n, scale) {
	const target = n ** BigInt(scale)
	const digits = target.toString().length
	const q = digits - 1
	return [q / scale, (q + 1) / scale]
}

describe('log10FloatStable', () => {
	it('validates input types and throws TypeError for non-numbers', () => {
		const invalidInputs = [
			'10',
			'1',
			null,
			undefined,
			true,
			false,
			10n,
			{},
			[10],
			Symbol('x'),
			() => 10,
		]
		for (const input of invalidInputs) {
			assert.throws(
				() => log10FloatStable(input),
				{ name: 'TypeError' },
				`Expected TypeError for input ${String(input)}`
			)
		}
	})

	it('handles IEEE-754 special values and domain boundaries', () => {
		assert.ok(Number.isNaN(log10FloatStable(Number.NaN)))
		assert.ok(Number.isNaN(log10FloatStable(-1)))
		assert.ok(Number.isNaN(log10FloatStable(-10)))
		assert.ok(Number.isNaN(log10FloatStable(-Number.MIN_VALUE)))
		assert.ok(Number.isNaN(log10FloatStable(-Number.MAX_VALUE)))
		assert.ok(Number.isNaN(log10FloatStable(-Number.POSITIVE_INFINITY)))

		assert.equal(log10FloatStable(0), -Number.POSITIVE_INFINITY)
		assert.equal(log10FloatStable(-0), -Number.POSITIVE_INFINITY)
		assert.equal(log10FloatStable(Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY)
		assert.ok(Object.is(log10FloatStable(1), 0))
	})

	it('returns exact integers for all exact float64 powers of 10 (10^0..10^22)', () => {
		// Naive Math.log(1000) / Math.LN10 produces 2.9999999999999996;
		// log10FloatStable must return exact integers for all exact powers of 10.
		for (let k = 0; k <= 22; k++) {
			const x = 10 ** k
			assert.equal(
				log10FloatStable(x),
				k,
				`Expected exact ${k} for 10^${k}`
			)
		}
	})

	it('handles negative and large powers of 10 across full normal float64 range', () => {
		for (let k = -307; k <= 308; k++) {
			const x = Number(`1e${k}`)
			const actual = log10FloatStable(x)
			const ref = Math.log10(x)
			assert.ok(
				ulpDistance(actual, ref) <= 1n,
				`k=${k}: got ${actual}, ref ${ref}, ulp=${ulpDistance(actual, ref)}`
			)
			assert.ok(Math.abs(actual - k) <= 1e-13, `k=${k}: got ${actual}`)
		}
	})

	it('handles subnormal numbers and extreme float64 magnitudes without overflow/underflow', () => {
		const extremes = [
			Number.MIN_VALUE, // 2^-1074
			Number.MIN_VALUE * 2,
			Number.MIN_VALUE * 3,
			Number.MIN_VALUE * 10,
			Number.MIN_VALUE * 1024,
			2 ** -1050,
			2 ** -1022 - Number.MIN_VALUE, // largest subnormal
			2 ** -1022, // smallest positive normal
			2 ** -1022 + Number.MIN_VALUE,
			Number.MAX_VALUE / 2,
			Number.MAX_VALUE,
		]

		for (const x of extremes) {
			const actual = log10FloatStable(x)
			const ref = Math.log10(x)
			assert.ok(Number.isFinite(actual), `Expected finite result for ${x}`)
			assert.ok(
				ulpDistance(actual, ref) <= 1n,
				`x=${x}: got ${actual}, ref ${ref}, ulp=${ulpDistance(actual, ref)}`
			)
		}

		// Independent check for Number.MIN_VALUE = 2^-1074:
		// log10(2^-1074) = -1074 * log10(2) = -323.3062153431158
		assert.equal(log10FloatStable(Number.MIN_VALUE), -323.3062153431158)
	})

	it('resists catastrophic cancellation for values very close to 1', () => {
		const offsets = [
			Number.EPSILON,
			-Number.EPSILON / 2,
			2 * Number.EPSILON,
			-Number.EPSILON,
			1e-15,
			-1e-15,
			1e-12,
			-1e-12,
			1e-9,
			-1e-9,
			1e-6,
			-1e-6,
			1e-3,
			-1e-3,
		]

		for (const dx of offsets) {
			const x = 1 + dx
			const exactDx = x - 1
			const actual = log10FloatStable(x)
			// Independent cross-check via Math.log1p(exactDx) / Math.LN10
			const refLog1p = Math.log1p(exactDx) / Math.LN10
			const relErr = Math.abs(actual - refLog1p) / Math.abs(refLog1p)
			assert.ok(
				relErr <= 4 * Number.EPSILON,
				`x=1+${exactDx}: actual=${actual}, ref=${refLog1p}, relErr=${relErr}`
			)
			assert.ok(
				ulpDistance(actual, Math.log10(x)) <= 1n,
				`x=1+${exactDx}: ulp vs Math.log10 = ${ulpDistance(actual, Math.log10(x))}`
			)
		}
	})

	it('is monotonic across range-reduction and subnormal boundaries', () => {
		// Adjacent float64 values around boundaries must be non-decreasing (since at
		// |log10(x)| ~ 308, 1 ULP of log10 exceeds 2^-52 / ln(10)).
		const adjacentBoundaries = [
			Number.MIN_VALUE,
			Number.MIN_VALUE * 2,
			2 ** -1022 - Number.MIN_VALUE,
			2 ** -1022,
			2 ** -1022 * (1 + Number.EPSILON),
			Math.SQRT1_2 * (1 - Number.EPSILON),
			Math.SQRT1_2,
			Math.SQRT1_2 * (1 + Number.EPSILON),
			1 - Number.EPSILON / 2,
			1,
			1 + Number.EPSILON,
			Math.SQRT2 * (1 - Number.EPSILON),
			Math.SQRT2,
			Math.SQRT2 * (1 + Number.EPSILON),
			2 - Number.EPSILON,
			2,
			2 * (1 + Number.EPSILON),
			Number.MAX_VALUE * (1 - Number.EPSILON),
			Number.MAX_VALUE,
		]

		for (let i = 1; i < adjacentBoundaries.length; i++) {
			const prev = log10FloatStable(adjacentBoundaries[i - 1])
			const curr = log10FloatStable(adjacentBoundaries[i])
			assert.ok(
				curr >= prev,
				`Expected monotonicity at index ${i}: log10(${adjacentBoundaries[i - 1]})=${prev}, log10(${adjacentBoundaries[i]})=${curr}`
			)
		}

		// Well-separated points across every regime must be strictly increasing.
		const strictPoints = [
			Number.MIN_VALUE,
			Number.MIN_VALUE * 2,
			2 ** -1022 * 0.5,
			2 ** -1022,
			2 ** -1022 * 2,
			Math.SQRT1_2 * (1 - 1e-12),
			Math.SQRT1_2,
			Math.SQRT1_2 * (1 + 1e-12),
			1 - Number.EPSILON / 2,
			1,
			1 + Number.EPSILON,
			Math.SQRT2 * (1 - 1e-12),
			Math.SQRT2,
			Math.SQRT2 * (1 + 1e-12),
			Number.MAX_VALUE / 2,
			Number.MAX_VALUE,
		]
		for (let i = 1; i < strictPoints.length; i++) {
			const prev = log10FloatStable(strictPoints[i - 1])
			const curr = log10FloatStable(strictPoints[i])
			assert.ok(
				curr > prev,
				`Expected strict monotonicity at index ${i}: log10(${strictPoints[i - 1]})=${prev}, log10(${strictPoints[i]})=${curr}`
			)
		}
	})

	it('satisfies algebraic logarithm identities across wide scales', () => {
		const pairs = [
			[2, 5],
			[3, 7],
			[1.23456789, 9.87654321],
			[1e-120, 1e150],
			[1e150, 1e-140],
			[Math.PI, Math.E],
			[0.7071067811865476, 1.4142135623730951],
		]

		for (const [a, b] of pairs) {
			const la = log10FloatStable(a)
			const lb = log10FloatStable(b)
			const lProd = log10FloatStable(a * b)
			const lQuot = log10FloatStable(a / b)
			const scale = Math.max(1, Math.abs(la) + Math.abs(lb))

			assert.ok(
				Math.abs(lProd - (la + lb)) <= 8 * Number.EPSILON * scale,
				`Product identity failed for (${a}, ${b}): ${lProd} vs ${la + lb}`
			)
			assert.ok(
				Math.abs(lQuot - (la - lb)) <= 8 * Number.EPSILON * scale,
				`Quotient identity failed for (${a}, ${b}): ${lQuot} vs ${la - lb}`
			)
		}

		// Power identity and inverse round-trip
		for (const x of [0.0037, 0.5, 1.7320508075688772, 42, 12345.6789, 1e50]) {
			const lx = log10FloatStable(x)
			assert.ok(Math.abs(log10FloatStable(x * x) - 2 * lx) <= 4 * Number.EPSILON * Math.max(1, Math.abs(2 * lx)))
			assert.ok(Math.abs(log10FloatStable(Math.sqrt(x)) - 0.5 * lx) <= 4 * Number.EPSILON * Math.max(1, Math.abs(lx)))
			assert.ok(Math.abs(log10FloatStable(1 / x) + lx) <= 4 * Number.EPSILON * Math.max(1, Math.abs(lx)))

			const roundTrip = 10 ** lx
			assert.ok(
				Math.abs(roundTrip - x) / x <= 8 * Number.EPSILON,
				`Round-trip failed for x=${x}: 10^log10(x)=${roundTrip}`
			)
		}
	})

	it('cross-checks against an independent BigInt integer-bracketing oracle', () => {
		// Using scale = 500 gives bounds accurate to 0.002, and scale = 2000 gives 5e-4,
		// computed purely via exact integer arithmetic (zero floating-point logs).
		const integers = [2n, 3n, 5n, 7n, 11n, 13n, 99n, 101n, 1024n, 65537n, 999983n]
		for (const n of integers) {
			const [lo, hi] = bigintLog10Bounds(n, 2000)
			const actual = log10FloatStable(Number(n))
			assert.ok(
				actual >= lo && actual <= hi,
				`BigInt oracle check failed for n=${n}: ${actual} not in [${lo}, ${hi}]`
			)
		}
	})

	it('cross-checks against Math.log10 across 2000 deterministic samples spanning all float64 exponents', () => {
		// Deterministic xorshift64* generator for reproducible bit-level coverage.
		let state = 0x2545f4914f6cdd1dn
		const nextU64 = () => {
			state ^= state >> 12n
			state ^= (state << 25n) & 0xffffffffffffffffn
			state ^= state >> 27n
			return (state * 0x2545f4914f6cdd1dn) & 0xffffffffffffffffn
		}

		let maxUlp = 0n
		const samples = 2000
		for (let i = 0; i < samples; i++) {
			const raw = nextU64()
			// Construct a positive finite float64: sign=0, exponent in [0, 2046].
			const exp = raw % 2047n
			const frac = (raw >> 11n) & 0x000fffffffffffffn
			const bits = (exp << 52n) | frac
			if (bits === 0n) continue

			i64Buf[0] = BigInt.asIntN(64, bits)
			const x = f64Buf[0]

			const actual = log10FloatStable(x)
			const ref = Math.log10(x)
			const ulp = ulpDistance(actual, ref)
			if (ulp > maxUlp) maxUlp = ulp

			assert.ok(
				ulp <= 1n,
				`Sample ${i} (x=${x}): actual=${actual}, Math.log10=${ref}, ulp=${ulp}`
			)
		}
		assert.ok(maxUlp <= 1n, `Max ULP distance exceeded 1: ${maxUlp}`)
	})
})
