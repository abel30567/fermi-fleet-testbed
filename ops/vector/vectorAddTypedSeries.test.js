import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { vectorAddTypedSeries } from './vectorAddTypedSeries.js'

function normSquared(v) {
	let sum = 0
	for (let i = 0; i < v.length; i++) {
		sum += v[i] * v[i]
	}
	return sum
}

describe('vectorAddTypedSeries', () => {
	it('adds two Float64Array vectors element-wise', () => {
		const a = new Float64Array([1, 2.5, -3, 4.25])
		const b = new Float64Array([10, -0.5, 3, 0.75])
		const res = vectorAddTypedSeries(a, b)

		assert.ok(res instanceof Float64Array)
		assert.deepEqual(Array.from(res), [11, 2, 0, 5])
	})

	it('handles empty Float64Array inputs', () => {
		const a = new Float64Array(0)
		const b = new Float64Array(0)
		const res = vectorAddTypedSeries(a, b)

		assert.ok(res instanceof Float64Array)
		assert.equal(res.length, 0)
		assert.notEqual(res, a)
		assert.notEqual(res, b)
	})

	it('handles negative values, exact cancellation, and signed zero', () => {
		const a = new Float64Array([1e12, -42.5, -0, 0])
		const b = new Float64Array([-1e12, 42.5, -0, -0])
		const res = vectorAddTypedSeries(a, b)

		assert.equal(res[0], 0)
		assert.equal(res[1], 0)
		assert.ok(Object.is(res[2], -0))
		assert.ok(Object.is(res[3], 0))
	})

	it('preserves IEEE-754 semantics for NaN and Infinity', () => {
		const a = new Float64Array([NaN, Infinity, -Infinity, Infinity, 5])
		const b = new Float64Array([1, 2, -3, -Infinity, NaN])
		const res = vectorAddTypedSeries(a, b)

		assert.ok(Number.isNaN(res[0]))
		assert.equal(res[1], Infinity)
		assert.equal(res[2], -Infinity)
		assert.ok(Number.isNaN(res[3]))
		assert.ok(Number.isNaN(res[4]))
	})

	it('supports variadic Float64Array series with Neumaier compensation', () => {
		const a = new Float64Array([1e16, -1e16, 1, Infinity])
		const b = new Float64Array([1, 2, 2, 5])
		const c = new Float64Array([-1e16, 1e16, 3, 10])
		const res = vectorAddTypedSeries(a, b, c)

		assert.equal(res[0], 1)
		assert.equal(res[1], 2)
		assert.equal(res[2], 6)
		assert.equal(res[3], Infinity)
	})

	it('does not mutate input vectors and returns a distinct instance', () => {
		const a = new Float64Array([3, 6, 9])
		const b = new Float64Array([1, 2, 3])
		const aCopy = new Float64Array(a)
		const bCopy = new Float64Array(b)

		const res = vectorAddTypedSeries(a, b)
		res[0] = 999

		assert.notEqual(res, a)
		assert.notEqual(res, b)
		assert.deepEqual(a, aCopy)
		assert.deepEqual(b, bCopy)
	})

	it('throws RangeError on mismatched lengths', () => {
		const a = new Float64Array([1, 2, 3])
		const b = new Float64Array([1, 2])
		const c = new Float64Array([1, 2, 3])

		assert.throws(() => vectorAddTypedSeries(a, b), RangeError)
		assert.throws(() => vectorAddTypedSeries(a, c, b), RangeError)
	})

	it('throws TypeError on non-Float64Array inputs', () => {
		const valid = new Float64Array([1, 2])

		assert.throws(() => vectorAddTypedSeries([1, 2], valid), TypeError)
		assert.throws(() => vectorAddTypedSeries(valid, [1, 2]), TypeError)
		assert.throws(() => vectorAddTypedSeries(new Float32Array([1, 2]), valid), TypeError)
		assert.throws(() => vectorAddTypedSeries(valid, new Int32Array([1, 2])), TypeError)
		assert.throws(() => vectorAddTypedSeries(null, valid), TypeError)
		assert.throws(() => vectorAddTypedSeries(valid, undefined), TypeError)
		assert.throws(() => vectorAddTypedSeries(valid), TypeError)
		assert.throws(() => vectorAddTypedSeries(valid, valid, [1, 2]), TypeError)
	})

	it('satisfies the parallelogram law: ||a+b||^2 + ||a-b||^2 = 2(||a||^2 + ||b||^2)', () => {
		const a = new Float64Array([1.5, -2.25, 3.75, -0.5, 4.125, 7.0])
		const b = new Float64Array([-0.75, 5.5, 1.25, 2.0, -3.625, 0.5])
		const negB = b.map((x) => -x)

		const sum = vectorAddTypedSeries(a, b)
		const diff = vectorAddTypedSeries(a, negB)

		const lhs = normSquared(sum) + normSquared(diff)
		const rhs = 2 * (normSquared(a) + normSquared(b))

		assert.ok(
			Math.abs(lhs - rhs) <= 1e-11 * Math.max(1, Math.abs(rhs)),
			`expected ${lhs} to match ${rhs}`
		)
	})

	it('satisfies commutativity, associativity, and additive identity', () => {
		const a = new Float64Array([1.25, -3.5, 0.125, 8.75])
		const b = new Float64Array([-4.0, 2.75, 6.5, -1.25])
		const c = new Float64Array([0.5, 1.125, -2.25, 3.0])
		const zero = new Float64Array(a.length)

		// Commutativity: a + b === b + a
		assert.deepEqual(vectorAddTypedSeries(a, b), vectorAddTypedSeries(b, a))

		// Additive identity: a + 0 === a
		assert.deepEqual(vectorAddTypedSeries(a, zero), a)

		// Associativity: (a + b) + c ≈ a + (b + c) ≈ a + b + c
		const leftAssoc = vectorAddTypedSeries(vectorAddTypedSeries(a, b), c)
		const rightAssoc = vectorAddTypedSeries(a, vectorAddTypedSeries(b, c))
		const seriesSum = vectorAddTypedSeries(a, b, c)

		for (let i = 0; i < a.length; i++) {
			assert.ok(Math.abs(leftAssoc[i] - rightAssoc[i]) <= 1e-12)
			assert.ok(Math.abs(leftAssoc[i] - seriesSum[i]) <= 1e-12)
		}
	})
})
