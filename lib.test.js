import { test } from 'node:test'
import assert from 'node:assert'
import { add, hessian2D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function assertMatrixClose(actual, expected, tol = 1e-4) {
	assert.equal(actual.length, 2)
	assert.equal(actual[0].length, 2)
	assert.equal(actual[1].length, 2)
	for (let i = 0; i < 2; i++) {
		for (let j = 0; j < 2; j++) {
			assert.ok(
				Math.abs(actual[i][j] - expected[i][j]) <= tol,
				`Expected H[${i}][${j}] = ${actual[i][j]} to be within ${tol} of ${expected[i][j]}`
			)
		}
	}
}

test('hessian2D quadratic polynomial exact constant Hessian', () => {
	const f = (x, y) => 3 * x * x + 4 * x * y + 5 * y * y + 2 * x - 7 * y + 1
	const expected = [
		[6, 4],
		[4, 10],
	]
	assertMatrixClose(hessian2D(f, 1, -2), expected, 1e-5)
	assertMatrixClose(hessian2D(f, 0, 0), expected, 1e-5)
})

test('hessian2D constant and linear functions produce zero matrix', () => {
	const constantFn = () => 42
	const linearFn = (x, y) => 5 * x - 3 * y + 2
	const zero = [
		[0, 0],
		[0, 0],
	]
	assertMatrixClose(hessian2D(constantFn, 3.5, -1.2), zero, 1e-6)
	assertMatrixClose(hessian2D(linearFn, -4, 7), zero, 1e-6)
})

test('hessian2D trigonometric function and Schwarz symmetry', () => {
	const f = (x, y) => Math.sin(x) * Math.cos(y)
	const x = 0.7
	const y = 1.1
	const H = hessian2D(f, x, y)
	const expected = [
		[-Math.sin(x) * Math.cos(y), -Math.cos(x) * Math.sin(y)],
		[-Math.cos(x) * Math.sin(y), -Math.sin(x) * Math.cos(y)],
	]
	assertMatrixClose(H, expected, 1e-5)
	assert.equal(H[0][1], H[1][0])
})

test('hessian2D Rosenbrock function at minimum and off-minimum', () => {
	const rosenbrock = (x, y) => (1 - x) ** 2 + 100 * (y - x * x) ** 2
	const analytic = (x, y) => [
		[2 - 400 * y + 1200 * x * x, -400 * x],
		[-400 * x, 200],
	]
	const HMin = hessian2D(rosenbrock, 1, 1)
	assertMatrixClose(HMin, analytic(1, 1), 1e-3)
	const trace = HMin[0][0] + HMin[1][1]
	const det = HMin[0][0] * HMin[1][1] - HMin[0][1] * HMin[1][0]
	assert.ok(trace > 0 && det > 0)

	assertMatrixClose(hessian2D(rosenbrock, 0.5, 0.5), analytic(0.5, 0.5), 1e-3)
})

test('hessian2D exponential function, custom step size, and linearity identity', () => {
	const f = (x, y) => Math.exp(x * y)
	const g = (x, y) => x ** 3 - 2 * x * y ** 2 + y ** 3
	const x = 0.8
	const y = -0.6
	const e = Math.exp(x * y)
	const expectedF = [
		[y * y * e, (1 + x * y) * e],
		[(1 + x * y) * e, x * x * e],
	]
	assertMatrixClose(hessian2D(f, x, y, 1e-3), expectedF, 1e-4)

	const a = 2.5
	const b = -1.5
	const combined = (u, v) => a * f(u, v) + b * g(u, v)
	const Hf = hessian2D(f, x, y)
	const Hg = hessian2D(g, x, y)
	const Hc = hessian2D(combined, x, y)
	const expectedCombined = [
		[a * Hf[0][0] + b * Hg[0][0], a * Hf[0][1] + b * Hg[0][1]],
		[a * Hf[1][0] + b * Hg[1][0], a * Hf[1][1] + b * Hg[1][1]],
	]
	assertMatrixClose(Hc, expectedCombined, 1e-4)
})

test('hessian2D input validation and edge cases', () => {
	const f = (x, y) => x * x + y * y
	assert.throws(() => hessian2D(null, 0, 0), TypeError)
	assert.throws(() => hessian2D('not-a-fn', 0, 0), TypeError)
	assert.throws(() => hessian2D(f, NaN, 0), RangeError)
	assert.throws(() => hessian2D(f, 0, Infinity), RangeError)
	assert.throws(() => hessian2D(f, 0, 0, 0), RangeError)
	assert.throws(() => hessian2D(f, 0, 0, -1e-4), RangeError)
	assert.throws(() => hessian2D(f, 0, 0, NaN), RangeError)
})
