import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sqrtFloatRecursive } from './sqrtFloatRecursive.js'

/**
 * Deterministic xorshift32 PRNG for reproducible fuzz / cross-check tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state ^= state << 13
		state ^= state >>> 17
		state ^= state << 5
		return (state >>> 0) / 0x100000000
	}
}

describe('sqrtFloatRecursive', () => {
	describe('normal cases', () => {
		test('computes exact roots for integer and fractional perfect squares', () => {
			const cases = [
				[1, 1],
				[4, 2],
				[9, 3],
				[16, 4],
				[25, 5],
				[36, 6],
				[49, 7],
				[64, 8],
				[81, 9],
				[100, 10],
				[144, 12],
				[1024, 32],
				[65536, 256],
				[1e12, 1e6],
				[0.25, 0.5],
				[0.0625, 0.25],
				[2.25, 1.5],
				[6.25, 2.5],
				[12.25, 3.5],
			]
			for (const [input, expected] of cases) {
				const r = sqrtFloatRecursive(input)
				assert.equal(r, expected, `sqrtFloatRecursive(${input}) should be ${expected}`)
				assert.equal(r * r, input, `r * r should equal ${input} for exact square`)
			}
		})

		test('computes accurate roots for irrational and non-square values', () => {
			const inputs = [2, 3, 5, 7, 10, 0.1, 0.5, 0.75, 1.5, 3.99, 15.21, Math.PI, Math.E, 123456.789]
			for (const x of inputs) {
				const r = sqrtFloatRecursive(x)
				assert.equal(r, Math.sqrt(x), `mismatch for ${x}`)
			}
		})
	})

	describe('edge cases', () => {
		test('handles +0 and preserves -0 sign per IEEE-754', () => {
			assert.ok(Object.is(sqrtFloatRecursive(0), 0))
			assert.ok(Object.is(sqrtFloatRecursive(-0), -0))
		})

		test('handles +Infinity', () => {
			assert.equal(sqrtFloatRecursive(Infinity), Infinity)
		})

		test('handles subnormals and Number.MIN_VALUE', () => {
			const subnormals = [
				Number.MIN_VALUE,
				Number.MIN_VALUE * 2,
				Number.MIN_VALUE * 3,
				Number.MIN_VALUE * 16,
				Number.MIN_VALUE * 1024,
				2 ** -1074,
				2 ** -1073,
				2 ** -1050,
				2 ** -1023,
				2 ** -1022, // smallest positive normal
				(2 ** -1022) - Number.MIN_VALUE, // largest subnormal
			]
			for (const x of subnormals) {
				assert.equal(
					sqrtFloatRecursive(x),
					Math.sqrt(x),
					`subnormal mismatch for ${x}`,
				)
			}
		})

		test('handles extreme large values including Number.MAX_VALUE and MAX_SAFE_INTEGER', () => {
			const larges = [
				Number.MAX_SAFE_INTEGER,
				Number.MAX_SAFE_INTEGER - 1,
				1e100,
				1e200,
				1e300,
				1e308,
				2 ** 1022,
				2 ** 1023,
				Number.MAX_VALUE / 4,
				Number.MAX_VALUE / 2,
				Number.MAX_VALUE,
			]
			for (const x of larges) {
				assert.equal(
					sqrtFloatRecursive(x),
					Math.sqrt(x),
					`large value mismatch for ${x}`,
				)
			}
		})

		test('handles all exact powers of 2 across the entire float64 exponent range', () => {
			for (let exp = -1074; exp <= 1023; exp += 1) {
				const x = 2 ** exp
				const r = sqrtFloatRecursive(x)
				assert.equal(r, Math.sqrt(x), `mismatch for 2^${exp}`)
				if (exp % 2 === 0) {
					assert.equal(r, 2 ** (exp / 2), `exact power of 2 root failed for 2^${exp}`)
					assert.equal(r * r, x, `r * r !== 2^${exp}`)
				}
			}
		})

		test('handles boundary values around 1, 2, 4, and powers of 4', () => {
			const boundaries = [
				Number.EPSILON,
				1 - Number.EPSILON / 2,
				1,
				1 + Number.EPSILON,
				2 - Number.EPSILON,
				2,
				2 + Number.EPSILON * 2,
				4 - Number.EPSILON * 2,
				4,
				4 + Number.EPSILON * 4,
				0.25 - Number.EPSILON / 8,
				0.25,
				0.25 + Number.EPSILON / 4,
				2 ** 512,
				2 ** -512,
				(2 ** 512) * (1 - Number.EPSILON / 2),
				(2 ** -512) * (1 - Number.EPSILON / 2),
			]
			for (const x of boundaries) {
				assert.equal(
					sqrtFloatRecursive(x),
					Math.sqrt(x),
					`boundary mismatch for ${x}`,
				)
			}
		})
	})

	describe('invalid input errors', () => {
		test('throws TypeError for non-number inputs', () => {
			const nonNumbers = [
				undefined,
				null,
				'4',
				'0',
				'',
				true,
				false,
				4n,
				0n,
				{},
				[],
				[4],
				Symbol('sqrt'),
				() => 4,
			]
			for (const bad of nonNumbers) {
				assert.throws(
					() => sqrtFloatRecursive(bad),
					TypeError,
					`expected TypeError for ${String(bad)}`,
				)
			}
		})

		test('throws RangeError for NaN and negative numbers including -Infinity', () => {
			const outOfDomain = [
				NaN,
				-Number.MIN_VALUE,
				-1e-100,
				-0.0001,
				-1,
				-4,
				-Number.MAX_VALUE,
				-Infinity,
			]
			for (const bad of outOfDomain) {
				assert.throws(
					() => sqrtFloatRecursive(bad),
					RangeError,
					`expected RangeError for ${bad}`,
				)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('matches Math.sqrt bit-for-bit across 2000 deterministic floats spanning all exponents', () => {
			const rand = makeRng(0x5eed1234)
			for (let i = 0; i < 2000; i += 1) {
				// Pick exponent uniformly across [-1074, 1022] and random mantissa in [1, 2)
				const exp = Math.floor(rand() * 2097) - 1074
				const mantissa = 1 + rand()
				const x = mantissa * (2 ** exp)
				if (x === 0 || !Number.isFinite(x)) {
					continue
				}
				const actual = sqrtFloatRecursive(x)
				const expected = Math.sqrt(x)
				assert.ok(
					Object.is(actual, expected),
					`bit mismatch for x=${x} (exp=${exp}): got ${actual}, expected ${expected}`,
				)
			}
		})

		test('satisfies inverse property r * r ≈ x and monotonicity', () => {
			const rand = makeRng(0xdecafbad)
			const samples = []
			for (let i = 0; i < 500; i += 1) {
				const exp = Math.floor(rand() * 600) - 300
				const x = (1 + rand()) * (2 ** exp)
				samples.push(x)
				const r = sqrtFloatRecursive(x)
				const relErr = Math.abs(r * r - x) / x
				assert.ok(
					relErr <= 2 * Number.EPSILON,
					`inverse error too large for x=${x}: relErr=${relErr}`,
				)
			}

			// Verify r * r === x for generated exact float squares
			for (let i = 0; i < 200; i += 1) {
				const base = Math.floor(rand() * 1e7) + 1
				const sq = base * base
				const r = sqrtFloatRecursive(sq)
				assert.equal(r, base)
				assert.equal(r * r, sq)
			}

			// Verify monotonicity across sorted samples
			samples.sort((a, b) => a - b)
			for (let i = 1; i < samples.length; i += 1) {
				assert.ok(
					sqrtFloatRecursive(samples[i - 1]) <= sqrtFloatRecursive(samples[i]),
					`monotonicity violated between ${samples[i - 1]} and ${samples[i]}`,
				)
			}
		})

		test('satisfies multiplicative identity sqrt(a * b) ≈ sqrt(a) * sqrt(b)', () => {
			const rand = makeRng(0x12345678)
			for (let i = 0; i < 200; i += 1) {
				const a = 0.01 + rand() * 1e6
				const b = 0.01 + rand() * 1e6
				const lhs = sqrtFloatRecursive(a * b)
				const rhs = sqrtFloatRecursive(a) * sqrtFloatRecursive(b)
				const relErr = Math.abs(lhs - rhs) / lhs
				assert.ok(
					relErr <= 4 * Number.EPSILON,
					`multiplicative error too large for a=${a}, b=${b}: relErr=${relErr}`,
				)
			}
		})
	})
})
