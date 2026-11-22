import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { tensorProductBigIntSeries } from './tensorProductBigIntSeries.js'

/**
 * Independent recursive reference implementation of the outer tensor product.
 * Does not use flat buffers or stride arithmetic.
 */
function naiveTensorProduct(a, b) {
	if (typeof a === 'bigint') {
		return scaleRecursive(b, a)
	}
	return a.map((slice) => naiveTensorProduct(slice, b))
}

function scaleRecursive(tensor, scalar) {
	if (typeof tensor === 'bigint') {
		return scalar * tensor
	}
	return tensor.map((slice) => scaleRecursive(slice, scalar))
}

/**
 * Element-wise addition of two identically shaped BigInt tensors.
 */
function addTensors(a, b) {
	if (typeof a === 'bigint') {
		return a + b
	}
	return a.map((el, idx) => addTensors(el, b[idx]))
}

/**
 * Sum of all BigInt entries in an arbitrary-rank tensor.
 */
function sumEntries(tensor) {
	if (typeof tensor === 'bigint') {
		return tensor
	}
	return tensor.reduce((acc, el) => acc + sumEntries(el), 0n)
}

/**
 * Sum of squares of all BigInt entries (squared Frobenius norm).
 */
function sumSquares(tensor) {
	if (typeof tensor === 'bigint') {
		return tensor * tensor
	}
	return tensor.reduce((acc, el) => acc + sumSquares(el), 0n)
}

/**
 * Infers the shape tuple of a rectangular tensor.
 */
function getShape(tensor) {
	const shape = []
	let cur = tensor
	while (Array.isArray(cur)) {
		shape.push(cur.length)
		cur = cur[0]
	}
	return shape
}

/**
 * Independent 2D Kronecker block product for matrices A (m x n) and B (p x q),
 * returning an (m*p) x (n*q) matrix.
 */
function naiveKronecker2D(A, B) {
	const m = A.length
	const n = A[0].length
	const p = B.length
	const q = B[0].length
	const out = Array.from({ length: m * p }, () => new Array(n * q))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			for (let k = 0; k < p; k++) {
				for (let l = 0; l < q; l++) {
					out[i * p + k][j * q + l] = A[i][j] * B[k][l]
				}
			}
		}
	}
	return out
}

