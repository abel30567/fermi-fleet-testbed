import { test } from 'node:test'
import assert from 'node:assert'
import { add, romberg1D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('romberg1D integrates polynomials accurately', () => {
	const result = romberg1D((x) => 3 * x ** 5 - 2 * x ** 3 + x - 4, -1, 2)
	assert.ok(Math.abs(result - 13.5) < 1e-12, `expected ~13.5, got ${result}`)
})

test('romberg1D integrates smooth transcendental functions to high precision', () => {
	const sinIntegral = romberg1D(Math.sin, 0, Math.PI)
	assert.ok(Math.abs(sinIntegral - 2) < 1e-12, `expected ~2, got ${sinIntegral}`)

	const expIntegral = romberg1D(Math.exp, 0, 1)
	const expectedExp = Math.E - 1
	assert.ok(Math.abs(expIntegral - expectedExp) < 1e-12, `expected ~${expectedExp}, got ${expIntegral}`)

	const invIntegral = romberg1D((x) => 1 / (1 + x * x), 0, 1)
	assert.ok(Math.abs(invIntegral - Math.PI / 4) < 1e-12, `expected ~pi/4, got ${invIntegral}`)
})

test('romberg1D satisfies linearity and interval additivity identities', () => {
	const f = (x) => Math.cos(x)
	const g = (x) => x * x
	const alpha = 2.5
	const beta = -1.75

	const combined = romberg1D((x) => alpha * f(x) + beta * g(x), 0, 2)
	const separate = alpha * romberg1D(f, 0, 2) + beta * romberg1D(g, 0, 2)
	assert.ok(Math.abs(combined - separate) < 1e-12)

	const whole = romberg1D(Math.exp, -1, 2)
	const split = romberg1D(Math.exp, -1, 0.5) + romberg1D(Math.exp, 0.5, 2)
	assert.ok(Math.abs(whole - split) < 1e-12)
})

test('romberg1D handles zero-width and reversed bounds', () => {
	assert.equal(romberg1D((x) => x * x, 3, 3), 0)

	const forward = romberg1D(Math.sin, 0, 1.5)
	const reversed = romberg1D(Math.sin, 1.5, 0)
	assert.ok(Math.abs(forward + reversed) < 1e-12)
})

test('romberg1D respects custom maxOrder parameter', () => {
	assert.equal(romberg1D((x) => x * x, 0, 2, 0), 4)
	const cubic = romberg1D((x) => x ** 3, 0, 2, 1)
	assert.ok(Math.abs(cubic - 4) < 1e-12, `expected ~4, got ${cubic}`)
})

test('romberg1D validates inputs and throws on invalid arguments', () => {
	assert.throws(() => romberg1D(null, 0, 1), TypeError)
	assert.throws(() => romberg1D((x) => x, Number.NaN, 1), RangeError)
	assert.throws(() => romberg1D((x) => x, 0, Number.POSITIVE_INFINITY), RangeError)
	assert.throws(() => romberg1D((x) => x, 0, 1, -1), RangeError)
	assert.throws(() => romberg1D((x) => x, 0, 1, 2.5), RangeError)
})
