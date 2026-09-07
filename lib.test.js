import { test } from 'node:test'
import assert from 'node:assert'
import { add, vectorTriple } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function cross(a, b) {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	]
}

function dot(a, b) {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function sub(a, b) {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function scale(a, s) {
	return [a[0] * s, a[1] * s, a[2] * s]
}

test('vectorTriple matches direct cross-of-cross computation for a known case', () => {
	const u = [1, 2, 3]
	const v = [4, 5, 6]
	const w = [7, 8, 9]
	const expected = cross(u, cross(v, w))
	assert.deepEqual(vectorTriple(u, v, w), expected)
	assert.deepEqual(vectorTriple(u, v, w), [-24, -6, 12])
})

test('vectorTriple satisfies the BAC-CAB identity: u x (v x w) = v(u.w) - w(u.v)', () => {
	const u = [1, 2, 3]
	const v = [4, 5, 6]
	const w = [7, 8, 9]
	const bacCab = sub(scale(v, dot(u, w)), scale(w, dot(u, v)))
	assert.deepEqual(vectorTriple(u, v, w), bacCab)
})

test('vectorTriple with standard basis vectors', () => {
	const i = [1, 0, 0]
	const j = [0, 1, 0]
	const k = [0, 0, 1]
	// i x (j x k) = i x i = 0
	assert.deepEqual(vectorTriple(i, j, k), [0, 0, 0])
	// j x (i x k) = j x (-j) = 0... verify against BAC-CAB directly
	assert.deepEqual(vectorTriple(j, i, k), sub(scale(i, dot(j, k)), scale(k, dot(j, i))))
})

test('vectorTriple with a zero vector yields the zero vector', () => {
	assert.deepEqual(vectorTriple([0, 0, 0], [1, 2, 3], [4, 5, 6]), [0, 0, 0])
	assert.deepEqual(vectorTriple([1, 2, 3], [0, 0, 0], [4, 5, 6]), [0, 0, 0])
	assert.deepEqual(vectorTriple([1, 2, 3], [4, 5, 6], [0, 0, 0]), [0, 0, 0])
})

test('vectorTriple with parallel v and w yields the zero vector', () => {
	const u = [1, 2, 3]
	const v = [2, -1, 0]
	const w = scale(v, 3)
	assert.deepEqual(vectorTriple(u, v, w), [0, 0, 0])
})
