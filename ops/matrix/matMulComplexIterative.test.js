import { describe, test } from 'node:test'
import assert from 'node:assert'
import { matMulComplexIterative } from './matMulComplexIterative.js'

const c = (re, im = 0) => ({ re, im })

function assertComplexMatrixClose(actual, expected, eps = 1e-10) {
	assert.strictEqual(actual.length, expected.length, 'row count mismatch')
	for (let i = 0; i < expected.length; i++) {
		assert.strictEqual(
			actual[i].length,
			expected[i].length,
			`col count mismatch at row ${i}`
		)
		for (let j = 0; j < expected[i].length; j++) {
			const a = actual[i][j]
			const e = expected[i][j]
			assert.ok(
				Math.abs(a.re - e.re) <= eps,
				`re mismatch at [${i}][${j}]: got ${a.re}, expected ${e.re}`
			)
			assert.ok(
				Math.abs(a.im - e.im) <= eps,
				`im mismatch at [${i}][${j}]: got ${a.im}, expected ${e.im}`
			)
		}
	}
}

/**
 * Independent real-block isomorphism representation of a complex matrix Z = X + iY:
 *   R(Z) = [[ X, -Y ],
 *           [ Y,  X ]]
 * Matrix multiplication of complex matrices satisfies R(A * B) = R(A) * R(B).
 */
function toRealBlockMatrix(z) {
	const m = z.length
	const n = z[0].length
	const block = Array.from({ length: 2 * m }, () => new Array(2 * n).fill(0))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			block[i][j] = z[i][j].re
			block[i][j + n] = -z[i][j].im
			block[i + m][j] = z[i][j].im
			block[i + m][j + n] = z[i][j].re
		}
	}
	return block
}

function realMatMul(a, b) {
	const m = a.length
	const k = a[0].length
	const n = b[0].length
	const out = Array.from({ length: m }, () => new Array(n).fill(0))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0
			for (let p = 0; p < k; p++) {
				sum += a[i][p] * b[p][j]
			}
			out[i][j] = sum
		}
	}
	return out
}

function fromRealBlockMatrix(block) {
	const m = block.length / 2
	const n = block[0].length / 2
	return Array.from({ length: m }, (_, i) =>
		Array.from({ length: n }, (_, j) => ({
			re: block[i][j],
			im: block[i + m][j]
		}))
	)
}

function conjugateTranspose(mat) {
	const m = mat.length
	const n = mat[0].length
	return Array.from({ length: n }, (_, j) =>
		Array.from({ length: m }, (_, i) => ({
			re: mat[i][j].re,
			im: -mat[i][j].im
		}))
	)
}

function makeSeededRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (1664525 * state + 1013904223) >>> 0
		return (state / 0x100000000) * 20 - 10
	}
}

function randomComplexMatrix(rows, cols, rng) {
	return Array.from({ length: rows }, () =>
		Array.from({ length: cols }, () => ({
			re: Math.round(rng() * 100) / 100,
			im: Math.round(rng() * 100) / 100
		}))
	)
}

