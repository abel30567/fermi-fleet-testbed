import { test } from 'node:test'
import assert from 'node:assert'
import { add, cartesianToSpherical } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

const approxEqual = (actual, expected, eps = 1e-12) => {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		`Expected ${actual} to be within ${eps} of ${expected}`
	)
}

test('cartesianToSpherical handles origin (rho = 0)', () => {
	assert.deepStrictEqual(cartesianToSpherical(0, 0, 0), {
		rho: 0,
		theta: 0,
		phi: 0,
	})
	assert.deepStrictEqual(cartesianToSpherical(-0, -0, -0), {
		rho: 0,
		theta: 0,
		phi: 0,
	})
})

test('cartesianToSpherical handles points on coordinate axes and poles', () => {
	const posZ = cartesianToSpherical(0, 0, 5)
	approxEqual(posZ.rho, 5)
	approxEqual(posZ.theta, 0)
	approxEqual(posZ.phi, 0)

	const negZ = cartesianToSpherical(0, 0, -5)
	approxEqual(negZ.rho, 5)
	approxEqual(negZ.theta, 0)
	approxEqual(negZ.phi, Math.PI)

	const posX = cartesianToSpherical(3, 0, 0)
	approxEqual(posX.rho, 3)
	approxEqual(posX.theta, 0)
	approxEqual(posX.phi, Math.PI / 2)

	const posY = cartesianToSpherical(0, 4, 0)
	approxEqual(posY.rho, 4)
	approxEqual(posY.theta, Math.PI / 2)
	approxEqual(posY.phi, Math.PI / 2)

	const negX = cartesianToSpherical(-2, 0, 0)
	approxEqual(negX.rho, 2)
	approxEqual(negX.theta, Math.PI)
	approxEqual(negX.phi, Math.PI / 2)

	const negY = cartesianToSpherical(0, -2, 0)
	approxEqual(negY.rho, 2)
	approxEqual(negY.theta, -Math.PI / 2)
	approxEqual(negY.phi, Math.PI / 2)
})

test('cartesianToSpherical converts octant points with known exact angles', () => {
	const p1 = cartesianToSpherical(1, 1, Math.SQRT2)
	approxEqual(p1.rho, 2)
	approxEqual(p1.theta, Math.PI / 4)
	approxEqual(p1.phi, Math.PI / 4)

	const p2 = cartesianToSpherical(-1, -1, -Math.SQRT2)
	approxEqual(p2.rho, 2)
	approxEqual(p2.theta, (-3 * Math.PI) / 4)
	approxEqual(p2.phi, (3 * Math.PI) / 4)
})

test('cartesianToSpherical satisfies round-trip spherical-to-cartesian identity', () => {
	const points = [
		[3, 4, 12],
		[-5, 2, 7],
		[1.5, -2.5, -3.5],
		[-0.1, -0.2, 0.3],
		[1e-6, -2e-6, 3e-6],
	]
	for (const [x, y, z] of points) {
		const { rho, theta, phi } = cartesianToSpherical(x, y, z)
		assert.ok(rho > 0)
		assert.ok(phi >= 0 && phi <= Math.PI)
		approxEqual(rho * Math.sin(phi) * Math.cos(theta), x)
		approxEqual(rho * Math.sin(phi) * Math.sin(theta), y)
		approxEqual(rho * Math.cos(phi), z)
	}
})

test('cartesianToSpherical preserves angles under positive scaling and handles large values', () => {
	const base = cartesianToSpherical(2, -3, 6)
	const scaled = cartesianToSpherical(20, -30, 60)
	approxEqual(scaled.rho, base.rho * 10)
	approxEqual(scaled.theta, base.theta)
	approxEqual(scaled.phi, base.phi)

	const large = cartesianToSpherical(3e154, 4e154, 0)
	approxEqual(large.rho, 5e154, 1e142)
	approxEqual(large.theta, Math.atan2(4, 3))
	approxEqual(large.phi, Math.PI / 2)
})
