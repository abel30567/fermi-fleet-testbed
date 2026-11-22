import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { tensorProductDualRecursive } from './tensorProductDualRecursive.js'

/** @param {number} v @param {number} [d=0] */
const dual = (v, d = 0) => ({ v, d })

/**
 * Recursively infer the shape of a nested tensor array (scalar -> []).
 * @param {unknown} t
 * @returns {number[]}
 */
function getShape(t) {
	if (!Array.isArray(t)) return []
	if (t.length === 0) return [0]
	return [t.length, ...getShape(t[0])]
}

/**
 * Independent reference implementation using explicit flattening, flat-index
 * arithmetic, and stride-based unflattening (no recursive tensor product).
 * @param {any} a
 * @param {any} b
 * @returns {any}
 */
function tensorProductFlatReference(a, b) {
	const flatten = (tensor) => {
		const shape = []
		let cur = tensor
		while (Array.isArray(cur)) {
			shape.push(cur.length)
			cur = cur.length > 0 ? cur[0] : null
		}
		const flat = []
		const stack = [tensor]
		while (stack.length > 0) {
			const item = stack.pop()
			if (Array.isArray(item)) {
				for (let i = item.length - 1; i >= 0; i--) {
					stack.push(item[i])
				}
			} else {
				flat.push(item)
			}
		}
		return { shape, flat }
	}

	const unflatten = (flat, shape) => {
		if (shape.length === 0) return flat[0]
		const strides = new Array(shape.length)
		let stride = 1
		for (let axis = shape.length - 1; axis >= 0; axis--) {
			strides[axis] = stride
			stride *= shape[axis]
		}

		const build = (axis, offset) => {
			const dim = shape[axis]
			const out = new Array(dim)
			if (axis === shape.length - 1) {
				for (let i = 0; i < dim; i++) {
					out[i] = flat[offset + i]
				}
				return out
			}
			for (let i = 0; i < dim; i++) {
				out[i] = build(axis + 1, offset + i * strides[axis])
			}
			return out
		}
		return build(0, 0)
	}

	const fa = flatten(a)
	const fb = flatten(b)
	const outShape = [...fa.shape, ...fb.shape]
	const outFlat = new Array(fa.flat.length * fb.flat.length)

	for (let i = 0; i < fa.flat.length; i++) {
		const ai = fa.flat[i]
		for (let j = 0; j < fb.flat.length; j++) {
			const bj = fb.flat[j]
			const v = ai.v * bj.v
			const d = ai.v * bj.d + ai.d * bj.v
			outFlat[i * fb.flat.length + j] = {
				v: v === 0 ? 0 : v,
				d: d === 0 ? 0 : d,
			}
		}
	}

	return unflatten(outFlat, outShape)
}

/**
 * Purely real-valued outer product (used for finite-difference verification).
 * @param {any} a
 * @param {any} b
 * @returns {any}
 */
function realTensorProduct(a, b) {
	if (!Array.isArray(a)) {
		const scale = (x) => (Array.isArray(x) ? x.map(scale) : a * x)
		return scale(b)
	}
	return a.map((el) => realTensorProduct(el, b))
}

/**
 * Recursively compare two dual tensors within numeric tolerance.
 * @param {any} actual
 * @param {any} expected
 * @param {number} [tol=1e-12]
 */
function assertDualTensorClose(actual, expected, tol = 1e-12) {
	if (Array.isArray(expected)) {
		assert.ok(Array.isArray(actual), 'Expected array')
		assert.equal(actual.length, expected.length)
		for (let i = 0; i < expected.length; i++) {
			assertDualTensorClose(actual[i], expected[i], tol)
		}
		return
	}
	assert.ok(!Array.isArray(actual), 'Expected scalar dual')
	assert.ok(
		Math.abs(actual.v - expected.v) <= tol,
		`Value mismatch: actual=${actual.v}, expected=${expected.v}`,
	)
	assert.ok(
		Math.abs(actual.d - expected.d) <= tol,
		`Derivative mismatch: actual=${actual.d}, expected=${expected.d}`,
	)
}

