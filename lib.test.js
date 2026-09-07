import { test } from 'node:test'
import assert from 'node:assert'
import { add, hessianN } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('hessianN: sum of squares in 3D ~ 2*I', () => {
	const f = (x) => x[0] * x[0] + x[1] * x[1] + x[2] * x[2]
	const H = hessianN(f, [1, 2, 3])
	const expected = [
		[2, 0, 0],
		[0, 2, 0],
		[0, 0, 2],
	]
	for (let i = 0; i < 3; i++) {
		for (let j = 0; j < 3; j++) {
			assert.ok(
				Math.abs(H[i][j] - expected[i][j]) < 1e-1,
				`H[${i}][${j}] = ${H[i][j]}, expected ~${expected[i][j]}`
			)
		}
	}
})

test('hessianN: is symmetric', () => {
	const f = (x) => x[0] ** 2 * x[1] + Math.sin(x[1]) * x[2] + x[0] * x[2] ** 2
	const H = hessianN(f, [0.5, 1.2, -0.7])
	for (let i = 0; i < 3; i++) {
		for (let j = 0; j < 3; j++) {
			assert.ok(Math.abs(H[i][j] - H[j][i]) < 1e-6)
		}
	}
})

test('hessianN: bilinear term x0*x1 has off-diagonal ~1', () => {
	const f = (x) => x[0] * x[1]
	const H = hessianN(f, [3, -2])
	assert.ok(Math.abs(H[0][0]) < 1e-1)
	assert.ok(Math.abs(H[1][1]) < 1e-1)
	assert.ok(Math.abs(H[0][1] - 1) < 1e-1)
	assert.ok(Math.abs(H[1][0] - 1) < 1e-1)
})

test('hessianN: constant function has zero Hessian', () => {
	const f = () => 42
	const H = hessianN(f, [1, 2])
	for (const row of H) {
		for (const v of row) {
			assert.ok(Math.abs(v) < 1e-1)
		}
	}
})

test('hessianN: respects custom step size h', () => {
	const f = (x) => x[0] * x[0]
	const H = hessianN(f, [0], 1e-2)
	assert.ok(Math.abs(H[0][0] - 2) < 1e-1)
})
