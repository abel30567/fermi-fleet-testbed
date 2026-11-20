import { test } from 'node:test'
import assert from 'node:assert'
import { add, simpson1D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('simpson1D is exact for polynomials up to degree 3 even with n = 2', () => {
	const poly = (x) => 4 * x ** 3 - 3 * x ** 2 + 2 * x - 1
	const result = simpson1D(poly, 0, 2, 2)
	assert.ok(Math.abs(result - 10) < 1e-12, `expected ~10, got ${result}`)
})

test('simpson1D integrates transcendental functions accurately', () => {
	const sinIntegral = simpson1D(Math.sin, 0, Math.PI)
	assert.ok(Math.abs(sinIntegral - 2) < 1e-7, `sin integral: ${sinIntegral}`)

	const expIntegral = simpson1D(Math.exp, 0, 1)
	assert.ok(Math.abs(expIntegral - (Math.E - 1)) < 1e-8, `exp integral: ${expIntegral}`)

	const invIntegral = simpson1D((x) => 1 / x, 1, Math.E)
	assert.ok(Math.abs(invIntegral - 1) < 1e-7, `1/x integral: ${invIntegral}`)
})

test('simpson1D ensures even n when odd n is passed', () => {
	const f = (x) => Math.cos(x) + x ** 3
	assert.equal(simpson1D(f, 0, 2, 1), simpson1D(f, 0, 2, 2))
	assert.equal(simpson1D(f, 0, 2, 99), simpson1D(f, 0, 2, 100))
	assert.ok(Math.abs(simpson1D((x) => x ** 3, 0, 2, 1) - 4) < 1e-12)
})

test('simpson1D satisfies reversal, additivity, and linearity identities', () => {
	const f = (x) => Math.exp(-x * x)
	const g = (x) => Math.sin(2 * x)

	// Reversal: integral(b, a) = -integral(a, b)
	const forward = simpson1D(f, 0, 1.5, 100)
	const backward = simpson1D(f, 1.5, 0, 100)
	assert.ok(Math.abs(forward + backward) < 1e-12)

	// Additivity: integral(a, c) + integral(c, b) = integral(a, b)
	const left = simpson1D(f, 0, 0.7, 100)
	const right = simpson1D(f, 0.7, 1.5, 100)
	assert.ok(Math.abs(left + right - forward) < 1e-9)

	// Linearity: integral(2f + 3g) = 2*integral(f) + 3*integral(g)
	const combined = simpson1D((x) => 2 * f(x) + 3 * g(x), 0, 1.5, 100)
	const separate = 2 * simpson1D(f, 0, 1.5, 100) + 3 * simpson1D(g, 0, 1.5, 100)
	assert.ok(Math.abs(combined - separate) < 1e-12)
})

test('simpson1D achieves O(h^4) convergence rate', () => {
	const exact = 1 / 5 // integral of x^4 over [0, 1]
	const err10 = Math.abs(simpson1D((x) => x ** 4, 0, 1, 10) - exact)
	const err20 = Math.abs(simpson1D((x) => x ** 4, 0, 1, 20) - exact)
	const ratio = err10 / err20
	assert.ok(Math.abs(ratio - 16) < 1e-6, `expected error ratio ~16, got ${ratio}`)
})

test('simpson1D handles boundary conditions and invalid inputs', () => {
	assert.equal(simpson1D(Math.sin, 2.5, 2.5), 0)
	assert.equal(simpson1D(() => 0, -5, 5), 0)
	assert.ok(Math.abs(simpson1D((x) => x ** 5, -2, 2, 100)) < 1e-12)

	assert.throws(() => simpson1D(null, 0, 1), TypeError)
	assert.throws(() => simpson1D(Math.sin, NaN, 1), RangeError)
	assert.throws(() => simpson1D(Math.sin, 0, Infinity), RangeError)
	assert.throws(() => simpson1D(Math.sin, 0, 1, 0), RangeError)
	assert.throws(() => simpson1D(Math.sin, 0, 1, -4), RangeError)
	assert.throws(() => simpson1D(Math.sin, 0, 1, 4.5), RangeError)
})
