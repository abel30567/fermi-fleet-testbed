import { test } from 'node:test'
import assert from 'node:assert'
import { tensorProductDualMemo } from './tensorProductDualMemo.js'

/**
 * Helper to create a dual number { v, d }.
 */
const D = (v, d) => ({ v, d })

/**
 * Recursively compare two dual tensors within a numeric tolerance.
 */
function assertDualTensorClose(actual, expected, tol = 1e-9, path = '') {
	if (Array.isArray(expected)) {
		assert.ok(Array.isArray(actual), `Expected array at ${path || 'root'}`)
		assert.strictEqual(actual.length, expected.length, `Length mismatch at ${path || 'root'}`)
		for (let i = 0; i < expected.length; i++) {
			assertDualTensorClose(actual[i], expected[i], tol, `${path}[${i}]`)
		}
		return
	}
	assert.ok(actual && typeof actual === 'object' && !Array.isArray(actual), `Expected dual at ${path || 'root'}`)
	assert.ok(
		Math.abs(actual.v - expected.v) <= tol,
		`Primal mismatch at ${path || 'root'}: got ${actual.v}, expected ${expected.v}`
	)
	assert.ok(
		Math.abs(actual.d - expected.d) <= tol,
		`Derivative mismatch at ${path || 'root'}: got ${actual.d}, expected ${expected.d}`
	)
}

/**
 * Independent naive unmemoized recursive tensor product over dual numbers.
 */
function naiveTensorProductDual(a, b) {
	if (Array.isArray(a)) {
		return a.map((item) => naiveTensorProductDual(item, b))
	}
	if (Array.isArray(b)) {
		return b.map((item) => naiveTensorProductDual(a, item))
	}
	const v = a.v * b.v
	const d = a.v * b.d + a.d * b.v
	return { v: v === 0 ? 0 : v, d: d === 0 ? 0 : d }
}

/**
 * Independent scalar-only tensor product (for numerical finite-difference cross-checks).
 */
function scalarTensorProduct(a, b) {
	if (Array.isArray(a)) {
		return a.map((item) => scalarTensorProduct(item, b))
	}
	if (Array.isArray(b)) {
		return b.map((item) => scalarTensorProduct(a, item))
	}
	return a * b
}

/**
 * Elementwise dual tensor addition (for bilinearity checks).
 */
function addDualTensors(x, y) {
	if (Array.isArray(x)) {
		return x.map((item, i) => addDualTensors(item, y[i]))
	}
	return { v: x.v + y.v, d: x.d + y.d }
}

test('0D dual scalar × 0D dual scalar follows product rule', () => {
	// (3 + 2ε) * (5 + 7ε) = 15 + (21 + 10)ε = 15 + 31ε
	const res = tensorProductDualMemo(D(3, 2), D(5, 7))
	assert.deepStrictEqual(res, D(15, 31))
})

test('1D vector × 1D vector produces 2D outer product with forward derivatives', () => {
	const a = [D(2, 1), D(-3, 4)]
	const b = [D(5, -2), D(0, 3), D(1, 0)]
	const expected = [
		[D(10, 1), D(0, 6), D(2, 1)],
		[D(-15, 26), D(0, -9), D(-3, 4)],
	]
	const actual = tensorProductDualMemo(a, b)
	assert.deepStrictEqual(actual, expected)
})

test('0D scalar × 1D vector and 1D vector × 0D scalar', () => {
	const s = D(4, -1)
	const v = [D(2, 3), D(-5, 0.5)]

	const left = tensorProductDualMemo(s, v)
	const right = tensorProductDualMemo(v, s)

	assert.deepStrictEqual(left, [D(8, 10), D(-20, 7)])
	assert.deepStrictEqual(right, [D(8, 10), D(-20, 7)])
})

