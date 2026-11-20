import { test } from 'node:test'
import assert from 'node:assert'
import { add, jacobianDet3D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('jacobianDet3D: identity and general linear transformation', () => {
	const id = jacobianDet3D(
		(x) => x,
		(_x, y) => y,
		(_x, _y, z) => z,
		1.5,
		-2.3,
		4.1,
	)
	assert.ok(Math.abs(id - 1) < 1e-9)

	// Linear map Ax + b with det(A) = 2*(5*9 - 6*8) - 1*(4*9 - 6*7) + 3*(4*8 - 5*7) = -9
	const u = (x, y, z) => 2 * x + 1 * y + 3 * z + 7
	const v = (x, y, z) => 4 * x + 5 * y + 6 * z - 2
	const w = (x, y, z) => 7 * x + 8 * y + 9 * z + 11
	const det = jacobianDet3D(u, v, w, -3, 5, 2)
	assert.ok(Math.abs(det - -9) < 1e-7)
})

test('jacobianDet3D: spherical coordinates determinant equals r^2 sin(theta)', () => {
	const u = (r, theta, phi) => r * Math.sin(theta) * Math.cos(phi)
	const v = (r, theta, phi) => r * Math.sin(theta) * Math.sin(phi)
	const w = (r, theta) => r * Math.cos(theta)

	const r = 3.2
	const theta = Math.PI / 3
	const phi = 1.1
	const expected = r * r * Math.sin(theta)
	const det = jacobianDet3D(u, v, w, r, theta, phi)
	assert.ok(Math.abs(det - expected) < 1e-7)
})

test('jacobianDet3D: cylindrical coordinates determinant equals r', () => {
	const u = (r, theta) => r * Math.cos(theta)
	const v = (r, theta) => r * Math.sin(theta)
	const w = (_r, _theta, z) => z

	const r = 4.5
	const det = jacobianDet3D(u, v, w, r, 0.7, -2.0)
	assert.ok(Math.abs(det - r) < 1e-8)
})

test('jacobianDet3D: antisymmetry under row swap and volume-preserving nonlinear shear', () => {
	const u = (x, y, z) => x * x + Math.sin(y) + z
	const v = (x, y, z) => Math.exp(x) * y - z * z
	const w = (x, y, z) => x * y * z + Math.cos(z)

	const d1 = jacobianDet3D(u, v, w, 0.7, -1.2, 0.5)
	const d2 = jacobianDet3D(v, u, w, 0.7, -1.2, 0.5)
	assert.ok(Math.abs(d1 + d2) < 1e-7)

	// Upper-triangular nonlinear shear has unit Jacobian determinant everywhere
	const shearDet = jacobianDet3D(
		(x, y, z) => x + Math.sin(y * z),
		(_x, y, z) => y + Math.cos(z),
		(_x, _y, z) => z,
		1.2,
		-0.8,
		2.5,
	)
	assert.ok(Math.abs(shearDet - 1) < 1e-8)
})

test('jacobianDet3D: singular and dependent transformations yield zero', () => {
	// Constant component
	const detConst = jacobianDet3D(
		(x, y) => x * y,
		(_x, y, z) => y + z,
		() => 42,
		2,
		3,
		4,
	)
	assert.ok(Math.abs(detConst) < 1e-9)

	// Linearly dependent component w = 2u - 3v
	const u = (x, y, z) => Math.sin(x) + y * z
	const v = (x, y, z) => x * x - Math.cos(y) + z
	const w = (x, y, z) => 2 * u(x, y, z) - 3 * v(x, y, z)
	const detDep = jacobianDet3D(u, v, w, 1.1, -0.4, 2.2)
	assert.ok(Math.abs(detDep) < 1e-7)
})

test('jacobianDet3D: custom step size and input validation', () => {
	const detCustomH = jacobianDet3D(
		(x) => -2 * x,
		(_x, y) => 3 * y,
		(_x, _y, z) => 4 * z,
		0,
		0,
		0,
		1e-4,
	)
	assert.ok(Math.abs(detCustomH - -24) < 1e-8)

	const id = (x) => x
	assert.throws(() => jacobianDet3D(null, id, id, 0, 0, 0), TypeError)
	assert.throws(() => jacobianDet3D(id, id, id, NaN, 0, 0), RangeError)
	assert.throws(() => jacobianDet3D(id, id, id, 0, 0, 0, 0), RangeError)
	assert.throws(() => jacobianDet3D(id, id, id, 0, 0, 0, -1e-6), RangeError)
})
