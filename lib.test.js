import { test } from 'node:test'
import assert from 'node:assert'
import { add, polyEval } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('polyEval: normal linear, quadratic, and cubic polynomials', () => {
	assert.equal(polyEval([5, 3], 4), 17)
	assert.equal(polyEval([1, 2, 3], 2), 17)
	assert.equal(polyEval([2, -3, 0, 4], 3), 101)
})

test('polyEval: negative x and floating-point values', () => {
	assert.equal(polyEval([1, -2, 1], -3), 16)
	const val = polyEval([0.5, -1.5, 2.25], 0.4)
	assert.ok(Math.abs(val - (0.5 - 0.6 + 0.36)) < 1e-12)
})

test('polyEval: mathematical identities at x=0, x=1, x=-1', () => {
	const coeffs = [7, -4, 3, -2, 5]
	assert.equal(polyEval(coeffs, 0), coeffs[0])
	assert.equal(
		polyEval(coeffs, 1),
		coeffs.reduce((acc, c) => acc + c, 0),
	)
	assert.equal(
		polyEval(coeffs, -1),
		coeffs.reduce((acc, c, i) => acc + (i % 2 === 0 ? c : -c), 0),
	)
})

test('polyEval: binomial and geometric series identities', () => {
	const binom4 = [1, 4, 6, 4, 1]
	for (const x of [-5, -1.5, 0, 2, 3.5]) {
		assert.ok(Math.abs(polyEval(binom4, x) - (1 + x) ** 4) < 1e-9)
	}
	const geom = [1, 1, 1, 1, 1, 1]
	assert.equal(polyEval(geom, 2), 2 ** 6 - 1)
})

test('polyEval: boundary and edge cases', () => {
	assert.equal(polyEval([], 10), 0)
	assert.equal(polyEval([42], 0), 42)
	assert.equal(polyEval([42], -99), 42)
	assert.equal(polyEval([0, 0, 0], 5), 0)
	assert.equal(polyEval([3, 2, 0, 0], 5), polyEval([3, 2], 5))
})

test('polyEval: throws TypeError for non-array coeffs', () => {
	assert.throws(() => polyEval(null, 2), TypeError)
	assert.throws(() => polyEval('123', 2), TypeError)
})
