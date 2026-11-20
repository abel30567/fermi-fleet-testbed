import { test } from 'node:test'
import assert from 'node:assert'
import { add, mixedPartial } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('mixedPartial on bilinear and polynomial functions', () => {
	assert.ok(Math.abs(mixedPartial((x, y) => x * y, 3, -5) - 1) < 1e-6)
	// f(x, y) = x^2 * y^3 => d^2f/(dx dy) = 6 * x * y^2
	const val = mixedPartial((x, y) => x * x * y * y * y, 2, 3)
	assert.ok(Math.abs(val - 108) < 1e-4)
})

test('mixedPartial on trigonometric and exponential functions', () => {
	// f(x, y) = sin(x) * cos(y) => d^2f/(dx dy) = -cos(x) * sin(y)
	const x = 0.7
	const y = 1.2
	const trigExpected = -Math.cos(x) * Math.sin(y)
	assert.ok(Math.abs(mixedPartial((a, b) => Math.sin(a) * Math.cos(b), x, y) - trigExpected) < 1e-6)

	// f(x, y) = exp(x * y) => d^2f/(dx dy) = (1 + x * y) * exp(x * y)
	const expExpected = (1 + x * y) * Math.exp(x * y)
	assert.ok(Math.abs(mixedPartial((a, b) => Math.exp(a * b), x, y) - expExpected) < 1e-5)
})

test('mixedPartial vanishes on additively separable functions', () => {
	const f = (x, y) => x * x * x + Math.sin(y) + 42
	assert.ok(Math.abs(mixedPartial(f, 1.5, -2.3)) < 1e-6)
	assert.ok(Math.abs(mixedPartial(() => 7, 0, 0)) < 1e-12)
})

test('mixedPartial satisfies Clairaut symmetry and linearity', () => {
	const f = (x, y) => Math.exp(x) * Math.sin(y) + x * x * y
	const g = (x, y) => Math.cos(x * y)
	const x = 0.5
	const y = -0.8

	// Symmetry: d^2f/(dx dy) == d^2f/(dy dx)
	const dxy = mixedPartial(f, x, y)
	const dyx = mixedPartial((b, a) => f(a, b), y, x)
	assert.ok(Math.abs(dxy - dyx) < 1e-7)

	// Linearity: D(2f - 3g) = 2 D(f) - 3 D(g)
	const combined = mixedPartial((a, b) => 2 * f(a, b) - 3 * g(a, b), x, y)
	const linear = 2 * mixedPartial(f, x, y) - 3 * mixedPartial(g, x, y)
	assert.ok(Math.abs(combined - linear) < 1e-6)
})

test('mixedPartial supports custom step size h and origin evaluation', () => {
	// f(x, y) = sin(x * y) => at (0, 0), d^2f/(dx dy) = 1
	assert.ok(Math.abs(mixedPartial((x, y) => Math.sin(x * y), 0, 0, 1e-3) - 1) < 1e-6)
	assert.ok(Math.abs(mixedPartial((x, y) => (x + 1) * (y - 2), 0, 0, 1e-2) - 1) < 1e-8)
})

test('mixedPartial validates arguments', () => {
	assert.throws(() => mixedPartial(null, 1, 2), TypeError)
	assert.throws(() => mixedPartial((x, y) => x * y, NaN, 2), RangeError)
	assert.throws(() => mixedPartial((x, y) => x * y, 1, Infinity), RangeError)
	assert.throws(() => mixedPartial((x, y) => x * y, 1, 2, 0), RangeError)
	assert.throws(() => mixedPartial((x, y) => x * y, 1, 2, -1e-4), RangeError)
	assert.throws(() => mixedPartial((x, y) => x * y, 1, 2, NaN), RangeError)
})
