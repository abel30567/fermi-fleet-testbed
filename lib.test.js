import { test } from 'node:test'
import assert from 'node:assert'
import { add, lerpVec } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('lerpVec interpolates 2D and 3D vectors at interior t values', () => {
	assert.deepStrictEqual(lerpVec([0, 0], [10, 20], 0.5), [5, 10])
	assert.deepStrictEqual(lerpVec([1, 2, 3], [5, 6, 7], 0.25), [2, 3, 4])
	assert.deepStrictEqual(lerpVec([2, -4, 10], [6, 4, -10], 0.75), [5, 2, -5])
})

test('lerpVec returns exact endpoints at t = 0 and t = 1 without mutating inputs', () => {
	const a = [0.1, 0.2, 0.3]
	const b = [0.7, 0.8, 0.9]
	const atZero = lerpVec(a, b, 0)
	const atOne = lerpVec(a, b, 1)
	assert.deepStrictEqual(atZero, a)
	assert.deepStrictEqual(atOne, b)
	assert.notStrictEqual(atZero, a)
	assert.notStrictEqual(atOne, b)
})

test('lerpVec satisfies symmetry and identical-vector mathematical identities', () => {
	const a = [3, -5, 12, 0.5]
	const b = [-9, 7, 4, 8.5]
	const t = 0.3
	const forward = lerpVec(a, b, t)
	const reversed = lerpVec(b, a, 1 - t)
	for (let i = 0; i < a.length; i++) {
		assert.ok(Math.abs(forward[i] - reversed[i]) < 1e-12)
	}
	assert.deepStrictEqual(lerpVec(a, a, 0.37), a)
})

test('lerpVec supports linear extrapolation for t < 0 and t > 1', () => {
	assert.deepStrictEqual(lerpVec([2, 4], [6, 12], 1.5), [8, 16])
	assert.deepStrictEqual(lerpVec([2, 4], [6, 12], -0.5), [0, 0])
	assert.deepStrictEqual(lerpVec([10, 0], [0, 10], 2), [-10, 20])
})

test('lerpVec handles empty vectors, single-element vectors, and negative values', () => {
	assert.deepStrictEqual(lerpVec([], [], 0.5), [])
	assert.deepStrictEqual(lerpVec([-10], [10], 0.5), [0])
	assert.deepStrictEqual(lerpVec([-4, -8], [-2, -4], 0.5), [-3, -6])
})

test('lerpVec throws on mismatched lengths or invalid argument types', () => {
	assert.throws(() => lerpVec([1, 2], [1, 2, 3], 0.5), RangeError)
	assert.throws(() => lerpVec('not-array', [1, 2], 0.5), TypeError)
	assert.throws(() => lerpVec([1, 2], null, 0.5), TypeError)
	assert.throws(() => lerpVec([1, 2], [3, 4], NaN), TypeError)
	assert.throws(() => lerpVec([1, 2], [3, 4], '0.5'), TypeError)
})
