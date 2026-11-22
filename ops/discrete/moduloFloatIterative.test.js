import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moduloFloatIterative } from './moduloFloatIterative.js'

test('normal positive integers and floats', () => {
	assert.equal(moduloFloatIterative(7, 3), 1)
	assert.equal(moduloFloatIterative(10, 4), 2)
	assert.equal(moduloFloatIterative(2, 5), 2)
	assert.equal(moduloFloatIterative(5.5, 2), 1.5)
	assert.equal(moduloFloatIterative(7.25, 2.5), 2.25)
	assert.ok(Math.abs(moduloFloatIterative(10.5, 0.4) - 0.1) < 1e-12)
})

test('zero dividend and exact multiples return +0', () => {
	assert.ok(Object.is(moduloFloatIterative(0, 5), 0))
	assert.ok(Object.is(moduloFloatIterative(-0, 5), 0))
	assert.ok(Object.is(moduloFloatIterative(0, -5), 0))
	assert.ok(Object.is(moduloFloatIterative(-0, -5), 0))
	assert.ok(Object.is(moduloFloatIterative(12, 4), 0))
	assert.ok(Object.is(moduloFloatIterative(-12, 4), 0))
	assert.ok(Object.is(moduloFloatIterative(12, -4), 0))
	assert.ok(Object.is(moduloFloatIterative(-12, -4), 0))
	assert.ok(Object.is(moduloFloatIterative(7.5, 2.5), 0))
	assert.ok(Object.is(moduloFloatIterative(-7.5, 2.5), 0))
})

test('negative dividend with positive divisor (floored modulo in [0, m))', () => {
	assert.equal(moduloFloatIterative(-1, 3), 2)
	assert.equal(moduloFloatIterative(-7, 3), 2)
	assert.equal(moduloFloatIterative(-2.5, 4), 1.5)
	assert.equal(moduloFloatIterative(-7.25, 2.5), 0.25)
	// Tiny negative dividend where (-1e-20) + 1 rounds to 1 wraps cleanly to 0
	assert.ok(Object.is(moduloFloatIterative(-1e-20, 1), 0))
})

test('negative divisor (floored modulo in (m, 0])', () => {
	assert.equal(moduloFloatIterative(7, -3), -2)
	assert.equal(moduloFloatIterative(-7, -3), -1)
	assert.equal(moduloFloatIterative(1, -3), -2)
	assert.equal(moduloFloatIterative(-1, -3), -1)
	assert.equal(moduloFloatIterative(5.5, -2), -0.5)
	assert.equal(moduloFloatIterative(-5.5, -2), -1.5)
	// Tiny positive dividend with negative divisor wraps cleanly to 0
	assert.ok(Object.is(moduloFloatIterative(1e-20, -1), 0))
})

test('fractional and binary-exact floats', () => {
	assert.equal(moduloFloatIterative(0.75, 0.5), 0.25)
	assert.equal(moduloFloatIterative(-0.75, 0.5), 0.25)
	assert.equal(moduloFloatIterative(0.75, -0.5), -0.25)
	assert.equal(moduloFloatIterative(-0.75, -0.5), -0.25)
	assert.equal(moduloFloatIterative(1 / 8, 1 / 16), 0)
	assert.equal(moduloFloatIterative(3 / 16, 1 / 8), 1 / 16)
})

