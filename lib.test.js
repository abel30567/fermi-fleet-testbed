import { test } from 'node:test'
import assert from 'node:assert'
import { add, jacobianN } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('jacobianN: scalar-valued product function', () => {
	const F = (v) => [v[0] * v[1]]
	const J = jacobianN(F, [2, 3])
	assert.equal(J.length, 1)
	assert.equal(J[0].length, 2)
	assert.ok(Math.abs(J[0][0] - 3) < 1e-4)
	assert.ok(Math.abs(J[0][1] - 2) < 1e-4)
})

test('jacobianN: vector-valued function (m != n)', () => {
	const F = (v) => [v[0] + v[1], v[0] * v[1], v[0] - v[1]]
	const J = jacobianN(F, [1, 2])
	assert.equal(J.length, 3)
	assert.equal(J[0].length, 2)
	// d/dx1 [x1+x2, x1*x2, x1-x2] = [1, x2, 1]
	assert.ok(Math.abs(J[0][0] - 1) < 1e-4)
	assert.ok(Math.abs(J[1][0] - 2) < 1e-4)
	assert.ok(Math.abs(J[2][0] - 1) < 1e-4)
	// d/dx2 [x1+x2, x1*x2, x1-x2] = [1, x1, -1]
	assert.ok(Math.abs(J[0][1] - 1) < 1e-4)
	assert.ok(Math.abs(J[1][1] - 1) < 1e-4)
	assert.ok(Math.abs(J[2][1] - (-1)) < 1e-4)
})

test('jacobianN: identity function yields identity matrix', () => {
	const F = (v) => v.slice()
	const J = jacobianN(F, [5, -1, 3])
	for (let i = 0; i < 3; i++) {
		for (let j = 0; j < 3; j++) {
			const expected = i === j ? 1 : 0
			assert.ok(Math.abs(J[i][j] - expected) < 1e-4)
		}
	}
})

test('jacobianN: respects custom step size h', () => {
	const F = (v) => [v[0] ** 2]
	const J = jacobianN(F, [4], 1e-3)
	assert.ok(Math.abs(J[0][0] - 8) < 1e-2)
})
