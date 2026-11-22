import { describe, it } from 'node:test'
import assert from 'node:assert'
import { crossProductTypedRecursive } from './crossProductTypedRecursive.js'

function dot3(u, uOff, v, vOff) {
	return (
		u[uOff] * v[vOff] +
		u[uOff + 1] * v[vOff + 1] +
		u[uOff + 2] * v[vOff + 2]
	)
}

function normSq3(v, off) {
	return dot3(v, off, v, off)
}

describe('crossProductTypedRecursive', () => {
	describe('normal cases', () => {
		it('computes cross product for standard right-handed basis vectors', () => {
			const i = new Float64Array([1, 0, 0])
			const j = new Float64Array([0, 1, 0])
			const k = new Float64Array([0, 0, 1])

			assert.deepStrictEqual(crossProductTypedRecursive(i, j), new Float64Array([0, 0, 1]))
			assert.deepStrictEqual(crossProductTypedRecursive(j, k), new Float64Array([1, 0, 0]))
			assert.deepStrictEqual(crossProductTypedRecursive(k, i), new Float64Array([0, 1, 0]))

			assert.deepStrictEqual(crossProductTypedRecursive(j, i), new Float64Array([0, 0, -1]))
			assert.deepStrictEqual(crossProductTypedRecursive(k, j), new Float64Array([-1, 0, 0]))
			assert.deepStrictEqual(crossProductTypedRecursive(i, k), new Float64Array([0, -1, 0]))
		})

		it('computes cross product for general single 3D vectors', () => {
			const a = new Float64Array([1, 2, 3])
			const b = new Float64Array([4, 5, 6])
			assert.deepStrictEqual(crossProductTypedRecursive(a, b), new Float64Array([-3, 6, -3]))

			const c = new Float64Array([2, -3, 4])
			const d = new Float64Array([-5, 6, -7])
			// (-3)*(-7) - 4*6 = 21 - 24 = -3
			// 4*(-5) - 2*(-7) = -20 + 14 = -6
			// 2*6 - (-3)*(-5) = 12 - 15 = -3
			assert.deepStrictEqual(crossProductTypedRecursive(c, d), new Float64Array([-3, -6, -3]))
		})

		it('handles empty Float64Array inputs', () => {
			const a = new Float64Array(0)
			const b = new Float64Array(0)
			const out = crossProductTypedRecursive(a, b)

			assert.ok(out instanceof Float64Array)
			assert.strictEqual(out.length, 0)
			assert.notStrictEqual(out, a)
			assert.notStrictEqual(out, b)
		})

		it('computes packed batches of multiple 3D vectors exercising divide-and-conquer splits', () => {
			// 5 vectors (odd count, exercises uneven binary splits)
			const a = new Float64Array([
				1, 0, 0,
				0, 1, 0,
				1, 2, 3,
				-2, 5, 1,
				0.5, -1.5, 2.5,
			])
			const b = new Float64Array([
				0, 1, 0,
				0, 0, 1,
				4, 5, 6,
				3, -1, 4,
				4, 2, -2,
			])

			const expected = new Float64Array([
				0, 0, 1,
				1, 0, 0,
				-3, 6, -3,
				21, 11, -13,
				-2, 11, 7,
			])

			const out = crossProductTypedRecursive(a, b)
			assert.ok(out instanceof Float64Array)
			assert.deepStrictEqual(out, expected)
		})

		it('handles large batches across many levels of recursion', () => {
			const count = 257
			const a = new Float64Array(count * 3)
			const b = new Float64Array(count * 3)
			const expected = new Float64Array(count * 3)

			for (let idx = 0; idx < count; idx++) {
				const off = idx * 3
				const ax = Math.sin(idx + 1) * 10
				const ay = Math.cos(idx * 2 + 0.5) * 10
				const az = ((idx % 11) - 5) * 1.25
				const bx = Math.cos(idx + 3) * 7
				const by = Math.sin(idx * 3 - 1) * 7
				const bz = ((idx % 7) - 3) * 2.5

				a[off] = ax
				a[off + 1] = ay
				a[off + 2] = az
				b[off] = bx
				b[off + 1] = by
				b[off + 2] = bz

				const cx = ay * bz - az * by
				const cy = az * bx - ax * bz
				const cz = ax * by - ay * bx
				expected[off] = cx === 0 ? 0 : cx
				expected[off + 1] = cy === 0 ? 0 : cy
				expected[off + 2] = cz === 0 ? 0 : cz
			}

			const actual = crossProductTypedRecursive(a, b)
			assert.deepStrictEqual(actual, expected)
		})

		it('works with Float64Array subarray views', () => {
			const bufA = new Float64Array([99, 1, 2, 3, 1, 0, 0, 88])
			const bufB = new Float64Array([77, 4, 5, 6, 0, 1, 0, 66])
			const subA = bufA.subarray(1, 7)
			const subB = bufB.subarray(1, 7)

			assert.deepStrictEqual(
				crossProductTypedRecursive(subA, subB),
				new Float64Array([-3, 6, -3, 0, 0, 1])
			)
		})
	})

	describe('edge cases and algebraic properties', () => {
		it('returns zero vector for parallel, anti-parallel, identical, and zero vectors', () => {
			const v = new Float64Array([3, -4, 5])
			const parallel = new Float64Array([6, -8, 10])
			const antiParallel = new Float64Array([-9, 12, -15])
			const zero = new Float64Array([0, 0, 0])

			assert.deepStrictEqual(crossProductTypedRecursive(v, v), zero)
			assert.deepStrictEqual(crossProductTypedRecursive(v, parallel), zero)
			assert.deepStrictEqual(crossProductTypedRecursive(v, antiParallel), zero)
			assert.deepStrictEqual(crossProductTypedRecursive(v, zero), zero)
			assert.deepStrictEqual(crossProductTypedRecursive(zero, v), zero)
			assert.deepStrictEqual(crossProductTypedRecursive(zero, zero), zero)
		})

		it('satisfies anti-commutativity a × b = -(b × a)', () => {
			const a = new Float64Array([3.5, -2.25, 7.125, -1, 4, 9, 0.25, 8, -3])
			const b = new Float64Array([-6.5, 1.5, -4.75, 2, -5, 3, 6, -1.25, 2.5])

			const ab = crossProductTypedRecursive(a, b)
			const ba = crossProductTypedRecursive(b, a)

			for (let i = 0; i < ab.length; i++) {
				assert.strictEqual(ab[i], ba[i] === 0 ? 0 : -ba[i])
			}
		})

		it('does not mutate inputs and returns a new Float64Array instance', () => {
			const a = new Float64Array([1, 2, 3, 7, 8, 9])
			const b = new Float64Array([4, 5, 6, -1, -2, -3])
			const aCopy = new Float64Array(a)
			const bCopy = new Float64Array(b)

			const out = crossProductTypedRecursive(a, b)

			assert.notStrictEqual(out, a)
			assert.notStrictEqual(out, b)
			assert.deepStrictEqual(a, aCopy)
			assert.deepStrictEqual(b, bCopy)

			// Mutating output does not affect inputs
			out[0] = 9999
			assert.deepStrictEqual(a, aCopy)
			assert.deepStrictEqual(b, bCopy)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-Float64Array inputs', () => {
			const valid = new Float64Array([1, 2, 3])
			const invalidInputs = [
				[1, 2, 3],
				new Float32Array([1, 2, 3]),
				new Int32Array([1, 2, 3]),
				null,
				undefined,
				42,
				'123',
				{ 0: 1, 1: 2, 2: 3, length: 3 },
			]

			for (const bad of invalidInputs) {
				assert.throws(() => crossProductTypedRecursive(bad, valid), TypeError)
				assert.throws(() => crossProductTypedRecursive(valid, bad), TypeError)
			}
		})

		it('throws RangeError for mismatched lengths', () => {
			assert.throws(
				() => crossProductTypedRecursive(new Float64Array([1, 2, 3]), new Float64Array([1, 2, 3, 4, 5, 6])),
				RangeError
			)
			assert.throws(
				() => crossProductTypedRecursive(new Float64Array(0), new Float64Array([1, 2, 3])),
				RangeError
			)
		})

		it('throws RangeError when length is not divisible by 3', () => {
			for (const len of [1, 2, 4, 5, 7, 8]) {
				assert.throws(
					() => crossProductTypedRecursive(new Float64Array(len), new Float64Array(len)),
					RangeError
				)
			}
		})

		it('throws RangeError for non-finite values (NaN, Infinity, -Infinity)', () => {
			const valid = new Float64Array([1, 2, 3, 4, 5, 6])
			const nonFiniteValues = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]

			for (const badVal of nonFiniteValues) {
				const badA = new Float64Array([1, 2, 3, 4, badVal, 6])
				const badB = new Float64Array([1, badVal, 3, 4, 5, 6])

				assert.throws(() => crossProductTypedRecursive(badA, valid), RangeError)
				assert.throws(() => crossProductTypedRecursive(valid, badB), RangeError)
			}
		})
	})

	describe('mathematical cross-checks', () => {
		it('satisfies orthogonality dot(a×b, a) = 0, dot(a×b, b) = 0 and Lagrange identity |a×b|^2 = |a|^2|b|^2 - (a·b)^2', () => {
			const a = new Float64Array([
				1.5, -2.7, 3.3,
				-4.2, 0.8, 5.1,
				7.0, 2.5, -1.5,
				-0.3, -6.4, 2.2,
				11.2, -3.7, 8.9,
				0.1, 0.2, 0.3,
			])
			const b = new Float64Array([
				-2.1, 4.4, 1.9,
				3.6, -5.5, 2.0,
				-1.2, 6.3, 4.8,
				8.1, 1.7, -3.9,
				-4.5, 9.2, -6.1,
				0.4, -0.5, 0.6,
			])

			const c = crossProductTypedRecursive(a, b)
			const vecCount = a.length / 3

			for (let v = 0; v < vecCount; v++) {
				const off = v * 3
				const normA2 = normSq3(a, off)
				const normB2 = normSq3(b, off)
				const normC2 = normSq3(c, off)
				const abDot = dot3(a, off, b, off)

				// Orthogonality: |dot(a×b, a)| ≈ 0 and |dot(a×b, b)| ≈ 0
				const orthA = Math.abs(dot3(c, off, a, off))
				const orthB = Math.abs(dot3(c, off, b, off))
				const scale = Math.sqrt(normA2 * normB2) * Math.sqrt(normC2)
				assert.ok(
					orthA <= 1e-12 * Math.max(1, scale),
					`Vector ${v}: dot(a×b, a) = ${orthA} exceeded tolerance`
				)
				assert.ok(
					orthB <= 1e-12 * Math.max(1, scale),
					`Vector ${v}: dot(a×b, b) = ${orthB} exceeded tolerance`
				)

				// Lagrange's identity: |a×b|^2 = |a|^2|b|^2 - (a·b)^2
				const lagrangeRhs = normA2 * normB2 - abDot * abDot
				const lagrangeErr = Math.abs(normC2 - lagrangeRhs)
				assert.ok(
					lagrangeErr <= 1e-10 * Math.max(1, Math.abs(lagrangeRhs)),
					`Vector ${v}: Lagrange identity mismatch (${normC2} vs ${lagrangeRhs})`
				)
			}
		})

		it('satisfies the Jacobi identity a×(b×c) + b×(c×a) + c×(a×b) = 0', () => {
			const a = new Float64Array([1.2, -3.4, 5.6, -2.0, 4.5, 1.5])
			const b = new Float64Array([2.3, 1.1, -4.2, 3.5, -1.0, 2.5])
			const c = new Float64Array([-0.7, 2.9, 3.1, 1.25, 2.75, -3.25])

			const t1 = crossProductTypedRecursive(a, crossProductTypedRecursive(b, c))
			const t2 = crossProductTypedRecursive(b, crossProductTypedRecursive(c, a))
			const t3 = crossProductTypedRecursive(c, crossProductTypedRecursive(a, b))

			for (let i = 0; i < a.length; i++) {
				assert.ok(
					Math.abs(t1[i] + t2[i] + t3[i]) < 1e-11,
					`Jacobi identity failed at index ${i}: ${t1[i] + t2[i] + t3[i]}`
				)
			}
		})
	})
})