test('large magnitudes and extreme dynamic range terminate quickly without overflow', () => {
	assert.equal(moduloFloatIterative(1e15 + 3, 7), ((1e15 + 3) % 7 + 7) % 7)
	assert.equal(moduloFloatIterative(-(1e15 + 3), 7), ((-(1e15 + 3) % 7) + 7) % 7)
	assert.equal(moduloFloatIterative(1e100, 3), ((1e100 % 3) + 3) % 3)
	assert.equal(moduloFloatIterative(1e308, 7), ((1e308 % 7) + 7) % 7)
	// Near MAX_VALUE where naive ((a % m) + m) % m would overflow to NaN
	assert.equal(moduloFloatIterative(1.4e308, 1.5e308), 1.4e308)
	assert.equal(moduloFloatIterative(-1.4e308, 1.5e308), 1.5e308 - 1.4e308)
	// Extreme exponent span: MAX_VALUE mod MIN_VALUE and subnormals
	assert.ok(Object.is(moduloFloatIterative(Number.MAX_VALUE, Number.MIN_VALUE), 0))
	assert.equal(moduloFloatIterative(3 * Number.MIN_VALUE, 2 * Number.MIN_VALUE), Number.MIN_VALUE)
	const largeVsTiny = moduloFloatIterative(1e308, 3 * Number.MIN_VALUE)
	assert.ok(largeVsTiny >= 0 && largeVsTiny < 3 * Number.MIN_VALUE)
})

test('invalid inputs throw appropriate errors', () => {
	// Zero divisor
	assert.throws(() => moduloFloatIterative(5, 0), RangeError)
	assert.throws(() => moduloFloatIterative(5, -0), RangeError)
	assert.throws(() => moduloFloatIterative(0, 0), RangeError)

	// NaN and Infinity
	assert.throws(() => moduloFloatIterative(Number.NaN, 3), RangeError)
	assert.throws(() => moduloFloatIterative(3, Number.NaN), RangeError)
	assert.throws(() => moduloFloatIterative(Number.POSITIVE_INFINITY, 3), RangeError)
	assert.throws(() => moduloFloatIterative(Number.NEGATIVE_INFINITY, 3), RangeError)
	assert.throws(() => moduloFloatIterative(3, Number.POSITIVE_INFINITY), RangeError)
	assert.throws(() => moduloFloatIterative(3, Number.NEGATIVE_INFINITY), RangeError)

	// Non-numbers
	assert.throws(() => moduloFloatIterative('5', 3), TypeError)
	assert.throws(() => moduloFloatIterative(5, '3'), TypeError)
	assert.throws(() => moduloFloatIterative(null, 3), TypeError)
	assert.throws(() => moduloFloatIterative(5, undefined), TypeError)
	assert.throws(() => moduloFloatIterative(5n, 3), TypeError)
	assert.throws(() => moduloFloatIterative(5, 3n), TypeError)
	assert.throws(() => moduloFloatIterative({}, 3), TypeError)
})

test('cross-check against independent floored modulo formulas and division invariant', () => {
	const dividends = [-1000.75, -17.5, -7, -1.25, -0.5, 0, 0.5, 1.25, 7, 17.5, 1000.75]
	const divisors = [-8, -2.5, -0.5, 0.5, 2.5, 8]

	for (const a of dividends) {
		for (const m of divisors) {
			const r = moduloFloatIterative(a, m)

			// Independent check 1: JS remainder adjusted to floored modulo
			const rawRef = ((a % m) + m) % m
			const refMod = rawRef === 0 ? 0 : rawRef
			assert.equal(r, refMod, `((a % m) + m) % m mismatch for a=${a}, m=${m}`)

			// Independent check 2: a - m * Math.floor(a / m) and division invariant a === q * m + r
			const q = Math.floor(a / m)
			const formulaRef = a - m * q
			assert.ok(
				Math.abs(r - formulaRef) <= 1e-12,
				`floor formula mismatch for a=${a}, m=${m}: got ${r}, expected ${formulaRef}`
			)
			assert.ok(
				Math.abs(q * m + r - a) <= 1e-12,
				`division invariant failed for a=${a}, m=${m}: ${q} * ${m} + ${r} !== ${a}`
			)

			// Range invariant
			if (m > 0) {
				assert.ok(r >= 0 && r < m, `range [0, ${m}) violated for a=${a}: got ${r}`)
			} else {
				assert.ok(r <= 0 && r > m, `range (${m}, 0] violated for a=${a}: got ${r}`)
			}
		}
	}
})