test('2D matrix × 1D vector and 2D matrix × 2D matrix higher-order tensors', () => {
	const m1 = [
		[D(1, 2), D(3, -1)],
		[D(-2, 0.5), D(4, 1)],
	]
	const v = [D(2, 1), D(-1, 3)]
	const m2 = [
		[D(0.5, 1), D(2, 0)],
		[D(-1, 2), D(3, -0.5)],
	]

	const res3D = tensorProductDualMemo(m1, v)
	assert.deepStrictEqual(res3D, naiveTensorProductDual(m1, v))

	const res4D = tensorProductDualMemo(m1, m2)
	assert.deepStrictEqual(res4D, naiveTensorProductDual(m1, m2))
})

test('empty tensor edge cases preserve expected nested structure', () => {
	const v = [D(1, 2), D(3, 4)]
	assert.deepStrictEqual(tensorProductDualMemo([], v), [])
	assert.deepStrictEqual(tensorProductDualMemo(v, []), [[], []])
	assert.deepStrictEqual(tensorProductDualMemo([], []), [])
	assert.deepStrictEqual(tensorProductDualMemo([[]], [D(2, 1)]), [[]])
	assert.deepStrictEqual(tensorProductDualMemo([D(2, 1)], [[]]), [[[]]])
})

test('normalizes -0 to +0 in both value and derivative', () => {
	const res = tensorProductDualMemo([D(-0, 0), D(-2, 0)], [D(0, -0)])
	assert.ok(Object.is(res[0][0].v, 0))
	assert.ok(Object.is(res[0][0].d, 0))
	assert.ok(Object.is(res[1][0].v, 0))
	assert.ok(Object.is(res[1][0].d, 0))
})

test('memoization returns independent clones and matches uncached execution', () => {
	const a = [D(2, 1), D(2, 1), D(3, -1)]
	const b = [D(4, 2), D(4, 2)]

	const first = tensorProductDualMemo(a, b)
	const second = tensorProductDualMemo(a, b)
	const uncached = tensorProductDualMemo(a, b, { useCache: false })

	assert.deepStrictEqual(first, second)
	assert.deepStrictEqual(first, uncached)

	// Mutating the first returned tensor must not poison the memoized cache.
	first[0][0].v = 999999
	first[0][0].d = -999999
	first[0] = []

	const third = tensorProductDualMemo(a, b)
	assert.deepStrictEqual(third, uncached)
	assert.strictEqual(third[0][0].v, 8)
	assert.strictEqual(third[0][0].d, 8)
})

test('independent cross-check: central finite differences match forward-mode derivatives', () => {
	// Parameterized smooth tensors A(t) (2x2) and B(t) (length 3)
	const evalA = (t) => [
		[Math.sin(1.3 * t) + t * t, Math.exp(0.4 * t)],
		[Math.cos(0.7 * t), 2 * t - 3],
	]
	const derivA = (t) => [
		[1.3 * Math.cos(1.3 * t) + 2 * t, 0.4 * Math.exp(0.4 * t)],
		[-0.7 * Math.sin(0.7 * t), 2],
	]

	const evalB = (t) => [Math.cos(1.1 * t) + 1, t * t * t - t, Math.exp(-0.5 * t)]
	const derivB = (t) => [-1.1 * Math.sin(1.1 * t), 3 * t * t - 1, -0.5 * Math.exp(-0.5 * t)]

	const t0 = 0.85
	const h = 1e-6

	const aVal = evalA(t0)
	const aDer = derivA(t0)
	const bVal = evalB(t0)
	const bDer = derivB(t0)

	const aDual = aVal.map((row, i) => row.map((v, j) => D(v, aDer[i][j])))
	const bDual = bVal.map((v, k) => D(v, bDer[k]))

	const dualProd = tensorProductDualMemo(aDual, bDual)

	const prodCenter = scalarTensorProduct(evalA(t0), evalB(t0))
	const prodPlus = scalarTensorProduct(evalA(t0 + h), evalB(t0 + h))
	const prodMinus = scalarTensorProduct(evalA(t0 - h), evalB(t0 - h))

	for (let i = 0; i < 2; i++) {
		for (let j = 0; j < 2; j++) {
			for (let k = 0; k < 3; k++) {
				const numDeriv = (prodPlus[i][j][k] - prodMinus[i][j][k]) / (2 * h)
				assert.ok(
					Math.abs(dualProd[i][j][k].v - prodCenter[i][j][k]) < 1e-12,
					`Primal mismatch at [${i}][${j}][${k}]`
				)
				assert.ok(
					Math.abs(dualProd[i][j][k].d - numDeriv) < 1e-7,
					`Derivative mismatch at [${i}][${j}][${k}]: dual=${dualProd[i][j][k].d}, fd=${numDeriv}`
				)
			}
		}
	}
})

