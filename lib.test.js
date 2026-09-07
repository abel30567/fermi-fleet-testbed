import { test } from 'node:test'
import assert from 'node:assert'
import { add, cartesianToPolar } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('cartesianToPolar: [1, 1] -> [sqrt2, pi/4]', () => {
	const [r, theta] = cartesianToPolar(1, 1)
	assert.ok(Math.abs(r - Math.sqrt(2)) < 1e-12)
	assert.ok(Math.abs(theta - Math.PI / 4) < 1e-12)
})

test('cartesianToPolar: origin -> [0, 0]', () => {
	const [r, theta] = cartesianToPolar(0, 0)
	assert.equal(r, 0)
	assert.equal(theta, 0)
})

test('cartesianToPolar: positive x-axis -> [x, 0]', () => {
	const [r, theta] = cartesianToPolar(5, 0)
	assert.equal(r, 5)
	assert.equal(theta, 0)
})

test('cartesianToPolar: positive y-axis -> [y, pi/2]', () => {
	const [r, theta] = cartesianToPolar(0, 5)
	assert.equal(r, 5)
	assert.ok(Math.abs(theta - Math.PI / 2) < 1e-12)
})

test('cartesianToPolar: negative x-axis -> [|x|, pi]', () => {
	const [r, theta] = cartesianToPolar(-3, 0)
	assert.equal(r, 3)
	assert.ok(Math.abs(theta - Math.PI) < 1e-12)
})

test('cartesianToPolar: negative y-axis -> [|y|, -pi/2]', () => {
	const [r, theta] = cartesianToPolar(0, -3)
	assert.equal(r, 3)
	assert.ok(Math.abs(theta - -Math.PI / 2) < 1e-12)
})

test('cartesianToPolar: second quadrant', () => {
	const [r, theta] = cartesianToPolar(-1, 1)
	assert.ok(Math.abs(r - Math.sqrt(2)) < 1e-12)
	assert.ok(Math.abs(theta - 3 * Math.PI / 4) < 1e-12)
})

test('cartesianToPolar: third quadrant', () => {
	const [r, theta] = cartesianToPolar(-1, -1)
	assert.ok(Math.abs(r - Math.sqrt(2)) < 1e-12)
	assert.ok(Math.abs(theta - -3 * Math.PI / 4) < 1e-12)
})

test('cartesianToPolar: fourth quadrant', () => {
	const [r, theta] = cartesianToPolar(1, -1)
	assert.ok(Math.abs(r - Math.sqrt(2)) < 1e-12)
	assert.ok(Math.abs(theta - -Math.PI / 4) < 1e-12)
})

test('cartesianToPolar: 3-4-5 triangle', () => {
	const [r, theta] = cartesianToPolar(3, 4)
	assert.ok(Math.abs(r - 5) < 1e-12)
	assert.ok(Math.abs(theta - Math.atan2(4, 3)) < 1e-12)
})
