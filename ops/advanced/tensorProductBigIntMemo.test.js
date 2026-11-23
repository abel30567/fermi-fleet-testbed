import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { tensorProductBigIntMemo } from './tensorProductBigIntMemo.js'

/**
 * Independent reference helpers for cross-checking tensorProductBigIntMemo.
 */
function getShape(t) {
	if (typeof t === 'bigint') return []
	if (t.length === 0) return [0]
	return [t.length, ...getShape(t[0])]
}

function flatten(t, out = []) {
	if (typeof t === 'bigint') {
		out.push(t)
		return out
	}
	for (const el of t) {
		flatten(el, out)
	}
	return out
}

function unflatten(flat, shape, offset = { idx: 0 }) {
	if (shape.length === 0) {
		return flat[offset.idx++]
	}
	const [dim, ...rest] = shape
	const arr = new Array(dim)
	for (let i = 0; i < dim; i++) {
		arr[i] = unflatten(flat, rest, offset)
	}
	return arr
}

/**
 * Independent flat-buffer Cartesian product reference implementation.
 */
function naiveTensorProduct(a, b) {
	const shapeA = getShape(a)
	const shapeB = getShape(b)
	const outShape = [...shapeA, ...shapeB]
	const flatA = flatten(a)
	const flatB = flatten(b)
	const flatOut = []
	for (const va of flatA) {
		for (const vb of flatB) {
			flatOut.push(va * vb)
		}
	}
	return unflatten(flatOut, outShape)
}

function addTensors(x, y) {
	if (typeof x === 'bigint' && typeof y === 'bigint') return x + y
	assert.equal(x.length, y.length)
	return x.map((el, i) => addTensors(el, y[i]))
}

function sumEntries(t) {
	return flatten(t).reduce((acc, v) => acc + v, 0n)
}

function frobeniusNormSq(t) {
	return flatten(t).reduce((acc, v) => acc + v * v, 0n)
}