describe('matMulComplexIterative', () => {
	test('multiplies 2x2 complex matrices accurately', () => {
		const a = [
			[c(1, 2), c(3, -1)],
			[c(0, 4), c(2, 1)]
		]
		const b = [
			[c(2, 1), c(-1, 3)],
			[c(4, -2), c(1, 0)]
		]
		// [0][0] = (1+2i)(2+i) + (3-i)(4-2i) = (0+5i) + (10-10i) = 10 - 5i
		// [0][1] = (1+2i)(-1+3i) + (3-i)(1) = (-7+i) + (3-i) = -4 + 0i
		// [1][0] = (4i)(2+i) + (2+i)(4-2i) = (-4+8i) + (10+0i) = 6 + 8i
		// [1][1] = (4i)(-1+3i) + (2+i)(1) = (-12-4i) + (2+i) = -10 - 3i
		const expected = [
			[c(10, -5), c(-4, 0)],
			[c(6, 8), c(-10, -3)]
		]
		assert.deepStrictEqual(matMulComplexIterative(a, b), expected)
	})

	test('multiplies rectangular matrices (2x3 by 3x2)', () => {
		const a = [
			[c(1, 1), c(2, 0), c(0, -1)],
			[c(-1, 2), c(0, 3), c(1, 1)]
		]
		const b = [
			[c(1, -1), c(0, 2)],
			[c(3, 1), c(-2, 1)],
			[c(0, 4), c(1, -1)]
		]
		// [0][0] = (1+i)(1-i) + 2(3+i) + (-i)(4i) = 2 + (6+2i) + 4 = 12 + 2i
		// [0][1] = (1+i)(2i) + 2(-2+i) + (-i)(1-i) = (-2+2i) + (-4+2i) + (-1-i) = -7 + 3i
		// [1][0] = (-1+2i)(1-i) + (3i)(3+i) + (1+i)(4i) = (1+3i) + (-3+9i) + (-4+4i) = -6 + 16i
		// [1][1] = (-1+2i)(2i) + (3i)(-2+i) + (1+i)(1-i) = (-4-2i) + (-3-6i) + 2 = -5 - 8i
		const expected = [
			[c(12, 2), c(-7, 3)],
			[c(-6, 16), c(-5, -8)]
		]
		assert.deepStrictEqual(matMulComplexIterative(a, b), expected)
	})

	test('handles 1x1 complex multiplication including i * i = -1', () => {
		assert.deepStrictEqual(
			matMulComplexIterative([[c(0, 1)]], [[c(0, 1)]]),
			[[c(-1, 0)]]
		)
		assert.deepStrictEqual(
			matMulComplexIterative([[c(3, 4)]], [[c(3, -4)]]),
			[[c(25, 0)]]
		)
	})

	test('handles inner product (1xN * Nx1) and outer product (Mx1 * 1xN)', () => {
		const row = [[c(1, 2), c(3, -4)]]
		const col = [[c(1, -2)], [c(3, 4)]]
		// |1+2i|^2 + |3-4i|^2 = 5 + 25 = 30
		assert.deepStrictEqual(matMulComplexIterative(row, col), [[c(30, 0)]])

		const outer = matMulComplexIterative(col, row)
		assert.deepStrictEqual(outer, [
			[c(5, 0), c(-5, -10)],
			[c(-5, 10), c(25, 0)]
		])
	})

	test('identity and zero matrix edge cases', () => {
		const identity = [
			[c(1, 0), c(0, 0)],
			[c(0, 0), c(1, 0)]
		]
		const zero = [
			[c(0, 0), c(0, 0)],
			[c(0, 0), c(0, 0)]
		]
		const m = [
			[c(-3.5, 2.25), c(0, -1)],
			[c(7, 0), c(-0.5, -0.5)]
		]

		assert.deepStrictEqual(matMulComplexIterative(identity, m), m)
		assert.deepStrictEqual(matMulComplexIterative(m, identity), m)
		assert.deepStrictEqual(matMulComplexIterative(zero, m), zero)
		assert.deepStrictEqual(matMulComplexIterative(m, zero), zero)
	})

	test('normalizes -0 to +0 and does not mutate input matrices', () => {
		const a = [[c(-0, 0), c(1, 0)]]
		const b = [[c(1, 0)], [c(0, -0)]]
		const aSnapshot = structuredClone(a)
		const bSnapshot = structuredClone(b)

		const out = matMulComplexIterative(a, b)
		assert.ok(Object.is(out[0][0].re, 0))
		assert.ok(Object.is(out[0][0].im, 0))
		assert.deepStrictEqual(a, aSnapshot)
		assert.deepStrictEqual(b, bSnapshot)
	})

	test('satisfies Pauli and unitary matrix identities (independent cross-check)', () => {
		// Pauli matrices: sigma_x * sigma_y = i * sigma_z
		const sx = [
			[c(0, 0), c(1, 0)],
			[c(1, 0), c(0, 0)]
		]
		const sy = [
			[c(0, 0), c(0, -1)],
			[c(0, 1), c(0, 0)]
		]
		const iSz = [
			[c(0, 1), c(0, 0)],
			[c(0, 0), c(0, -1)]
		]
		assert.deepStrictEqual(matMulComplexIterative(sx, sy), iSz)

		// 4x4 normalized DFT matrix F is unitary: F^H * F = I_4
		const n = 4
		const scale = 1 / Math.sqrt(n)
		const dft = Array.from({ length: n }, (_, row) =>
			Array.from({ length: n }, (_, col) => {
				const angle = (-2 * Math.PI * row * col) / n
				return c(scale * Math.cos(angle), scale * Math.sin(angle))
			})
		)
		const identity4 = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => c(i === j ? 1 : 0, 0))
		)
		assertComplexMatrixClose(
			matMulComplexIterative(conjugateTranspose(dft), dft),
			identity4
		)
	})

	test('cross-checks against independent real-block matrix isomorphism', () => {
		const rng = makeSeededRng(20261123)
		const shapes = [
			[1, 1, 1],
			[2, 3, 4],
			[4, 4, 4],
			[5, 2, 3],
			[3, 6, 1]
		]

		for (const [m, k, n] of shapes) {
			const a = randomComplexMatrix(m, k, rng)
			const b = randomComplexMatrix(k, n, rng)

			const complexProd = matMulComplexIterative(a, b)
			const blockProd = realMatMul(
				toRealBlockMatrix(a),
				toRealBlockMatrix(b)
			)
			const expected = fromRealBlockMatrix(blockProd)

			assertComplexMatrixClose(complexProd, expected)
		}
	})

	test('satisfies associativity (AB)C = A(BC) and conjugate-transpose (AB)^H = B^H A^H', () => {
		const rng = makeSeededRng(42)
		const a = randomComplexMatrix(3, 4, rng)
		const b = randomComplexMatrix(4, 2, rng)
		const d = randomComplexMatrix(2, 5, rng)

		const leftAssoc = matMulComplexIterative(
			matMulComplexIterative(a, b),
			d
		)
		const rightAssoc = matMulComplexIterative(
			a,
			matMulComplexIterative(b, d)
		)
		assertComplexMatrixClose(leftAssoc, rightAssoc)

		const abH = conjugateTranspose(matMulComplexIterative(a, b))
		const bHaH = matMulComplexIterative(
			conjugateTranspose(b),
			conjugateTranspose(a)
		)
		assertComplexMatrixClose(abH, bHaH)
	})

	test('rejects invalid matrix containers and dimensions', () => {
		const valid1x1 = [[c(1, 0)]]

		assert.throws(() => matMulComplexIterative(null, valid1x1), TypeError)
		assert.throws(
			() => matMulComplexIterative(valid1x1, undefined),
			TypeError
		)
		assert.throws(
			() => matMulComplexIterative('matrix', valid1x1),
			TypeError
		)
		assert.throws(() => matMulComplexIterative([c(1, 0)], valid1x1), TypeError)
		assert.throws(() => matMulComplexIterative([], valid1x1), RangeError)
		assert.throws(() => matMulComplexIterative([[]], valid1x1), RangeError)
		assert.throws(() => matMulComplexIterative(valid1x1, [[]]), RangeError)

		// Ragged rows
		assert.throws(
			() =>
				matMulComplexIterative(
					[[c(1, 0), c(2, 0)], [c(3, 0)]],
					[[c(1, 0)], [c(2, 0)]]
				),
			RangeError
		)

		// Incompatible inner dimensions (2x3 * 2x2)
		assert.throws(
			() =>
				matMulComplexIterative(
					[
						[c(1, 0), c(2, 0), c(3, 0)],
						[c(4, 0), c(5, 0), c(6, 0)]
					],
					[
						[c(1, 0), c(0, 0)],
						[c(0, 0), c(1, 0)]
					]
				),
			RangeError
		)
	})

	test('rejects invalid complex entries and non-finite numbers', () => {
		const valid1x1 = [[c(1, 0)]]

		// Non-object / null / array / sparse entries
		assert.throws(() => matMulComplexIterative([[null]], valid1x1), TypeError)
		assert.throws(() => matMulComplexIterative([[1]], valid1x1), TypeError)
		assert.throws(
			() => matMulComplexIterative([[[1, 2]]], valid1x1),
			TypeError
		)
		const sparseRow = new Array(1)
		assert.throws(
			() => matMulComplexIterative([sparseRow], valid1x1),
			TypeError
		)

		// Missing or non-numeric re/im
		assert.throws(
			() => matMulComplexIterative([[{ re: 1 }]], valid1x1),
			TypeError
		)
		assert.throws(
			() => matMulComplexIterative([[{ im: 1 }]], valid1x1),
			TypeError
		)
		assert.throws(
			() => matMulComplexIterative([[{ re: '1', im: 0 }]], valid1x1),
			TypeError
		)

		// Non-finite re/im
		assert.throws(
			() => matMulComplexIterative([[c(NaN, 0)]], valid1x1),
			RangeError
		)
		assert.throws(
			() => matMulComplexIterative([[c(0, Infinity)]], valid1x1),
			RangeError
		)
		assert.throws(
			() => matMulComplexIterative(valid1x1, [[c(-Infinity, 0)]]),
			RangeError
		)
	})
})
