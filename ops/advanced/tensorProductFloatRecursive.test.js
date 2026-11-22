import { describe, test } from 'node:test'
import assert from 'node:assert'
import { tensorProductFloatRecursive } from './tensorProductFloatRecursive.js'

/**
 * Helper: extracts shape tuple of a rectangular tensor.
 */
function getShape(t) {
	const shape = []
	let cur = t
	while (Array.isArray(cur)) {
		shape.push(cur.length)
		cur = cur[0]
	}
	return shape
}

/**
 * Helper: indexes a nested tensor by an index tuple.
 */
function getAt(t, indices) {
	let cur = t
	for (const idx of indices) {
		cur = cur[idx]
	}
	return cur
}

/**
 * Helper: generates all index tuples for a given shape.
 */
function* allIndices(shape) {
	if (shape.length === 0) {
		yield []
		return
	}
	const [head, ...tail] = shape
	for (let i = 0; i < head; i++) {
		for (const rest of allIndices(tail)) {
			yield [i, ...rest]
		}
	}
}

/**
 * Helper: computes Frobenius (Euclidean) norm ||T||_F = sqrt(sum(t_i^2)).
 */
function frobeniusNorm(t) {
	let sumSq = 0
	const shape = getShape(t)
	for (const idx of allIndices(shape)) {
		const v = getAt(t, idx)
		sumSq += v * v
	}
	return Math.sqrt(sumSq)
}

/**
 * Helper: asserts element-wise outer product formula
 * T[i1,...,ip,j1,...,jq] === A[i1,...,ip] * B[j1,...,jq]
 * and Frobenius norm identity ||A ⊗ B||_F ≈ ||A||_F * ||B||_F.
 */
function assertTensorProductIdentities(a, b, result, eps = 1e-12) {
	const shapeA = getShape(a)
	const shapeB = getShape(b)
	const shapeT = getShape(result)
	assert.deepStrictEqual(shapeT, [...shapeA, ...shapeB])

	for (const idxA of allIndices(shapeA)) {
		const valA = getAt(a, idxA)
		for (const idxB of allIndices(shapeB)) {
			const valB = getAt(b, idxB)
			const actual = getAt(result, [...idxA, ...idxB])
			const expected = valA * valB
			assert.ok(
				Math.abs(actual - expected) <= eps * Math.max(1, Math.abs(expected)),
				`Mismatch at [${[...idxA, ...idxB].join(',')}]: got ${actual}, expected ${expected}`
			)
		}
	}

	const normT = frobeniusNorm(result)
	const normProduct = frobeniusNorm(a) * frobeniusNorm(b)
	assert.ok(
		Math.abs(normT - normProduct) <= eps * Math.max(1, normProduct),
		`Frobenius norm mismatch: ||A⊗B||_F=${normT}, ||A||_F*||B||_F=${normProduct}`
	)
}

