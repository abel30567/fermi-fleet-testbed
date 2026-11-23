import { test, describe } from 'node:test'
import assert from 'node:assert'
import { dotProductTypedRecursive } from './dotProductTypedRecursive.js'

function iterativeDot(a, b) {
	let sum = 0
	for (let i = 0; i < a.length; i++) {
		sum += a[i] * b[i]
	}
	return sum
}

describe('dotProductTypedRecursive', () => {
	test('computes dot product for standard vectors', () => {
		const a = new Float64Array([1, 2, 3])
		const b = new Float64Array([4, 5, 6])
		assert.strictEqual(dotProductTypedRecursive(a, b), 32)
	})

	test('returns 0 for empty Float64Array inputs', () => {
		const a = new Float64Array([])
		const b = new Float64Array([])
		assert.strictEqual(dotProductTypedRecursive(a, b), 0)
	})

	test('handles single-element vectors', () => {
		const a = new Float64Array([7.5])
		const b = new Float64Array([-4])
		assert.strictEqual(dotProductTypedRecursive(a, b), -30)
	})

	test('returns 0 for orthogonal vectors', () => {
		const a = new Float64Array([1, 0, -2, 0])
		const b = new Float64Array([0, 5, 0, 9])
		assert.strictEqual(dotProductTypedRecursive(a, b), 0)

		const u = new Float64Array([3, -4])
		const v = new Float64Array([4, 3])
		assert.strictEqual(dotProductTypedRecursive(u, v), 0)
	})

	test('handles negative and mixed-sign entries', () => {
		const a = new Float64Array([-1, -2, -3, -4])
		const b = new Float64Array([5, -6, 7, -8])
		// -5 + 12 - 21 + 32 = 18
		assert.strictEqual(dotProductTypedRecursive(a, b), 18)
	})

	test('works correctly on Float64Array subarray views', () => {
		const bufA = new Float64Array([99, 2, 3, 4, 88])
		const bufB = new Float64Array([77, 10, 20, 30, 66])
		const subA = bufA.subarray(1, 4)
		const subB = bufB.subarray(1, 4)
		assert.strictEqual(dotProductTypedRecursive(subA, subB), 200)
	})

	test('handles large arrays without stack overflow and matches analytical sum', () => {
		const n = 100_000
		const a = new Float64Array(n)
		const b = new Float64Array(n)
		for (let i = 0; i < n; i++) {
			a[i] = 1.5
			b[i] = 2.0
		}
		assert.strictEqual(dotProductTypedRecursive(a, b), 300_000)
	})

	test('handles odd and non-power-of-two lengths accurately', () => {
		for (const n of [2, 3, 5, 7, 15, 16, 17, 63, 127, 257]) {
			const a = new Float64Array(n)
			const b = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				a[i] = i + 1
				b[i] = 2
			}
			// 2 * n * (n + 1) / 2 = n * (n + 1)
			assert.strictEqual(dotProductTypedRecursive(a, b), n * (n + 1))
		}
	})

	test('cross-check: agrees with iterative summation within floating-point tolerance', () => {
		const n = 10_000
		const a = new Float64Array(n)
		const b = new Float64Array(n)
		for (let i = 0; i < n; i++) {
			a[i] = Math.sin(i * 0.13)
			b[i] = Math.cos(i * 0.29)
		}
		const recursiveResult = dotProductTypedRecursive(a, b)
		const iterativeResult = iterativeDot(a, b)
		assert.ok(
			Math.abs(recursiveResult - iterativeResult) < 1e-10,
			`Expected ${recursiveResult} to be within 1e-10 of ${iterativeResult}`
		)
	})

	test('cross-check: satisfies commutativity (a·b === b·a) and bilinearity', () => {
		const a = new Float64Array([1.25, -3.5, 4.75, 0.125, -9.5, 2.25, 7.0])
		const b = new Float64Array([-0.5, 2.0, -1.75, 8.0, 3.25, -4.5, 1.5])
		const c = new Float64Array([2.5, 1.5, -0.25, 3.0, -1.0, 6.0, -2.0])

		// Commutativity holds bit-for-bit due to symmetric tree decomposition
		assert.strictEqual(
			dotProductTypedRecursive(a, b),
			dotProductTypedRecursive(b, a)
		)

		// Bilinearity: (a + b) · c ≈ a·c + b·c
		const aPlusB = new Float64Array(a.length)
		for (let i = 0; i < a.length; i++) {
			aPlusB[i] = a[i] + b[i]
		}
		const lhs = dotProductTypedRecursive(aPlusB, c)
		const rhs = dotProductTypedRecursive(a, c) + dotProductTypedRecursive(b, c)
		assert.ok(Math.abs(lhs - rhs) < 1e-12)
	})

	test('cross-check: satisfies Cauchy-Schwarz inequality |a·b|^2 <= (a·a)(b·b)', () => {
		const a = new Float64Array([3.1, -1.4, 5.9, -2.6, 5.3, -5.8, 9.7])
		const b = new Float64Array([-2.7, 1.8, -2.8, 1.8, -2.8, 4.5, -9.0])
		const ab = dotProductTypedRecursive(a, b)
		const aa = dotProductTypedRecursive(a, a)
		const bb = dotProductTypedRecursive(b, b)
		assert.ok(ab * ab <= aa * bb + 1e-12)
		assert.ok(aa >= 0 && bb >= 0)
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const valid = new Float64Array([1, 2])
		const invalidInputs = [
			null,
			undefined,
			[1, 2],
			new Float32Array([1, 2]),
			new Int32Array([1, 2]),
			'12',
			42,
			{ length: 2, 0: 1, 1: 2 }
		]
		for (const bad of invalidInputs) {
			assert.throws(() => dotProductTypedRecursive(bad, valid), TypeError)
			assert.throws(() => dotProductTypedRecursive(valid, bad), TypeError)
		}
	})

	test('throws RangeError for mismatched vector lengths', () => {
		assert.throws(
			() =>
				dotProductTypedRecursive(
					new Float64Array([1, 2, 3]),
					new Float64Array([1, 2])
				),
			RangeError
		)
		assert.throws(
			() =>
				dotProductTypedRecursive(
					new Float64Array([]),
					new Float64Array([1])
				),
			RangeError
		)
	})
})
