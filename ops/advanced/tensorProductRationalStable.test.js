import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { tensorProductRationalStable } from './tensorProductRationalStable.js'

/** Helper to construct a rational literal concisely. */
const q = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

/** Independent GCD for test assertions and cross-checks. */
function refGcd(a, b) {
	a = a < 0n ? -a : a
	b = b < 0n ? -b : b
	while (b !== 0n) {
		const t = a % b
		a = b
		b = t
	}
	return a
}

/** Independent naive rational reduction. */
function refReduce(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = refGcd(num, den)
	return { num: num / g, den: den / g }
}

/** Independent naive rational addition. */
function refAdd(a, b) {
	return refReduce(a.num * b.den + b.num * a.den, a.den * b.den)
}

/** Independent naive rational multiplication (multiplies first, reduces after). */
function refMul(a, b) {
	return refReduce(a.num * b.num, a.den * b.den)
}

/** Independent naive recursive tensor product (no scaling, no cross-cancellation). */
function naiveTensorProduct(a, b) {
	if (Array.isArray(a)) {
		return a.map((el) => naiveTensorProduct(el, b))
	}
	if (Array.isArray(b)) {
		return b.map((el) => naiveTensorProduct(a, el))
	}
	return refMul(a, b)
}

/** Independent matrix multiplication over exact rationals. */
function refMatMul(A, B) {
	const m = A.length
	const k = A[0].length
	const n = B[0].length
	const C = Array.from({ length: m }, () => new Array(n))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let acc = q(0, 1)
			for (let t = 0; t < k; t++) {
				acc = refAdd(acc, refMul(A[i][t], B[t][j]))
			}
			C[i][j] = acc
		}
	}
	return C
}

/** Element-wise tensor addition for bilinearity checks. */
function refTensorAdd(a, b) {
	if (Array.isArray(a)) {
		return a.map((el, i) => refTensorAdd(el, b[i]))
	}
	return refAdd(a, b)
}

/** Sums all rational entries in an arbitrary-rank tensor. */
function refTensorSum(t) {
	if (Array.isArray(t)) {
		return t.reduce((acc, el) => refAdd(acc, refTensorSum(el)), q(0, 1))
	}
	return refReduce(t.num, t.den)
}

/** Recursively verifies canonical lowest-terms invariants on every entry. */
function assertCanonicalTensor(tensor) {
	if (Array.isArray(tensor)) {
		for (const child of tensor) {
			assertCanonicalTensor(child)
		}
		return
	}
	assert.equal(typeof tensor, 'object')
	assert.notEqual(tensor, null)
	assert.equal(typeof tensor.num, 'bigint')
	assert.equal(typeof tensor.den, 'bigint')
	assert.ok(tensor.den > 0n, `expected den > 0n, got ${tensor.den}`)
	if (tensor.num === 0n) {
		assert.equal(tensor.den, 1n, 'zero must have den === 1n')
	} else {
		assert.equal(refGcd(tensor.num, tensor.den), 1n, `not in lowest terms: ${tensor.num}/${tensor.den}`)
	}
}

