import { test } from 'node:test'
import assert from 'node:assert'
import { add, jacobian3D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function assertMatrixClose(actual, expected, tol = 1e-7) {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assert.equal(actual[i].length, 3)
		for (let j = 0; j < 3; j++) {
			assert.ok(
				Math.abs(actual[i][j] - expected[i][j]) <= tol,
				`entry [${i}][${j}]: expected ${expected[i][j]}, got ${actual[i][j]}`
			)
		}
	}
}

function det3(m) {
	return (
		m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
		m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
		m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
	)
}

test('jacobian3D: constant vector field yields zero matrix', () => {
	const J = jacobian3D(
		() => 42,
		() => -3.14,
		() => 0,
		1.5,
		-2.5,
		3.5
	)
	assertMatrixClose(J, [
		[0, 0, 0],
		[0, 0, 0],
		[0, 0, 0],
	])
})

test('jacobian3D: linear map recovers exact transformation matrix', () => {
	const A = [
		[2, -3, 5],
		[0, 4, -1],
		[-7, 1.5, 3],
	]
	const u = (x, y, z) => A[0][0] * x + A[0][1] * y + A[0][2] * z + 10
	const v = (x, y, z) => A[1][0] * x + A[1][1] * y + A[1][2] * z - 4
	const w = (x, y, z) => A[2][0] * x + A[2][1] * y + A[2][2] * z + 0.5

	const J = jacobian3D(u, v, w, -2, 3.25, 0.75)
	assertMatrixClose(J, A, 1e-8)
})

test('jacobian3D: nonlinear smooth field matches analytic partial derivatives', () => {
	const u = (x, y, z) => x * x * y + Math.sin(z)
	const v = (x, y, z) => Math.exp(x) * Math.cos(y) - z * z * z
	const w = (x, y, z) => x * y * z

	const x = 0.7
	const y = -1.2
	const z = 0.5
	const J = jacobian3D(u, v, w, x, y, z)

	const expected = [
		[2 * x * y, x * x, Math.cos(z)],
		[Math.exp(x) * Math.cos(y), -Math.exp(x) * Math.sin(y), -3 * z * z],
		[y * z, x * z, x * y],
	]
	assertMatrixClose(J, expected, 1e-7)
})

test('jacobian3D: spherical-to-Cartesian determinant equals r^2 sin(theta)', () => {
	const u = (r, theta, phi) => r * Math.sin(theta) * Math.cos(phi)
	const v = (r, theta, phi) => r * Math.sin(theta) * Math.sin(phi)
	const w = (r, theta, phi) => r * Math.cos(theta)

	const r = 2.5
	const theta = Math.PI / 3
	const phi = Math.PI / 4
	const J = jacobian3D(u, v, w, r, theta, phi)
	const expectedDet = r * r * Math.sin(theta)

	assert.ok(Math.abs(det3(J) - expectedDet) < 1e-7)
})

test('jacobian3D: gradient of a scalar potential has symmetric Jacobian (Hessian symmetry)', () => {
	const dPhiDx = (x, y, z) => 3 * x * x * y + z * Math.cos(x * z)
	const dPhiDy = (x, y, z) => x * x * x + 2 * y * z * z
	const dPhiDz = (x, y, z) => 2 * y * y * z + x * Math.cos(x * z)

	const J = jacobian3D(dPhiDx, dPhiDy, dPhiDz, 1.1, -0.8, 0.6)
	for (let i = 0; i < 3; i++) {
		for (let j = i + 1; j < 3; j++) {
			assert.ok(
				Math.abs(J[i][j] - J[j][i]) < 1e-7,
				`expected symmetry at (${i},${j}): ${J[i][j]} vs ${J[j][i]}`
			)
		}
	}
})

test('jacobian3D: custom step h, origin evaluation, and input validation', () => {
	const J = jacobian3D(
		(x) => x,
		(_, y) => y,
		(_, __, z) => z,
		0,
		0,
		0,
		1e-4
	)
	assertMatrixClose(J, [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	])

	const id = (x) => x
	assert.throws(() => jacobian3D(null, id, id, 0, 0, 0), TypeError)
	assert.throws(() => jacobian3D(id, 123, id, 0, 0, 0), TypeError)
	assert.throws(() => jacobian3D(id, id, 'z', 0, 0, 0), TypeError)
	assert.throws(() => jacobian3D(id, id, id, NaN, 0, 0), RangeError)
	assert.throws(() => jacobian3D(id, id, id, 0, Infinity, 0), RangeError)
	assert.throws(() => jacobian3D(id, id, id, 0, 0, 0, 0), RangeError)
	assert.throws(() => jacobian3D(id, id, id, 0, 0, 0, -1e-6), RangeError)
	assert.throws(() => jacobian3D(id, id, id, 0, 0, 0, NaN), RangeError)
})
