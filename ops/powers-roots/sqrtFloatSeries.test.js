import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sqrtFloatSeries } from './sqrtFloatSeries.js'

const ULP_BUF = new ArrayBuffer(8)
const ULP_VIEW = new DataView(ULP_BUF)

/**
 * Computes the ULP (Units in the Last Place) distance between two finite float64 numbers.
 */
function ulpDistance(a, b) {
	if (Object.is(a, b)) return 0n
	if (a === 0 && b === 0) return 0n
	ULP_VIEW.setFloat64(0, a, false)
	const bitsA = ULP_VIEW.getBigInt64(0, false)
	ULP_VIEW.setFloat64(0, b, false)
	const bitsB = ULP_VIEW.getBigInt64(0, false)
	const orderedA = bitsA < 0n ? -(bitsA & 0x7fffffffffffffffn) : bitsA
	const orderedB = bitsB < 0n ? -(bitsB & 0x7fffffffffffffffn) : bitsB
	return orderedA >= orderedB ? orderedA - orderedB : orderedB - orderedA
}

describe('sqrtFloatSeries', () => {
	describe('input validation', () => {
		test('throws TypeError for non-number inputs', () => {
			const invalidTypes = ['4', '', null, undefined, true, false, {}, [], 4n, Symbol('x'), () => 4]
			for (const value of invalidTypes) {
				assert.throws(() => sqrtFloatSeries(value), { name: 'TypeError' })
			}
		})

		test('throws RangeError for non-finite numbers', () => {
			for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
				assert.throws(() => sqrtFloatSeries(value), { name: 'RangeError' })
			}
		})

		test('throws RangeError for negative finite numbers', () => {
			const negatives = [-Number.MIN_VALUE, -1e-308, -1e-12, -0.5, -1, -2, -4, -1e100, -Number.MAX_VALUE]
			for (const value of negatives) {
				assert.throws(() => sqrtFloatSeries(value), { name: 'RangeError' })
			}
		})
	})

	describe('edge cases', () => {
		test('handles +0, -0, and 1', () => {
			assert.equal(Object.is(sqrtFloatSeries(0), 0), true)
			assert.equal(Object.is(sqrtFloatSeries(-0), -0), true)
			assert.equal(sqrtFloatSeries(1), 1)
		})

		test('handles very small subnormals accurately', () => {
			const subnormals = [
				Number.MIN_VALUE, // 2^-1074
				Number.MIN_VALUE * 2, // 2^-1073
				Number.MIN_VALUE * 3,
				Number.MIN_VALUE * 9,
				2 ** -1070,
				2 ** -1050,
				2 ** -1023,
				2 ** -1022 - Number.MIN_VALUE, // largest subnormal
				2 ** -1022, // smallest normal
			]
			for (const x of subnormals) {
				const got = sqrtFloatSeries(x)
				const expected = Math.sqrt(x)
				assert.ok(
					ulpDistance(got, expected) <= 1n,
					`subnormal x=${x}: got ${got}, expected ${expected}, ulp=${ulpDistance(got, expected)}`,
				)
				const relErr = Math.abs(got * got - x) / x
				assert.ok(relErr <= 1e-15, `subnormal y*y ≈ x failed for x=${x}: relErr=${relErr}`)
			}
		})

		test('handles very large floats near Number.MAX_VALUE accurately', () => {
			const largeValues = [
				1e100,
				1e200,
				1e300,
				1e308,
				2 ** 1022,
				2 ** 1023,
				Number.MAX_VALUE * 0.5,
				Number.MAX_VALUE * 0.75,
				Number.MAX_VALUE,
			]
			for (const x of largeValues) {
				const got = sqrtFloatSeries(x)
				const expected = Math.sqrt(x)
				assert.ok(
					ulpDistance(got, expected) <= 1n,
					`large x=${x}: got ${got}, expected ${expected}, ulp=${ulpDistance(got, expected)}`,
				)
				// Check y * y ≈ x without overflowing intermediate product near MAX_VALUE
				if (x < 1e307) {
					const relErr = Math.abs(got * got - x) / x
					assert.ok(relErr <= 1e-15, `large y*y ≈ x failed for x=${x}: relErr=${relErr}`)
				} else {
					const scaled = got * 0.5
					const relErr = Math.abs(scaled * scaled - x * 0.25) / (x * 0.25)
					assert.ok(relErr <= 1e-15, `large scaled y*y ≈ x failed for x=${x}: relErr=${relErr}`)
				}
			}
		})

		test('handles values immediately around powers of 2 and 4', () => {
			const pivots = [0.25, 0.5, 1, 2, 4, 8, 16, 64, 1024, 2 ** -52, 2 ** 52]
			for (const p of pivots) {
				for (const delta of [-2, -1, 0, 1, 2]) {
					const x = p * (1 + delta * Number.EPSILON)
					const got = sqrtFloatSeries(x)
					const expected = Math.sqrt(x)
					assert.ok(
						ulpDistance(got, expected) <= 1n,
						`pivot x=${x}: got ${got}, expected ${expected}, ulp=${ulpDistance(got, expected)}`,
					)
				}
			}
		})
	})

	describe('normal cases and cross-checks', () => {
		test('computes exact roots for small and medium perfect squares', () => {
			const bases = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 25, 32, 64, 100, 256, 1024, 65536]
			for (const b of bases) {
				const x = b * b
				const got = sqrtFloatSeries(x)
				assert.ok(
					ulpDistance(got, b) <= 1n,
					`perfect square ${x}: got ${got}, expected ${b}, ulp=${ulpDistance(got, b)}`,
				)
			}
		})

		test('matches Math.sqrt within 1 ULP for common irrationals and fractions', () => {
			const values = [
				0.0001,
				0.01,
				0.1,
				0.25,
				0.5,
				0.75,
				0.999999999999,
				1.000000000001,
				1.5,
				2,
				3,
				5,
				7,
				10,
				Math.PI,
				Math.E,
				42.195,
				123456.789,
				9876543210.123456,
			]
			for (const x of values) {
				const got = sqrtFloatSeries(x)
				const expected = Math.sqrt(x)
				assert.ok(
					ulpDistance(got, expected) <= 1n,
					`x=${x}: got ${got}, expected ${expected}, ulp=${ulpDistance(got, expected)}`,
				)
				const relErr = Math.abs(got * got - x) / x
				assert.ok(relErr <= 1e-15, `y*y ≈ x failed for x=${x}: relErr=${relErr}`)
			}
		})

		test('cross-checks against Math.sqrt and y*y ≈ x across 5000 deterministic samples spanning full float64 range', () => {
			// Deterministic xorshift64* PRNG for reproducible full-range coverage
			let state = 0x2545f4914f6cdd1dn
			function nextU64() {
				state ^= state >> 12n
				state ^= (state << 25n) & 0xffffffffffffffffn
				state ^= state >> 27n
				return (state * 0x2545f4914f6cdd1dn) & 0xffffffffffffffffn
			}

			let maxUlp = 0n
			for (let i = 0; i < 5000; i += 1) {
				// Pick exponent uniformly across [-1074, 1022] and random 52-bit mantissa
				const raw = nextU64()
				const expIdx = Number(raw % 2047n) // 0..2046 (includes subnormals at 0 and all normals)
				const mantissa = (raw >> 11n) & 0x000fffffffffffffn
				const bits = (BigInt(expIdx) << 52n) | mantissa
				if (bits === 0n) continue

				ULP_VIEW.setBigUint64(0, bits, false)
				const x = ULP_VIEW.getFloat64(0, false)

				const got = sqrtFloatSeries(x)
				const expected = Math.sqrt(x)
				const ulp = ulpDistance(got, expected)
				if (ulp > maxUlp) maxUlp = ulp

				assert.ok(ulp <= 1n, `sample #${i} x=${x}: got ${got}, expected ${expected}, ulp=${ulp}`)

				// Verify y * y ≈ x without overflowing near MAX_VALUE or underflowing subnormals
				if (x < 1e307) {
					const relErr = Math.abs(got * got - x) / x
					assert.ok(relErr <= 1e-15, `sample #${i} y*y ≈ x failed for x=${x}: relErr=${relErr}`)
				} else {
					const yHalf = got * 0.5
					const xQuarter = x * 0.25
					const relErr = Math.abs(yHalf * yHalf - xQuarter) / xQuarter
					assert.ok(relErr <= 1e-15, `sample #${i} scaled y*y ≈ x failed for x=${x}: relErr=${relErr}`)
				}
			}

			assert.ok(maxUlp <= 1n, `Expected max ULP <= 1, got ${maxUlp}`)
		})
	})
})
