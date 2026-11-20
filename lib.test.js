import { test } from 'node:test'
import assert from 'node:assert'
import { add, cartesianToCylindrical } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('cartesianToCylindrical converts standard first-quadrant coordinates', () => {
	const res = cartesianToCylindrical(3, 4, 5)
	assert.equal(res.r, 5)
	assert.ok(Math.abs(res.theta - Math.atan2(4, 3)) < 1e-12)
	assert.equal(res.z, 5)
})

test('cartesianToCylindrical handles cardinal axes accurately', () => {
	const posX = cartesianToCylindrical(2, 0, 1)
	assert.equal(posX.r, 2)
	assert.equal(posX.theta, 0)
	assert.equal(posX.z, 1)

	const posY = cartesianToCylindrical(0, 3, -2)
	assert.equal(posY.r, 3)
	assert.ok(Math.abs(posY.theta - Math.PI / 2) < 1e-12)
	assert.equal(posY.z, -2)

	const negX = cartesianToCylindrical(-4, 0, 0)
	assert.equal(negX.r, 4)
	assert.ok(Math.abs(negX.theta - Math.PI) < 1e-12)
	assert.equal(negX.z, 0)

	const negY = cartesianToCylindrical(0, -5, 7)
	assert.equal(negY.r, 5)
	assert.ok(Math.abs(negY.theta + Math.PI / 2) < 1e-12)
	assert.equal(negY.z, 7)
})

test('cartesianToCylindrical handles origin and z-axis points', () => {
	assert.deepEqual(cartesianToCylindrical(0, 0, 0), { r: 0, theta: 0, z: 0 })
	assert.deepEqual(cartesianToCylindrical(0, 0, -4.5), { r: 0, theta: 0, z: -4.5 })
})

test('cartesianToCylindrical handles negative quadrants and diagonals', () => {
	const q3 = cartesianToCylindrical(-3, -4, -5)
	assert.equal(q3.r, 5)
	assert.ok(Math.abs(q3.theta - Math.atan2(-4, -3)) < 1e-12)
	assert.equal(q3.z, -5)

	const q4 = cartesianToCylindrical(1, -1, 2.5)
	assert.ok(Math.abs(q4.r - Math.SQRT2) < 1e-12)
	assert.ok(Math.abs(q4.theta + Math.PI / 4) < 1e-12)
	assert.equal(q4.z, 2.5)
})

test('cartesianToCylindrical satisfies inverse coordinate transformation identity', () => {
	const samples = [
		[1.5, 2.5, 3.5],
		[-2.2, 4.1, -0.5],
		[-6.3, -1.7, 9.9],
		[5.4, -3.8, -12.1],
	]
	for (const [x, y, z] of samples) {
		const { r, theta, z: cz } = cartesianToCylindrical(x, y, z)
		assert.ok(r >= 0)
		assert.ok(theta >= -Math.PI && theta <= Math.PI)
		assert.ok(Math.abs(r * Math.cos(theta) - x) < 1e-12)
		assert.ok(Math.abs(r * Math.sin(theta) - y) < 1e-12)
		assert.ok(Math.abs(r * r - (x * x + y * y)) < 1e-10)
		assert.equal(cz, z)
	}
})

test('cartesianToCylindrical handles very large and very small magnitudes without overflow or underflow', () => {
	const large = cartesianToCylindrical(3e200, 4e200, 1e200)
	assert.ok(Math.abs(large.r - 5e200) / 5e200 < 1e-12)
	assert.ok(Math.abs(large.theta - Math.atan2(4, 3)) < 1e-12)
	assert.equal(large.z, 1e200)

	const small = cartesianToCylindrical(3e-200, 4e-200, -1e-200)
	assert.ok(Math.abs(small.r - 5e-200) / 5e-200 < 1e-12)
	assert.ok(Math.abs(small.theta - Math.atan2(4, 3)) < 1e-12)
	assert.equal(small.z, -1e-200)
})
