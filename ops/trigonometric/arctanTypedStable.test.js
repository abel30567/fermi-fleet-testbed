import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { arctanTypedStable } from './arctanTypedStable.js'

const ulpBuf = new ArrayBuffer(16)
const ulpF64 = new Float64Array(ulpBuf)
const ulpU64 = new BigUint64Array(ulpBuf)

/**
 * Computes the distance in ULPs (units in the last place) between two finite
 * IEEE-754 binary64 numbers.
 */
function ulpDistance(a, b) {
	if (Object.is(a, b)) return 0n
	if (Number.isNaN(a) || Number.isNaN(b)) return BigInt(Number.MAX_SAFE_INTEGER)
	if (!Number.isFinite(a) || !Number.isFinite(b)) return BigInt(Number.MAX_SAFE_INTEGER)

	ulpF64[0] = a
	ulpF64[1] = b
	const signMask = 0x8000000000000000n
	const ia = (ulpU64[0] & signMask) !== 0n ? ~(ulpU64[0] & ~signMask) + 1n : ulpU64[0]
	const ib = (ulpU64[1] & signMask) !== 0n ? ~(ulpU64[1] & ~signMask) + 1n : ulpU64[1]
	const diff = ia - ib
	return diff < 0n ? -diff : diff
}

/**
 * Independent high-precision BigInt oracle for arctan(p / q) (200-bit fixed point),
 * using Machin's formula for pi/2 and rational Taylor series without calling Math.atan.
 */
function bigIntAtanRational(p, q) {
	const SHIFT = 200n
	const ONE = 1n << SHIFT

	function atanSeries(num, den) {
		const n2 = num * num
		const d2 = den * den
		let term = (num * ONE) / den
		let sum = term
		for (let k = 1n; ; k++) {
			term = (term * n2) / d2
			const delta = term / (2n * k + 1n)
			if (delta === 0n) break
			if ((k & 1n) === 1n) sum -= delta
			else sum += delta
		}
		return sum
	}

	const bp = BigInt(p)
	const bq = BigInt(q)
	const sign = (bp < 0n) !== (bq < 0n) ? -1 : 1
	const ap = bp < 0n ? -bp : bp
	const aq = bq < 0n ? -bq : bq

	let val
	if (ap === 0n) {
		return 0
	} else if (ap * 2n <= aq) {
		// |x| <= 0.5: direct Taylor series
		val = atanSeries(ap, aq)
	} else if (ap < aq * 2n) {
		// 0.5 < |x| < 2: reduce via atan(x) = pi/4 + atan((x - 1) / (x + 1))
		const piOver4 = 4n * atanSeries(1n, 5n) - atanSeries(1n, 239n)
		const diff = ap - aq
		const sum = ap + aq
		if (diff === 0n) {
			val = piOver4
		} else if (diff > 0n) {
			val = piOver4 + atanSeries(diff, sum)
		} else {
			val = piOver4 - atanSeries(-diff, sum)
		}
	} else {
		// |x| >= 2: reduce via atan(x) = pi/2 - atan(1/x)
		const piOver2 = 2n * (4n * atanSeries(1n, 5n) - atanSeries(1n, 239n))
		val = piOver2 - atanSeries(aq, ap)
	}

	// Convert fixed-point val / 2^200 to nearest IEEE-754 double with full 53-bit precision.
	const bitLen = val.toString(2).length
	const shift = Math.max(0, bitLen - 54)
	const shifted = val >> BigInt(shift)
	// Round to nearest using the half-bit when shift > 0.
	const rounded =
		shift > 0 && ((val >> BigInt(shift - 1)) & 1n) === 1n ? shifted + 1n : shifted
	const approx = Number(rounded) * 2 ** (shift - Number(SHIFT))
	return sign * approx
}

