import { test } from 'node:test'
import assert from 'node:assert'
import { add, arcLength2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('arcLength2: unit circle circumference ~ 2*pi', () => {
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	const length = arcLength2(rx, ry, 0, 2 * Math.PI)
	assert.ok(Math.abs(length - 2 * Math.PI) < 1e-3)
})

test('arcLength2: half unit circle ~ pi', () => {
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	const length = arcLength2(rx, ry, 0, Math.PI)
	assert.ok(Math.abs(length - Math.PI) < 1e-3)
})

test('arcLength2: straight horizontal segment is exact', () => {
	const rx = (t) => t
	const ry = (t) => 0
	const length = arcLength2(rx, ry, 0, 5)
	assert.equal(length, 5)
})

test('arcLength2: straight diagonal segment (3-4-5 triangle) is exact', () => {
	const rx = (t) => 3 * t
	const ry = (t) => 4 * t
	const length = arcLength2(rx, ry, 0, 1)
	assert.ok(Math.abs(length - 5) < 1e-9)
})

test('arcLength2: zero-length interval is zero', () => {
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	const length = arcLength2(rx, ry, 1, 1)
	assert.equal(length, 0)
})

test('arcLength2: respects custom n subdivision count', () => {
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	const length = arcLength2(rx, ry, 0, 2 * Math.PI, 10000)
	assert.ok(Math.abs(length - 2 * Math.PI) < 1e-5)
})
