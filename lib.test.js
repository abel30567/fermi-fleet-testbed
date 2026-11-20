import { test } from 'node:test'
import assert from 'node:assert'
import { add, gradientND } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function assertVecClose(actual, expected, eps = 1e-6) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= eps,
			`index ${i}: expected ${expected[i]} ± ${eps}, got ${actual[i]}`
		)
	}
}

test('gradientND computes accurate gradients for 1D, 2D, and 3D functions', () => {
	// 1D: f(x) = x^3 - 2x => f'(x) = 3x^2 - 2
	const g1 = gradientND(([x]) => x ** 3 - 2 * x, [3])
	assertVecClose(g1, [25], 1e-5)

	// 2D: f(x, y) = x^2 + 3xy + 2y^2 => [2x + 3y, 3x + 4y]
	const g2 = gradientND(([x, y]) => x * x + 3 * x * y + 2 * y * y, [2, -1])
	assertVecClose(g2, [1, 2], 1e-6)

	// 3D: f(x, y, z) = sin(x)*cos(y) + exp(z) => [cos(x)*cos(y), -sin(x)*sin(y), exp(z)]
	const p3 = [0.5, 1.2, -0.3]
	const g3 = gradientND(([x, y, z]) => Math.sin(x) * Math.cos(y) + Math.exp(z), p3)
	assertVecClose(
		g3,
		[Math.cos(0.5) * Math.cos(1.2), -Math.sin(0.5) * Math.sin(1.2), Math.exp(-0.3)],
		1e-6
	)
})

test('gradientND handles higher dimensions (5D quadratic form)', () => {
	const weights = [1, -2, 3.5, 0, 4]
	const point = [1, 2, -1, 5, 0.5]
	const f = (v) => v.reduce((sum, x, i) => sum + weights[i] * x * x, 0)
	const expected = point.map((x, i) => 2 * weights[i] * x)
	assertVecClose(gradientND(f, point), expected, 1e-5)
})

test('gradientND satisfies linearity, product rule, and constant/linear identities', () => {
	const f = ([x, y]) => x * x + Math.sin(y)
	const g = ([x, y]) => Math.exp(x) - y * y * y
	const p = [0.7, -1.1]

	// Linearity: grad(a*f + b*g) = a*grad(f) + b*grad(g)
	const a = 2.5
	const b = -1.3
	const gf = gradientND(f, p)
	const gg = gradientND(g, p)
	const gLin = gradientND((v) => a * f(v) + b * g(v), p)
	assertVecClose(
		gLin,
		gf.map((val, i) => a * val + b * gg[i]),
		1e-5
	)

	// Product rule: grad(f * g) = g*grad(f) + f*grad(g)
	const fp = f(p)
	const gp = g(p)
	const gProd = gradientND((v) => f(v) * g(v), p)
	assertVecClose(
		gProd,
		gf.map((val, i) => gp * val + fp * gg[i]),
		1e-5
	)

	// Constant function has zero gradient
	assertVecClose(gradientND(() => 42, [1, 2, 3]), [0, 0, 0], 1e-9)

	// Linear function c . x + d has constant gradient c
	const c = [4, -7, 0.25]
	assertVecClose(
		gradientND((v) => c[0] * v[0] + c[1] * v[1] + c[2] * v[2] + 9, [10, -20, 30]),
		c,
		1e-6
	)
})

test('gradientND vanishes at stationary point and respects custom h without mutating point', () => {
	// Rosenbrock function f(x, y) = (1 - x)^2 + 100*(y - x^2)^2 has minimum at (1, 1)
	const rosenbrock = ([x, y]) => (1 - x) ** 2 + 100 * (y - x * x) ** 2
	assertVecClose(gradientND(rosenbrock, [1, 1], 1e-5), [0, 0], 1e-6)

	// Does not mutate caller point even if f mutates its input vector
	const point = [2, 3]
	const mutatingF = (v) => {
		const res = v[0] * v[0] + v[1] * v[1]
		v[0] = 999
		v[1] = -999
		return res
	}
	assertVecClose(gradientND(mutatingF, point, 1e-4), [4, 6], 1e-6)
	assert.deepEqual(point, [2, 3])
})

test('gradientND handles boundary and invalid inputs', () => {
	// 0-dimensional point
	assert.deepEqual(gradientND(() => 1, []), [])

	// Invalid inputs
	assert.throws(() => gradientND(null, [1]), TypeError)
	assert.throws(() => gradientND((v) => v[0], 'not-an-array'), TypeError)
	assert.throws(() => gradientND((v) => v[0], [1, NaN]), TypeError)
	assert.throws(() => gradientND((v) => v[0], [Infinity]), TypeError)
	assert.throws(() => gradientND((v) => v[0], [1], 0), RangeError)
	assert.throws(() => gradientND((v) => v[0], [1], -1e-6), RangeError)
	assert.throws(() => gradientND((v) => v[0], [1], Number.NaN), RangeError)
})
