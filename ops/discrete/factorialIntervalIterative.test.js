import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { factorialIntervalIterative } from './factorialIntervalIterative.js'

/**
 * Independent BigInt exact factorial for cross-checking enclosure guarantees.
 *
 * @param {number} n
 * @returns {bigint}
 */
function exactFactorialBigInt(n) {
	let result = 1n
	for (let k = 2n; k <= BigInt(n); k++) {
		result *= k
	}
	return result
}

/**
 * Verifies that an IEEE-754 float64 interval [loOut, hiOut] strictly encloses
 * `exact` (a BigInt), i.e., loOut <= exact <= hiOut.
 *
 * @param {[number, number]} out
 * @param {bigint} exact
 * @param {string} [label]
 */
function assertEnclosesBigInt([loOut, hiOut], exact, label = '') {
	assert.equal(typeof loOut, 'number', `${label}: loOut should be a number`)
	assert.equal(typeof hiOut, 'number', `${label}: hiOut should be a number`)
	assert.ok(!Number.isNaN(loOut), `${label}: loOut should not be NaN`)
	assert.ok(!Number.isNaN(hiOut), `${label}: hiOut should not be NaN`)
	assert.ok(loOut <= hiOut, `${label}: loOut (${loOut}) must be <= hiOut (${hiOut})`)
	assert.ok(Number.isFinite(loOut), `${label}: loOut must be finite`)

	assert.ok(
		BigInt(loOut) <= exact,
		`${label}: lower bound ${BigInt(loOut)} must be <= exact ${exact}`,
	)

	if (hiOut !== Infinity) {
		assert.ok(
			exact <= BigInt(hiOut),
			`${label}: exact ${exact} must be <= upper bound ${BigInt(hiOut)}`,
		)
	}
}

