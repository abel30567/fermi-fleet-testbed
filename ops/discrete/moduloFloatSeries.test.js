import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { moduloFloatSeries } from './moduloFloatSeries.js'

describe('moduloFloatSeries', () => {
	it('computes floored modulo for positive dividends and divisors', () => {
		assert.equal(moduloFloatSeries(7, 3), 1)
		assert.equal(moduloFloatSeries(10, 4), 2)
		assert.equal(moduloFloatSeries(3, 7), 3)
		assert.equal(moduloFloatSeries(5.5, 2), 1.5)
		assert.equal(moduloFloatSeries(3.75, 1.5), 0.75)
	})

	it('computes floored modulo for negative dividends and positive divisors', () => {
		assert.equal(moduloFloatSeries(-7, 3), 2)
		assert.equal(moduloFloatSeries(-1, 5), 4)
		assert.equal(moduloFloatSeries(-5.5, 2), 0.5)
		assert.equal(moduloFloatSeries(-0.25, 1), 0.75)
	})

	it('computes floored modulo for negative divisors', () => {
		assert.equal(moduloFloatSeries(7, -3), -2)
		assert.equal(moduloFloatSeries(1, -5), -4)
		assert.equal(moduloFloatSeries(5.5, -2), -0.5)
		assert.equal(moduloFloatSeries(-7, -3), -1)
		assert.equal(moduloFloatSeries(-1, -5), -1)
		assert.equal(moduloFloatSeries(-5.5, -2), -1.5)
	})

	it('handles zero dividends and exact multiples without returning -0', () => {
		const cases = [
			[0, 3],
			[-0, 3],
			[0, -3],
			[-0, -3],
			[6, 3],
			[-6, 3],
			[6, -3],
			[-6, -3],
			[7.5, 2.5],
			[-7.5, 2.5],
			[-7.5, -2.5],
		]
		for (const [a, m] of cases) {
			const res = moduloFloatSeries(a, m)
			assert.equal(Object.is(res, 0), true, `expected +0 for (${a}, ${m}), got ${res}`)
		}
	})

	it('handles tiny values near zero and boundary rounding when |a| < eps * |m|', () => {
		// Opposite signs: r + m rounds to m, so result wraps to +0 to stay inside [0, m) or (m, 0].
		assert.equal(Object.is(moduloFloatSeries(-1e-17, 1), 0), true)
		assert.equal(Object.is(moduloFloatSeries(-Number.MIN_VALUE, 1), 0), true)
		assert.equal(Object.is(moduloFloatSeries(-1e-16, 10), 0), true)
		assert.equal(Object.is(moduloFloatSeries(1e-17, -1), 0), true)
		assert.equal(Object.is(moduloFloatSeries(Number.MIN_VALUE, -1), 0), true)

		// Same signs: tiny remainder must be preserved exactly without precision loss.
		assert.equal(moduloFloatSeries(1e-17, 1), 1e-17)
		assert.equal(moduloFloatSeries(Number.MIN_VALUE, 1), Number.MIN_VALUE)
		assert.equal(moduloFloatSeries(-1e-17, -1), -1e-17)
		assert.equal(moduloFloatSeries(-Number.MIN_VALUE, -1), -Number.MIN_VALUE)
	})

	it('avoids precision loss for large |a / m| and overflow near MAX_VALUE', () => {
		assert.equal(moduloFloatSeries(1e20, 3), 1)
		assert.equal(moduloFloatSeries(-1e20, 3), 2)
		assert.equal(moduloFloatSeries(1e308, 1.5e308), 1e308)
		assert.equal(moduloFloatSeries(-1e308, 1.5e308), 0.5e308)
		assert.equal(Object.is(moduloFloatSeries(Number.MAX_VALUE, Number.MAX_VALUE), 0), true)
		assert.equal(Object.is(moduloFloatSeries(-Number.MAX_VALUE, Number.MAX_VALUE), 0), true)
	})

	it('throws on invalid inputs (m === 0, NaN, Infinity, non-numbers)', () => {
		assert.throws(() => moduloFloatSeries(5, 0), RangeError)
		assert.throws(() => moduloFloatSeries(5, -0), RangeError)
		assert.throws(() => moduloFloatSeries(NaN, 3), RangeError)
		assert.throws(() => moduloFloatSeries(3, NaN), RangeError)
		assert.throws(() => moduloFloatSeries(Infinity, 3), RangeError)
		assert.throws(() => moduloFloatSeries(-Infinity, 3), RangeError)
		assert.throws(() => moduloFloatSeries(3, Infinity), RangeError)
		assert.throws(() => moduloFloatSeries(3, -Infinity), RangeError)

		assert.throws(() => moduloFloatSeries('5', 3), TypeError)
		assert.throws(() => moduloFloatSeries(5, '3'), TypeError)
		assert.throws(() => moduloFloatSeries(null, 3), TypeError)
		assert.throws(() => moduloFloatSeries(5, undefined), TypeError)
		assert.throws(() => moduloFloatSeries(5n, 3), TypeError)
	})

	it('cross-check: satisfies division algorithm identity a === m * floor(a / m) + r and range bounds', () => {
		// Exact dyadic rationals so m * q + r is exact in binary64.
		const dividends = [-17.75, -8, -3.125, -0.5, 0, 0.25, 3.125, 8, 17.75]
		const divisors = [-4, -1.5, -0.5, 0.5, 1.5, 4]

		for (const a of dividends) {
			for (const m of divisors) {
				const r = moduloFloatSeries(a, m)
				const q = Math.floor(a / m)
				assert.equal(m * q + r, a, `division identity failed for a=${a}, m=${m}`)
				if (m > 0) {
					assert.ok(r >= 0 && r < m, `range [0, ${m}) violated: r=${r}`)
				} else {
					assert.ok(r <= 0 && r > m, `range (${m}, 0] violated: r=${r}`)
				}
			}
		}
	})

	it('cross-check: satisfies periodicity mod(a + k * m, m) === mod(a, m) and negation symmetry', () => {
		const pairs = [
			[1.25, 2.5],
			[-1.25, 2.5],
			[1.25, -2.5],
			[-1.25, -2.5],
			[0.375, 1.5],
			[-0.375, 1.5],
		]
		const shifts = [-5, -2, -1, 0, 1, 2, 5]

		for (const [a, m] of pairs) {
			const base = moduloFloatSeries(a, m)
			for (const k of shifts) {
				assert.equal(
					moduloFloatSeries(a + k * m, m),
					base,
					`periodicity failed for a=${a}, m=${m}, k=${k}`,
				)
			}
			const neg = moduloFloatSeries(-a, -m)
			if (base === 0) {
				assert.equal(Object.is(neg, 0), true)
			} else {
				assert.equal(neg, -base, `negation symmetry failed for a=${a}, m=${m}`)
			}
		}
	})

	it('cross-check: matches exact BigInt floored modulo for large float64 integers', () => {
		const bigDividends = [
			1e20,
			-1e20,
			2 ** 80 + 2 ** 30,
			-(2 ** 80 + 2 ** 30),
			Number.MAX_VALUE,
			-Number.MAX_VALUE,
		]
		const intDivisors = [3, 7, 97, -3, -7, -97]

		for (const a of bigDividends) {
			const A = BigInt(a)
			for (const m of intDivisors) {
				const M = BigInt(m)
				let expected = A % M
				if (expected !== 0n && (expected > 0n) !== (M > 0n)) {
					expected += M
				}
				assert.equal(
					moduloFloatSeries(a, m),
					Number(expected),
					`BigInt mismatch for a=${a}, m=${m}`,
				)
			}
		}
	})
})