describe('tensorProductRationalStable', () => {
	test('scalar ⊗ scalar with signs, zero, and unreduced inputs', () => {
		const r1 = tensorProductRationalStable(q(6, -9), q(-15, 10))
		assertCanonicalTensor(r1)
		assert.deepEqual(r1, q(1, 1))

		const r2 = tensorProductRationalStable(q(0, -7), q(123, 456))
		assertCanonicalTensor(r2)
		assert.deepEqual(r2, q(0, 1))

		const r3 = tensorProductRationalStable(q(7, 12), q(-8, 21))
		assertCanonicalTensor(r3)
		assert.deepEqual(r3, q(-2, 9))
	})

	test('scalar ⊗ tensor and tensor ⊗ scalar', () => {
		const v = [q(2, 3), q(-5, 6), q(0, 4)]
		const left = tensorProductRationalStable(q(3, 4), v)
		const right = tensorProductRationalStable(v, q(3, 4))
		assertCanonicalTensor(left)
		assertCanonicalTensor(right)
		const expected = [q(1, 2), q(-5, 8), q(0, 1)]
		assert.deepEqual(left, expected)
		assert.deepEqual(right, expected)
	})

	test('vector ⊗ vector produces outer-product matrix in lowest terms', () => {
		const u = [q(1, 2), q(-2, 3), q(0, 5)]
		const v = [q(3, 5), q(4, 9)]
		const out = tensorProductRationalStable(u, v)
		assertCanonicalTensor(out)
		assert.deepEqual(out, [
			[q(3, 10), q(2, 9)],
			[q(-2, 5), q(-8, 27)],
			[q(0, 1), q(0, 1)],
		])
	})

	test('matrix ⊗ matrix produces rank-4 tensor in default mode', () => {
		const A = [
			[q(1, 2), q(3, 4)],
			[q(-5, 6), q(0, 1)],
		]
		const B = [
			[q(2, 3), q(-4, 5)],
			[q(6, 7), q(8, 9)],
		]
		const out = tensorProductRationalStable(A, B)
		assertCanonicalTensor(out)
		assert.equal(out.length, 2)
		assert.equal(out[0].length, 2)
		assert.equal(out[0][0].length, 2)
		assert.equal(out[0][0][0].length, 2)
		assert.deepEqual(out, naiveTensorProduct(A, B))
	})

	test('mixed-rank tensors (vector ⊗ matrix and 3D ⊗ 2D)', () => {
		const v = [q(2, 5), q(-3, 7)]
		const M = [
			[q(5, 6), q(7, 8)],
			[q(0, 1), q(-14, 9)],
		]
		const outVM = tensorProductRationalStable(v, M)
		assertCanonicalTensor(outVM)
		assert.deepEqual(outVM, naiveTensorProduct(v, M))

		const T3 = [[[q(1, 3)], [q(-2, 5)]]]
		const out5D = tensorProductRationalStable(T3, M)
		assertCanonicalTensor(out5D)
		assert.deepEqual(out5D, naiveTensorProduct(T3, M))
	})

	test('kronecker mode for 1D vectors, 2D matrices, and 3D tensors', () => {
		const u = [q(1, 2), q(2, 3)]
		const v = [q(3, 4), q(-6, 5)]
		const kv = tensorProductRationalStable(u, v, { mode: 'kronecker' })
		assertCanonicalTensor(kv)
		assert.deepEqual(kv, [q(3, 8), q(-3, 5), q(1, 2), q(-4, 5)])

		const A = [
			[q(1, 2), q(2, 3)],
			[q(0, 1), q(-3, 4)],
		]
		const B = [
			[q(4, 5), q(6, 7), q(-2, 1)],
			[q(10, 3), q(0, 1), q(8, 9)],
		]
		const km = tensorProductRationalStable(A, B, { mode: 'kronecker' })
		assertCanonicalTensor(km)
		assert.equal(km.length, 4)
		assert.equal(km[0].length, 6)
		for (let i = 0; i < 2; i++) {
			for (let j = 0; j < 2; j++) {
				for (let k = 0; k < 2; k++) {
					for (let l = 0; l < 3; l++) {
						assert.deepEqual(km[i * 2 + k][j * 3 + l], refMul(A[i][j], B[k][l]))
					}
				}
			}
		}

		// 3D Kronecker product: shape [2, 1, 2] ⊗_K [1, 2, 2] -> [2, 2, 4]
		const X = [[[q(1, 2), q(3, 4)]], [[q(-5, 6), q(7, 8)]]]
		const Y = [[[q(2, 3), q(4, 5)], [q(6, 7), q(8, 9)]]]
		const k3 = tensorProductRationalStable(X, Y, { mode: 'kronecker' })
		assertCanonicalTensor(k3)
		assert.equal(k3.length, 2)
		assert.equal(k3[0].length, 2)
		assert.equal(k3[0][0].length, 4)
		assert.deepEqual(k3[1][1][3], refMul(X[1][0][1], Y[0][1][1]))
	})

	test('extreme reciprocal scaling cancels cleanly without overflow or precision loss', () => {
		const bigA = 10n ** 400n
		const bigB = 7n ** 300n
		const A = [
			[{ num: 3n * bigA, den: 2n * bigB }, { num: -5n * bigA, den: 4n * bigB }],
			[{ num: 0n, den: bigB }, { num: 11n * bigA, den: 6n * bigB }],
		]
		const B = [
			[{ num: 2n * bigB, den: 3n * bigA }, { num: 4n * bigB, den: 5n * bigA }],
			[{ num: -6n * bigB, den: 11n * bigA }, { num: 9n * bigB, den: 7n * bigA }],
		]
		const out = tensorProductRationalStable(A, B)
		assertCanonicalTensor(out)
		assert.deepEqual(out[0][0][0][0], q(1, 1))
		assert.deepEqual(out[0][1][0][1], q(-1, 1))
		assert.deepEqual(out[1][1][1][0], q(-1, 1))
		assert.deepEqual(out[1][0][1][1], q(0, 1))
		assert.deepEqual(out[1][1][1][1], q(33, 14))
	})

	test('huge coprime BigInt entries (> 2^256) remain exact', () => {
		const p1 = (1n << 260n) + 17n
		const p2 = (1n << 260n) + 33n
		const q1 = (1n << 258n) + 9n
		const q2 = (1n << 258n) + 27n
		const res = tensorProductRationalStable([{ num: p1, den: q1 }], [{ num: p2, den: q2 }])
		assertCanonicalTensor(res)
		assert.deepEqual(res, [[refMul({ num: p1, den: q1 }, { num: p2, den: q2 })]])
	})

	test('all-zero tensors and empty dimensions', () => {
		const zeroVec = [q(0, 3), q(0, -5)]
		const nonZero = [q(7, 11), q(-13, 17)]
		const zOut = tensorProductRationalStable(zeroVec, nonZero)
		assertCanonicalTensor(zOut)
		assert.deepEqual(zOut, [
			[q(0, 1), q(0, 1)],
			[q(0, 1), q(0, 1)],
		])
		// Distinct objects (no shared mutable zero references)
		assert.notEqual(zOut[0][0], zOut[0][1])
		assert.notEqual(zOut[0][0], zOut[1][0])

		assert.deepEqual(tensorProductRationalStable([], nonZero), [])
		assert.deepEqual(tensorProductRationalStable(nonZero, []), [[], []])
		assert.deepEqual(tensorProductRationalStable([[], []], nonZero), [[], []])
		assert.deepEqual(tensorProductRationalStable(nonZero, [[], []]), [
			[[], []],
			[[], []],
		])
		assert.deepEqual(tensorProductRationalStable([], nonZero, { mode: 'kronecker' }), [])
	})

	test('preserves input immutability and allows shared non-circular references', () => {
		const r = { num: 4n, den: -6n }
		const row = [r, { num: 3n, den: 9n }]
		const mat = [row, row]
		const res = tensorProductRationalStable(mat, [q(3, 2)])
		assertCanonicalTensor(res)
		// Input untouched
		assert.deepEqual(r, { num: 4n, den: -6n })
		assert.deepEqual(res[0][0][0], q(-1, 1))
		assert.deepEqual(res[1][0][0], q(-1, 1))
		// Output entries are independent objects
		assert.notEqual(res[0][0][0], res[1][0][0])
	})

	test('independent cross-check against naive implementation on deterministic pseudo-random tensors', () => {
		let seed = 0x123456789abcdef1n
		const nextInt = (bound) => {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
			return Number(seed % BigInt(bound))
		}
		const randRat = () => {
			const num = BigInt(nextInt(41) - 20) * BigInt(nextInt(5) === 0 ? 0 : 12)
			const denRaw = BigInt(nextInt(25) + 1) * (nextInt(2) === 0 ? 6n : -6n)
			return { num, den: denRaw }
		}

		const A = Array.from({ length: 3 }, () => Array.from({ length: 2 }, randRat))
		const B = Array.from({ length: 2 }, () => Array.from({ length: 4 }, randRat))

		const actual = tensorProductRationalStable(A, B)
		const expected = naiveTensorProduct(A, B)
		assertCanonicalTensor(actual)
		assert.deepEqual(actual, expected)

		// Independent sum identity: sum(A ⊗ B) === sum(A) * sum(B)
		assert.deepEqual(refTensorSum(actual), refMul(refTensorSum(A), refTensorSum(B)))
	})

	test('algebraic identities: bilinearity, associativity, and Kronecker mixed-product property', () => {
		const A = [
			[q(1, 2), q(-2, 3)],
			[q(3, 5), q(4, 7)],
		]
		const B = [
			[q(-5, 6), q(1, 4)],
			[q(2, 9), q(-7, 8)],
		]
		const C = [
			[q(3, 4), q(5, 2)],
			[q(-1, 3), q(2, 5)],
		]
		const D = [
			[q(7, 10), q(-3, 8)],
			[q(4, 9), q(5, 6)],
		]

		// Bilinearity: (A + B) ⊗ C === (A ⊗ C) + (B ⊗ C)
		const lhsBilin = tensorProductRationalStable(refTensorAdd(A, B), C)
		const rhsBilin = refTensorAdd(
			tensorProductRationalStable(A, C),
			tensorProductRationalStable(B, C)
		)
		assert.deepEqual(lhsBilin, rhsBilin)

		// Associativity: (A ⊗ B) ⊗ C === A ⊗ (B ⊗ C)
		const u = [q(2, 3), q(-1, 5)]
		const v = [q(5, 7), q(3, 4)]
		const w = [q(-4, 9), q(1, 2)]
		assert.deepEqual(
			tensorProductRationalStable(tensorProductRationalStable(u, v), w),
			tensorProductRationalStable(u, tensorProductRationalStable(v, w))
		)

		// Kronecker mixed-product property: (A ⊗_K B)(C ⊗_K D) === (AC) ⊗_K (BD)
		const AkB = tensorProductRationalStable(A, B, { mode: 'kronecker' })
		const CkD = tensorProductRationalStable(C, D, { mode: 'kronecker' })
		const lhsMixed = refMatMul(AkB, CkD)
		const rhsMixed = tensorProductRationalStable(refMatMul(A, C), refMatMul(B, D), {
			mode: 'kronecker',
		})
		assertCanonicalTensor(rhsMixed)
		assert.deepEqual(lhsMixed, rhsMixed)

		// Trace identity: tr(A ⊗_K B) === tr(A) * tr(B)
		const tr = (M) => M.reduce((acc, row, i) => refAdd(acc, row[i]), q(0, 1))
		assert.deepEqual(tr(AkB), refMul(tr(A), tr(B)))
	})

	test('input validation rejects invalid rationals, shapes, options, holes, and cycles', () => {
		// Invalid types
		assert.throws(() => tensorProductRationalStable(null, q(1, 1)), TypeError)
		assert.throws(() => tensorProductRationalStable(q(1, 1), undefined), TypeError)
		assert.throws(() => tensorProductRationalStable(1, q(1, 1)), TypeError)
		assert.throws(() => tensorProductRationalStable({ num: 1, den: 2n }, q(1, 1)), TypeError)
		assert.throws(() => tensorProductRationalStable({ num: 1n, den: 2 }, q(1, 1)), TypeError)

		// Zero denominator
		assert.throws(() => tensorProductRationalStable({ num: 1n, den: 0n }, q(1, 1)), RangeError)
		assert.throws(() => tensorProductRationalStable(q(1, 1), [{ num: 0n, den: 0n }]), RangeError)

		// Ragged and mixed-depth arrays
		assert.throws(
			() => tensorProductRationalStable([[q(1, 1), q(2, 1)], [q(3, 1)]], q(1, 1)),
			RangeError
		)
		assert.throws(
			() => tensorProductRationalStable([q(1, 1), [q(2, 1)]], q(1, 1)),
			RangeError
		)

		// Sparse array hole
		const sparse = [q(1, 1), , q(2, 1)] // eslint-disable-line no-sparse-arrays
		assert.throws(() => tensorProductRationalStable(sparse, q(1, 1)), TypeError)

		// Circular array reference
		const cyclic = []
		cyclic.push(cyclic)
		assert.throws(() => tensorProductRationalStable(cyclic, q(1, 1)), TypeError)

		// Invalid options
		assert.throws(() => tensorProductRationalStable(q(1, 1), q(1, 1), null), TypeError)
		assert.throws(() => tensorProductRationalStable(q(1, 1), q(1, 1), []), TypeError)
		assert.throws(
			() => tensorProductRationalStable(q(1, 1), q(1, 1), { mode: 'invalid' }),
			RangeError
		)

		// Kronecker rank mismatch
		assert.throws(
			() => tensorProductRationalStable([q(1, 1)], [[q(1, 1)]], { mode: 'kronecker' }),
			RangeError
		)
	})
})
