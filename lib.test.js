import { test } from 'node:test'
import assert from 'node:assert'
import { add, brentRoot } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('brentRoot finds algebraic roots (sqrt(2) and golden ratio)', () => {
	const sqrt2 = brentRoot((x) => x * x - 2, 1, 2)
	assert.ok(Math.abs(sqrt2 - Math.SQRT2) < 1e-10, `expected sqrt(2), got ${sqrt2}`)

	const phi = brentRoot((x) => x * x - x - 1, 1, 2)
	const expectedPhi = (1 + Math.sqrt(5)) / 2
	assert.ok(Math.abs(phi - expectedPhi) < 1e-10, `expected phi, got ${phi}`)
})

test('brentRoot finds transcendental roots (cos(x) = x and sin(x) = 0 near pi)', () => {
	const dottie = brentRoot((x) => Math.cos(x) - x, 0, 1, 1e-12)
	assert.ok(Math.abs(Math.cos(dottie) - dottie) < 1e-11)
	assert.ok(Math.abs(dottie - 0.7390851332151607) < 1e-11)

	const piApprox = brentRoot((x) => Math.sin(x), 2, 4, 1e-12)
	assert.ok(Math.abs(piApprox - Math.PI) < 1e-11)
})

test('brentRoot handles flat cubic root and steep exponential (exercises bisection fallback)', () => {
	const cubic = brentRoot((x) => (x - 1) ** 3, 0, 2, 1e-10, 200)
	assert.ok(Math.abs(cubic - 1) < 1e-3)
	assert.ok(Math.abs((cubic - 1) ** 3) < 1e-9)

	const expRoot = brentRoot((x) => Math.exp(x) - 1000, 0, 10, 1e-12)
	assert.ok(Math.abs(expRoot - Math.log(1000)) < 1e-11)
})

test('brentRoot returns exact endpoint when root lies on a or b and supports reversed brackets', () => {
	assert.equal(brentRoot((x) => x - 3, 3, 5), 3)
	assert.equal(brentRoot((x) => x - 5, 3, 5), 5)

	const reversed = brentRoot((x) => x * x - 9, 5, 1)
	assert.ok(Math.abs(reversed - 3) < 1e-10)
})

test('brentRoot respects mathematical shift/scale invariance', () => {
	const f = (x) => x ** 3 - 2 * x - 5
	const r1 = brentRoot(f, 2, 3, 1e-12)
	const shift = 7.5
	const r2 = brentRoot((x) => f(x - shift), 2 + shift, 3 + shift, 1e-12)
	assert.ok(Math.abs(r2 - (r1 + shift)) < 1e-11)
	assert.ok(Math.abs(f(r1)) < 1e-11)
})

test('brentRoot throws on invalid inputs, unbracketed intervals, and maxIter exhaustion', () => {
	assert.throws(() => brentRoot('not-a-fn', 0, 1), TypeError)
	assert.throws(() => brentRoot((x) => x, NaN, 1), RangeError)
	assert.throws(() => brentRoot((x) => x, -1, 1, 0), RangeError)
	assert.throws(() => brentRoot((x) => x, -1, 1, 1e-8, 0), RangeError)
	assert.throws(() => brentRoot((x) => x * x + 1, -2, 2), RangeError)
	assert.throws(() => brentRoot((x) => x * x - 2, 1, 2, 1e-14, 1), /failed to converge/)
})