describe('tensorProductBigIntSeries', () => {
	describe('normal cases across ranks', () => {
		it('computes rank-0 ⊗ rank-0 scalar product', () => {
			assert.strictEqual(tensorProductBigIntSeries(6n, 7n), 42n)
			assert.strictEqual(tensorProductBigIntSeries(-9n, 5n), -45n)
			assert.strictEqual(tensorProductBigIntSeries(-8n, -12n), 96n)
		})

		it('computes scalar ⊗ tensor and tensor ⊗ scalar (rank-0 with rank-1 and rank-2)', () => {
			const v = [1n, -2n, 3n]
			assert.deepStrictEqual(tensorProductBigIntSeries(4n, v), [4n, -8n, 12n])
			assert.deepStrictEqual(tensorProductBigIntSeries(v, -5n), [-5n, 10n, -15n])

			const m = [
				[1n, 2n],
				[3n, -4n]
			]
			assert.deepStrictEqual(tensorProductBigIntSeries(-3n, m), [
				[-3n, -6n],
				[-9n, 12n]
			])
			assert.deepStrictEqual(tensorProductBigIntSeries(m, 2n), [
				[2n, 4n],
				[6n, -8n]
			])
		})

		it('computes rank-1 ⊗ rank-1 outer product of vectors', () => {
			const a = [2n, 3n]
			const b = [5n, 7n, 11n]
			const expected = [
				[10n, 14n, 22n],
				[15n, 21n, 33n]
			]
			const actual = tensorProductBigIntSeries(a, b)
			assert.deepStrictEqual(actual, expected)
			assert.deepStrictEqual(getShape(actual), [2, 3])
		})

		it('computes mixed rank-1 ⊗ rank-2 and rank-2 ⊗ rank-1 products', () => {
			const v = [2n, -3n]
			const m = [
				[1n, 4n],
				[5n, 6n],
				[7n, 8n]
			]

			const vm = tensorProductBigIntSeries(v, m)
			assert.deepStrictEqual(getShape(vm), [2, 3, 2])
			assert.deepStrictEqual(vm, [
				[
					[2n, 8n],
					[10n, 12n],
					[14n, 16n]
				],
				[
					[-3n, -12n],
					[-15n, -18n],
					[-21n, -24n]
				]
			])

			const mv = tensorProductBigIntSeries(m, v)
			assert.deepStrictEqual(getShape(mv), [3, 2, 2])
			assert.deepStrictEqual(mv, [
				[
					[2n, -3n],
					[8n, -12n]
				],
				[
					[10n, -15n],
					[12n, -18n]
				],
				[
					[14n, -21n],
					[16n, -24n]
				]
			])
		})

		it('computes rank-2 ⊗ rank-2 product into rank-4 tensor', () => {
			const A = [
				[1n, 2n],
				[3n, 4n]
			]
			const B = [
				[5n, 6n, 7n],
				[8n, 9n, 10n]
			]
			const C = tensorProductBigIntSeries(A, B)
			assert.deepStrictEqual(getShape(C), [2, 2, 2, 3])
			for (let i = 0; i < 2; i++) {
				for (let j = 0; j < 2; j++) {
					for (let k = 0; k < 2; k++) {
						for (let l = 0; l < 3; l++) {
							assert.strictEqual(C[i][j][k][l], A[i][j] * B[k][l])
						}
					}
				}
			}
		})

		it('computes higher-rank tensors (rank-3 ⊗ rank-2 -> rank-5)', () => {
			const A = [
				[
					[1n, 2n, 3n],
					[4n, 5n, 6n]
				],
				[
					[-1n, -2n, -3n],
					[7n, 0n, 9n]
				]
			]
			const B = [
				[10n, -20n],
				[30n, 40n]
			]
			const C = tensorProductBigIntSeries(A, B)
			assert.deepStrictEqual(getShape(C), [2, 2, 3, 2, 2])
			assert.deepStrictEqual(C, naiveTensorProduct(A, B))
		})
	})

	describe('edge cases', () => {
		it('handles 1x1 matrices and singleton tensors', () => {
			assert.deepStrictEqual(tensorProductBigIntSeries([5n], [-3n]), [[-15n]])
			assert.deepStrictEqual(tensorProductBigIntSeries([[7n]], [[-11n]]), [[[[-77n]]]])
			assert.deepStrictEqual(tensorProductBigIntSeries([[[1n]]], [2n]), [[[[2n]]]])
		})

		it('handles zero entries and all-zero tensors', () => {
			assert.strictEqual(tensorProductBigIntSeries(0n, 123456789n), 0n)
			assert.deepStrictEqual(tensorProductBigIntSeries([0n, 0n], [5n, -9n]), [
				[0n, 0n],
				[0n, 0n]
			])
			assert.deepStrictEqual(
				tensorProductBigIntSeries(
					[
						[0n, 3n],
						[-4n, 0n]
					],
					[0n, 2n]
				),
				[
					[
						[0n, 0n],
						[0n, 6n]
					],
					[
						[0n, -8n],
						[0n, 0n]
					]
				]
			)
		})

		it('preserves exact arithmetic for huge (> 2^128) positive and negative BigInts', () => {
			const hugeA = (1n << 256n) + 98765432109876543210987654321n
			const hugeB = -((1n << 192n) + 12345678901234567890123456789n)
			const hugeC = 10n ** 60n - 1n
			const hugeD = -(10n ** 55n) + 17n

			const A = [hugeA, hugeB]
			const B = [
				[hugeC, hugeD],
				[1n, 0n]
			]

			const result = tensorProductBigIntSeries(A, B)
			assert.deepStrictEqual(getShape(result), [2, 2, 2])
			assert.strictEqual(result[0][0][0], hugeA * hugeC)
			assert.strictEqual(result[0][0][1], hugeA * hugeD)
			assert.strictEqual(result[0][1][0], hugeA)
			assert.strictEqual(result[0][1][1], 0n)
			assert.strictEqual(result[1][0][0], hugeB * hugeC)
			assert.strictEqual(result[1][0][1], hugeB * hugeD)
			assert.strictEqual(result[1][1][0], hugeB)
			assert.strictEqual(result[1][1][1], 0n)
		})

		it('handles shared acyclic subarray references without aliasing output or mutating frozen inputs', () => {
			const sharedRow = Object.freeze([2n, 3n])
			const A = Object.freeze([sharedRow, sharedRow])
			const B = Object.freeze([5n, 7n])

			const result = tensorProductBigIntSeries(A, B)
			assert.deepStrictEqual(result, [
				[
					[10n, 14n],
					[15n, 21n]
				],
				[
					[10n, 14n],
					[15n, 21n]
				]
			])

			// Verify output rows are freshly allocated and distinct
			assert.notStrictEqual(result[0], result[1])
			assert.notStrictEqual(result[0][0], result[1][0])
			result[0][0][0] = 999n
			assert.strictEqual(result[1][0][0], 10n)
			assert.strictEqual(A[0][0], 2n)
			assert.strictEqual(B[0], 5n)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for missing or non-BigInt top-level inputs', () => {
			assert.throws(() => tensorProductBigIntSeries(), TypeError)
			assert.throws(() => tensorProductBigIntSeries([1n]), TypeError)
			assert.throws(() => tensorProductBigIntSeries(1, 2n), TypeError)
			assert.throws(() => tensorProductBigIntSeries(1n, 2), TypeError)
			assert.throws(() => tensorProductBigIntSeries(NaN, [1n]), TypeError)
			assert.throws(() => tensorProductBigIntSeries(Infinity, [1n]), TypeError)
			assert.throws(() => tensorProductBigIntSeries('1n', [1n]), TypeError)
			assert.throws(() => tensorProductBigIntSeries(null, [1n]), TypeError)
			assert.throws(() => tensorProductBigIntSeries(undefined, [1n]), TypeError)
			assert.throws(() => tensorProductBigIntSeries({}, [1n]), TypeError)
			assert.throws(() => tensorProductBigIntSeries(true, [1n]), TypeError)
			assert.throws(() => tensorProductBigIntSeries(Symbol('x'), [1n]), TypeError)
			assert.throws(
				() => tensorProductBigIntSeries(new BigInt64Array([1n, 2n]), [1n]),
				TypeError
			)
		})

		it('throws TypeError for non-BigInt entries inside nested arrays', () => {
			assert.throws(() => tensorProductBigIntSeries([1n, 2], [3n]), TypeError)
			assert.throws(() => tensorProductBigIntSeries([1n], [[2n, '3n']]), TypeError)
			assert.throws(() => tensorProductBigIntSeries([[null]], [1n]), TypeError)
			assert.throws(() => tensorProductBigIntSeries([[1n, undefined]], [1n]), TypeError)
		})

		it('throws TypeError for mixed scalar/array nesting depths', () => {
			assert.throws(() => tensorProductBigIntSeries([1n, [2n]], [3n]), TypeError)
			assert.throws(() => tensorProductBigIntSeries([[1n], 2n], [3n]), TypeError)
			assert.throws(() => tensorProductBigIntSeries([1n], [2n, [3n]]), TypeError)
		})

		it('throws TypeError for sparse arrays', () => {
			const sparse1 = new Array(2)
			sparse1[0] = 1n
			assert.throws(() => tensorProductBigIntSeries(sparse1, [1n]), TypeError)

			const sparse2 = new Array(2)
			sparse2[1] = 2n
			assert.throws(() => tensorProductBigIntSeries([1n], sparse2), TypeError)

			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => tensorProductBigIntSeries([[1n], , [2n]], [1n]), TypeError)
		})

		it('throws RangeError for empty arrays at any depth', () => {
			assert.throws(() => tensorProductBigIntSeries([], [1n]), RangeError)
			assert.throws(() => tensorProductBigIntSeries([1n], []), RangeError)
			assert.throws(() => tensorProductBigIntSeries([[]], [1n]), RangeError)
			assert.throws(() => tensorProductBigIntSeries([[1n], []], [1n]), RangeError)
		})

		it('throws RangeError for ragged arrays', () => {
			assert.throws(
				() =>
					tensorProductBigIntSeries(
						[
							[1n, 2n],
							[3n]
						],
						[1n]
					),
				RangeError
			)
			assert.throws(
				() =>
					tensorProductBigIntSeries(
						[1n],
						[
							[
								[1n, 2n],
								[3n, 4n]
							],
							[[5n, 6n]]
						]
					),
				RangeError
			)
			assert.throws(() => tensorProductBigIntSeries([[1n], [[2n]]], [1n]), RangeError)
		})

		it('throws RangeError for cyclic array references', () => {
			const cyclic = []
			cyclic.push(cyclic)
			assert.throws(() => tensorProductBigIntSeries(cyclic, [1n]), RangeError)

			const deepCyclic = [[1n]]
			deepCyclic.push(deepCyclic)
			assert.throws(() => tensorProductBigIntSeries([1n], deepCyclic), RangeError)
		})
	})

	describe('algebraic identities and independent cross-checks', () => {
		const A = [
			[2n, -5n, 7n],
			[11n, 0n, -13n]
		]
		const B = [
			[-3n, 4n, 1n],
			[6n, -8n, 9n]
		]
		const C = [
			[17n, -19n],
			[23n, 29n],
			[-31n, 37n]
		]
		const v = [41n, -43n, 47n]
		const w = [-53n, 59n]

		it('satisfies bilinearity: (A + B) ⊗ C = A ⊗ C + B ⊗ C and A ⊗ (B + C) = A ⊗ B + A ⊗ C', () => {
			// Left additivity
			const lhsLeft = tensorProductBigIntSeries(addTensors(A, B), C)
			const rhsLeft = addTensors(
				tensorProductBigIntSeries(A, C),
				tensorProductBigIntSeries(B, C)
			)
			assert.deepStrictEqual(lhsLeft, rhsLeft)

			// Right additivity
			const lhsRight = tensorProductBigIntSeries(C, addTensors(A, B))
			const rhsRight = addTensors(
				tensorProductBigIntSeries(C, A),
				tensorProductBigIntSeries(C, B)
			)
			assert.deepStrictEqual(lhsRight, rhsRight)

			// Scalar homogeneity: (k ⊗ A) ⊗ C = k ⊗ (A ⊗ C) = A ⊗ (k ⊗ C)
			const k = -((1n << 130n) + 99n)
			const leftScaled = tensorProductBigIntSeries(tensorProductBigIntSeries(k, A), C)
			const outerScaled = tensorProductBigIntSeries(k, tensorProductBigIntSeries(A, C))
			const rightScaled = tensorProductBigIntSeries(A, tensorProductBigIntSeries(k, C))
			assert.deepStrictEqual(leftScaled, outerScaled)
			assert.deepStrictEqual(outerScaled, rightScaled)
		})

		it('satisfies associativity: (X ⊗ Y) ⊗ Z = X ⊗ (Y ⊗ Z) across mixed ranks', () => {
			// Rank 1, Rank 2, Rank 1
			const lhs1 = tensorProductBigIntSeries(tensorProductBigIntSeries(v, A), w)
			const rhs1 = tensorProductBigIntSeries(v, tensorProductBigIntSeries(A, w))
			assert.deepStrictEqual(lhs1, rhs1)
			assert.deepStrictEqual(getShape(lhs1), [3, 2, 3, 2])

			// Rank 2, Rank 1, Rank 2
			const lhs2 = tensorProductBigIntSeries(tensorProductBigIntSeries(A, w), C)
			const rhs2 = tensorProductBigIntSeries(A, tensorProductBigIntSeries(w, C))
			assert.deepStrictEqual(lhs2, rhs2)
			assert.deepStrictEqual(getShape(lhs2), [2, 3, 2, 3, 2])

			// Rank 0, Rank 2, Rank 1
			const s = -123456789012345678901234567890n
			const lhs3 = tensorProductBigIntSeries(tensorProductBigIntSeries(s, B), v)
			const rhs3 = tensorProductBigIntSeries(s, tensorProductBigIntSeries(B, v))
			assert.deepStrictEqual(lhs3, rhs3)
		})

		it('satisfies sum-of-entries identity sum(X ⊗ Y) = sum(X) * sum(Y) and Frobenius norm squared identity', () => {
			const pairs = [
				[v, w],
				[A, C],
				[A, v],
				[B, [v, v]],
				[
					[1n << 140n, -(1n << 135n)],
					[
						[3n ** 90n, -(5n ** 60n)],
						[7n ** 40n, 0n]
					]
				]
			]

			for (const [X, Y] of pairs) {
				const prod = tensorProductBigIntSeries(X, Y)
				assert.strictEqual(sumEntries(prod), sumEntries(X) * sumEntries(Y))
				assert.strictEqual(sumSquares(prod), sumSquares(X) * sumSquares(Y))
			}
		})

		it('matches independent 2D Kronecker block product entry-for-entry', () => {
			const prod = tensorProductBigIntSeries(A, C)
			const kron = naiveKronecker2D(A, C)
			const [m, n] = getShape(A)
			const [p, q] = getShape(C)

			for (let i = 0; i < m; i++) {
				for (let j = 0; j < n; j++) {
					for (let k = 0; k < p; k++) {
						for (let l = 0; l < q; l++) {
							assert.strictEqual(prod[i][j][k][l], kron[i * p + k][j * q + l])
						}
					}
				}
			}
		})

		it('matches independent recursive reference across all rank pairs (0..3 x 0..3)', () => {
			const samples = [
				-7n,
				[3n, -5n, 11n],
				[
					[2n, -4n],
					[6n, 8n],
					[-10n, 12n]
				],
				[
					[
						[1n, -2n],
						[3n, 4n]
					],
					[
						[-5n, 6n],
						[7n, -8n]
					]
				]
			]

			for (const X of samples) {
				for (const Y of samples) {
					const actual = tensorProductBigIntSeries(X, Y)
					const expected = naiveTensorProduct(X, Y)
					assert.deepStrictEqual(actual, expected)
					assert.deepStrictEqual(getShape(actual), getShape(X).concat(getShape(Y)))
				}
			}
		})
	})
})
