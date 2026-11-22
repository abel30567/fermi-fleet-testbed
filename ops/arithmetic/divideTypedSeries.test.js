import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { divideTypedSeries } from './divideTypedSeries.js'

/**
 * Computes the ULP distance between two finite binary64 numbers.
 */
function ulpDistance(a, b) {
	if (Object.is(a, b)) return 0n
	const buf = new ArrayBuffer(8)
	const f64 = new Float64Array(buf)
	const i64 = new BigInt64Array(buf)

	const toOrderedInt = (x) => {
		f64[0] = x
		const bits = i64[0]
		return bits < 0n ? (0x8000000000000000n - bits) : bits
	}

	const diff = toOrderedInt(a) - toOrderedInt(b)
	return diff < 0n ? -diff : diff
}

/**
 * Deterministic xorshift32 PRNG for reproducible cross-check tests.
 */
function makeRng(seed = 0x12345678) {
	let state = seed >>> 0
	return () => {
		state ^= state << 13
		state ^= state >>> 17
		state ^= state << 5
		return (state >>> 0) / 0x100000000
	}
}

describe('divideTypedSeries', () => {
	describe('basic element-wise division', () => {
		it('divides two Float64Arrays of normal values', () => {
			const a = new Float64Array([10, -25, 0.75, 1, 100])
			const b = new Float64Array([2, 5, 0.25, 3, -4])
			const out = divideTypedSeries(a, b)

			assert.ok(out instanceof Float64Array)
			assert.notEqual(out, a)
			assert.notEqual(out, b)
			assert.equal(out.length, a.length)

			assert.equal(out[0], 5)
			assert.equal(out[1], -5)
			assert.equal(out[2], 3)
			assert.ok(ulpDistance(out[3], 1 / 3) <= 1n)
			assert.equal(out[4], -25)
		})

		it('does not mutate input Float64Arrays', () => {
			const a = new Float64Array([6, 12, 18])
			const b = new Float64Array([2, 3, 6])
			const copyA = new Float64Array(a)
			const copyB = new Float64Array(b)

			divideTypedSeries(a, b)
			assert.deepEqual(a, copyA)
			assert.deepEqual(b, copyB)
		})

		it('supports dividing a series of 3 or more Float64Arrays left-to-right', () => {
			const a = new Float64Array([120, -64, 1, 7.5])
			const b = new Float64Array([2, 4, 3, 1.5])
			const c = new Float64Array([3, -2, 7, 2.5])
			const d = new Float64Array([5, 4, 11, 0.5])

			const out = divideTypedSeries(a, b, c, d)
			for (let i = 0; i < a.length; i++) {
				const ref = ((a[i] / b[i]) / c[i]) / d[i]
				assert.ok(
					ulpDistance(out[i], ref) <= 2n,
					`index ${i}: got ${out[i]}, expected ${ref}`,
				)
			}
			assert.equal(out[0], 4)
			assert.equal(out[1], 2)
			assert.equal(out[3], 4)
		})
	})

	describe('edge cases: empty, signed zero, subnormals, extremes', () => {
		it('returns a new empty Float64Array for empty inputs', () => {
			const a = new Float64Array(0)
			const b = new Float64Array(0)
			const out = divideTypedSeries(a, b)
			assert.ok(out instanceof Float64Array)
			assert.equal(out.length, 0)
			assert.notEqual(out, a)
		})

		it('preserves IEEE-754 signed zero semantics for zero dividends', () => {
			const a = new Float64Array([0, 0, -0, -0])
			const b = new Float64Array([2, -2, 2, -2])
			const out = divideTypedSeries(a, b)

			assert.ok(Object.is(out[0], 0))
			assert.ok(Object.is(out[1], -0))
			assert.ok(Object.is(out[2], -0))
			assert.ok(Object.is(out[3], 0))
		})

		it('handles subnormal numbers accurately', () => {
			const a = new Float64Array([
				Number.MIN_VALUE,
				Number.MIN_VALUE * 7,
				1e-315,
				1.0,
				-Number.MIN_VALUE * 3,
				1.5e-320,
			])
			const b = new Float64Array([
				Number.MIN_VALUE,
				Number.MIN_VALUE,
				1e-310,
				Number.MIN_VALUE * 1e20,
				2,
				3e-10,
			])
			const out = divideTypedSeries(a, b)

			for (let i = 0; i < a.length; i++) {
				const ref = a[i] / b[i]
				assert.ok(
					ulpDistance(out[i], ref) <= 1n,
					`subnormal index ${i}: got ${out[i]}, ref ${ref}, ulp=${ulpDistance(out[i], ref)}`,
				)
			}
		})

		it('handles extreme exponents, exact overflow, and exact underflow', () => {
			const a = new Float64Array([
				Number.MAX_VALUE,
				Number.MAX_VALUE,
				1.0,
				-1.0,
				Number.MIN_VALUE,
				-Number.MIN_VALUE,
				1e300,
				0.75,
			])
			const b = new Float64Array([
				Number.MAX_VALUE,
				0.5,
				Number.MIN_VALUE,
				Number.MIN_VALUE,
				10,
				10,
				1e-300,
				2 ** -1024,
			])
			const out = divideTypedSeries(a, b)

			assert.equal(out[0], 1)
			assert.equal(out[1], Infinity)
			assert.equal(out[2], Infinity)
			assert.equal(out[3], -Infinity)
			assert.ok(Object.is(out[4], 0))
			assert.ok(Object.is(out[5], -0))
			assert.equal(out[6], Infinity)
			assert.ok(ulpDistance(out[7], 0.75 / (2 ** -1024)) <= 1n)
		})

		it('handles chained division when an intermediate step overflows to Infinity', () => {
			const a = new Float64Array([1e300, -1e300])
			const b = new Float64Array([1e-300, 1e-300])
			const c = new Float64Array([-2, -2])
			const out = divideTypedSeries(a, b, c)

			assert.equal(out[0], -Infinity)
			assert.equal(out[1], Infinity)
		})

		it('handles exact powers of two and exact binary fractions without rounding error', () => {
			const a = new Float64Array([1, 3, 5, 7, 9, 15, 0.375, -0.875])
			const b = new Float64Array([2, 4, 8, 16, 32, 64, 0.125, 0.25])
			const out = divideTypedSeries(a, b)

			for (let i = 0; i < a.length; i++) {
				assert.equal(out[i], a[i] / b[i])
			}
		})
	})

	describe('cross-checks against native IEEE-754 division and algebraic identities', () => {
		it('matches native IEEE-754 / within <= 1 ULP across 1,000 wide-range random pairs', () => {
			const rng = makeRng(0xdeadbeef)
			const n = 1000
			const a = new Float64Array(n)
			const b = new Float64Array(n)

			for (let i = 0; i < n; i++) {
				const signA = rng() < 0.5 ? -1 : 1
				const signB = rng() < 0.5 ? -1 : 1
				const expA = Math.floor(rng() * 600) - 300
				const expB = Math.floor(rng() * 600) - 300
				const manA = 0.5 + rng() * 0.5
				const manB = 0.5 + rng() * 0.5
				a[i] = signA * manA * (2 ** expA)
				b[i] = signB * manB * (2 ** expB)
			}

			const out = divideTypedSeries(a, b)
			let maxUlp = 0n
			for (let i = 0; i < n; i++) {
				const ref = a[i] / b[i]
				if (!Number.isFinite(ref)) {
					assert.equal(out[i], ref)
				} else {
					const dist = ulpDistance(out[i], ref)
					if (dist > maxUlp) maxUlp = dist
					assert.ok(
						dist <= 1n,
						`pair ${i} (${a[i]} / ${b[i]}): got ${out[i]}, ref ${ref}, ulp=${dist}`,
					)
				}
			}
			assert.ok(maxUlp <= 1n)
		})

		it('satisfies the inverse multiplication identity (a / b) * b ≈ a', () => {
			const rng = makeRng(0xcafebabe)
			const n = 256
			const a = new Float64Array(n)
			const b = new Float64Array(n)

			for (let i = 0; i < n; i++) {
				a[i] = (rng() * 2 - 1) * 1e6
				let d = (rng() * 2 - 1) * 1e3
				if (Math.abs(d) < 1e-3) d = 1.25
				b[i] = d
			}

			const q = divideTypedSeries(a, b)
			for (let i = 0; i < n; i++) {
				const reconstructed = q[i] * b[i]
				const relErr = Math.abs(reconstructed - a[i]) / Math.max(Math.abs(a[i]), 1e-300)
				assert.ok(
					relErr <= 1e-14,
					`index ${i}: (${q[i]} * ${b[i]}) = ${reconstructed} vs ${a[i]} (relErr=${relErr})`,
				)
			}
		})

		it('satisfies divisibility / associativity identity: divide(a, b, c) ≈ divide(a, b * c)', () => {
			const a = new Float64Array([100, -42.5, Math.PI, 1e12, 0.00123])
			const b = new Float64Array([3, 7, 1.4142135623730951, 1e4, 0.5])
			const c = new Float64Array([11, -5, 2.718281828459045, 1e3, 0.25])
			const bc = new Float64Array(a.length)
			for (let i = 0; i < a.length; i++) {
				bc[i] = b[i] * c[i]
			}

			const seq = divideTypedSeries(a, b, c)
			const combined = divideTypedSeries(a, bc)

			for (let i = 0; i < a.length; i++) {
				const relErr = Math.abs(seq[i] - combined[i]) / Math.abs(combined[i])
				assert.ok(relErr <= 1e-14, `index ${i}: seq=${seq[i]}, combined=${combined[i]}`)
			}
		})

		it('satisfies self-division identity: divide(a, a) === 1 for non-zero finite inputs', () => {
			const a = new Float64Array([
				1, -1, Math.PI, -Math.E, 1e-300, 1e300,
				Number.MIN_VALUE, Number.MAX_VALUE, -Number.MIN_VALUE,
			])
			const out = divideTypedSeries(a, a)
			for (let i = 0; i < a.length; i++) {
				assert.equal(out[i], 1, `index ${i}: ${a[i]} / ${a[i]} = ${out[i]}`)
			}
		})
	})

	describe('input validation', () => {
		it('throws RangeError when fewer than 2 arguments are provided', () => {
			assert.throws(() => divideTypedSeries(), RangeError)
			assert.throws(() => divideTypedSeries(new Float64Array([1, 2])), RangeError)
		})

		it('throws TypeError for non-Float64Array arguments', () => {
			const valid = new Float64Array([1, 2])
			assert.throws(() => divideTypedSeries([1, 2], valid), TypeError)
			assert.throws(() => divideTypedSeries(valid, [1, 2]), TypeError)
			assert.throws(() => divideTypedSeries(new Float32Array([1, 2]), valid), TypeError)
			assert.throws(() => divideTypedSeries(valid, new Int32Array([1, 2])), TypeError)
			assert.throws(() => divideTypedSeries(valid, null), TypeError)
			assert.throws(() => divideTypedSeries(valid, undefined), TypeError)
			assert.throws(() => divideTypedSeries(valid, valid, 'not-an-array'), TypeError)
		})

		it('throws RangeError on mismatched array lengths', () => {
			const a = new Float64Array([1, 2, 3])
			const b = new Float64Array([1, 2])
			const c = new Float64Array([1, 2, 3, 4])
			assert.throws(() => divideTypedSeries(a, b), RangeError)
			assert.throws(() => divideTypedSeries(a, a, c), RangeError)
		})

		it('throws RangeError on division by +0 or -0 in any divisor array', () => {
			const a = new Float64Array([1, 2, 3])
			assert.throws(() => divideTypedSeries(a, new Float64Array([1, 0, 3])), RangeError)
			assert.throws(() => divideTypedSeries(a, new Float64Array([1, -0, 3])), RangeError)
			assert.throws(
				() => divideTypedSeries(a, new Float64Array([1, 2, 3]), new Float64Array([1, 2, 0])),
				RangeError,
			)
		})

		it('throws RangeError on NaN, Infinity, or -Infinity in any array', () => {
			const valid = new Float64Array([1, 2])
			assert.throws(() => divideTypedSeries(new Float64Array([NaN, 2]), valid), RangeError)
			assert.throws(() => divideTypedSeries(valid, new Float64Array([1, NaN])), RangeError)
			assert.throws(() => divideTypedSeries(new Float64Array([Infinity, 2]), valid), RangeError)
			assert.throws(() => divideTypedSeries(valid, new Float64Array([-Infinity, 2])), RangeError)
			assert.throws(
				() => divideTypedSeries(valid, valid, new Float64Array([1, Infinity])),
				RangeError,
			)
		})
	})
})
