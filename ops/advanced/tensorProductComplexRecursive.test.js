import { test, describe } from 'node:test'
import assert from 'node:assert'
import { tensorProductComplexRecursive } from './tensorProductComplexRecursive.js'

const c = (re, im = 0) => ({ re, im })

/**
 * Independent iterative reference implementation using flat indexing and strides.
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

function flatten(t) {
	if (!Array.isArray(t)) return [t]
	const result = []
	const stack = [t]
	while (stack.length > 0) {
		const node = stack.pop()
		if (!Array.isArray(node)) {
			result.push(node)
		} else {
			for (let i = node.length - 1; i >= 0; i--) {
				stack.push(node[i])
			}
		}
	}
	return result
}

function unflatten(flat, shape) {
	if (shape.length === 0) return flat[0]
	let cur = flat
	for (let d = shape.length - 1; d >= 1; d--) {
		const dim = shape[d]
		const next = []
		for (let i = 0; i < cur.length; i += dim) {
			next.push(cur.slice(i, i + dim))
		}
		cur = next
	}
	return cur
}

function referenceTensorProductIterative(a, b) {
	const shapeA = getShape(a)
	const shapeB = getShape(b)
	const flatA = flatten(a)
	const flatB = flatten(b)
	const flatOut = []
	for (let i = 0; i < flatA.length; i++) {
		for (let j = 0; j < flatB.length; j++) {
			const re = flatA[i].re * flatB[j].re - flatA[i].im * flatB[j].im
			const im = flatA[i].re * flatB[j].im + flatA[i].im * flatB[j].re
			flatOut.push({ re: re === 0 ? 0 : re, im: im === 0 ? 0 : im })
		}
	}
	return unflatten(flatOut, [...shapeA, ...shapeB])
}

function addTensors(a, b) {
	if (!Array.isArray(a)) {
		return { re: a.re + b.re, im: a.im + b.im }
	}
	return a.map((item, idx) => addTensors(item, b[idx]))
}

function conjugateTensor(t) {
	if (!Array.isArray(t)) {
		return { re: t.re, im: t.im === 0 ? 0 : -t.im }
	}
	return t.map(conjugateTensor)
}

function frobeniusNorm(t) {
	const flat = flatten(t)
	let sumSq = 0
	for (const z of flat) {
		sumSq += z.re * z.re + z.im * z.im
	}
	return Math.sqrt(sumSq)
}

function assertComplexTensorsClose(actual, expected, eps = 1e-12) {
	assert.deepStrictEqual(getShape(actual), getShape(expected))
	const flatActual = flatten(actual)
	const flatExpected = flatten(expected)
	assert.strictEqual(flatActual.length, flatExpected.length)
	for (let i = 0; i < flatActual.length; i++) {
		assert.ok(
			Math.abs(flatActual[i].re - flatExpected[i].re) <= eps,
			`re mismatch at flat index ${i}: ${flatActual[i].re} vs ${flatExpected[i].re}`
		)
		assert.ok(
			Math.abs(flatActual[i].im - flatExpected[i].im) <= eps,
			`im mismatch at flat index ${i}: ${flatActual[i].im} vs ${flatExpected[i].im}`
		)
	}
}

describe('tensorProductComplexRecursive', () => {
	describe('normal cases', () => {
		test('rank-0 ⊗ rank-0 (complex scalar multiplication)', () => {
			assert.deepStrictEqual(
				tensorProductComplexRecursive(c(3, 2), c(1, -4)),
				c(11, -10)
			)
			assert.deepStrictEqual(
				tensorProductComplexRecursive(c(0, 1), c(0, 1)),
				c(-1, 0)
			)
		})

		test('rank-1 ⊗ rank-1 (complex vector outer product)', () => {
			const u = [c(1, 2), c(3, -1)]
			const v = [c(0, 1), c(2, 3), c(-1, 0)]
			const actual = tensorProductComplexRecursive(u, v)
			const expected = [
				[c(-2, 1), c(-4, 7), c(-1, -2)],
				[c(1, 3), c(9, 7), c(-3, 1)],
			]
			assert.deepStrictEqual(actual, expected)
		})

		test('rank-2 ⊗ rank-2 (complex matrices produce 4D tensor)', () => {
			const A = [
				[c(1, 0), c(0, 1)],
				[c(2, -1), c(-1, 3)],
			]
			const B = [
				[c(1, 1), c(2, 0), c(0, -2)],
				[c(-3, 2), c(0, 0), c(4, 1)],
			]
			const actual = tensorProductComplexRecursive(A, B)
			assert.deepStrictEqual(getShape(actual), [2, 2, 2, 3])
			assert.deepStrictEqual(actual[0][0][0][0], c(1, 1))
			assert.deepStrictEqual(actual[0][1][0][0], c(-1, 1))
			assert.deepStrictEqual(actual[1][0][1][2], c(9, -2))
			assert.deepStrictEqual(actual[1][1][1][0], c(-3, -11))
		})

		test('mixed ranks: scalar ⊗ vector, vector ⊗ scalar, vector ⊗ matrix, matrix ⊗ vector', () => {
			const s = c(2, -1)
			const v = [c(1, 1), c(0, -3), c(4, 2)]
			const M = [
				[c(1, 0), c(0, 2)],
				[c(-1, 1), c(3, -1)],
			]

			assert.deepStrictEqual(tensorProductComplexRecursive(s, v), [
				c(3, 1),
				c(-3, -6),
				c(10, 0),
			])
			assert.deepStrictEqual(tensorProductComplexRecursive(v, s), [
				c(3, 1),
				c(-3, -6),
				c(10, 0),
			])

			const vm = tensorProductComplexRecursive(v, M)
			assert.deepStrictEqual(getShape(vm), [3, 2, 2])
			assert.deepStrictEqual(vm[0][0][1], c(-2, 2))

			const mv = tensorProductComplexRecursive(M, v)
			assert.deepStrictEqual(getShape(mv), [2, 2, 3])
			assert.deepStrictEqual(mv[1][0][2], c(-6, 2))
		})

		test('odd and non-power-of-two dimensions exercise uneven divide-and-conquer splits', () => {
			const a = [c(1, 1), c(2, -1), c(3, 0), c(0, 4), c(-2, 3)]
			const b = [c(1, -2), c(-1, 1), c(2, 5)]
			const actual = tensorProductComplexRecursive(a, b)
			assert.deepStrictEqual(getShape(actual), [5, 3])
			assert.deepStrictEqual(actual, referenceTensorProductIterative(a, b))
		})
	})

	describe('edge cases', () => {
		test('single-element tensors of various ranks', () => {
			assert.deepStrictEqual(
				tensorProductComplexRecursive([c(2, 3)], [c(4, -5)]),
				[[c(23, 2)]]
			)
			assert.deepStrictEqual(
				tensorProductComplexRecursive([[c(0, 1)]], [[c(0, -1)]]),
				[[[[c(1, 0)]]]]
			)
		})

		test('zero complex numbers normalize -0 to +0', () => {
			const actual = tensorProductComplexRecursive(
				[c(0, 0), c(-0, 0)],
				[c(-1, 2), c(0, -3)]
			)
			for (const row of actual) {
				for (const entry of row) {
					assert.strictEqual(Object.is(entry.re, 0), true)
					assert.strictEqual(Object.is(entry.im, 0), true)
				}
			}
		})

		test('purely real and purely imaginary inputs', () => {
			const realVec = [c(2, 0), c(-3, 0)]
			const imagVec = [c(0, 4), c(0, -5)]
			assert.deepStrictEqual(tensorProductComplexRecursive(realVec, imagVec), [
				[c(0, 8), c(0, -10)],
				[c(0, -12), c(0, 15)],
			])
		})

		test('does not mutate inputs and produces fresh independent output objects', () => {
			const a = [c(1, 2), c(3, 4)]
			const b = [c(5, 6)]
			const aSnapshot = structuredClone(a)
			const bSnapshot = structuredClone(b)

			const out = tensorProductComplexRecursive(a, b)
			assert.deepStrictEqual(a, aSnapshot)
			assert.deepStrictEqual(b, bSnapshot)

			out[0][0].re = 999
			assert.deepStrictEqual(a, aSnapshot)
			assert.deepStrictEqual(b, bSnapshot)
			assert.notStrictEqual(out[0][0], out[1][0])
		})

		test('larger tensors exercise deeper divide-and-conquer recursion', () => {
			const a = Array.from({ length: 23 }, (_, i) => c(i - 11, (i % 5) - 2))
			const b = Array.from({ length: 19 }, (_, j) => c((j % 7) - 3, j - 9))
			const actual = tensorProductComplexRecursive(a, b)
			assert.deepStrictEqual(getShape(actual), [23, 19])
			assert.deepStrictEqual(actual, referenceTensorProductIterative(a, b))
		})
	})

	describe('invalid input errors', () => {
		test('rejects non-complex primitives and null/undefined', () => {
			const valid = [c(1, 0)]
			for (const bad of [null, undefined, 42, '1+2i', true, Symbol('x')]) {
				assert.throws(
					() => tensorProductComplexRecursive(bad, valid),
					TypeError
				)
				assert.throws(
					() => tensorProductComplexRecursive(valid, bad),
					TypeError
				)
			}
		})

		test('rejects malformed complex objects and non-finite components', () => {
			const valid = c(1, 1)
			const malformed = [
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 0 },
				{ re: 1, im: null },
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 1 },
				{ re: 1, im: -Infinity },
			]
			for (const bad of malformed) {
				assert.throws(
					() => tensorProductComplexRecursive(bad, valid),
					TypeError
				)
				assert.throws(
					() => tensorProductComplexRecursive(valid, [bad]),
					TypeError
				)
			}
		})

		test('rejects empty arrays and nested empty dimensions', () => {
			const valid = [c(1, 0)]
			for (const empty of [[], [[]], [[c(1, 0)], []]]) {
				assert.throws(
					() => tensorProductComplexRecursive(empty, valid),
					RangeError
				)
				assert.throws(
					() => tensorProductComplexRecursive(valid, empty),
					RangeError
				)
			}
		})

		test('rejects ragged / non-rectangular arrays and mixed ranks', () => {
			const valid = [c(1, 0)]
			const raggedCases = [
				[[c(1, 0), c(2, 0)], [c(3, 0)]],
				[c(1, 0), [c(2, 0)]],
				[[[c(1, 0)]], [c(2, 0)]],
			]
			for (const bad of raggedCases) {
				assert.throws(
					() => tensorProductComplexRecursive(bad, valid),
					RangeError
				)
				assert.throws(
					() => tensorProductComplexRecursive(valid, bad),
					RangeError
				)
			}
		})

		test('rejects sparse arrays with holes', () => {
			const sparseLeading = new Array(2)
			sparseLeading[1] = c(1, 0)

			const sparseMiddle = [c(1, 0), undefined, c(2, 0)]
			delete sparseMiddle[1]

			assert.throws(
				() => tensorProductComplexRecursive(sparseLeading, c(1, 0)),
				TypeError
			)
			assert.throws(
				() => tensorProductComplexRecursive(c(1, 0), sparseMiddle),
				TypeError
			)
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		test('matches independent iterative flat-index implementation across higher-rank tensors', () => {
			const t3 = [
				[
					[c(1.5, -0.5), c(0.25, 2.0)],
					[c(-1.0, 0.75), c(3.25, -1.25)],
				],
				[
					[c(0.0, -2.5), c(4.0, 0.5)],
					[c(-0.5, -0.5), c(1.0, 1.0)],
				],
			]
			const t2 = [
				[c(0.5, 1.5), c(-2.0, 0.25), c(1.25, -0.75)],
				[c(3.0, -1.0), c(0.0, 0.0), c(-1.5, 2.25)],
			]

			const actual = tensorProductComplexRecursive(t3, t2)
			const expected = referenceTensorProductIterative(t3, t2)
			assert.deepStrictEqual(getShape(actual), [2, 2, 2, 2, 3])
			assertComplexTensorsClose(actual, expected)
		})

		test('satisfies associativity: (A ⊗ B) ⊗ C === A ⊗ (B ⊗ C)', () => {
			const A = [c(1, -2), c(3, 1)]
			const B = [
				[c(0, 1), c(2, -1)],
				[c(-1, 3), c(4, 0)],
			]
			const C = [c(-2, 1), c(1, 1), c(0, -3)]

			const lhs = tensorProductComplexRecursive(
				tensorProductComplexRecursive(A, B),
				C
			)
			const rhs = tensorProductComplexRecursive(
				A,
				tensorProductComplexRecursive(B, C)
			)
			assert.deepStrictEqual(lhs, rhs)
		})

		test('satisfies bilinearity: (αA + βB) ⊗ C = α(A ⊗ C) + β(B ⊗ C) and right linearity', () => {
			const alpha = c(2, -3)
			const beta = c(-1, 4)
			const A = [c(1, 2), c(-3, 1), c(0, 4)]
			const B = [c(2, -1), c(1, 5), c(-2, 0)]
			const C = [
				[c(1, 1), c(-2, 3)],
				[c(0, -1), c(4, 2)],
			]

			const leftCombined = addTensors(
				tensorProductComplexRecursive(alpha, A),
				tensorProductComplexRecursive(beta, B)
			)
			const lhs = tensorProductComplexRecursive(leftCombined, C)
			const rhs = addTensors(
				tensorProductComplexRecursive(
					alpha,
					tensorProductComplexRecursive(A, C)
				),
				tensorProductComplexRecursive(beta, tensorProductComplexRecursive(B, C))
			)
			assert.deepStrictEqual(lhs, rhs)

			const rightCombined = addTensors(
				tensorProductComplexRecursive(alpha, A),
				tensorProductComplexRecursive(beta, B)
			)
			const rLhs = tensorProductComplexRecursive(C, rightCombined)
			const rRhs = addTensors(
				tensorProductComplexRecursive(
					alpha,
					tensorProductComplexRecursive(C, A)
				),
				tensorProductComplexRecursive(beta, tensorProductComplexRecursive(C, B))
			)
			assert.deepStrictEqual(rLhs, rRhs)
		})

		test('satisfies Frobenius norm multiplicativity and complex conjugation', () => {
			const A = [
				[c(1.5, -2.5), c(0.5, 3.0)],
				[c(-1.0, 0.25), c(2.0, -1.5)],
			]
			const B = [c(3.0, 4.0), c(-0.5, 1.25), c(2.5, -0.75)]

			const prod = tensorProductComplexRecursive(A, B)
			const normProd = frobeniusNorm(prod)
			const expectedNorm = frobeniusNorm(A) * frobeniusNorm(B)
			assert.ok(
				Math.abs(normProd - expectedNorm) <= 1e-12,
				`Expected norm ${expectedNorm}, got ${normProd}`
			)

			const conjProd = conjugateTensor(prod)
			const prodConj = tensorProductComplexRecursive(
				conjugateTensor(A),
				conjugateTensor(B)
			)
			assertComplexTensorsClose(conjProd, prodConj)
		})
	})
})