test('independent cross-check: bilinearity and associativity over dual numbers', () => {
	const a1 = [D(1.5, -0.5), D(2, 3)]
	const a2 = [D(-0.5, 2), D(4, -1)]
	const b1 = [D(3, 1), D(-2, 0.25)]
	const b2 = [D(0.5, -1.5), D(1, 2)]
	const c = [D(-1, 2), D(2.5, -0.5)]

	// Left distributivity: (a1 + a2) ⊗ b1 === (a1 ⊗ b1) + (a2 ⊗ b1)
	const lhsLeft = tensorProductDualMemo(addDualTensors(a1, a2), b1)
	const rhsLeft = addDualTensors(tensorProductDualMemo(a1, b1), tensorProductDualMemo(a2, b1))
	assertDualTensorClose(lhsLeft, rhsLeft)

	// Right distributivity: a1 ⊗ (b1 + b2) === (a1 ⊗ b1) + (a1 ⊗ b2)
	const lhsRight = tensorProductDualMemo(a1, addDualTensors(b1, b2))
	const rhsRight = addDualTensors(tensorProductDualMemo(a1, b1), tensorProductDualMemo(a1, b2))
	assertDualTensorClose(lhsRight, rhsRight)

	// Associativity: (a1 ⊗ b1) ⊗ c === a1 ⊗ (b1 ⊗ c)
	const assocLeft = tensorProductDualMemo(tensorProductDualMemo(a1, b1), c)
	const assocRight = tensorProductDualMemo(a1, tensorProductDualMemo(b1, c))
	assertDualTensorClose(assocLeft, assocRight)
})

test('input validation rejects invalid dual numbers, ragged tensors, sparse arrays, and bad options', () => {
	assert.throws(() => tensorProductDualMemo(null, D(1, 0)), TypeError)
	assert.throws(() => tensorProductDualMemo(D(1, 0), undefined), TypeError)
	assert.throws(() => tensorProductDualMemo(5, D(1, 0)), TypeError)
	assert.throws(() => tensorProductDualMemo({ v: 1 }, D(1, 0)), TypeError)
	assert.throws(() => tensorProductDualMemo({ v: NaN, d: 1 }, D(1, 0)), TypeError)
	assert.throws(() => tensorProductDualMemo({ v: 1, d: Infinity }, D(1, 0)), TypeError)
	assert.throws(() => tensorProductDualMemo([D(1, 0)], [{ v: -Infinity, d: 0 }]), TypeError)

	// Ragged tensors (inconsistent inner sizes or mixed depths)
	assert.throws(() => tensorProductDualMemo([[D(1, 0), D(2, 0)], [D(3, 0)]], [D(1, 0)]), RangeError)
	assert.throws(() => tensorProductDualMemo([D(1, 0), [D(2, 0)]], [D(1, 0)]), RangeError)

	// Sparse arrays
	const sparse = new Array(2)
	sparse[0] = D(1, 0)
	assert.throws(() => tensorProductDualMemo(sparse, [D(1, 0)]), TypeError)

	// Invalid options
	assert.throws(() => tensorProductDualMemo(D(1, 0), D(2, 0), null), TypeError)
	assert.throws(() => tensorProductDualMemo(D(1, 0), D(2, 0), []), TypeError)
	assert.throws(() => tensorProductDualMemo(D(1, 0), D(2, 0), { useCache: 'yes' }), TypeError)
})
