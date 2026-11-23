import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { magnitudeTypedIterative } from './magnitudeTypedIterative.js'

describe('magnitudeTypedIterative', () => {
	it('computes exact magnitudes for Pythagorean triples and standard vectors', () => {
		assert.equal(magnitudeTypedIterative(new Float64Array([3, 4])), 5)
		assert.equal(magnitudeTypedIterative(new Float64Array([5, 12])), 13)
		assert.equal(magnitudeTypedIterative(new Float64Array([1, 2, 2])), 3)
		assert.equal(magnitudeTypedIterative(new Float64Array([2, 3, 6])), 7)
	})

	it('handles negative values and signed zeros', () => {
		assert.equal(magnitudeTypedIterative(new Float64Array([-3, -4])), 5)
		assert.equal(magnitudeTypedIterative(new Float64Array([-5])), 5)
		assert.equal(magnitudeTypedIterative(new Float64Array([-0, 0, -0])), 0)
	})

	it('handles empty, zero, single-element, and unit vectors', () => {
		assert.equal(magnitudeTypedIterative(new Float64Array([])), 0)
		assert.equal(magnitudeTypedIterative(new Float64Array([0, 0, 0, 0])), 0)
		assert.equal(magnitudeTypedIterative(new Float64Array([42.5])), 42.5)
		assert.equal(magnitudeTypedIterative(new Float64Array([0, 1, 0])), 1)
	})

	it('handles subarray views without mutating the input', () => {
		const backing = new Float64Array([99, 3, 4, 88])
		const view = backing.subarray(1, 3)
		assert.equal(magnitudeTypedIterative(view), 5)
		assert.deepEqual(Array.from(backing), [99, 3, 4, 88])
	})

	it('propagates NaN and Infinity per IEEE 754', () => {
		assert.ok(Number.isNaN(magnitudeTypedIterative(new Float64Array([1, NaN, 2]))))
		assert.equal(magnitudeTypedIterative(new Float64Array([1, Infinity, 2])), Infinity)
		assert.equal(magnitudeTypedIterative(new Float64Array([1, -Infinity, 2])), Infinity)
	})

	it('throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			null,
			undefined,
			[3, 4],
			new Float32Array([3, 4]),
			new Int32Array([3, 4]),
			'3,4',
			42,
			{ length: 2, 0: 3, 1: 4 },
		]
		for (const input of invalidInputs) {
			assert.throws(() => magnitudeTypedIterative(input), TypeError)
		}
	})

	it('matches independent Math.hypot cross-check across deterministic pseudo-random vectors', () => {
		// Deterministic LCG for reproducible floating-point test vectors
		let seed = 123456789
		const nextFloat = () => {
			seed = (1664525 * seed + 1013904223) >>> 0
			return (seed / 0xffffffff) * 200 - 100
		}

		for (const len of [1, 2, 5, 17, 64, 256]) {
			const vec = new Float64Array(len)
			for (let i = 0; i < len; i++) {
				vec[i] = nextFloat()
			}
			const actual = magnitudeTypedIterative(vec)
			const expected = Math.hypot(...vec)
			assert.ok(
				Math.abs(actual - expected) <= 1e-12 * Math.max(1, expected),
				`Mismatch for length ${len}: actual=${actual}, expected=${expected}`,
			)
		}
	})

	it('satisfies scaling homogeneity ||k * v|| = |k| * ||v||', () => {
		const vec = new Float64Array([1.5, -2.25, 3.75, -0.5])
		const scale = -3.5
		const scaled = new Float64Array(vec.length)
		for (let i = 0; i < vec.length; i++) {
			scaled[i] = vec[i] * scale
		}
		const lhs = magnitudeTypedIterative(scaled)
		const rhs = Math.abs(scale) * magnitudeTypedIterative(vec)
		assert.ok(Math.abs(lhs - rhs) <= 1e-12 * Math.max(1, rhs))
	})
})
