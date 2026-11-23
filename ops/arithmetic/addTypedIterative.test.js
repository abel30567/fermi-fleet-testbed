import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { addTypedIterative } from './addTypedIterative.js'

describe('addTypedIterative', () => {
	test('adds positive integers and floating-point values element-wise', () => {
		const a = new Float64Array([1, 2.5, 10, 0.25])
		const b = new Float64Array([3, 4.5, 20, 0.75])
		const res = addTypedIterative(a, b)

		assert.ok(res instanceof Float64Array)
		assert.deepEqual(res, new Float64Array([4, 7, 30, 1]))
	})

	test('handles negative and mixed-sign values', () => {
		const a = new Float64Array([-5, 12.5, -0.5, -100])
		const b = new Float64Array([5, -2.5, -0.5, 42])
		const res = addTypedIterative(a, b)

		assert.deepEqual(res, new Float64Array([0, 10, -1, -58]))
	})

	test('handles single-element Float64Arrays', () => {
		const res = addTypedIterative(new Float64Array([42.5]), new Float64Array([-2.5]))
		assert.deepEqual(res, new Float64Array([40]))
	})

	test('does not mutate inputs and returns a fresh Float64Array', () => {
		const a = new Float64Array([1, 2, 3])
		const b = new Float64Array([4, 5, 6])
		const res = addTypedIterative(a, b)

		assert.notEqual(res, a)
		assert.notEqual(res, b)
		assert.deepEqual(a, new Float64Array([1, 2, 3]))
		assert.deepEqual(b, new Float64Array([4, 5, 6]))
		assert.deepEqual(res, new Float64Array([5, 7, 9]))
	})

	test('supports subarray views with non-zero byteOffset', () => {
		const backing = new Float64Array([99, 1, 2, 3, 10, 20, 30, 88])
		const a = backing.subarray(1, 4)
		const b = backing.subarray(4, 7)
		const res = addTypedIterative(a, b)

		assert.deepEqual(res, new Float64Array([11, 22, 33]))
	})

	test('handles empty Float64Arrays', () => {
		const a = new Float64Array(0)
		const b = new Float64Array(0)
		const res = addTypedIterative(a, b)

		assert.ok(res instanceof Float64Array)
		assert.equal(res.length, 0)
		assert.notEqual(res, a)
		assert.notEqual(res, b)
	})

	test('handles same Float64Array instance passed for both operands', () => {
		const a = new Float64Array([1.5, -3, 0, 8])
		const res = addTypedIterative(a, a)

		assert.notEqual(res, a)
		assert.deepEqual(res, new Float64Array([3, -6, 0, 16]))
	})

	test('preserves IEEE-754 special values (NaN, Infinity, signed zero, overflow, subnormals)', () => {
		const a = new Float64Array([
			-0,
			-0,
			0,
			Infinity,
			-Infinity,
			Infinity,
			NaN,
			1,
			Number.MAX_VALUE,
			-Number.MAX_VALUE,
			Number.MIN_VALUE,
		])
		const b = new Float64Array([
			-0,
			0,
			-0,
			1,
			-1,
			-Infinity,
			5,
			NaN,
			Number.MAX_VALUE,
			-Number.MAX_VALUE,
			Number.MIN_VALUE,
		])
		const res = addTypedIterative(a, b)

		assert.ok(Object.is(res[0], -0))
		assert.ok(Object.is(res[1], +0))
		assert.ok(Object.is(res[2], +0))
		assert.equal(res[3], Infinity)
		assert.equal(res[4], -Infinity)
		assert.ok(Number.isNaN(res[5]))
		assert.ok(Number.isNaN(res[6]))
		assert.ok(Number.isNaN(res[7]))
		assert.equal(res[8], Infinity)
		assert.equal(res[9], -Infinity)
		assert.equal(res[10], Number.MIN_VALUE * 2)
	})

	test('validates that both arguments are Float64Array instances', () => {
		const valid = new Float64Array([1, 2])
		const invalidValues = [
			[1, 2],
			new Float32Array([1, 2]),
			new Int32Array([1, 2]),
			new Uint8Array([1, 2]),
			null,
			undefined,
			42,
			'12',
			{ length: 2, 0: 1, 1: 2 },
		]

		for (const bad of invalidValues) {
			assert.throws(() => addTypedIterative(bad, valid), TypeError)
			assert.throws(() => addTypedIterative(valid, bad), TypeError)
		}
	})

	test('throws RangeError when input lengths differ', () => {
		assert.throws(
			() => addTypedIterative(new Float64Array([1, 2]), new Float64Array([1, 2, 3])),
			RangeError,
		)
		assert.throws(
			() => addTypedIterative(new Float64Array([1]), new Float64Array(0)),
			RangeError,
		)
	})

	test('independent cross-check against functional Float64Array.from and algebraic properties', () => {
		const n = 1024
		const a = new Float64Array(n)
		const b = new Float64Array(n)
		const negA = new Float64Array(n)
		const zeros = new Float64Array(n)

		// Deterministic LCG for reproducible floating-point and integer test vectors
		let seed = 0x12345678
		const nextRand = () => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
			return (seed / 0x100000000 - 0.5) * 1e6
		}

		for (let i = 0; i < n; i += 1) {
			a[i] = nextRand()
			b[i] = nextRand()
			negA[i] = -a[i]
		}

		const actual = addTypedIterative(a, b)
		const expected = Float64Array.from(Array.from(a), (val, idx) => val + b[idx])
		assert.deepEqual(actual, expected)

		// Commutativity: a + b === b + a
		assert.deepEqual(actual, addTypedIterative(b, a))

		// Additive identity: a + 0 === a
		assert.deepEqual(addTypedIterative(a, zeros), a)

		// Additive inverse: a + (-a) === 0
		assert.deepEqual(addTypedIterative(a, negA), zeros)

		// Exact integer sum conservation check
		const intA = new Float64Array(200)
		const intB = new Float64Array(200)
		let sumA = 0
		let sumB = 0
		for (let i = 0; i < intA.length; i += 1) {
			intA[i] = i * 3 - 150
			intB[i] = (i % 17) * 7 - 50
			sumA += intA[i]
			sumB += intB[i]
		}
		const intRes = addTypedIterative(intA, intB)
		const sumRes = Array.from(intRes).reduce((acc, v) => acc + v, 0)
		assert.equal(sumRes, sumA + sumB)
	})
})
