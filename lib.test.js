import { test } from 'node:test'
import assert from 'node:assert'
import { add, divergence3D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('divergence3D of constant vector field is zero', () => {
	const fx = () => 5
	const fy = () => -3
	const fz = () => 12
	assert.ok(Math.abs(divergence3D(fx, fy, fz, 1.5, -2.5, 4)) < 1e-9)
})

test('divergence3D of radial and linear vector fields', () => {
	// Radial field F(x, y, z) = (x, y, z) has divergence 3 everywhere
	const divRadial = divergence3D((x) => x, (_, y) => y, (_, __, z) => z, 7, -4, 2.5)
	assert.ok(Math.abs(divRadial - 3) < 1e-8)

	// General linear field F = (2x + 3y - z, -4y + 5z, x + 6z) has divergence 2 - 4 + 6 = 4
	const divLinear = divergence3D(
		(x, y, z) => 2 * x + 3 * y - z,
		(_, y, z) => -4 * y + 5 * z,
		(x, _, z) => x + 6 * z,
		-3,
		2,
		5
	)
	assert.ok(Math.abs(divLinear - 4) < 1e-8)
})

test('divergence3D of polynomial vector field matches analytical formula', () => {
	// F = (x^2 * y, y^2 * z, z^2 * x) => div F = 2xy + 2yz + 2zx
	const fx = (x, y) => x * x * y
	const fy = (_, y, z) => y * y * z
	const fz = (x, _, z) => z * z * x

	const div1 = divergence3D(fx, fy, fz, 1, 2, 3)
	assert.ok(Math.abs(div1 - 22) < 1e-7)

	const div2 = divergence3D(fx, fy, fz, -2, 3, -1)
	assert.ok(Math.abs(div2 - -14) < 1e-7)
})

test('divergence3D satisfies div(curl(A)) = 0 solenoidal identity', () => {
	// Curl of A = (y*z^2, z*x^2, x*y^2) is (2xy - x^2, 2yz - y^2, 2zx - z^2)
	const fx = (x, y) => 2 * x * y - x * x
	const fy = (_, y, z) => 2 * y * z - y * y
	const fz = (x, _, z) => 2 * z * x - z * z

	assert.ok(Math.abs(divergence3D(fx, fy, fz, 1.2, -3.4, 2.7)) < 1e-7)
	assert.ok(Math.abs(divergence3D(fx, fy, fz, 0, 0, 0)) < 1e-9)
})

test('divergence3D of transcendental field and linearity identity', () => {
	// F = (sin(x)*cos(y), exp(y)*z, ln(z)) => div F = cos(x)*cos(y) + exp(y)*z + 1/z
	const fx = (x, y) => Math.sin(x) * Math.cos(y)
	const fy = (_, y, z) => Math.exp(y) * z
	const fz = (_, __, z) => Math.log(z)

	const x = 0.7
	const y = -0.4
	const z = 2.5
	const expected = Math.cos(x) * Math.cos(y) + Math.exp(y) * z + 1 / z
	const actual = divergence3D(fx, fy, fz, x, y, z)
	assert.ok(Math.abs(actual - expected) < 1e-7)

	// Linearity: div(a*F + b*G) = a*div(F) + b*div(G)
	const gx = (x, _, z) => x * z
	const gy = (x, y) => x * y
	const gz = (_, y, z) => y * z
	const a = 2.5
	const b = -1.3
	const divCombined = divergence3D(
		(px, py, pz) => a * fx(px, py, pz) + b * gx(px, py, pz),
		(px, py, pz) => a * fy(px, py, pz) + b * gy(px, py, pz),
		(px, py, pz) => a * fz(px, py, pz) + b * gz(px, py, pz),
		x,
		y,
		z
	)
	const divWeighted = a * divergence3D(fx, fy, fz, x, y, z) + b * divergence3D(gx, gy, gz, x, y, z)
	assert.ok(Math.abs(divCombined - divWeighted) < 1e-7)
})

test('divergence3D supports custom step size h and validates inputs', () => {
	const fx = (x) => x * x * x
	const fy = (_, y) => y * y
	const fz = (_, __, z) => z
	// Analytical: 3x^2 + 2y + 1 at (2, 3, 4) = 12 + 6 + 1 = 19
	const divCustomH = divergence3D(fx, fy, fz, 2, 3, 4, 1e-4)
	assert.ok(Math.abs(divCustomH - 19) < 1e-6)

	assert.throws(() => divergence3D(null, fy, fz, 0, 0, 0), TypeError)
	assert.throws(() => divergence3D(fx, fy, fz, NaN, 0, 0), RangeError)
	assert.throws(() => divergence3D(fx, fy, fz, 0, Infinity, 0), RangeError)
	assert.throws(() => divergence3D(fx, fy, fz, 0, 0, 0, 0), RangeError)
	assert.throws(() => divergence3D(fx, fy, fz, 0, 0, 0, -1e-6), RangeError)
})
