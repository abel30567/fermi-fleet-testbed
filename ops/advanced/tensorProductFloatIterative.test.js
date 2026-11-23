import { test } from 'node:test'
import assert from 'node:assert'
import { tensorProductFloatIterative } from './tensorProductFloatIterative.js'

/**
 * Independent recursive reference implementation of the tensor product
 * for cross-checking the iterative implementation.
 */
function referenceTensorProduct(a, b) {
	if (typeof a === 'number') {
		return scaleRecursive(b, a)
	}
	return a.map((sub) => referenceTensorProduct(sub, b))
}

function scaleRecursive(t, scalar) {
	if (typeof t === 'number') {
		return scalar * t
	}
	return t.map((sub) => scaleRecursive(sub, scalar))
}

function flatten(t) {
	const out = []
	const stack = [t]
	while (stack.length > 0) {
		const item = stack.pop()
		if (Array.isArray(item)) {
			for (let i = item.length - 1; i >= 0; i--) {
				stack.push(item[i])
			}
		} else {
			out.push(item)
		}
	}
	return out
}

function assertTensorsClose(actual, expected, eps = 1e-12) {
	if (typeof expected === 'number') {
		assert.strictEqual(typeof actual, 'number')
		assert.ok(
			Math.abs(actual - expected) <= eps * Math.max(1, Math.abs(actual), Math.abs(expected)),
			`Expected ${actual} to be close to ${expected}`
		)
		return
	}
	assert.ok(Array.isArray(actual))
	assert.strictEqual(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assertTensorsClose(actual[i], expected[i], eps)
	}
}

test('1D x 1D vector outer product', () => {
	const result = tensorProductFloatIterative([1, 2, 3], [4, 5])
	assert.deepStrictEqual(result, [
		[4, 5],
		[8, 10],
		[12, 15],
	])
})

test('1D x 1D with negative and fractional float64 values', () => {
	const result = tensorProductFloatIterative([-1.5, 0.25], [2.0, -4.0, 0.5])
	assert.deepStrictEqual(result, [
		[-3.0, 6.0, -0.75],
		[0.5, -1.0, 0.125],
	])
})

test('2D x 1D and 1D x 2D produce rank-3 tensors', () => {
	const m = [
		[1, 2],
		[3, 4],
	]
	const v = [10, 20]

	assert.deepStrictEqual(tensorProductFloatIterative(m, v), [
		[
			[10, 20],
			[20, 40],
		],
		[
			[30, 60],
			[40, 80],
		],
	])

	assert.deepStrictEqual(tensorProductFloatIterative(v, m), [
		[
			[10, 20],
			[30, 40],
		],
		[
			[20, 40],
			[60, 80],
		],
	])
})

test('2D x 2D produces rank-4 tensor', () => {
	const a = [
		[1, 2],
		[3, 4],
	]
	const b = [
		[0, 5],
		[6, 7],
	]
	const result = tensorProductFloatIterative(a, b)
	assert.deepStrictEqual(result, [
		[
			[
				[0, 5],
				[6, 7],
			],
			[
				[0, 10],
				[12, 14],
			],
		],
		[
			[
				[0, 15],
				[18, 21],
			],
			[
				[0, 20],
				[24, 28],
			],
		],
	])
})

test('single-element tensors and IEEE-754 edge values', () => {
	assert.deepStrictEqual(tensorProductFloatIterative([3.5], [2.0]), [[7.0]])

	const tiny = Number.MIN_VALUE
	const resTiny = tensorProductFloatIterative([tiny], [2])
	assert.deepStrictEqual(resTiny, [[tiny * 2]])

	const resZero = tensorProductFloatIterative([0, -0], [1, -1])
	assert.strictEqual(Object.is(resZero[0][0], 0), true)
	assert.strictEqual(Object.is(resZero[0][1], -0), true)
	assert.strictEqual(Object.is(resZero[1][0], -0), true)
	assert.strictEqual(Object.is(resZero[1][1], 0), true)
})

test('empty tensor edge cases and non-aliasing', () => {
	assert.deepStrictEqual(tensorProductFloatIterative([], [1, 2]), [])
	assert.deepStrictEqual(tensorProductFloatIterative([], []), [])

	const rightEmpty = tensorProductFloatIterative([1, 2], [])
	assert.deepStrictEqual(rightEmpty, [[], []])
	rightEmpty[0].push(99)
	assert.deepStrictEqual(rightEmpty[1], [])

	const leftNestedEmpty = tensorProductFloatIterative([[], []], [1, 2])
	assert.deepStrictEqual(leftNestedEmpty, [[], []])
	leftNestedEmpty[0].push(42)
	assert.deepStrictEqual(leftNestedEmpty[1], [])

	const rightNestedEmpty = tensorProductFloatIterative([1, 2], [[], []])
	assert.deepStrictEqual(rightNestedEmpty, [
		[[], []],
		[[], []],
	])
	rightNestedEmpty[0][0].push(7)
	assert.deepStrictEqual(rightNestedEmpty[0][1], [])
	assert.deepStrictEqual(rightNestedEmpty[1][0], [])
})

test('does not mutate input tensors', () => {
	const a = [
		[1.25, -2.5],
		[3.75, 4.0],
	]
	const b = [0.5, -1.5]
	const aCopy = structuredClone(a)
	const bCopy = structuredClone(b)

	const out = tensorProductFloatIterative(a, b)
	out[0][0][0] = 999

	assert.deepStrictEqual(a, aCopy)
	assert.deepStrictEqual(b, bCopy)
})

