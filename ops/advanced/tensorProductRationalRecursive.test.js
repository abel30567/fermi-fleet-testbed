import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { tensorProductRationalRecursive } from './tensorProductRationalRecursive.js'

/**
 * Helper to construct a Rational `{ num, den }`.
 *
 * @param {bigint | number} num
 * @param {bigint | number} [den=1n]
 * @returns {{ num: bigint, den: bigint }}
 */
const r = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

function absBigInt(n) {
	return n < 0n ? -n : n
}

function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function normRef(q) {
	if (q.num === 0n) return { num: 0n, den: 1n }
	const sign = q.den < 0n ? -1n : 1n
	const n = q.num * sign
	const d = q.den * sign
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

function addRef(p, q) {
	return normRef({ num: p.num * q.den + q.num * p.den, den: p.den * q.den })
}

function mulRef(p, q) {
	return normRef({ num: p.num * q.num, den: p.den * q.den })
}

/**
 * Independent reference implementation using flattening, nested loops,
 * and unflattening by shape.
 */
function getShape(t) {
	if (!Array.isArray(t)) return []
	if (t.length === 0) return [0]
	return [t.length, ...getShape(t[0])]
}

function flattenTensor(t) {
	if (!Array.isArray(t)) return [normRef(t)]
	const out = []
	const stack = [t]
	while (stack.length > 0) {
		const cur = stack.pop()
		if (!Array.isArray(cur)) {
			out.push(normRef(cur))
		} else {
			for (let i = cur.length - 1; i >= 0; i--) {
				stack.push(cur[i])
			}
		}
	}
	return out
}

function unflattenTensor(flat, shape, offset = 0) {
	if (shape.length === 0) return flat[offset]
	const [dim, ...rest] = shape
	if (dim === 0) return []
	let stride = 1
	for (const d of rest) stride *= d
	const out = []
	for (let i = 0; i < dim; i++) {
		out.push(unflattenTensor(flat, rest, offset + i * stride))
	}
	return out
}

function tensorProductIterativeReference(a, b) {
	const shapeA = getShape(a)
	const shapeB = getShape(b)
	const flatA = flattenTensor(a)
	const flatB = flattenTensor(b)
	const flatOut = []
	for (let i = 0; i < flatA.length; i++) {
		for (let j = 0; j < flatB.length; j++) {
			flatOut.push(mulRef(flatA[i], flatB[j]))
		}
	}
	return unflattenTensor(flatOut, [...shapeA, ...shapeB], 0)
}

function addTensors(a, b) {
	if (!Array.isArray(a)) return addRef(a, b)
	return a.map((el, i) => addTensors(el, b[i]))
}

function scaleTensorRef(s, t) {
	if (!Array.isArray(t)) return mulRef(s, t)
	return t.map((el) => scaleTensorRef(s, el))
}

function assertAllNormalized(tensor) {
	if (!Array.isArray(tensor)) {
		assert.equal(typeof tensor.num, 'bigint')
		assert.equal(typeof tensor.den, 'bigint')
		assert.ok(tensor.den > 0n, `expected den > 0n, got ${tensor.den}`)
		if (tensor.num === 0n) {
			assert.equal(tensor.den, 1n)
		} else {
			assert.equal(gcdBigInt(tensor.num, tensor.den), 1n)
		}
		return
	}
	for (const child of tensor) {
		assertAllNormalized(child)
	}
}

describe('tensorProductRationalRecursive', () => {
	describe('normal cases', () => {
		it('computes scalar ⊗ scalar (rank 0 ⊗ rank 0)', () => {
			const res = tensorProductRationalRecursive(r(2, 3), r(9, 4))
			assert.deepStrictEqual(res, r(3, 2))
			assertAllNormalized(res)
		})

		it('computes scalar ⊗ tensor and tensor ⊗ scalar', () => {
			const s = r(-3, 5)
			const vec = [r(5, 6), r(10, 9), r(0, 7)]
			const expected = [r(-1, 2), r(-2, 3), r(0, 1)]

			const left = tensorProductRationalRecursive(s, vec)
			const right = tensorProductRationalRecursive(vec, s)
			assert.deepStrictEqual(left, expected)
			assert.deepStrictEqual(right, expected)
			assertAllNormalized(left)
			assertAllNormalized(right)

			const mat = [
				[r(1, 2), r(2, 3)],
				[r(-5, 3), r(10, 1)],
			]
			const expectedMat = [
				[r(-3, 10), r(-2, 5)],
				[r(1, 1), r(-6, 1)],
			]
			assert.deepStrictEqual(tensorProductRationalRecursive(s, mat), expectedMat)
			assert.deepStrictEqual(tensorProductRationalRecursive(mat, s), expectedMat)
		})

		it('computes 1D vector outer product (rank 1 ⊗ rank 1 -> rank 2)', () => {
			const u = [r(1, 2), r(-3, 4), r(5, 6)]
			const v = [r(2, 3), r(4, 5)]
			const result = tensorProductRationalRecursive(u, v)
			assert.deepStrictEqual(result, [
				[r(1, 3), r(2, 5)],
				[r(-1, 2), r(-3, 5)],
				[r(5, 9), r(2, 3)],
			])
			assertAllNormalized(result)
		})

		it('computes 2D ⊗ 2D tensor product (rank 2 ⊗ rank 2 -> rank 4)', () => {
			const A = [
				[r(1, 2), r(1, 3)],
				[r(2, 5), r(-3, 7)],
			]
			const B = [
				[r(3, 4), r(0, 1), r(-2, 1)],
				[r(7, 6), r(5, 2), r(1, 3)],
			]
			const result = tensorProductRationalRecursive(A, B)
			assert.deepStrictEqual(getShape(result), [2, 2, 2, 3])
			assert.deepStrictEqual(result[0][0], [
				[r(3, 8), r(0, 1), r(-1, 1)],
				[r(7, 12), r(5, 4), r(1, 6)],
			])
			assert.deepStrictEqual(result[1][1], [
				[r(-9, 28), r(0, 1), r(6, 7)],
				[r(-1, 2), r(-15, 14), r(-1, 7)],
			])
			assertAllNormalized(result)
		})

		it('computes rank-3 tensor products', () => {
			const T3 = [
				[
					[r(1, 2), r(2, 3)],
					[r(3, 4), r(4, 5)],
				],
				[
					[r(-1, 3), r(5, 6)],
					[r(0, 5), r(-7, 2)],
				],
			]
			const v = [r(6, 5), r(-2, 7)]
			const result = tensorProductRationalRecursive(T3, v)
			assert.deepStrictEqual(getShape(result), [2, 2, 2, 2])
			assert.deepStrictEqual(result[0][0][0], [r(3, 5), r(-1, 7)])
			assert.deepStrictEqual(result[1][1][1], [r(-21, 5), r(1, 1)])
			assertAllNormalized(result)
		})

		it('handles larger odd and even lengths exercising multi-level divide-and-conquer', () => {
			const a = Array.from({ length: 17 }, (_, i) => r(i - 8, i + 2))
			const b = Array.from({ length: 13 }, (_, j) => r(2 * j - 7, j + 3))
			const result = tensorProductRationalRecursive(a, b)
			const expected = tensorProductIterativeReference(a, b)
			assert.deepStrictEqual(result, expected)
			assertAllNormalized(result)
		})
	})

	describe('edge cases', () => {
		it('normalizes zero entries, negative denominators, and unreduced inputs', () => {
			const a = [r(0, -99), r(-6, -9), r(12, -18)]
			const b = [r(-15, 25), r(0, 42), r(-8, -12)]
			const result = tensorProductRationalRecursive(a, b)
			assert.deepStrictEqual(result, [
				[r(0, 1), r(0, 1), r(0, 1)],
				[r(-2, 5), r(0, 1), r(4, 9)],
				[r(2, 5), r(0, 1), r(-4, 9)],
			])
			assertAllNormalized(result)
		})

		it('preserves exact arithmetic for very large BigInt values', () => {
			const p = 10n ** 40n + 7n
			const q = 10n ** 40n + 9n
			const a = [{ num: p * 6n, den: q * 9n }]
			const b = [{ num: q * 15n, den: p * 10n }]
			const result = tensorProductRationalRecursive(a, b)
			assert.deepStrictEqual(result, [[{ num: 1n, den: 1n }]])
			assertAllNormalized(result)
		})

		it('handles empty tensor dimensions consistently', () => {
			assert.deepStrictEqual(tensorProductRationalRecursive([], [r(1, 2), r(3, 4)]), [])
			assert.deepStrictEqual(tensorProductRationalRecursive([r(1, 2), r(3, 4)], []), [[], []])
			assert.deepStrictEqual(tensorProductRationalRecursive([], []), [])
			assert.deepStrictEqual(tensorProductRationalRecursive([[], []], [r(1, 2)]), [[], []])
			assert.deepStrictEqual(tensorProductRationalRecursive(r(5, 7), []), [])
			assert.deepStrictEqual(tensorProductRationalRecursive([], r(5, 7)), [])
		})

		it('allows shared subarrays (DAG) without mutating inputs or aliasing outputs', () => {
			const sharedRow = [r(2, 4), r(-3, -6)]
			const A = [sharedRow, sharedRow]
			const B = [r(2, 1)]
			const result = tensorProductRationalRecursive(A, B)
			assert.deepStrictEqual(result, [
				[[r(1, 1)], [r(1, 1)]],
				[[r(1, 1)], [r(1, 1)]],
			])
			// Original unreduced inputs are untouched
			assert.deepStrictEqual(sharedRow, [r(2, 4), r(-3, -6)])
			// Output cells are independent objects
			assert.notEqual(result[0][0][0], result[1][0][0])
		})

		it('rejects zero denominators (including when paired with empty tensors)', () => {
			assert.throws(() => tensorProductRationalRecursive(r(1, 0), r(1, 2)), RangeError)
			assert.throws(() => tensorProductRationalRecursive(r(1, 2), [r(0, 0)]), RangeError)
			assert.throws(() => tensorProductRationalRecursive([], [r(1, 0)]), RangeError)
			assert.throws(() => tensorProductRationalRecursive([r(1, 0)], []), RangeError)
		})

		it('rejects invalid rational shapes and types', () => {
			assert.throws(() => tensorProductRationalRecursive(null, r(1, 2)), TypeError)
			assert.throws(() => tensorProductRationalRecursive(undefined, r(1, 2)), TypeError)
			assert.throws(() => tensorProductRationalRecursive(r(1, 2), undefined), TypeError)
			assert.throws(() => tensorProductRationalRecursive(3, r(1, 2)), TypeError)
			assert.throws(() => tensorProductRationalRecursive(3n, r(1, 2)), TypeError)
			assert.throws(() => tensorProductRationalRecursive({ num: 1, den: 2 }, r(1, 2)), TypeError)
			assert.throws(() => tensorProductRationalRecursive({ num: 1n }, r(1, 2)), TypeError)
			assert.throws(() => tensorProductRationalRecursive([{ num: 1n, den: '2' }], r(1, 2)), TypeError)
		})

		it('rejects ragged tensors, mixed ranks, sparse arrays, and circular references', () => {
			// Ragged 2D
			assert.throws(
				() => tensorProductRationalRecursive([[r(1, 1), r(2, 1)], [r(3, 1)]], [r(1, 1)]),
				RangeError
			)
			// Mixed scalar and array siblings
			assert.throws(
				() => tensorProductRationalRecursive([r(1, 1), [r(2, 1)]], r(1, 1)),
				RangeError
			)
			// Empty vs non-empty sibling
			assert.throws(
				() => tensorProductRationalRecursive([[], [r(1, 1)]], r(1, 1)),
				RangeError
			)
			// Different ranks among empty subarrays
			assert.throws(
				() => tensorProductRationalRecursive([[], [[]]], r(1, 1)),
				RangeError
			)
			// Deeply nested raggedness in right operand
			assert.throws(
				() =>
					tensorProductRationalRecursive(r(1, 1), [
						[[r(1, 1)], [r(2, 1)]],
						[[r(3, 1)], [r(4, 1), r(5, 1)]],
					]),
				RangeError
			)
			// Sparse array
			const sparse = new Array(2)
			sparse[0] = r(1, 1)
			assert.throws(() => tensorProductRationalRecursive(sparse, r(1, 1)), TypeError)
			// Circular reference
			const cyclic = []
			cyclic.push(cyclic)
			assert.throws(() => tensorProductRationalRecursive(cyclic, r(1, 1)), TypeError)
		})
	})

	describe('cross-checks and algebraic properties', () => {
		it('matches an independent iterative flattened-index reference across ranks 0..3', () => {
			const tensors = [
				r(-14, -21),
				[r(0, -5), r(3, -4), r(10, 15)],
				[
					[r(1, 2), r(-4, 6), r(0, 3)],
					[r(9, -12), r(7, 8), r(-5, -10)],
				],
				[
					[
						[r(2, 3), r(-1, 4)],
						[r(5, -6), r(0, 1)],
					],
					[
						[r(7, 9), r(8, 12)],
						[r(-3, -5), r(11, 7)],
					],
				],
			]

			for (const A of tensors) {
				for (const B of tensors) {
					const actual = tensorProductRationalRecursive(A, B)
					const expected = tensorProductIterativeReference(A, B)
					assert.deepStrictEqual(actual, expected)
					assertAllNormalized(actual)
				}
			}
		})

		it('satisfies bilinearity: (αA + βA′) ⊗ B = α(A ⊗ B) + β(A′ ⊗ B) and right linearity', () => {
			const alpha = r(3, 7)
			const beta = r(-5, 4)
			const A = [
				[r(1, 2), r(-2, 3)],
				[r(4, 5), r(0, 1)],
			]
			const A2 = [
				[r(-3, 4), r(5, 6)],
				[r(1, 10), r(7, -8)],
			]
			const B = [
				[r(2, 9), r(3, -5), r(1, 1)],
				[r(-4, 7), r(0, 3), r(6, 11)],
			]
			const B2 = [
				[r(1, 3), r(-2, 5), r(4, 7)],
				[r(5, 2), r(-1, 6), r(3, -4)],
			]

			// Left linearity
			const leftCombined = addTensors(scaleTensorRef(alpha, A), scaleTensorRef(beta, A2))
			const lhsLeft = tensorProductRationalRecursive(leftCombined, B)
			const rhsLeft = addTensors(
				scaleTensorRef(alpha, tensorProductRationalRecursive(A, B)),
				scaleTensorRef(beta, tensorProductRationalRecursive(A2, B))
			)
			assert.deepStrictEqual(lhsLeft, rhsLeft)

			// Right linearity
			const rightCombined = addTensors(scaleTensorRef(alpha, B), scaleTensorRef(beta, B2))
			const lhsRight = tensorProductRationalRecursive(A, rightCombined)
			const rhsRight = addTensors(
				scaleTensorRef(alpha, tensorProductRationalRecursive(A, B)),
				scaleTensorRef(beta, tensorProductRationalRecursive(A, B2))
			)
			assert.deepStrictEqual(lhsRight, rhsRight)
		})

		it('satisfies associativity: (A ⊗ B) ⊗ C = A ⊗ (B ⊗ C)', () => {
			const A = [r(2, 3), r(-4, 5)]
			const B = [
				[r(1, 2), r(3, -7)],
				[r(0, 1), r(5, 6)],
			]
			const C = [r(7, 8), r(-9, 10), r(11, 12)]

			const lhs = tensorProductRationalRecursive(tensorProductRationalRecursive(A, B), C)
			const rhs = tensorProductRationalRecursive(A, tensorProductRationalRecursive(B, C))
			assert.deepStrictEqual(lhs, rhs)
			assertAllNormalized(lhs)
		})
	})
})
