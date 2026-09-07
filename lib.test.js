import { test } from 'node:test'
import assert from 'node:assert'
import { add, trace2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('trace2 sums the diagonal of a 2x2 matrix', () => {
	assert.equal(trace2([[1, 2], [3, 4]]), 5)
})

test('trace2 handles negative and zero entries', () => {
	assert.equal(trace2([[-3, 5], [7, 3]]), 0)
	assert.equal(trace2([[0, 0], [0, 0]]), 0)
})

test('trace2 as Laplacian: f(x,y) = x^2 + y^2 has Hessian [[2,0],[0,2]] and Laplacian 4', () => {
	// f = x^2 + y^2 => fxx = 2, fyy = 2, fxy = fyx = 0
	const hessian = [[2, 0], [0, 2]]
	assert.equal(trace2(hessian), 4)
})

test('trace2 as Laplacian: f(x,y) = x^3 + y^2 at (x=1) has Hessian [[6,0],[0,2]] and Laplacian 8', () => {
	// f = x^3 + y^2 => fxx = 6x, fyy = 2, fxy = fyx = 0; at x = 1, fxx = 6
	const hessian = [[6, 0], [0, 2]]
	assert.equal(trace2(hessian), 8)
})