test('input validation rejects invalid types, non-finite values, and ragged tensors', () => {
	// Non-array inputs
	assert.throws(() => tensorProductFloatIterative(null, [1]), TypeError)
	assert.throws(() => tensorProductFloatIterative([1], undefined), TypeError)
	assert.throws(() => tensorProductFloatIterative(5, [1, 2]), TypeError)
	assert.throws(() => tensorProductFloatIterative([1, 2], '12'), TypeError)
	assert.throws(() => tensorProductFloatIterative({}, [1]), TypeError)

	// Non-number leaf elements
	assert.throws(() => tensorProductFloatIterative(['1', 2], [3]), TypeError)
	assert.throws(() => tensorProductFloatIterative([1, null], [3]), TypeError)
	assert.throws(() => tensorProductFloatIterative([1], [true]), TypeError)
	assert.throws(() => tensorProductFloatIterative([1n], [2]), TypeError)
	// eslint-disable-next-line no-sparse-arrays
	assert.throws(() => tensorProductFloatIterative([1, , 3], [2]), TypeError)

	// Non-finite float64 values
	assert.throws(() => tensorProductFloatIterative([NaN], [1]), RangeError)
	assert.throws(() => tensorProductFloatIterative([1], [Infinity]), RangeError)
	assert.throws(() => tensorProductFloatIterative([-Infinity, 2], [1]), RangeError)

	// Ragged and inconsistent-rank tensors
	assert.throws(() => tensorProductFloatIterative([[1, 2], [3]], [1]), RangeError)
	assert.throws(() => tensorProductFloatIterative([1], [[1], [2, 3]]), RangeError)
	assert.throws(() => tensorProductFloatIterative([[], [1]], [1]), RangeError)
	assert.throws(() => tensorProductFloatIterative([1, [2]], [3]), RangeError)
	assert.throws(() => tensorProductFloatIterative([[1], 2], [3]), RangeError)
})

test('independent cross-check against recursive reference on higher-rank tensors', () => {
	const t3d = [
		[
			[0.1, -0.2, 0.3],
			[1.4, -2.5, 3.6],
		],
		[
			[Math.PI, -Math.E, Math.SQRT2],
			[0.0, 42.125, -7.875],
		],
	]
	const t2d = [
		[1.1, -2.2],
		[3.3, 4.4],
		[-5.5, 6.6],
	]

	const actual = tensorProductFloatIterative(t3d, t2d)
	const expected = referenceTensorProduct(t3d, t2d)
	assert.deepStrictEqual(actual, expected)
})

test('independent cross-check via algebraic identities (associativity, bilinearity, Frobenius norm, contraction)', () => {
	const a = [1.5, -2.25, 0.75]
	const b = [
		[0.5, -1.25],
		[2.0, 3.5],
	]
	const c = [-0.4, 1.6, 2.2]

	// Associativity: (A ⊗ B) ⊗ C == A ⊗ (B ⊗ C)
	const leftAssoc = tensorProductFloatIterative(tensorProductFloatIterative(a, b), c)
	const rightAssoc = tensorProductFloatIterative(a, tensorProductFloatIterative(b, c))
	assertTensorsClose(leftAssoc, rightAssoc, 1e-12)

	// Bilinearity: (u + v) ⊗ w == u ⊗ w + v ⊗ w
	const u = [1.2, -3.4, 5.6]
	const v = [-0.8, 2.1, 0.9]
	const w = [4.5, -1.5]
	const uPlusV = u.map((x, i) => x + v[i])
	const lhs = tensorProductFloatIterative(uPlusV, w)
	const uw = tensorProductFloatIterative(u, w)
	const vw = tensorProductFloatIterative(v, w)
	const rhs = uw.map((row, i) => row.map((val, j) => val + vw[i][j]))
	assertTensorsClose(lhs, rhs, 1e-12)

	// Frobenius norm multiplicativity: ||A ⊗ B||_F^2 == ||A||_F^2 * ||B||_F^2
	const ab = tensorProductFloatIterative(a, b)
	const sumSq = (arr) => flatten(arr).reduce((acc, x) => acc + x * x, 0)
	const lhsNormSq = sumSq(ab)
	const rhsNormSq = sumSq(a) * sumSq(b)
	assert.ok(
		Math.abs(lhsNormSq - rhsNormSq) <= 1e-12 * Math.max(1, lhsNormSq, rhsNormSq),
		`Frobenius norm squared mismatch: ${lhsNormSq} vs ${rhsNormSq}`
	)

	// Sum of elements identity: sum(A ⊗ B) == sum(A) * sum(B)
	const sumAll = (arr) => flatten(arr).reduce((acc, x) => acc + x, 0)
	const lhsSum = sumAll(ab)
	const rhsSum = sumAll(a) * sumAll(b)
	assert.ok(
		Math.abs(lhsSum - rhsSum) <= 1e-12 * Math.max(1, Math.abs(lhsSum), Math.abs(rhsSum)),
		`Sum identity mismatch: ${lhsSum} vs ${rhsSum}`
	)

	// Outer product action on vector: (u ⊗ w) * x == u * (w · x)
	const x = [2.5, -3.5]
	const dotWX = w[0] * x[0] + w[1] * x[1]
	const mv = uw.map((row) => row[0] * x[0] + row[1] * x[1])
	const scaledU = u.map((val) => val * dotWX)
	assertTensorsClose(mv, scaledU, 1e-12)
})
