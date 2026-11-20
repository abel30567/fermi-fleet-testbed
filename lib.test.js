import { test } from 'node:test'
import assert from 'node:assert'
import { add, convolve1D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('convolve1D computes full discrete linear convolution of standard arrays', () => {
	const out = convolve1D([1, 2, 3], [4, 5])
	assert.equal(out.length, 3 + 2 - 1)
	assert.deepStrictEqual(out, [4, 13, 22, 15])
})

test('convolve1D satisfies commutativity and sum identity', () => {
	const a = [2, -1, 4, 3]
	const b = [-3, 5, 1]
	const ab = convolve1D(a, b)
	const ba = convolve1D(b, a)
	assert.deepStrictEqual(ab, ba)
	const sum = (arr) => arr.reduce((acc, v) => acc + v, 0)
	assert.equal(sum(ab), sum(a) * sum(b))
})

test('convolve1D satisfies associativity and polynomial multiplication identity', () => {
	const a = [1, 2, 3]
	const b = [2, -1]
	const c = [4, 0, -2]
	assert.deepStrictEqual(convolve1D(a, b), [2, 3, 4, -3])
	assert.deepStrictEqual(convolve1D(convolve1D(a, b), c), convolve1D(a, convolve1D(b, c)))
})

test('convolve1D satisfies impulse identity and delay shift', () => {
	const signal = [5, -2, 7, 1]
	const idOut = convolve1D(signal, [1])
	assert.deepStrictEqual(idOut, signal)
	assert.notStrictEqual(idOut, signal)
	assert.deepStrictEqual(convolve1D(signal, [0, 0, 1]), [0, 0, 5, -2, 7, 1])
})

test('convolve1D handles single-element, zero, negative, and floating-point inputs', () => {
	assert.deepStrictEqual(convolve1D([3], [4]), [12])
	assert.deepStrictEqual(convolve1D([0, -2, 0], [3, -1]), [0, -6, 2, 0])
	const fp = convolve1D([0.5, 1.5], [2, -0.5])
	assert.equal(fp.length, 3)
	assert.ok(Math.abs(fp[0] - 1.0) < 1e-12)
	assert.ok(Math.abs(fp[1] - 2.75) < 1e-12)
	assert.ok(Math.abs(fp[2] - -0.75) < 1e-12)
})

test('convolve1D handles empty arrays and rejects invalid inputs', () => {
	assert.deepStrictEqual(convolve1D([], [1, 2, 3]), [])
	assert.deepStrictEqual(convolve1D([1, 2, 3], []), [])
	assert.deepStrictEqual(convolve1D([], []), [])
	assert.throws(() => convolve1D(null, [1]), TypeError)
	assert.throws(() => convolve1D([1], 'abc'), TypeError)
})