describe('tensorProductBigIntMemo', () => {
	test('rank-0 scalar × scalar products (small table, boundary, and huge BigInts)', () => {
		assert.equal(tensorProductBigIntMemo(0n, 0n), 0n)
		assert.equal(tensorProductBigIntMemo(0n, 999999999999999999999n), 0n)
		assert.equal(tensorProductBigIntMemo(1n, -42n), -42n)
		assert.equal(tensorProductBigIntMemo(-1n, -42n), 42n)
		assert.equal(tensorProductBigIntMemo(7n, -9n), -63n)
		assert.equal(tensorProductBigIntMemo(-64n, 64n), -4096n)
		assert.equal(tensorProductBigIntMemo(64n, 64n), 4096n)
		assert.equal(tensorProductBigIntMemo(65n, -65n), -4225n)

		const hugeA = 10n ** 50n + 1234567890123456789n
		const hugeB = -(10n ** 40n) + 9876543210987654321n
		assert.equal(tensorProductBigIntMemo(hugeA, hugeB), hugeA * hugeB)
	})

	test('scalar × tensor and tensor × scalar products', () => {
		const vec = [1n, -2n, 0n, 100n]
		assert.deepEqual(tensorProductBigIntMemo(3n, vec), [3n, -6n, 0n, 300n])
		assert.deepEqual(tensorProductBigIntMemo(vec, 3n), [3n, -6n, 0n, 300n])

		const mat = [
			[1n, 2n],
			[-3n, 4n],
		]
		assert.deepEqual(tensorProductBigIntMemo(-2n, mat), [
			[-2n, -4n],
			[6n, -8n],
		])
		assert.deepEqual(tensorProductBigIntMemo(mat, 0n), [
			[0n, 0n],
			[0n, 0n],
		])
	})

	test('vector × vector outer product (rank 1 ⊗ rank 1 -> rank 2)', () => {
		const a = [1n, 2n, 3n]
		const b = [4n, -5n]
		assert.deepEqual(tensorProductBigIntMemo(a, b), [
			[4n, -5n],
			[8n, -10n],
			[12n, -15n],
		])
	})

	test('matrix × matrix tensor product (rank 2 ⊗ rank 2 -> rank 4)', () => {
		const a = [
			[1n, 2n],
			[3n, 4n],
		]
		const b = [
			[5n, 6n, 7n],
			[8n, 9n, 10n],
		]
		const result = tensorProductBigIntMemo(a, b)
		assert.deepEqual(getShape(result), [2, 2, 2, 3])
		for (let i = 0; i < 2; i++) {
			for (let j = 0; j < 2; j++) {
				for (let k = 0; k < 2; k++) {
					for (let l = 0; l < 3; l++) {
						assert.equal(result[i][j][k][l], a[i][j] * b[k][l])
					}
				}
			}
		}
	})

	test('higher-rank tensors (rank 3 ⊗ rank 2 -> rank 5)', () => {
		const a = [
			[
				[1n, -1n],
				[2n, 0n],
			],
			[
				[64n, -65n],
				[10n ** 25n, -(10n ** 25n)],
			],
		]
		const b = [
			[3n, 7n],
			[-11n, 10n ** 20n],
		]
		const actual = tensorProductBigIntMemo(a, b)
		const expected = naiveTensorProduct(a, b)
		assert.deepEqual(getShape(actual), [2, 2, 2, 2, 2])
		assert.deepEqual(actual, expected)
	})

	test('empty tensor edge cases', () => {
		assert.deepEqual(tensorProductBigIntMemo([], [1n, 2n]), [])
		assert.deepEqual(tensorProductBigIntMemo([1n, 2n], []), [[], []])
		assert.deepEqual(tensorProductBigIntMemo([], []), [])
		assert.deepEqual(tensorProductBigIntMemo(5n, []), [])
		assert.deepEqual(tensorProductBigIntMemo([], 5n), [])
		assert.deepEqual(tensorProductBigIntMemo([[], []], [1n, 2n]), [[], []])
	})

	test('shared non-circular sub-array references are accepted', () => {
		const row = [2n, 3n]
		const mat = [row, row]
		const actual = tensorProductBigIntMemo(mat, [5n, 7n])
		assert.deepEqual(actual, [
			[
				[10n, 14n],
				[15n, 21n],
			],
			[
				[10n, 14n],
				[15n, 21n],
			],
		])
	})

	test('independent cross-check against naive flat-buffer reference across ranks and value ranges', () => {
		const cases = [
			[0n, [1n, 2n]],
			[[-64n, -1n, 0n, 1n, 64n], [-64n, 0n, 64n]],
			[[-65n, 65n, 10n ** 30n], [-(10n ** 30n), 65n, -65n]],
			[
				[
					[1n, 2n, 3n],
					[4n, 5n, 6n],
				],
				[-7n, 8n, -9n, 10n],
			],
			[
				[10n ** 18n, -(10n ** 18n) + 1n],
				[
					[10n ** 18n, 2n],
					[3n, -(10n ** 18n)],
				],
			],
		]

		for (const [a, b] of cases) {
			const actual = tensorProductBigIntMemo(a, b)
			const expected = naiveTensorProduct(a, b)
			assert.deepEqual(actual, expected)
			assert.equal(sumEntries(actual), sumEntries(a) * sumEntries(b))
			assert.equal(
				frobeniusNormSq(actual),
				frobeniusNormSq(a) * frobeniusNormSq(b),
			)
		}
	})

	test('algebraic cross-check: bilinearity and associativity', () => {
		const a1 = [2n, -3n, 5n]
		const a2 = [-7n, 11n, 13n]
		const b1 = [
			[1n, -2n],
			[4n, 6n],
		]
		const b2 = [
			[3n, 5n],
			[-8n, 9n],
		]
		const c = [10n ** 18n, -(10n ** 18n) + 7n]
		const scalar = 10n ** 22n + 19n

		// Left additivity: (a1 + a2) ⊗ b1 === (a1 ⊗ b1) + (a2 ⊗ b1)
		assert.deepEqual(
			tensorProductBigIntMemo(addTensors(a1, a2), b1),
			addTensors(
				tensorProductBigIntMemo(a1, b1),
				tensorProductBigIntMemo(a2, b1),
			),
		)

		// Right additivity: a1 ⊗ (b1 + b2) === (a1 ⊗ b1) + (a1 ⊗ b2)
		assert.deepEqual(
			tensorProductBigIntMemo(a1, addTensors(b1, b2)),
			addTensors(
				tensorProductBigIntMemo(a1, b1),
				tensorProductBigIntMemo(a1, b2),
			),
		)

		// Scalar homogeneity: (s * a1) ⊗ b1 === s * (a1 ⊗ b1) === a1 ⊗ (s * b1)
		const lhs = tensorProductBigIntMemo(
			tensorProductBigIntMemo(scalar, a1),
			b1,
		)
		const mid = tensorProductBigIntMemo(
			scalar,
			tensorProductBigIntMemo(a1, b1),
		)
		const rhs = tensorProductBigIntMemo(
			a1,
			tensorProductBigIntMemo(scalar, b1),
		)
		assert.deepEqual(lhs, mid)
		assert.deepEqual(mid, rhs)

		// Associativity: (a1 ⊗ b1) ⊗ c === a1 ⊗ (b1 ⊗ c)
		const assocLeft = tensorProductBigIntMemo(
			tensorProductBigIntMemo(a1, b1),
			c,
		)
		const assocRight = tensorProductBigIntMemo(
			a1,
			tensorProductBigIntMemo(b1, c),
		)
		assert.deepEqual(assocLeft, assocRight)
	})

	test('memoization isolation: mutating outputs or inputs never corrupts cached values', () => {
		const a = [2n, 2n, 3n]
		const b = [4n, 5n]

		const first = tensorProductBigIntMemo(a, b)
		assert.deepEqual(first, [
			[8n, 10n],
			[8n, 10n],
			[12n, 15n],
		])

		// Repeated scalar leaf in `a` must not alias rows in output
		assert.notEqual(first[0], first[1])
		first[0][0] = 999999n
		assert.equal(first[1][0], 8n)

		// Subsequent call with equivalent inputs must return clean cached value
		const second = tensorProductBigIntMemo([2n, 2n, 3n], [4n, 5n])
		assert.deepEqual(second, [
			[8n, 10n],
			[8n, 10n],
			[12n, 15n],
		])

		// Mutating original input arrays after caching must not affect future lookups
		a[0] = -100n
		const third = tensorProductBigIntMemo([2n, 2n, 3n], [4n, 5n])
		assert.deepEqual(third, [
			[8n, 10n],
			[8n, 10n],
			[12n, 15n],
		])
	})

	test('bounded LRU cache handles eviction cleanly past capacity', () => {
		for (let i = 0; i < 1150; i++) {
			const bi = BigInt(i)
			const res = tensorProductBigIntMemo([bi, bi + 1n], [2n, -3n])
			assert.deepEqual(res, [
				[bi * 2n, bi * -3n],
				[(bi + 1n) * 2n, (bi + 1n) * -3n],
			])
		}
		// Re-query evicted early entry and recent entry
		assert.deepEqual(tensorProductBigIntMemo([0n, 1n], [2n, -3n]), [
			[0n, 0n],
			[2n, -3n],
		])
		assert.deepEqual(tensorProductBigIntMemo([1149n, 1150n], [2n, -3n]), [
			[2298n, -3447n],
			[2300n, -3450n],
		])
	})

	test('input validation rejects invalid types, sparse holes, cycles, and ragged tensors', () => {
		// Invalid primitive / object types
		assert.throws(() => tensorProductBigIntMemo(), TypeError)
		assert.throws(() => tensorProductBigIntMemo(1n), TypeError)
		assert.throws(() => tensorProductBigIntMemo(1, 2n), TypeError)
		assert.throws(() => tensorProductBigIntMemo(1n, 2), TypeError)
		assert.throws(() => tensorProductBigIntMemo(NaN, 2n), TypeError)
		assert.throws(() => tensorProductBigIntMemo('1', 2n), TypeError)
		assert.throws(() => tensorProductBigIntMemo(null, [1n]), TypeError)
		assert.throws(() => tensorProductBigIntMemo([1n], undefined), TypeError)
		assert.throws(() => tensorProductBigIntMemo({}, [1n]), TypeError)
		assert.throws(() => tensorProductBigIntMemo([1n, 2], [3n]), TypeError)
		assert.throws(() => tensorProductBigIntMemo([[1n]], [['2']]), TypeError)

		// Sparse array holes
		const sparse = [1n, , 3n]
		assert.throws(() => tensorProductBigIntMemo(sparse, [1n]), TypeError)
		assert.throws(() => tensorProductBigIntMemo([1n], new Array(2)), TypeError)

		// Circular references
		const circular = []
		circular.push(circular)
		assert.throws(() => tensorProductBigIntMemo(circular, [1n]), TypeError)
		assert.throws(() => tensorProductBigIntMemo([1n], circular), TypeError)

		// Ragged (non-rectangular) tensors
		assert.throws(
			() => tensorProductBigIntMemo([[1n, 2n], [3n]], [1n]),
			RangeError,
		)
		assert.throws(
			() => tensorProductBigIntMemo([1n], [[1n], [2n, 3n]]),
			RangeError,
		)
		assert.throws(
			() => tensorProductBigIntMemo([1n, [2n]], [1n]),
			RangeError,
		)
		assert.throws(
			() => tensorProductBigIntMemo([[], [1n]], [1n]),
			RangeError,
		)
	})
})