describe('tensorProductFloatRecursive', () => {
	describe('normal cases', () => {
		test('scalar x scalar', () => {
			assert.strictEqual(tensorProductFloatRecursive(3.5, -2), -7)
			assertTensorProductIdentities(3.5, -2, tensorProductFloatRecursive(3.5, -2))
		})

		test('scalar x vector and vector x scalar', () => {
			const v = [1.5, -2, 4.25]
			const sv = tensorProductFloatRecursive(2, v)
			const vs = tensorProductFloatRecursive(v, 2)
			assert.deepStrictEqual(sv, [3, -4, 8.5])
			assert.deepStrictEqual(vs, [3, -4, 8.5])
			assertTensorProductIdentities(2, v, sv)
			assertTensorProductIdentities(v, 2, vs)
		})

		test('scalar x matrix and matrix x scalar', () => {
			const m = [
				[1, 2],
				[3, 4],
			]
			const sm = tensorProductFloatRecursive(0.5, m)
			const ms = tensorProductFloatRecursive(m, 0.5)
			assert.deepStrictEqual(sm, [
				[0.5, 1],
				[1.5, 2],
			])
			assert.deepStrictEqual(ms, sm)
			assertTensorProductIdentities(0.5, m, sm)
			assertTensorProductIdentities(m, 0.5, ms)
		})

		test('vector x vector outer product', () => {
			const a = [1, 2, 3]
			const b = [4, 5]
			const result = tensorProductFloatRecursive(a, b)
			assert.deepStrictEqual(result, [
				[4, 5],
				[8, 10],
				[12, 15],
			])
			assertTensorProductIdentities(a, b, result)
		})

		test('vector x matrix 3D tensor', () => {
			const v = [2, -1]
			const m = [
				[1, 3, 5],
				[2, 4, 6],
			]
			const result = tensorProductFloatRecursive(v, m)
			assert.deepStrictEqual(result, [
				[
					[2, 6, 10],
					[4, 8, 12],
				],
				[
					[-1, -3, -5],
					[-2, -4, -6],
				],
			])
			assertTensorProductIdentities(v, m, result)
		})

		test('matrix x matrix 4D tensor', () => {
			const a = [
				[1, 2],
				[3, 4],
			]
			const b = [
				[0.5, -1],
				[2, 3],
			]
			const result = tensorProductFloatRecursive(a, b)
			assert.deepStrictEqual(result, [
				[
					[
						[0.5, -1],
						[2, 3],
					],
					[
						[1, -2],
						[4, 6],
					],
				],
				[
					[
						[1.5, -3],
						[6, 9],
					],
					[
						[2, -4],
						[8, 12],
					],
				],
			])
			assertTensorProductIdentities(a, b, result)
		})

		test('higher-order 3D x 2D -> 5D tensor', () => {
			const a = [
				[
					[1, -0.5],
					[2, 0.25],
				],
				[
					[-1.5, 3],
					[0.5, -2],
				],
			]
			const b = [
				[1.25, -2.5, 0.75],
				[4, 0, -1],
			]
			const result = tensorProductFloatRecursive(a, b)
			assert.deepStrictEqual(getShape(result), [2, 2, 2, 2, 3])
			assertTensorProductIdentities(a, b, result)
		})
	})

	describe('edge cases', () => {
		test('zeros and negative values normalize -0 to 0', () => {
			const a = [0, -2, 3]
			const b = [-5, 0]
			const result = tensorProductFloatRecursive(a, b)
			assert.deepStrictEqual(result, [
				[0, 0],
				[10, 0],
				[-15, 0],
			])
			assert.ok(Object.is(result[0][0], 0))
			assert.ok(Object.is(result[1][1], 0))
			assertTensorProductIdentities(a, b, result)
		})

		test('non-square rectangular matrices', () => {
			const a = [
				[1, 2, 3],
				[4, 5, 6],
			] // 2x3
			const b = [
				[7],
				[8],
				[9],
				[10],
			] // 4x1
			const result = tensorProductFloatRecursive(a, b)
			assert.deepStrictEqual(getShape(result), [2, 3, 4, 1])
			assertTensorProductIdentities(a, b, result)
		})

		test('single-element tensors of various ranks', () => {
			const a = [[[-3.25]]] // 1x1x1
			const b = [[4]] // 1x1
			const result = tensorProductFloatRecursive(a, b)
			assert.deepStrictEqual(result, [[[[[-13]]]]])
			assertTensorProductIdentities(a, b, result)
		})

		test('large odd-length vectors exercise deep divide-and-conquer splits', () => {
			const a = Array.from({ length: 37 }, (_, i) => (i - 18) * 0.25)
			const b = Array.from({ length: 29 }, (_, j) => (j - 14) * 0.5)
			const result = tensorProductFloatRecursive(a, b)
			assert.deepStrictEqual(getShape(result), [37, 29])
			assertTensorProductIdentities(a, b, result)
		})

		test('self tensor product allocates independent slices (no aliasing)', () => {
			const v = [1, 2]
			const result = tensorProductFloatRecursive(v, v)
			result[0][0] = 999
			assert.strictEqual(v[0], 1)
			assert.strictEqual(result[1][0], 2)
		})

		test('bilinearity property: (a + a2) ⊗ b === a ⊗ b + a2 ⊗ b', () => {
			const a1 = [1.5, -2.25, 0.75]
			const a2 = [-0.5, 3.0, 1.25]
			const sum = a1.map((x, i) => x + a2[i])
			const b = [
				[2, -1],
				[0.5, 4],
			]
			const lhs = tensorProductFloatRecursive(sum, b)
			const rhs1 = tensorProductFloatRecursive(a1, b)
			const rhs2 = tensorProductFloatRecursive(a2, b)
			for (const idx of allIndices(getShape(lhs))) {
				const expected = getAt(rhs1, idx) + getAt(rhs2, idx)
				const actual = getAt(lhs, idx)
				assert.ok(Math.abs(actual - expected) <= 1e-12)
			}
		})
	})

	describe('input validation', () => {
		test('throws TypeError on non-number / non-array operands or elements', () => {
			assert.throws(() => tensorProductFloatRecursive(null, [1, 2]), TypeError)
			assert.throws(() => tensorProductFloatRecursive([1, 2], undefined), TypeError)
			assert.throws(() => tensorProductFloatRecursive('1', 2), TypeError)
			assert.throws(() => tensorProductFloatRecursive({}, [1]), TypeError)
			assert.throws(() => tensorProductFloatRecursive([1, '2'], [3]), TypeError)
			assert.throws(() => tensorProductFloatRecursive([1], [true]), TypeError)
			assert.throws(() => tensorProductFloatRecursive([1n], [2]), TypeError)
			assert.throws(() => tensorProductFloatRecursive(new Float64Array([1, 2]), [3]), TypeError)
		})

		test('throws TypeError on sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3]
			assert.throws(() => tensorProductFloatRecursive(sparse, [1, 2]), TypeError)
			assert.throws(() => tensorProductFloatRecursive([1, 2], new Array(2)), TypeError)
		})

		test('throws RangeError on non-finite float64 values', () => {
			assert.throws(() => tensorProductFloatRecursive(NaN, 1), RangeError)
			assert.throws(() => tensorProductFloatRecursive(1, Infinity), RangeError)
			assert.throws(() => tensorProductFloatRecursive([1, -Infinity], [2]), RangeError)
			assert.throws(() => tensorProductFloatRecursive([[1, 2], [3, NaN]], [1]), RangeError)
		})

		test('throws RangeError on empty tensors or empty nested dimensions', () => {
			assert.throws(() => tensorProductFloatRecursive([], [1, 2]), RangeError)
			assert.throws(() => tensorProductFloatRecursive([1, 2], []), RangeError)
			assert.throws(() => tensorProductFloatRecursive([[]], [1]), RangeError)
			assert.throws(() => tensorProductFloatRecursive([[1], []], [1]), RangeError)
		})

		test('throws RangeError on jagged arrays or mixed-rank nesting', () => {
			assert.throws(
				() =>
					tensorProductFloatRecursive(
						[
							[1, 2],
							[3],
						],
						[1, 2]
					),
				RangeError
			)
			assert.throws(
				() =>
					tensorProductFloatRecursive(
						[1, 2],
						[
							[1, 2, 3],
							[4, 5],
						]
					),
				RangeError
			)
			assert.throws(() => tensorProductFloatRecursive([1, [2]], [3]), RangeError)
			assert.throws(
				() =>
					tensorProductFloatRecursive(
						[
							[[1, 2]],
							[[3], [4]],
						],
						1
					),
				RangeError
			)
		})
	})
})
