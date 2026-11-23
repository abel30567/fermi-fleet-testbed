import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { log2FloatMemo } from './log2FloatMemo.js'

/**
 * Computes the ULP distance between two finite float64 numbers.
 * @param {number} a
 * @param {number} b
 * @returns {bigint}
 */
function ulpDistance(a, b) {
	if (a === b) return 0n
	const buf = new ArrayBuffer(16)
	const f64 = new Float64Array(buf)
	const i64 = new BigInt64Array(buf)
	f64[0] = a
	f64[1] = b
	let ia = i64[0]
	let ib = i64[1]
	if (ia < 0n) ia = 0x8000000000000000n - ia
	if (ib < 0n) ib = 0x8000000000000000n - ib
	return ia >= ib ? ia - ib : ib - ia
}

describe('log2FloatMemo', () => {
	describe('input validation', () => {
		it('throws TypeError for non-number inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				'2',
				'8',
				'',
				true,
				false,
				2n,
				{},
				[],
				[4],
				Symbol('log2'),
				() => 2,
			]
			for (const bad of invalidInputs) {
				assert.throws(
					() => log2FloatMemo(bad),
					{ name: 'TypeError' },
					`Expected TypeError for input ${String(bad)}`
				)
			}
		})
	})

	describe('IEEE-754 special values and edge cases', () => {
		it('handles 1, +0, -0, Infinity, -Infinity, NaN, and negative numbers', () => {
			assert.ok(Object.is(log2FloatMemo(1), 0), 'log2(1) must be +0')
			assert.equal(log2FloatMemo(0), -Infinity)
			assert.equal(log2FloatMemo(-0), -Infinity)
			assert.equal(log2FloatMemo(Infinity), Infinity)
			assert.ok(Number.isNaN(log2FloatMemo(-Infinity)))
			assert.ok(Number.isNaN(log2FloatMemo(NaN)))
			assert.ok(Number.isNaN(log2FloatMemo(-1)))
			assert.ok(Number.isNaN(log2FloatMemo(-Number.MIN_VALUE)))
			assert.ok(Number.isNaN(log2FloatMemo(-Number.MAX_VALUE)))
		})

		it('returns exact integers for powers of two across normal and subnormal exponents', () => {
			for (let exp = -1074; exp <= 1023; exp++) {
				const x = 2 ** exp
				assert.equal(
					log2FloatMemo(x),
					exp,
					`Expected exact log2(2^${exp}) === ${exp}`
				)
			}
		})

		it('handles subnormal numbers accurately', () => {
			const subnormals = [
				Number.MIN_VALUE, // 2^-1074
				Number.MIN_VALUE * 3,
				Number.MIN_VALUE * 17,
				Number.MIN_VALUE * 1023,
				Number.MIN_VALUE * 0x1fffff,
				2 ** -1022 - Number.MIN_VALUE, // largest subnormal
				2 ** -1022, // smallest normal
			]
			for (const x of subnormals) {
				const actual = log2FloatMemo(x)
				const expected = Math.log2(x)
				assert.ok(
					ulpDistance(actual, expected) <= 1n,
					`Subnormal x=${x}: got ${actual}, expected ${expected}, ulp=${ulpDistance(actual, expected)}`
				)
			}
		})

		it('handles extreme magnitudes and values very close to 1', () => {
			const cases = [
				Number.MAX_VALUE,
				Number.MAX_VALUE / 3,
				1 + Number.EPSILON,
				1 + 2 * Number.EPSILON,
				1 - Number.EPSILON / 2,
				1 - Number.EPSILON,
				1 + 1e-12,
				1 - 1e-12,
				2 - Number.EPSILON,
				0.5 + Number.EPSILON / 4,
			]
			for (const x of cases) {
				const actual = log2FloatMemo(x)
				const expected = Math.log2(x)
				assert.ok(
					ulpDistance(actual, expected) <= 1n,
					`Edge x=${x}: got ${actual}, expected ${expected}, ulp=${ulpDistance(actual, expected)}`
				)
			}
		})
	})

	describe('normal cases and table coverage', () => {
		it('computes accurate log2 for common positive values', () => {
			const values = [
				0.1,
				0.25,
				0.3,
				0.5,
				0.75,
				Math.SQRT1_2,
				Math.SQRT2,
				Math.E,
				Math.PI,
				3,
				5,
				7,
				10,
				100,
				1000,
				123456.789,
				1e20,
				1e-20,
				1e150,
				1e-150,
			]
			for (const x of values) {
				const actual = log2FloatMemo(x)
				const expected = Math.log2(x)
				assert.ok(
					ulpDistance(actual, expected) <= 1n,
					`x=${x}: got ${actual}, expected ${expected}, ulp=${ulpDistance(actual, expected)}`
				)
			}
		})

		it('is accurate across all 257 table nodes and midpoints', () => {
			for (let i = 0; i <= 256; i++) {
				const node = 1 + i / 256
				const actualNode = log2FloatMemo(node)
				const expectedNode = Math.log2(node)
				assert.ok(
					ulpDistance(actualNode, expectedNode) <= 1n,
					`Table node i=${i}: got ${actualNode}, expected ${expectedNode}`
				)

				if (i < 256) {
					const mid = 1 + (i + 0.5) / 256
					const actualMid = log2FloatMemo(mid)
					const expectedMid = Math.log2(mid)
					assert.ok(
						ulpDistance(actualMid, expectedMid) <= 1n,
						`Table midpoint i=${i}: got ${actualMid}, expected ${expectedMid}`
					)
				}
			}
		})
	})

	describe('memoization and cache behavior', () => {
		it('returns bitwise-identical results on repeated lookups', () => {
			const inputs = [Math.PI, Math.E, 42.125, 1e-100, 1e100, Number.MIN_VALUE * 9]
			const firstPass = inputs.map((x) => log2FloatMemo(x))
			const secondPass = inputs.map((x) => log2FloatMemo(x))
			for (let i = 0; i < inputs.length; i++) {
				assert.ok(
					Object.is(firstPass[i], secondPass[i]),
					`Repeated call mismatch for ${inputs[i]}`
				)
			}
		})

		it('remains accurate beyond the 4096-entry cache eviction boundary', () => {
			// Insert > 5000 distinct keys to exercise FIFO eviction, then re-query early keys.
			const probe = 3.141592653589793
			const beforeEviction = log2FloatMemo(probe)

			for (let i = 1; i <= 5000; i++) {
				const x = 1 + i * 0.000137
				const actual = log2FloatMemo(x)
				const expected = Math.log2(x)
				assert.ok(
					ulpDistance(actual, expected) <= 1n,
					`Eviction sweep x=${x}: ulp=${ulpDistance(actual, expected)}`
				)
			}

			const afterEviction = log2FloatMemo(probe)
			assert.ok(Object.is(beforeEviction, afterEviction))
		})
	})

	describe('independent mathematical cross-checks', () => {
		it('satisfies round-trip identity 2 ** log2FloatMemo(x) ≈ x and matches Math.log2', () => {
			// Deterministic PRNG (xorshift32) for reproducible sampling.
			let state = 0x12345678
			const nextRand = () => {
				state ^= state << 13
				state ^= state >>> 17
				state ^= state << 5
				return (state >>> 0) / 0x100000000
			}

			for (let i = 0; i < 500; i++) {
				const exp = Math.floor(nextRand() * 1900) - 950
				const mant = 1 + nextRand()
				const x = mant * 2 ** exp
				const y = log2FloatMemo(x)
				const ref = Math.log2(x)

				assert.ok(
					ulpDistance(y, ref) <= 1n,
					`Math.log2 mismatch for x=${x}: ulp=${ulpDistance(y, ref)}`
				)

				const reconstructed = 2 ** y
				const relErr = Math.abs(reconstructed - x) / x
				assert.ok(
					relErr < 1e-12,
					`Round-trip 2**y != x for x=${x}: reconstructed=${reconstructed}, relErr=${relErr}`
				)
			}
		})

		it('satisfies logarithm algebraic identities: product, quotient, and power', () => {
			const pairs = [
				[3, 5],
				[7.25, 11.5],
				[0.125, 99.75],
				[1e-40, 1e60],
				[Math.PI, Math.E],
			]
			for (const [a, b] of pairs) {
				const logProd = log2FloatMemo(a * b)
				const sumLogs = log2FloatMemo(a) + log2FloatMemo(b)
				assert.ok(
					Math.abs(logProd - sumLogs) <= 1e-13 * Math.max(1, Math.abs(logProd)),
					`Product identity failed for (${a}, ${b})`
				)

				const logQuot = log2FloatMemo(a / b)
				const diffLogs = log2FloatMemo(a) - log2FloatMemo(b)
				assert.ok(
					Math.abs(logQuot - diffLogs) <= 1e-13 * Math.max(1, Math.abs(logQuot)),
					`Quotient identity failed for (${a}, ${b})`
				)
			}

			// Power identity: log2(x^n) = n * log2(x)
			for (const x of [1.5, 3.7, 10, 0.3]) {
				for (const n of [-3, -1, 2, 5]) {
					const lhs = log2FloatMemo(x ** n)
					const rhs = n * log2FloatMemo(x)
					assert.ok(
						Math.abs(lhs - rhs) <= 1e-13 * Math.max(1, Math.abs(rhs)),
						`Power identity failed for x=${x}, n=${n}`
					)
				}
			}
		})
	})
})