describe('arctanTypedStable', () => {
	it('computes exact known trigonometric values', () => {
		const inputs = new Float64Array([
			0,
			1 / Math.sqrt(3),
			1,
			Math.sqrt(3),
			-1 / Math.sqrt(3),
			-1,
			-Math.sqrt(3),
		])
		const expected = [
			0,
			Math.PI / 6,
			Math.PI / 4,
			Math.PI / 3,
			-Math.PI / 6,
			-Math.PI / 4,
			-Math.PI / 3,
		]
		const out = arctanTypedStable(inputs)

		assert.ok(out instanceof Float64Array)
		assert.equal(out.length, inputs.length)
		for (let i = 0; i < expected.length; i++) {
			assert.ok(
				ulpDistance(out[i], expected[i]) <= 1n,
				`index ${i}: got ${out[i]}, expected ${expected[i]} (ulp=${ulpDistance(out[i], expected[i])})`
			)
		}
	})

	it('handles IEEE-754 special values and sign preservation', () => {
		const inputs = new Float64Array([
			0,
			-0,
			Infinity,
			-Infinity,
			NaN,
			Number.MIN_VALUE,
			-Number.MIN_VALUE,
			Number.MAX_VALUE,
			-Number.MAX_VALUE,
		])
		const out = arctanTypedStable(inputs)

		assert.ok(Object.is(out[0], 0), 'expected +0 to preserve sign')
		assert.ok(Object.is(out[1], -0), 'expected -0 to preserve sign')
		assert.equal(out[2], Math.PI / 2)
		assert.equal(out[3], -Math.PI / 2)
		assert.ok(Number.isNaN(out[4]))
		assert.equal(out[5], Number.MIN_VALUE)
		assert.equal(out[6], -Number.MIN_VALUE)
		assert.equal(out[7], Math.PI / 2)
		assert.equal(out[8], -Math.PI / 2)
	})

	it('handles empty Float64Array and subarrays with non-zero byteOffset', () => {
		const empty = arctanTypedStable(new Float64Array(0))
		assert.ok(empty instanceof Float64Array)
		assert.equal(empty.length, 0)

		const backing = new Float64Array([100, -0.5, 0.5, 1.0, 2.0, -100])
		const view = backing.subarray(1, 5)
		const out = arctanTypedStable(view)

		assert.equal(out.length, 4)
		for (let i = 0; i < view.length; i++) {
			assert.ok(ulpDistance(out[i], Math.atan(view[i])) <= 1n)
		}
		// Ensure input was not mutated.
		assert.deepEqual(Array.from(backing), [100, -0.5, 0.5, 1.0, 2.0, -100])
	})

	it('supports optional out buffer including safe in-place execution', () => {
		const src = new Float64Array([-3, -1, 0, 0.5, 1.5, 4])
		const prealloc = new Float64Array(src.length)
		const returned = arctanTypedStable(src, prealloc)

		assert.equal(returned, prealloc)
		for (let i = 0; i < src.length; i++) {
			assert.ok(ulpDistance(returned[i], Math.atan(src[i])) <= 1n)
		}

		const inPlace = new Float64Array(src)
		const returnedInPlace = arctanTypedStable(inPlace, inPlace)
		assert.equal(returnedInPlace, inPlace)
		assert.deepEqual(Array.from(inPlace), Array.from(prealloc))
	})

	it('maintains <= 1 ULP accuracy around all reduction breakpoints and thresholds', () => {
		const criticalPoints = [
			2 ** -28,
			2 ** -27,
			2 ** -26,
			7 / 16,
			0.5,
			11 / 16,
			1.0,
			19 / 16,
			1.5,
			39 / 16,
			2 ** 54,
			2 ** 55,
			2 ** 56,
		]

		const samples = []
		const buf = new ArrayBuffer(8)
		const f64 = new Float64Array(buf)
		const u64 = new BigUint64Array(buf)

		for (const pt of criticalPoints) {
			f64[0] = pt
			const baseBits = u64[0]
			for (let delta = -8n; delta <= 8n; delta++) {
				u64[0] = baseBits + delta
				const v = f64[0]
				samples.push(v, -v)
			}
		}

		const input = new Float64Array(samples)
		const out = arctanTypedStable(input)
		let maxUlp = 0n

		for (let i = 0; i < input.length; i++) {
			const ref = Math.atan(input[i])
			const d = ulpDistance(out[i], ref)
			if (d > maxUlp) maxUlp = d
			assert.ok(
				d <= 1n,
				`x=${input[i]}: got=${out[i]}, Math.atan=${ref}, ulp=${d}`
			)
		}
		assert.ok(maxUlp <= 1n)
	})

	it('matches independent 200-bit BigInt rational oracle across all 5 intervals', () => {
		// Exact dyadic rational pairs covering intervals 0, 1, 2, 3, 4 (positive and negative).
		const rationals = [
			[1, 1024],
			[1, 16],
			[3, 8],
			[7, 16],
			[1, 2],
			[5, 8],
			[11, 16],
			[3, 4],
			[1, 1],
			[9, 8],
			[19, 16],
			[3, 2],
			[2, 1],
			[39, 16],
			[5, 2],
			[10, 1],
			[1024, 1],
			[-3, 8],
			[-1, 2],
			[-1, 1],
			[-3, 2],
			[-7, 2],
			[-256, 1],
		]

		const input = new Float64Array(rationals.map(([p, q]) => p / q))
		const out = arctanTypedStable(input)

		for (let i = 0; i < rationals.length; i++) {
			const [p, q] = rationals[i]
			const oracle = bigIntAtanRational(p, q)
			const d = ulpDistance(out[i], oracle)
			assert.ok(
				d <= 1n,
				`rational ${p}/${q}: got=${out[i]}, oracle=${oracle}, ulp=${d}`
			)
		}
	})

	it('satisfies mathematical identities (odd symmetry, reciprocal, addition, monotonicity)', () => {
		// Log-spaced positive grid from 1e-12 to 1e12.
		const n = 500
		const pos = new Float64Array(n)
		for (let i = 0; i < n; i++) {
			pos[i] = 10 ** (-12 + (24 * i) / (n - 1))
		}
		const neg = new Float64Array(n)
		const inv = new Float64Array(n)
		for (let i = 0; i < n; i++) {
			neg[i] = -pos[i]
			inv[i] = 1 / pos[i]
		}

		const atanPos = arctanTypedStable(pos)
		const atanNeg = arctanTypedStable(neg)
		const atanInv = arctanTypedStable(inv)

		for (let i = 0; i < n; i++) {
			// Exact odd symmetry: atan(-x) === -atan(x).
			assert.ok(Object.is(atanNeg[i], -atanPos[i]), `odd symmetry failed at ${pos[i]}`)

			// Complementary reciprocal identity: atan(x) + atan(1/x) === pi/2.
			const sum = atanPos[i] + atanInv[i]
			assert.ok(
				Math.abs(sum - Math.PI / 2) <= 2e-15,
				`reciprocal identity failed at x=${pos[i]}: sum=${sum}`
			)

			// Strict range bound: (0, pi/2].
			assert.ok(atanPos[i] > 0 && atanPos[i] <= Math.PI / 2)

			// Monotonicity on strictly increasing positive grid.
			if (i > 0) {
				assert.ok(atanPos[i] >= atanPos[i - 1], `monotonicity failed at index ${i}`)
			}
		}

		// Addition formula: atan(u) + atan(v) === atan((u + v) / (1 - u*v)) for u*v < 1.
		const pairs = [
			[0.1, 0.2],
			[0.25, 0.5],
			[0.5, 0.75],
			[-0.4, 0.9],
			[0.3, -1.2],
		]
		for (const [u, v] of pairs) {
			const combined = (u + v) / (1 - u * v)
			const res = arctanTypedStable(new Float64Array([u, v, combined]))
			assert.ok(
				Math.abs(res[0] + res[1] - res[2]) <= 2e-15,
				`addition formula failed for u=${u}, v=${v}`
			)
		}
	})

	it('throws on invalid inputs and invalid out buffers', () => {
		const invalidInputs = [
			null,
			undefined,
			42,
			'0.5',
			{},
			[0, 1],
			new Float32Array([0, 1]),
			new Int32Array([0, 1]),
			new Uint8Array([0, 1]),
		]
		for (const bad of invalidInputs) {
			assert.throws(() => arctanTypedStable(bad), TypeError)
		}

		const valid = new Float64Array([0, 1, 2])
		assert.throws(() => arctanTypedStable(valid, []), TypeError)
		assert.throws(() => arctanTypedStable(valid, new Float32Array(3)), TypeError)
		assert.throws(() => arctanTypedStable(valid, null), TypeError)
		assert.throws(() => arctanTypedStable(valid, new Float64Array(2)), RangeError)
		assert.throws(() => arctanTypedStable(valid, new Float64Array(4)), RangeError)
	})
})