describe('tensorProductDualRecursive', () => {
	describe('normal cases across ranks', () => {
		it('computes scalar ⊗ scalar (rank 0 ⊗ rank 0 -> rank 0)', () => {
			assert.deepStrictEqual(tensorProductDualRecursive(dual(2, 1), dual(3, 4)), { v: 6, d: 11 })
			assert.deepStrictEqual(tensorProductDualRecursive(dual(-5, 2), dual(0, 3)), { v: 0, d: -15 })
			assert.deepStrictEqual(tensorProductDualRecursive(dual(0, 0), dual(-4, 7)), { v: 0, d: 0 })
		})

		it('computes scalar ⊗ vector and vector ⊗ scalar (rank 0 and rank 1)', () => {
			const s = dual(3, -1)
			const vec = [dual(2, 5), dual(-4, 1), dual(0, 2)]

			assert.deepStrictEqual(tensorProductDualRecursive(s, vec), [
				{ v: 6, d: 13 },
				{ v: -12, d: 7 },
				{ v: 0, d: 6 },
			])
			assert.deepStrictEqual(tensorProductDualRecursive(vec, s), [
				{ v: 6, d: 13 },
				{ v: -12, d: 7 },
				{ v: 0, d: 6 },
			])
		})

		it('computes vector ⊗ vector (rank 1 ⊗ rank 1 -> rank 2)', () => {
			const u = [dual(1, 2), dual(3, -1), dual(-2, 0.5)]
			const w = [dual(4, 1), dual(-1, 3)]
			const result = tensorProductDualRecursive(u, w)

			assert.deepStrictEqual(getShape(result), [3, 2])
			assert.deepStrictEqual(result, [
				[
					{ v: 4, d: 9 },
					{ v: -1, d: 1 },
				],
				[
					{ v: 12, d: -1 },
					{ v: -3, d: 10 },
				],
				[
					{ v: -8, d: 0 },
					{ v: 2, d: -6.5 },
				],
			])
		})

		it('computes matrix ⊗ vector (rank 2 ⊗ rank 1 -> rank 3)', () => {
			const m = [
				[dual(1, 0), dual(2, 1)],
				[dual(-1, 3), dual(0, 2)],
			]
			const v = [dual(5, -1), dual(2, 4), dual(-3, 0)]
			const result = tensorProductDualRecursive(m, v)

			assert.deepStrictEqual(getShape(result), [2, 2, 3])
			assert.deepStrictEqual(result, [
				[
					[
						{ v: 5, d: -1 },
						{ v: 2, d: 4 },
						{ v: -3, d: 0 },
					],
					[
						{ v: 10, d: 3 },
						{ v: 4, d: 10 },
						{ v: -6, d: -3 },
					],
				],
				[
					[
						{ v: -5, d: 16 },
						{ v: -2, d: 2 },
						{ v: 3, d: -9 },
					],
					[
						{ v: 0, d: 10 },
						{ v: 0, d: 4 },
						{ v: 0, d: -6 },
					],
				],
			])
		})

		it('computes matrix ⊗ matrix (rank 2 ⊗ rank 2 -> rank 4)', () => {
			const a = [
				[dual(1, 1), dual(2, 0)],
				[dual(3, -1), dual(4, 2)],
			]
			const b = [
				[dual(0, 1), dual(-1, 2), dual(2, -1)],
				[dual(5, 0), dual(1, 1), dual(-2, 3)],
			]
			const result = tensorProductDualRecursive(a, b)

			assert.deepStrictEqual(getShape(result), [2, 2, 2, 3])
			assert.deepStrictEqual(result[0][0][0][0], { v: 0, d: 1 })
			assert.deepStrictEqual(result[0][1][1][2], { v: -4, d: 6 })
			assert.deepStrictEqual(result[1][0][0][1], { v: -3, d: 7 })
			assert.deepStrictEqual(result[1][1][1][0], { v: 20, d: 10 })
		})

		it('computes rank-3 tensor products (rank 3 ⊗ rank 1, rank 3 ⊗ rank 2, rank 3 ⊗ rank 3)', () => {
			const t3a = [
				[
					[dual(1, 0.5), dual(2, -1)],
					[dual(-1, 2), dual(3, 0)],
				],
				[
					[dual(0, 1), dual(4, 0.25)],
					[dual(2, -0.5), dual(-3, 1.5)],
				],
			]
			const v = [dual(2, 1), dual(-1, 3)]
			const res31 = tensorProductDualRecursive(t3a, v)
			assert.deepStrictEqual(getShape(res31), [2, 2, 2, 2])
			assert.deepStrictEqual(res31[0][0][1][1], { v: -2, d: 7 })
			assert.deepStrictEqual(res31[1][0][0][0], { v: 0, d: 2 })

			const t3b = [
				[[dual(1, -1)], [dual(2, 3)]],
				[[dual(-2, 0.5)], [dual(0.5, -0.5)]],
			]
			const res33 = tensorProductDualRecursive(t3a, t3b)
			assert.deepStrictEqual(getShape(res33), [2, 2, 2, 2, 2, 1])
			assert.deepStrictEqual(res33[1][1][1][0][1][0], { v: -6, d: -6 })
		})

		it('does not mutate inputs or alias sub-arrays/duals in the output', () => {
			const row = [dual(2, 1), dual(3, -1)]
			const a = [row, row] // shared non-cyclic row reference
			const b = [dual(4, 2)]
			const snapshotA = structuredClone(a)
			const snapshotB = structuredClone(b)

			const out = tensorProductDualRecursive(a, b)
			assert.deepStrictEqual(a, snapshotA)
			assert.deepStrictEqual(b, snapshotB)

			// Mutating one branch of output must not affect another or inputs
			out[0][0][0].v = 999
			assert.equal(out[1][0][0].v, 8)
			assert.equal(a[0][0].v, 2)
			assert.equal(b[0].v, 4)
		})

		it('satisfies associativity (A ⊗ B) ⊗ C = A ⊗ (B ⊗ C)', () => {
			const a = [dual(1, 2), dual(-3, 0.5)]
			const b = [
				[dual(2, -1), dual(0, 4)],
				[dual(5, 1), dual(-2, 3)],
			]
			const c = [dual(3, 1), dual(-1, 2), dual(0.5, -0.5)]

			const left = tensorProductDualRecursive(tensorProductDualRecursive(a, b), c)
			const right = tensorProductDualRecursive(a, tensorProductDualRecursive(b, c))
			assert.deepStrictEqual(left, right)
		})
	})

	describe('edge cases and input validation', () => {
		it('handles empty tensors across ranks without aliasing', () => {
			const s = dual(2, 3)
			const v = [dual(1, 0), dual(2, 1)]

			assert.deepStrictEqual(tensorProductDualRecursive([], []), [])
			assert.deepStrictEqual(tensorProductDualRecursive([], v), [])
			assert.deepStrictEqual(tensorProductDualRecursive([], s), [])
			assert.deepStrictEqual(tensorProductDualRecursive(s, []), [])

			const vEmpty = tensorProductDualRecursive(v, [])
			assert.deepStrictEqual(vEmpty, [[], []])
			assert.notEqual(vEmpty[0], vEmpty[1], 'Empty child arrays must be distinct instances')

			assert.deepStrictEqual(tensorProductDualRecursive([[], []], v), [[], []])
			assert.deepStrictEqual(tensorProductDualRecursive(v, [[], []]), [
				[[], []],
				[[], []],
			])
		})

		it('still validates the other operand when one operand is empty', () => {
			assert.throws(() => tensorProductDualRecursive([], /** @type {any} */ ('invalid')), TypeError)
			assert.throws(() => tensorProductDualRecursive(/** @type {any} */ (42), []), TypeError)
			assert.throws(
				() => tensorProductDualRecursive([], /** @type {any} */ ([[dual(1, 0)], []])),
				RangeError,
			)
		})

		it('throws RangeError on ragged tensors', () => {
			assert.throws(
				() =>
					tensorProductDualRecursive(
						[
							[dual(1, 0), dual(2, 0)],
							[dual(3, 0)],
						],
						dual(1, 0),
					),
				RangeError,
			)
			assert.throws(
				() => tensorProductDualRecursive(dual(1, 0), [[], [dual(1, 0)]]),
				RangeError,
			)
			assert.throws(
				() => tensorProductDualRecursive([dual(1, 0), [dual(2, 0)]], dual(1, 0)),
				RangeError,
			)
			assert.throws(
				() =>
					tensorProductDualRecursive(
						[
							[[dual(1, 0), dual(2, 0)]],
							[[dual(3, 0)]],
						],
						[dual(1, 0)],
					),
				RangeError,
			)
		})

		it('throws TypeError on non-dual elements, missing arguments, sparse arrays, and circular refs', () => {
			assert.throws(() => tensorProductDualRecursive(/** @type {any} */ (undefined), dual(1, 0)), TypeError)
			assert.throws(() => tensorProductDualRecursive(dual(1, 0), /** @type {any} */ (null)), TypeError)
			assert.throws(() => tensorProductDualRecursive(/** @type {any} */ (5), dual(1, 0)), TypeError)
			assert.throws(() => tensorProductDualRecursive(/** @type {any} */ ([1, 2]), [dual(1, 0)]), TypeError)
			assert.throws(() => tensorProductDualRecursive(/** @type {any} */ ({ v: 1 }), dual(1, 0)), TypeError)
			assert.throws(() => tensorProductDualRecursive(/** @type {any} */ ({ d: 1 }), dual(1, 0)), TypeError)
			assert.throws(
				() => tensorProductDualRecursive(/** @type {any} */ ({ v: '1', d: 0 }), dual(1, 0)),
				TypeError,
			)

			// Sparse array
			const sparse = new Array(2)
			sparse[0] = dual(1, 0)
			assert.throws(() => tensorProductDualRecursive(sparse, dual(1, 0)), TypeError)

			// Circular array reference
			/** @type {any[]} */
			const cyclic = []
			cyclic.push(cyclic)
			assert.throws(() => tensorProductDualRecursive(cyclic, dual(1, 0)), TypeError)
		})

		it('throws RangeError on non-finite dual components (NaN, Infinity, -Infinity)', () => {
			assert.throws(() => tensorProductDualRecursive(dual(Number.NaN, 0), dual(1, 0)), RangeError)
			assert.throws(() => tensorProductDualRecursive(dual(1, Number.POSITIVE_INFINITY), dual(1, 0)), RangeError)
			assert.throws(
				() => tensorProductDualRecursive([dual(1, 0)], [dual(2, Number.NEGATIVE_INFINITY)]),
				RangeError,
			)
		})
	})

	describe('independent cross-checks and finite-difference verification', () => {
		it('matches independent flattened/indexed reference across multiple shapes and sizes', () => {
			// Exercise multi-level divide-and-conquer splitting with odd and larger dimensions
			const makeDual = (seed) => dual(Math.sin(seed) * 3.1, Math.cos(seed * 1.7) * 2.3)

			const vecA = Array.from({ length: 11 }, (_, i) => makeDual(i + 1))
			const vecB = Array.from({ length: 9 }, (_, j) => makeDual(j + 20))
			assertDualTensorClose(
				tensorProductDualRecursive(vecA, vecB),
				tensorProductFlatReference(vecA, vecB),
			)

			const matA = Array.from({ length: 3 }, (_, i) =>
				Array.from({ length: 5 }, (_, j) => makeDual(i * 7 + j + 1)),
			)
			const matB = Array.from({ length: 4 }, (_, i) =>
				Array.from({ length: 3 }, (_, j) => makeDual(i * 11 + j + 50)),
			)
			assertDualTensorClose(
				tensorProductDualRecursive(matA, matB),
				tensorProductFlatReference(matA, matB),
			)

			const rank3A = Array.from({ length: 2 }, (_, i) =>
				Array.from({ length: 3 }, (_, j) =>
					Array.from({ length: 2 }, (_, k) => makeDual(i * 13 + j * 5 + k + 1)),
				),
			)
			const matC = Array.from({ length: 3 }, (_, i) =>
				Array.from({ length: 2 }, (_, j) => makeDual(i * 17 + j + 100)),
			)
			assertDualTensorClose(
				tensorProductDualRecursive(rank3A, matC),
				tensorProductFlatReference(rank3A, matC),
			)
		})

		it('matches central finite-difference derivatives for parameterized smooth tensors', () => {
			const t0 = 0.73
			const h = 1e-6

			/** Smooth rank-2 tensor A(t) with exact analytical derivative A'(t) */
			const evalA = (t) => [
				[Math.sin(2 * t) + 1.5, Math.exp(0.5 * t)],
				[t * t * t - 2 * t, Math.cos(3 * t)],
				[Math.log(t + 2), 4 * t - 1],
			]
			const evalAd = (t) => [
				[2 * Math.cos(2 * t), 0.5 * Math.exp(0.5 * t)],
				[3 * t * t - 2, -3 * Math.sin(3 * t)],
				[1 / (t + 2), 4],
			]

			/** Smooth rank-3 tensor B(t) with exact analytical derivative B'(t) */
			const evalB = (t) => [
				[
					[Math.cos(t), t * Math.sin(t)],
					[Math.exp(-t), 2 * t * t + 3],
				],
				[
					[Math.sin(t * t), 1 / (t + 1)],
					[Math.cos(2 * t) - t, Math.sqrt(t + 4)],
				],
			]
			const evalBd = (t) => [
				[
					[-Math.sin(t), Math.sin(t) + t * Math.cos(t)],
					[-Math.exp(-t), 4 * t],
				],
				[
					[2 * t * Math.cos(t * t), -1 / ((t + 1) * (t + 1))],
					[-2 * Math.sin(2 * t) - 1, 0.5 / Math.sqrt(t + 4)],
				],
			]

			const zipDual = (vals, derivs) =>
				Array.isArray(vals)
					? vals.map((v, idx) => zipDual(v, derivs[idx]))
					: dual(vals, derivs)

			const dualProduct = tensorProductDualRecursive(
				zipDual(evalA(t0), evalAd(t0)),
				zipDual(evalB(t0), evalBd(t0)),
			)

			const primalExpected = realTensorProduct(evalA(t0), evalB(t0))
			const plusH = realTensorProduct(evalA(t0 + h), evalB(t0 + h))
			const minusH = realTensorProduct(evalA(t0 - h), evalB(t0 - h))

			const checkRecursive = (node, pNode, plusNode, minusNode) => {
				if (Array.isArray(node)) {
					assert.equal(node.length, pNode.length)
					for (let i = 0; i < node.length; i++) {
						checkRecursive(node[i], pNode[i], plusNode[i], minusNode[i])
					}
					return
				}
				const fd = (plusNode - minusNode) / (2 * h)
				assert.ok(
					Math.abs(node.v - pNode) <= 1e-12,
					`Primal mismatch: dual.v=${node.v}, expected=${pNode}`,
				)
				assert.ok(
					Math.abs(node.d - fd) <= 1e-7,
					`Derivative vs finite-diff mismatch: dual.d=${node.d}, fd=${fd}`,
				)
			}

			assert.deepStrictEqual(getShape(dualProduct), [3, 2, 2, 2, 2])
			checkRecursive(dualProduct, primalExpected, plusH, minusH)
		})
	})
})
