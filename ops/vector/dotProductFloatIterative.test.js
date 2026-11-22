import { describe, test } from 'node:test'
import assert from 'node:assert'
import { dotProductFloatIterative } from './dotProductFloatIterative.js'

const EPSILON = 1e-12

function assertClose(actual, expected, tolerance = EPSILON) {
	assert.ok(
		Math.abs(actual - expected) <= tolerance,
		`Expected ${actual} to be within ${tolerance} of ${expected}`
	)
}

describe('dotProductFloatIterative', () => {
	describe('normal cases', () => {
		test('1D vectors', () => {
			assert.strictEqual(dotProductFloatIterative([3], [4]), 12)
			assert.strictEqual(dotProductFloatIterative([1.5], [2.5]), 3.75)
			assert.strictEqual(dotProductFloatIterative([-2.5], [4]), -10)
		})

		test('2D vectors', () => {
			assert.strictEqual(dotProductFloatIterative([1, 2], [3, 4]), 11)
			assertClose(dotProductFloatIterative([0.5, 1.25], [2.0, 4.0]), 6.0)
		})

		test('3D vectors', () => {
			assert.strictEqual(dotProductFloatIterative([1, 2, 3], [4, 5, 6]), 32)
			assertClose(
				dotProductFloatIterative([1.5, -2.25, 0.75], [2.0, 4.0, -8.0]),
				-12.0
			)
		})

		test('nD vectors', () => {
			const a = [1, 2, 3, 4, 5, 6]
			const b = [6, 5, 4, 3, 2, 1]
			// 6 + 10 + 12 + 12 + 10 + 6 = 56
			assert.strictEqual(dotProductFloatIterative(a, b), 56)

			const ones = new Array(100).fill(1.5)
			const twos = new Array(100).fill(2)
			assert.strictEqual(dotProductFloatIterative(ones, twos), 300)
		})

		test('orthogonal vectors return 0', () => {
			assert.strictEqual(dotProductFloatIterative([1, 0], [0, 1]), 0)
			assert.strictEqual(dotProductFloatIterative([1, 2, -1], [2, -1, 0]), 0)
			assert.strictEqual(
				dotProductFloatIterative([3, -4, 0, 0], [4, 3, 0, 5]),
				0
			)
			assertClose(
				dotProductFloatIterative(
					[Math.cos(0.7), Math.sin(0.7)],
					[-Math.sin(0.7), Math.cos(0.7)]
				),
				0
			)
		})

		test('commutativity and scalar homogeneity', () => {
			const a = [1.25, -3.5, 7.75, 0.5]
			const b = [-2.0, 4.25, -1.5, 8.0]
			assert.strictEqual(
				dotProductFloatIterative(a, b),
				dotProductFloatIterative(b, a)
			)

			const k = 3.5
			const scaledA = a.map((x) => k * x)
			assertClose(
				dotProductFloatIterative(scaledA, b),
				k * dotProductFloatIterative(a, b)
			)
		})
	})

	describe('edge cases', () => {
		test('empty vectors return 0', () => {
			assert.strictEqual(dotProductFloatIterative([], []), 0)
		})

		test('zero vectors and signed zeros', () => {
			assert.strictEqual(dotProductFloatIterative([0, 0, 0], [1, 2, 3]), 0)
			assert.strictEqual(dotProductFloatIterative([1, 2, 3], [0, 0, 0]), 0)
			assert.strictEqual(dotProductFloatIterative([0, 0], [0, 0]), 0)
			assert.strictEqual(dotProductFloatIterative([-0, 0], [1, -1]), 0)
		})

		test('negative values', () => {
			assert.strictEqual(
				dotProductFloatIterative([-1, -2, -3], [-4, -5, -6]),
				32
			)
			assert.strictEqual(
				dotProductFloatIterative([-1, -2, -3], [4, 5, 6]),
				-32
			)
			assert.strictEqual(dotProductFloatIterative([-3, 3], [2, 2]), 0)
		})

		test('NaN elements propagate NaN', () => {
			assert.ok(Number.isNaN(dotProductFloatIterative([NaN, 1], [2, 3])))
			assert.ok(Number.isNaN(dotProductFloatIterative([1, 2], [3, NaN])))
			assert.ok(Number.isNaN(dotProductFloatIterative([NaN], [0])))
		})

		test('Infinity and -Infinity elements follow IEEE-754 semantics', () => {
			assert.strictEqual(
				dotProductFloatIterative([Infinity, 1], [2, 3]),
				Infinity
			)
			assert.strictEqual(
				dotProductFloatIterative([-Infinity, 1], [2, 3]),
				-Infinity
			)
			assert.strictEqual(
				dotProductFloatIterative([Infinity, 1], [-2, 3]),
				-Infinity
			)
			assert.ok(
				Number.isNaN(dotProductFloatIterative([Infinity, 1], [0, 3]))
			)
			assert.ok(
				Number.isNaN(dotProductFloatIterative([Infinity, -Infinity], [1, 1]))
			)
		})

		test('overflow and subnormal float64 values', () => {
			assert.strictEqual(
				dotProductFloatIterative([Number.MAX_VALUE], [2]),
				Infinity
			)
			assert.strictEqual(
				dotProductFloatIterative([Number.MIN_VALUE], [Number.MIN_VALUE]),
				0
			)
		})

		test('mismatched lengths throw RangeError', () => {
			assert.throws(
				() => dotProductFloatIterative([1, 2], [1, 2, 3]),
				RangeError
			)
			assert.throws(() => dotProductFloatIterative([], [1]), RangeError)
			assert.throws(() => dotProductFloatIterative([1], []), RangeError)
		})

		test('non-array inputs throw TypeError', () => {
			const invalidInputs = [
				null,
				undefined,
				42,
				'123',
				{ 0: 1, length: 1 },
				true,
				new Float64Array([1, 2]),
				new Set([1, 2])
			]

			for (const bad of invalidInputs) {
				assert.throws(() => dotProductFloatIterative(bad, [1, 2]), TypeError)
				assert.throws(() => dotProductFloatIterative([1, 2], bad), TypeError)
			}
		})

		test('non-number elements throw TypeError', () => {
			const badElements = ['1', null, undefined, true, false, 1n, {}, [], Symbol('x')]

			for (const bad of badElements) {
				assert.throws(() => dotProductFloatIterative([1, bad], [1, 2]), TypeError)
				assert.throws(() => dotProductFloatIterative([1, 2], [1, bad]), TypeError)
			}

			// Sparse array holes evaluate to undefined and must throw TypeError
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3]
			assert.throws(() => dotProductFloatIterative(sparse, [1, 2, 3]), TypeError)
			assert.throws(() => dotProductFloatIterative([1, 2, 3], sparse), TypeError)

			// Validation must still reject invalid elements appearing after NaN
			assert.throws(() => dotProductFloatIterative([NaN, '2'], [1, 2]), TypeError)
			assert.throws(() => dotProductFloatIterative([1, 2], [NaN, '2']), TypeError)
		})
	})

	describe('cross-checks against independent computations', () => {
		test('matches geometric formula |a||b|cos(theta) in 2D', () => {
			const angles = [
				0,
				Math.PI / 6,
				Math.PI / 4,
				Math.PI / 3,
				Math.PI / 2,
				(2 * Math.PI) / 3,
				Math.PI,
				1.2345
			]
			const magA = 3.7
			const magB = 5.2

			for (const theta of angles) {
				const base = 0.42
				const a = [magA * Math.cos(base), magA * Math.sin(base)]
				const b = [magB * Math.cos(base + theta), magB * Math.sin(base + theta)]
				const expected = magA * magB * Math.cos(theta)
				assertClose(dotProductFloatIterative(a, b), expected, 1e-11)
			}
		})

		test('matches independent Array.prototype.reduce computation across nD vectors', () => {
			const reduceDot = (u, v) => u.reduce((acc, val, idx) => acc + val * v[idx], 0)

			const cases = [
				[
					[0.1, -0.2, 0.3, -0.4, 0.5, -0.6, 0.7],
					[1.3, 2.7, -3.1, 4.9, -5.2, 6.4, -7.8]
				],
				[
					Array.from({ length: 50 }, (_, i) => Math.sin(i + 1) * 10),
					Array.from({ length: 50 }, (_, i) => Math.cos(i * 2 + 0.5) * 7)
				]
			]

			for (const [a, b] of cases) {
				const actual = dotProductFloatIterative(a, b)
				const expected = reduceDot(a, b)
				assert.strictEqual(actual, expected)

				// Also verify Cauchy-Schwarz inequality: |a · b| <= ||a|| * ||b||
				const normA = Math.hypot(...a)
				const normB = Math.hypot(...b)
				assert.ok(Math.abs(actual) <= normA * normB + 1e-10)
			}
		})
	})
})