describe('factorialIntervalIterative', () => {
	describe('normal cases (exact in float64)', () => {
		test('[0, 0] -> [1, 1]', () => {
			assert.deepEqual(factorialIntervalIterative([0, 0]), [1, 1])
		})

		test('[-0, 0] -> [1, 1]', () => {
			assert.deepEqual(factorialIntervalIterative([-0, 0]), [1, 1])
		})

		test('[0, 1] -> [1, 1]', () => {
			assert.deepEqual(factorialIntervalIterative([0, 1]), [1, 1])
		})

		test('[1, 1] -> [1, 1]', () => {
			assert.deepEqual(factorialIntervalIterative([1, 1]), [1, 1])
		})

		test('[3, 5] -> [6, 120]', () => {
			assert.deepEqual(factorialIntervalIterative([3, 5]), [6, 120])
		})

		test('[10, 12] -> [3628800, 479001600]', () => {
			assert.deepEqual(factorialIntervalIterative([10, 12]), [3628800, 479001600])
		})

		test('[0, 22] and [22, 22] are exact in binary64', () => {
			const exact22 = exactFactorialBigInt(22)
			const exact22Num = Number(exact22)
			assert.equal(BigInt(exact22Num), exact22, '22! is exact in binary64')
			assert.deepEqual(factorialIntervalIterative([22, 22]), [exact22Num, exact22Num])
			assert.deepEqual(factorialIntervalIterative([0, 22]), [1, exact22Num])
		})
	})

	describe('precision beyond 2^53 (n >= 23) and outward rounding', () => {
		test('[23, 23] produces strict non-degenerate outward enclosure around exact 23!', () => {
			const [lo, hi] = factorialIntervalIterative([23, 23])
			const exact23 = exactFactorialBigInt(23)

			assert.ok(lo < hi, `expected outward-rounded bounds lo < hi for 23!, got [${lo}, ${hi}]`)
			assert.ok(BigInt(lo) < exact23, 'lo must be strictly below exact 23!')
			assert.ok(exact23 < BigInt(hi), 'hi must be strictly above exact 23!')
			assertEnclosesBigInt([lo, hi], exact23, '[23, 23]')
		})

		test('point intervals [n, n] for all n in 23..170 strictly enclose n! within 1 ULP', () => {
			const buf = new ArrayBuffer(8)
			const f64 = new Float64Array(buf)
			const u64 = new BigUint64Array(buf)

			for (let n = 23; n <= 170; n++) {
				const [lo, hi] = factorialIntervalIterative([n, n])
				const exact = exactFactorialBigInt(n)

				assert.ok(Number.isFinite(lo) && Number.isFinite(hi), `n=${n} must stay finite`)
				assert.ok(lo < hi, `n=${n}: 23..170 factorials are inexact in float64, so lo < hi`)
				assertEnclosesBigInt([lo, hi], exact, `[${n}, ${n}]`)

				// Verify optimal tightness: hi is the immediate IEEE-754 successor of lo (1 ULP apart)
				f64[0] = lo
				const loBits = u64[0]
				f64[0] = hi
				const hiBits = u64[0]
				assert.equal(hiBits - loBits, 1n, `n=${n}: enclosure should be tightly 1 ULP wide`)
			}
		})

		test('wide interval [23, 40] encloses every exact BigInt factorial k! for k in 23..40', () => {
			const out = factorialIntervalIterative([23, 40])
			for (let k = 23; k <= 40; k++) {
				assertEnclosesBigInt(out, exactFactorialBigInt(k), `k=${k} in [23, 40]`)
			}
			// Endpoints specifically match RD(23!) and RU(40!)
			assert.equal(out[0], factorialIntervalIterative([23, 23])[0])
			assert.equal(out[1], factorialIntervalIterative([40, 40])[1])
		})
	})

	describe('overflow handling (n > 170)', () => {
		test('[170, 170] remains finite and encloses exact 170!', () => {
			const out = factorialIntervalIterative([170, 170])
			assert.ok(Number.isFinite(out[0]) && Number.isFinite(out[1]))
			assertEnclosesBigInt(out, exactFactorialBigInt(170), '[170, 170]')
		})

		test('[170, 171] overflows upper bound to Infinity while preserving finite lower bound', () => {
			const out = factorialIntervalIterative([170, 171])
			assert.equal(out[0], factorialIntervalIterative([170, 170])[0])
			assert.equal(out[1], Infinity)
			assertEnclosesBigInt(out, exactFactorialBigInt(170), '170 in [170, 171]')
			assertEnclosesBigInt(out, exactFactorialBigInt(171), '171 in [170, 171]')
		})

		test('[0, 171] -> [1, Infinity]', () => {
			assert.deepEqual(factorialIntervalIterative([0, 171]), [1, Infinity])
		})

		test('[10, 200] -> [3628800, Infinity]', () => {
			assert.deepEqual(factorialIntervalIterative([10, 200]), [3628800, Infinity])
		})

		test('[171, 171] and [171, 500] return [Number.MAX_VALUE, Infinity] enclosing exact BigInt values', () => {
			const out171 = factorialIntervalIterative([171, 171])
			assert.deepEqual(out171, [Number.MAX_VALUE, Infinity])
			assertEnclosesBigInt(out171, exactFactorialBigInt(171), '[171, 171]')

			const outRange = factorialIntervalIterative([171, 180])
			assert.deepEqual(outRange, [Number.MAX_VALUE, Infinity])
			for (let k = 171; k <= 180; k++) {
				assertEnclosesBigInt(outRange, exactFactorialBigInt(k), `k=${k} in [171, 180]`)
			}

			// Large overflow intervals should complete immediately without looping up to hi
			assert.deepEqual(factorialIntervalIterative([1000, 1_000_000]), [Number.MAX_VALUE, Infinity])
		})
	})

	describe('cross-check against independent BigInt exact factorial across mixed intervals', () => {
		test('every integer k in sample intervals satisfies loOut <= exact(k!) <= hiOut', () => {
			const intervals = [
				[0, 10],
				[5, 25],
				[20, 35],
				[50, 60],
				[165, 175],
			]
			for (const [lo, hi] of intervals) {
				const out = factorialIntervalIterative([lo, hi])
				for (let k = lo; k <= hi; k++) {
					assertEnclosesBigInt(out, exactFactorialBigInt(k), `k=${k} in [${lo}, ${hi}]`)
				}
			}
		})
	})

	describe('input validation', () => {
		test('rejects non-array and wrong-length inputs with TypeError', () => {
			for (const bad of [null, undefined, 5, '0,1', { lo: 0, hi: 1 }, [], [1], [1, 2, 3]]) {
				assert.throws(() => factorialIntervalIterative(bad), TypeError)
			}
		})

		test('rejects non-number endpoints with TypeError', () => {
			for (const bad of [
				['0', 1],
				[0, '1'],
				[0n, 1n],
				[null, 1],
				[0, undefined],
			]) {
				assert.throws(() => factorialIntervalIterative(bad), TypeError)
			}
		})

		test('rejects non-finite endpoints (NaN, Infinity, -Infinity) with RangeError', () => {
			for (const bad of [
				[NaN, 1],
				[0, NaN],
				[0, Infinity],
				[-Infinity, 0],
				[Infinity, Infinity],
			]) {
				assert.throws(() => factorialIntervalIterative(bad), RangeError)
			}
		})

		test('rejects non-integer endpoints with RangeError', () => {
			for (const bad of [
				[0.5, 2],
				[1, 2.5],
				[1.1, 3.9],
			]) {
				assert.throws(() => factorialIntervalIterative(bad), RangeError)
			}
		})

		test('rejects negative endpoints with RangeError', () => {
			for (const bad of [
				[-1, 0],
				[-5, -1],
				[-1, 5],
			]) {
				assert.throws(() => factorialIntervalIterative(bad), RangeError)
			}
		})

		test('rejects inverted intervals (lo > hi) with RangeError', () => {
			for (const bad of [
				[1, 0],
				[5, 3],
				[171, 170],
			]) {
				assert.throws(() => factorialIntervalIterative(bad), RangeError)
			}
		})
	})
})
