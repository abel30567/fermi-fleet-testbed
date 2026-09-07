import { test } from 'node:test'
import assert from 'node:assert'
import { add, isConservative2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('isConservative2: P=y, Q=x is conservative', () => {
	const P = (x, y) => y
	const Q = (x, y) => x
	assert.equal(isConservative2(P, Q, 1, 2), true)
	assert.equal(isConservative2(P, Q, 0, 0), true)
	assert.equal(isConservative2(P, Q, -3.5, 7.2), true)
})

test('isConservative2: P=-y, Q=x is not conservative', () => {
	const P = (x, y) => -y
	const Q = (x, y) => x
	assert.equal(isConservative2(P, Q, 1, 2), false)
	assert.equal(isConservative2(P, Q, 0, 0), false)
})

test('isConservative2: respects tol parameter', () => {
	// dQ/dx - dP/dy = 2 here, so a loose tolerance should read as conservative
	const P = (x, y) => -y
	const Q = (x, y) => x
	assert.equal(isConservative2(P, Q, 1, 1, 5), true)
	assert.equal(isConservative2(P, Q, 1, 1, 1e-3), false)
})

test('isConservative2: gradient field (P=2x, Q=... ) style conservative field', () => {
	// F = grad(f) for f = x^2*y => P = 2xy, Q = x^2
	const P = (x, y) => 2 * x * y
	const Q = (x, y) => x * x
	assert.equal(isConservative2(P, Q, 2, 3), true)
})
