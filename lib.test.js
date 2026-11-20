import { test } from 'node:test'
import assert from 'node:assert'
import { add, curl3D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function assertVecClose(actual, expected, tol = 1e-6) {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= tol,
			`component ${i}: expected ${expected[i]}, got ${actual[i]} (diff ${Math.abs(actual[i] - expected[i])})`
		)
	}
}

test('curl3D of constant vector field is zero', () => {
	const result = curl3D(
		() => 3,
		() => -5,
		() => 7,
		1.5,
		-2.25,
		4.0
	)
	assertVecClose(result, [0, 0, 0], 1e-12)
})

test('curl3D of 3D rigid body rotation ω × r equals 2ω', () => {
	const wx = 1.5
	const wy = -2.0
	const wz = 3.25
	const fx = (x, y, z) => wy * z - wz * y
	const fy = (x, y, z) => wz * x - wx * z
	const fz = (x, y, z) => wx * y - wy * x

	assertVecClose(curl3D(fx, fy, fz, 2, -3, 5), [2 * wx, 2 * wy, 2 * wz], 1e-8)
	assertVecClose(curl3D(fx, fy, fz, 0, 0, 0), [2 * wx, 2 * wy, 2 * wz], 1e-8)
})

test('curl3D of nonlinear polynomial vector field matches analytical curl', () => {
	const fx = (x, y, z) => x * y * z
	const fy = (x, y, z) => y * y * z
	const fz = (x, y, z) => z * z * x

	const x = 1.2
	const y = -2.3
	const z = 0.7
	const expected = [-y * y, x * y - z * z, -x * z]
	assertVecClose(curl3D(fx, fy, fz, x, y, z), expected, 1e-7)
})

test('curl3D identity: curl of a conservative gradient field is zero', () => {
	// φ(x, y, z) = sin(x) * cos(y) * exp(z) + x^2 * y * z
	const fx = (x, y, z) => Math.cos(x) * Math.cos(y) * Math.exp(z) + 2 * x * y * z
	const fy = (x, y, z) => -Math.sin(x) * Math.sin(y) * Math.exp(z) + x * x * z
	const fz = (x, y, z) => Math.sin(x) * Math.cos(y) * Math.exp(z) + x * x * y

	assertVecClose(curl3D(fx, fy, fz, 0.7, -1.1, 0.4), [0, 0, 0], 1e-7)
})

test('curl3D identity: linearity curl(aF + bG) = a*curl(F) + b*curl(G)', () => {
	const a = 2.5
	const b = -1.75
	const fx = (x, y, z) => Math.sin(y) + z * z
	const fy = (x, y, z) => Math.cos(z) + x * y
	const fz = (x, y, z) => Math.sin(x) + y * z

	const gx = (x, y, z) => y * z
	const gy = (x, y, z) => x * z
	const gz = (x, y, z) => x * y * z

	const hx = (x, y, z) => a * fx(x, y, z) + b * gx(x, y, z)
	const hy = (x, y, z) => a * fy(x, y, z) + b * gy(x, y, z)
	const hz = (x, y, z) => a * fz(x, y, z) + b * gz(x, y, z)

	const x = 0.9
	const y = -0.4
	const z = 1.3
	const cF = curl3D(fx, fy, fz, x, y, z)
	const cG = curl3D(gx, gy, gz, x, y, z)
	const cH = curl3D(hx, hy, hz, x, y, z)

	assertVecClose(
		cH,
		[a * cF[0] + b * cG[0], a * cF[1] + b * cG[1], a * cF[2] + b * cG[2]],
		1e-7
	)
})

test('curl3D of trigonometric field with custom step size h', () => {
	const fx = (_x, y, _z) => Math.sin(y)
	const fy = (_x, _y, z) => Math.cos(z)
	const fz = (x, _y, _z) => Math.sin(x)

	const x = 0.5
	const y = -1.2
	const z = 2.1
	const expected = [Math.sin(z), -Math.cos(x), -Math.cos(y)]
	assertVecClose(curl3D(fx, fy, fz, x, y, z, 1e-5), expected, 1e-8)
})

test('curl3D validates inputs and boundary conditions', () => {
	const zero = () => 0
	assert.throws(() => curl3D(null, zero, zero, 0, 0, 0), TypeError)
	assert.throws(() => curl3D(zero, 'bad', zero, 0, 0, 0), TypeError)
	assert.throws(() => curl3D(zero, zero, 42, 0, 0, 0), TypeError)
	assert.throws(() => curl3D(zero, zero, zero, NaN, 0, 0), RangeError)
	assert.throws(() => curl3D(zero, zero, zero, 0, Infinity, 0), RangeError)
	assert.throws(() => curl3D(zero, zero, zero, 0, 0, 0, 0), RangeError)
	assert.throws(() => curl3D(zero, zero, zero, 0, 0, 0, -1e-6), RangeError)
	assert.throws(() => curl3D(zero, zero, zero, 0, 0, 0, NaN), RangeError)
})
