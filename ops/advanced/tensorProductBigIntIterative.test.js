import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { tensorProductBigIntIterative } from './tensorProductBigIntIterative.js'

/**
 * Independent recursive reference implementation of the tensor product
 * for cross-checking the iterative implementation.
 */
function referenceTensorProductRecursive(a, b) {
	if (typeof a === 'bigint') {
		if (typeof b === 'bigint') {
			return a * b
		}
		return b.map((elem) => referenceTensorProductRecursive(a, elem))
	}
	return a.map((elem) => referenceTensorProductRecursive(elem, b))
}

/**
 * Independent recursive elementwise addition of two identically shaped BigInt tensors.
 */
function addTensors(a, b) {
	if (typeof a === 'bigint') {
		return a + b
	}
	assert.equal(a.length, b.length)
	return a.map((el, i) => addTensors(el, b[i]))
}

/**
 * Independent recursive sum of all BigInt entries in a tensor.
 */
function sumTensor(t) {
	if (typeof t === 'bigint') {
		return t
	}
	let total = 0n
	for (const el of t) {
		total += sumTensor(el)
	}
	return total
}

describe('tensorProductBigIntIterative', () => {
	describe('normal cases', () => {
		test('rank 0 × rank 0 (scalar BigInt multiplication)', () => {
			assert.equal(tensorProductBigIntIterative(6n, 7n), 42n)
			assert.equal(tensorProductBigIntIterative(-9n, 5n), -45n)
			assert.equal(tensorProductBigIntIterative(-4n, -8n), 32n)
			assert.equal(tensorProductBigIntIterative(0n, 12345678901234567890n), 0n)
		})

		test('scalar × tensor and tensor × scalar', () => {
			assert.deepStrictEqual(
				tensorProductBigIntIterative(3n, [1n, -2n, 4n]),
				[3n, -6n, 12n]
			)
			assert.deepStrictEqual(
				tensorProductBigIntIterative([1n, -2n, 4n], 3n),
				[3n, -6n, 12n]
			)
			assert.deepStrictEqual(
				tensorProductBigIntIterative(-2n, [
					[1n, 2n],
					[3n, 4n],
				]),
				[
					[-2n, -4n],
					[-6n, -8n],
				]
			)
			assert.deepStrictEqual(
				tensorProductBigIntIterative(
					[
						[1n, 2n],
						[3n, 4n],
					],
					-2n
				),
				[
					[-2n, -4n],
					[-6n, -8n],
				]
			)
		})

		test('rank 1 × rank 1 (vector outer product)', () => {
			const u = [1n, 2n, 3n]
			const v = [4n, 5n]
			assert.deepStrictEqual(tensorProductBigIntIterative(u, v), [
				[4n, 5n],
				[8n, 10n],
				[12n, 15n],
			])
		})

		test('rank 2 × rank 1 and rank 1 × rank 2', () => {
			const mat = [
				[1n, 2n],
				[3n, 4n],
			]
			const vec = [10n, 20n, 30n]

			assert.deepStrictEqual(tensorProductBigIntIterative(mat, vec), [
				[
					[10n, 20n, 30n],
					[20n, 40n, 60n],
				],
				[
					[30n, 60n, 90n],
					[40n, 80n, 120n],
				],
			])

			assert.deepStrictEqual(tensorProductBigIntIterative(vec, mat), [
				[
					[10n, 20n],
					[30n, 40n],
				],
				[
					[20n, 40n],
					[60n, 80n],
				],
				[
					[30n, 60n],
					[90n, 120n],
				],
			])
		})

		test('rank 2 × rank 2 (produces rank 4 tensor)', () => {
			const a = [
				[1n, 2n],
				[3n, 4n],
			]
			const b = [
				[5n, 6n],
				[7n, 8n],
			]
			const expected = [
				[
					[
						[5n, 6n],
						[7n, 8n],
					],
					[
						[10n, 12n],
						[14n, 16n],
					],
				],
				[
					[
						[15n, 18n],
						[21n, 24n],
					],
					[
						[20n, 24n],
						[28n, 32n],
					],
				],
			]
			assert.deepStrictEqual(tensorProductBigIntIterative(a, b), expected)
		})

		test('exact arbitrary-precision BigInt arithmetic beyond Number.MAX_SAFE_INTEGER', () => {
			const p = (1n << 80n) + 3n
			const q = (1n << 80n) + 5n
			const r = -(1n << 100n) - 7n
			const result = tensorProductBigIntIterative([p, r], [q])
			assert.deepStrictEqual(result, [
				[(1n << 160n) + 8n * (1n << 80n) + 15n],
				[-((1n << 180n) + 5n * (1n << 100n) + 7n * (1n << 80n) + 35n)],
			])
		})
	})

	describe('edge cases', () => {
		test('single-element tensors', () => {
			assert.deepStrictEqual(tensorProductBigIntIterative([7n], [11n]), [[77n]])
			assert.deepStrictEqual(tensorProductBigIntIterative([[7n]], [[11n]]), [[[[77n]]]])
		})

		test('empty tensors preserve shape and distinct array instances', () => {
			assert.deepStrictEqual(tensorProductBigIntIterative([], [1n, 2n]), [])
			assert.deepStrictEqual(tensorProductBigIntIterative([], 5n), [])
			assert.deepStrictEqual(tensorProductBigIntIterative(5n, []), [])
			assert.deepStrictEqual(tensorProductBigIntIterative([], []), [])

			const r1 = tensorProductBigIntIterative([1n, 2n], [])
			assert.deepStrictEqual(r1, [[], []])
			assert.notEqual(r1[0], r1[1])

			const r2 = tensorProductBigIntIterative([1n, 2n], [[], [], []])
			assert.deepStrictEqual(r2, [
				[[], [], []],
				[[], [], []],
			])
			assert.notEqual(r2[0], r2[1])
			assert.notEqual(r2[0][0], r2[0][1])

			const r3 = tensorProductBigIntIterative([[], []], [10n, 20n])
			assert.deepStrictEqual(r3, [[], []])
			assert.notEqual(r3[0], r3[1])
		})

		test('shared (non-cyclic DAG) sub-arrays in inputs are handled safely without aliasing output', () => {
			const row = [2n, 3n]
			const mat = [row, row]
			const res = tensorProductBigIntIterative(mat, [5n])
			assert.deepStrictEqual(res, [
				[[10n], [15n]],
				[[10n], [15n]],
			])
			assert.notEqual(res[0], res[1])
			res[0][0][0] = 999n
			assert.equal(res[1][0][0], 10n)
		})

		test('inputs are not mutated', () => {
			const a = [
				[1n, 2n],
				[3n, 4n],
			]
			const b = [5n, 6n]
			const aSnap = structuredClone(a)
			const bSnap = structuredClone(b)

			const out = tensorProductBigIntIterative(a, b)
			out[0][0][0] = -1n

			assert.deepStrictEqual(a, aSnap)
			assert.deepStrictEqual(b, bSnap)
		})

		test('deeply nested rank-15 × rank-15 tensor (iterative without stack overflow)', () => {
			const wrap = (val, depth) => {
				let cur = val
				for (let i = 0; i < depth; i++) {
					cur = [cur]
				}
				return cur
			}
			const a = wrap(3n, 15)
			const b = wrap(7n, 15)
			const result = tensorProductBigIntIterative(a, b)
			let cur = result
			for (let i = 0; i < 30; i++) {
				assert.ok(Array.isArray(cur))
				assert.equal(cur.length, 1)
				cur = cur[0]
			}
			assert.equal(cur, 21n)
		})
	})

	describe('invalid inputs', () => {
		test('rejects missing or non-BigInt/non-Array top-level arguments', () => {
			assert.throws(() => tensorProductBigIntIterative(), TypeError)
			assert.throws(() => tensorProductBigIntIterative([1n]), TypeError)
			assert.throws(() => tensorProductBigIntIterative(1, 2n), TypeError)
			assert.throws(() => tensorProductBigIntIterative(1n, 2), TypeError)
			assert.throws(() => tensorProductBigIntIterative(null, [1n]), TypeError)
			assert.throws(() => tensorProductBigIntIterative([1n], undefined), TypeError)
			assert.throws(() => tensorProductBigIntIterative('1', 2n), TypeError)
			assert.throws(() => tensorProductBigIntIterative({}, [1n]), TypeError)
			assert.throws(() => tensorProductBigIntIterative(true, 1n), TypeError)
			assert.throws(
				() => tensorProductBigIntIterative(new BigInt64Array([1n, 2n]), [3n]),
				TypeError
			)
		})

		test('rejects non-BigInt leaves inside nested arrays', () => {
			assert.throws(() => tensorProductBigIntIterative([1n, 2], [3n]), TypeError)
			assert.throws(() => tensorProductBigIntIterative([1n], [[3n], ['4']]), TypeError)
			assert.throws(() => tensorProductBigIntIterative([[1n, null]], [2n]), TypeError)
			assert.throws(() => tensorProductBigIntIterative([[1n, NaN]], [2n]), TypeError)
			assert.throws(() => tensorProductBigIntIterative([1n, undefined], [2n]), TypeError)
		})

		test('rejects sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1n, , 3n]
			assert.throws(() => tensorProductBigIntIterative(sparse, [2n]), TypeError)
			assert.throws(() => tensorProductBigIntIterative([2n], sparse), TypeError)
		})

		test('rejects ragged arrays', () => {
			assert.throws(
				() => tensorProductBigIntIterative([[1n, 2n], [3n]], [1n]),
				RangeError
			)
			assert.throws(
				() => tensorProductBigIntIterative([1n], [[1n], [2n, 3n]]),
				RangeError
			)
			assert.throws(
				() => tensorProductBigIntIterative([[], [1n]], [1n]),
				RangeError
			)
			assert.throws(
				() => tensorProductBigIntIterative([[1n], []], [1n]),
				RangeError
			)
			assert.throws(
				() => tensorProductBigIntIterative([[[1n, 2n]], [[3n]]], [1n]),
				RangeError
			)
		})

		test('rejects inconsistent rank across branches', () => {
			assert.throws(() => tensorProductBigIntIterative([1n, [2n]], [3n]), RangeError)
			assert.throws(() => tensorProductBigIntIterative([[1n], 2n], [3n]), RangeError)
			assert.throws(() => tensorProductBigIntIterative([[], 2n], [3n]), RangeError)
			assert.throws(() => tensorProductBigIntIterative([2n, []], [3n]), RangeError)
			assert.throws(
				() => tensorProductBigIntIterative([[[1n]], [2n]], [3n]),
				RangeError
			)
			assert.throws(
				() => tensorProductBigIntIterative([[2n], [[1n]]], [3n]),
				RangeError
			)
			assert.throws(
				() => tensorProductBigIntIterative([[[]], [1n]], [3n]),
				RangeError
			)
			assert.throws(
				() => tensorProductBigIntIterative([[1n], [[]]], [3n]),
				RangeError
			)
		})

		test('rejects cyclic array references', () => {
			const cycA = []
			cycA.push(cycA)
			assert.throws(() => tensorProductBigIntIterative(cycA, [1n]), RangeError)
			assert.throws(() => tensorProductBigIntIterative([1n], cycA), RangeError)

			const inner = []
			inner.push(inner)
			const outer = [inner]
			assert.throws(() => tensorProductBigIntIterative(outer, [1n]), RangeError)
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		test('matches independent recursive reference across diverse ranks and shapes', () => {
			const samples = [
				-13n,
				[0n, 1n, -2n, 1000000000000000000n],
				[
					[1n, -2n, 3n],
					[4n, 5n, -6n],
				],
				[
					[
						[1n, 2n],
						[3n, 4n],
					],
					[
						[-5n, 6n],
						[7n, -8n],
					],
				],
				[],
				[[], []],
			]

			for (const a of samples) {
				for (const b of samples) {
					const actual = tensorProductBigIntIterative(a, b)
					const expected = referenceTensorProductRecursive(a, b)
					assert.deepStrictEqual(actual, expected)
				}
			}
		})

		test('satisfies bilinearity: (A + B) ⊗ C = (A ⊗ C) + (B ⊗ C) and scalar homogeneity', () => {
			const A = [
				[1n, -3n],
				[5n, 2n],
			]
			const B = [
				[4n, 7n],
				[-1n, 8n],
			]
			const C = [3n, -2n, 11n]
			const k = -17n

			const lhsLeft = tensorProductBigIntIterative(addTensors(A, B), C)
			const rhsLeft = addTensors(
				tensorProductBigIntIterative(A, C),
				tensorProductBigIntIterative(B, C)
			)
			assert.deepStrictEqual(lhsLeft, rhsLeft)

			const lhsRight = tensorProductBigIntIterative(C, addTensors(A, B))
			const rhsRight = addTensors(
				tensorProductBigIntIterative(C, A),
				tensorProductBigIntIterative(C, B)
			)
			assert.deepStrictEqual(lhsRight, rhsRight)

			const scaledLeft = tensorProductBigIntIterative(
				tensorProductBigIntIterative(k, A),
				C
			)
			const scaledRight = tensorProductBigIntIterative(
				A,
				tensorProductBigIntIterative(k, C)
			)
			const scaledOut = tensorProductBigIntIterative(
				k,
				tensorProductBigIntIterative(A, C)
			)
			assert.deepStrictEqual(scaledLeft, scaledOut)
			assert.deepStrictEqual(scaledRight, scaledOut)
		})

		test('satisfies associativity: (A ⊗ B) ⊗ C = A ⊗ (B ⊗ C)', () => {
			const A = [2n, -5n]
			const B = [
				[1n, 3n],
				[-4n, 7n],
			]
			const C = [11n, 13n, -17n]

			const leftAssoc = tensorProductBigIntIterative(
				tensorProductBigIntIterative(A, B),
				C
			)
			const rightAssoc = tensorProductBigIntIterative(
				A,
				tensorProductBigIntIterative(B, C)
			)
			assert.deepStrictEqual(leftAssoc, rightAssoc)
		})

		test('satisfies sum-of-entries identity: sum(A ⊗ B) = sum(A) * sum(B)', () => {
			const A = [
				[1234567890123456789n, -987654321098765432n],
				[42n, 99999999999999999999n],
			]
			const B = [
				[
					[3n, -7n],
					[19n, 23n],
				],
				[
					[-29n, 31n],
					[37n, -41n],
				],
			]
			const prod = tensorProductBigIntIterative(A, B)
			assert.equal(sumTensor(prod), sumTensor(A) * sumTensor(B))
		})
	})
})
