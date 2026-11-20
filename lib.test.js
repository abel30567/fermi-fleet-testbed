import { test } from 'node:test'
import assert from 'node:assert'
import { add, secantRoot } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('secantRoot finds sqrt(2) from x^2 - 2 = 0', () => {
	const root = secantRoot((x) => x * x - 2, 1, 2)
	assert.ok(Math.abs(root - Math.SQRT2) < 1e-10)
	assert.ok(Math.abs(root * root - 2) < 1e-9)
})

test('secantRoot finds transcendental root of cos(x) - x = 0', () => {
	const f = (x) => Math.cos(x) - x
	const root = secantRoot(f, 0, 1)
	assert.ok(Math.abs(f(root)) < 1e-10)
	assert.ok(Math.abs(root - 0.7390851332151607) < 1e-10)
})

test('secantRoot solves linear function exactly in one iteration', () => {
	const root = secantRoot((x) => 3 * x - 7, 0, 10, 1e-12, 1)
	assert.ok(Math.abs(root - 7 / 3) < 1e-12)
})

test('secantRoot finds negative root satisfying exponential identity', () => {
	const root = secantRoot((x) => Math.exp(x) - 0.5, -2, 0)
	assert.ok(Math.abs(root - -Math.LN2) < 1e-10)
	assert.ok(Math.abs(Math.exp(root) - 0.5) < 1e-10)
})

test('secantRoot finds cubic root x^3 - x - 2 = 0', () => {
	const f = (x) => x ** 3 - x - 2
	const root = secantRoot(f, 1, 2)
	assert.ok(Math.abs(f(root)) < 1e-10)
	assert.ok(Math.abs(root - 1.5213797068045676) < 1e-10)
})

test('secantRoot returns immediately when initial guess is a root', () => {
	assert.equal(secantRoot((x) => x - 4, 4, 10), 4)
	assert.equal(secantRoot((x) => x - 4, 0, 4), 4)
})

test('secantRoot throws on zero denominator, non-convergence, and invalid arguments', () => {
	assert.throws(() => secantRoot(() => 5, 0, 1), /zero denominator/)
	assert.throws(() => secantRoot((x) => x * x - 4, -1, 1), /zero denominator/)
	assert.throws(() => secantRoot((x) => x * x - 2, 1, 2, 1e-12, 1), /did not converge/)
	assert.throws(() => secantRoot((x) => x * x + 1, 0, 1, 1e-10, 20), /did not converge|zero denominator/)
	assert.throws(() => secantRoot('not-a-fn', 0, 1), TypeError)
	assert.throws(() => secantRoot((x) => x, NaN, 1), TypeError)
	assert.throws(() => secantRoot((x) => x, 0, 1, 0), RangeError)
	assert.throws(() => secantRoot((x) => x, 0, 1, 1e-6, 0), RangeError)
})
