import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moduloDualMemo } from './moduloDualMemo.js'

/**
 * Independent reference implementation of floored modulo on dual numbers.
 * @param {{ v: number, d: number }} a
 * @param {{ v: number, d: number }} b
 * @returns {{ v: number, d: number }}
 */
function referenceModuloDual(a, b) {
	const q = Math.floor(a.v / b.v)
	const v = a.v - q * b.v
	const d = a.d - q * b.d
	return { v: v === 0 ? 0 : v, d: d === 0 ? 0 : d }
}

/**
 * Independent scalar floored modulo for finite-difference derivative verification.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function scalarMod(a, b) {
	return a - Math.floor(a / b) * b
}

test('normal cases: positive integers inside precomputed table', () => {
	// 17 = 3 * 5 + 2 => v = 2, d = 1 - 3 * 0 = 1
	assert.deepEqual(moduloDualMemo({ v: 17, d: 1 }, { v: 5, d: 0 }), { v: 2, d: 1 })
	// Both components carry derivatives: 17 = 3 * 5 + 2 => d = 4 - 3 * 2 = -2
	assert.deepEqual(moduloDualMemo({ v: 17, d: 4 }, { v: 5, d: 2 }), { v: 2, d: -2 })
	// Exact multiple: 20 = 4 * 5 + 0 => v = 0, d = 3 - 4 * 1 = -1
	assert.deepEqual(moduloDualMemo({ v: 20, d: 3 }, { v: 5, d: 1 }), { v: 0, d: -1 })
})

test('normal cases: negative dividends and negative moduli', () => {
	// -1 = (-1) * 5 + 4 => v = 4, d = 2 - (-1) * 3 = 5
	assert.deepEqual(moduloDualMemo({ v: -1, d: 2 }, { v: 5, d: 3 }), { v: 4, d: 5 })
	// -17 = (-4) * 5 + 3 => v = 3, d = -1 - (-4) * 2 = 7
	assert.deepEqual(moduloDualMemo({ v: -17, d: -1 }, { v: 5, d: 2 }), { v: 3, d: 7 })
	// Negative modulus (outside precomputed table): 7 = (-3) * (-3) + (-2)
	assert.deepEqual(moduloDualMemo({ v: 7, d: 1 }, { v: -3, d: 2 }), { v: -2, d: 7 })
	// Both negative: -7 = 2 * (-3) + (-1) => v = -1, d = 5 - 2 * 4 = -3
	assert.deepEqual(moduloDualMemo({ v: -7, d: 5 }, { v: -3, d: 4 }), { v: -1, d: -3 })
})

test('normal cases: non-integer real dual numbers and values outside table bounds', () => {
	// 8.25 = 3 * 2.5 + 0.75 => d = 2 - 3 * 0.4 = 0.8
	const res1 = moduloDualMemo({ v: 8.25, d: 2 }, { v: 2.5, d: 0.4 })
	assert.ok(Math.abs(res1.v - 0.75) < 1e-12)
	assert.ok(Math.abs(res1.d - 0.8) < 1e-12)

	// Large integers outside [-64, 64] x [1, 64]
	assert.deepEqual(moduloDualMemo({ v: 1000, d: 5 }, { v: 97, d: 3 }), { v: 30, d: -25 })
	assert.deepEqual(moduloDualMemo({ v: -1000, d: 2 }, { v: 97, d: 1 }), { v: 67, d: 13 })
})

test('edge cases: zero dividend, negative zero normalization, table boundaries', () => {
	// Zero dividend
	const z1 = moduloDualMemo({ v: 0, d: 0 }, { v: 7, d: 3 })
	assert.ok(Object.is(z1.v, 0))
	assert.ok(Object.is(z1.d, 0))

	// Negative zero inputs normalize to +0
	const z2 = moduloDualMemo({ v: -0, d: -0 }, { v: 3, d: -0 })
	assert.ok(Object.is(z2.v, 0))
	assert.ok(Object.is(z2.d, 0))

	// Exact boundary values of the precomputed table ([-64, 64] x [1, 64])
	assert.deepEqual(moduloDualMemo({ v: -64, d: 1 }, { v: 64, d: 2 }), { v: 0, d: 3 })
	assert.deepEqual(moduloDualMemo({ v: 64, d: 1 }, { v: 64, d: 2 }), { v: 0, d: -1 })
	assert.deepEqual(moduloDualMemo({ v: -64, d: 1 }, { v: 1, d: 1 }), { v: 0, d: 65 })
	assert.deepEqual(moduloDualMemo({ v: 64, d: 1 }, { v: 1, d: 1 }), { v: 0, d: -63 })
	// Just outside table boundaries
	assert.deepEqual(moduloDualMemo({ v: -65, d: 1 }, { v: 64, d: 2 }), { v: 63, d: 5 })
	assert.deepEqual(moduloDualMemo({ v: 65, d: 1 }, { v: 65, d: 2 }), { v: 0, d: -1 })
})

test('input validation errors', () => {
	assert.throws(() => moduloDualMemo(null, { v: 2, d: 0 }), TypeError)
	assert.throws(() => moduloDualMemo({ v: 2, d: 0 }, undefined), TypeError)
	assert.throws(() => moduloDualMemo(5, { v: 2, d: 0 }), TypeError)
	assert.throws(() => moduloDualMemo({ v: '5', d: 0 }, { v: 2, d: 0 }), TypeError)
	assert.throws(() => moduloDualMemo({ v: 5, d: null }, { v: 2, d: 0 }), TypeError)

	assert.throws(() => moduloDualMemo({ v: NaN, d: 0 }, { v: 2, d: 0 }), RangeError)
	assert.throws(() => moduloDualMemo({ v: 5, d: Infinity }, { v: 2, d: 0 }), RangeError)
	assert.throws(() => moduloDualMemo({ v: 5, d: 1 }, { v: -Infinity, d: 0 }), RangeError)
	assert.throws(() => moduloDualMemo({ v: 5, d: 1 }, { v: 0, d: 1 }), RangeError)
	assert.throws(() => moduloDualMemo({ v: 5, d: 1 }, { v: -0, d: 1 }), RangeError)

	// Overflow of quotient or derivative
	assert.throws(() => moduloDualMemo({ v: 1e308, d: 1 }, { v: 1e-10, d: 0 }), RangeError)
	assert.throws(() => moduloDualMemo({ v: 1e200, d: 0 }, { v: 1, d: 1e200 }), RangeError)
})

test('memoization safety: repeated calls, mutation isolation, and cache eviction', () => {
	const a = { v: 123.45, d: 1.5 }
	const b = { v: 17.25, d: -0.5 }
	const first = moduloDualMemo(a, b)
	// Mutate returned object to ensure cached entry is not corrupted
	first.v = 999999
	first.d = -999999
	const second = moduloDualMemo(a, b)
	const expected = referenceModuloDual(a, b)
	assert.deepEqual(second, expected)

	// Exercise cache beyond capacity (4096) to verify eviction works cleanly
	for (let i = 1; i <= 4200; i++) {
		const res = moduloDualMemo({ v: i + 0.3, d: 1 }, { v: 7, d: 0.25 })
		const ref = referenceModuloDual({ v: i + 0.3, d: 1 }, { v: 7, d: 0.25 })
		assert.ok(Math.abs(res.v - ref.v) < 1e-12)
		assert.ok(Math.abs(res.d - ref.d) < 1e-12)
	}
})

test('cross-check: agreement with reference implementation and algebraic identity', () => {
	const aValues = [-100, -64, -13, -1, 0, 1, 7.25, 19, 64, 100, 1234.56]
	const bValues = [-17, -3.5, -1, 1, 2.5, 5, 64, 97]
	const derivs = [-3.5, 0, 1, 2.25]

	for (const av of aValues) {
		for (const bv of bValues) {
			for (const ad of derivs) {
				for (const bd of derivs) {
					const a = { v: av, d: ad }
					const b = { v: bv, d: bd }
					const actual = moduloDualMemo(a, b)
					const expected = referenceModuloDual(a, b)
					assert.ok(Math.abs(actual.v - expected.v) <= 1e-12)
					assert.ok(Math.abs(actual.d - expected.d) <= 1e-12)

					// Verify algebraic identity: q * b + r = a on both primal and tangent parts
					const q = Math.floor(av / bv)
					assert.ok(Math.abs(q * bv + actual.v - av) <= 1e-9)
					assert.ok(Math.abs(q * bd + actual.d - ad) <= 1e-9)
				}
			}
		}
	}
})

test('cross-check: forward-mode derivative matches central finite differences', () => {
	const h = 1e-6
	const cases = [
		{ a: { v: 17.3, d: 1.0 }, b: { v: 5.0, d: 0.0 } },
		{ a: { v: 17.3, d: 0.0 }, b: { v: 5.0, d: 1.0 } },
		{ a: { v: 17.3, d: 2.5 }, b: { v: 5.1, d: -1.3 } },
		{ a: { v: -11.4, d: -0.7 }, b: { v: 3.2, d: 1.8 } },
		{ a: { v: 9.7, d: 1.2 }, b: { v: -4.3, d: 0.9 } },
		{ a: { v: -23.6, d: 3.1 }, b: { v: -6.4, d: -2.2 } },
		{ a: { v: 250.4, d: -1.5 }, b: { v: 13.7, d: 0.6 } },
	]

	for (const { a, b } of cases) {
		const { d } = moduloDualMemo(a, b)
		const fPlus = scalarMod(a.v + h * a.d, b.v + h * b.d)
		const fMinus = scalarMod(a.v - h * a.d, b.v - h * b.d)
		const finiteDiff = (fPlus - fMinus) / (2 * h)
		assert.ok(
			Math.abs(d - finiteDiff) < 1e-6,
			`Expected derivative ${d} to match finite difference ${finiteDiff}`
		)
	}
})
