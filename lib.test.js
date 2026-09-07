import { test } from 'node:test'
import assert from 'node:assert'
import { add, lerp3 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('lerp3 at s=0 returns p', () => {
	const p = { x: 1, y: 2, z: 3 }
	const q = { x: 5, y: 6, z: 7 }
	assert.deepEqual(lerp3(p, q, 0), p)
})

test('lerp3 at s=1 returns q', () => {
	const p = { x: 1, y: 2, z: 3 }
	const q = { x: 5, y: 6, z: 7 }
	assert.deepEqual(lerp3(p, q, 1), q)
})

test('lerp3 at s=0.5 returns midpoint', () => {
	const p = { x: 0, y: 0, z: 0 }
	const q = { x: 10, y: -4, z: 6 }
	assert.deepEqual(lerp3(p, q, 0.5), { x: 5, y: -2, z: 3 })
})

test('lerp3 handles negative coordinates', () => {
	const p = { x: -2, y: -4, z: -6 }
	const q = { x: 2, y: 4, z: 6 }
	assert.deepEqual(lerp3(p, q, 0.25), { x: -1, y: -2, z: -3 })
})

test('lerp3 with identical points returns the same point for any s', () => {
	const p = { x: 3, y: 3, z: 3 }
	assert.deepEqual(lerp3(p, p, 0.7), p)
})
