import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { transposeRationalRecursive } from './transposeRationalRecursive.js'

const r = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		;[x, y] = [y, x % y]
	}
	return x
}

function assertLowestTerms(entry, context = '') {
	assert.equal(typeof entry.num, 'bigint', `${context} num must be bigint`)
	assert.equal(typeof entry.den, 'bigint', `${context} den must be bigint`)
	assert.ok(entry.den > 0n, `${context} den must be > 0n, got ${entry.den}`)
	if (entry.num === 0n) {
		assert.equal(entry.den, 1n, `${context} zero must have den === 1n`)
	} else {
		assert.equal(
			gcd(entry.num, entry.den),
			1n,
			`${context} rational ${entry.num}/${entry.den} must be in lowest terms`,
		)
	}
}

function assertMatrixLowestTerms(matrix) {
	for (let i = 0; i < matrix.length; i++) {
		for (let j = 0; j < matrix[i].length; j++) {
			assertLowestTerms(matrix[i][j], `[${i}][${j}]`)
		}
	}
}

function normalizeRef(entry) {
	if (entry.num === 0n) return { num: 0n, den: 1n }
	const num = entry.den < 0n ? -entry.num : entry.num
	const den = entry.den < 0n ? -entry.den : entry.den
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

function iterativeTransposeRef(matrix) {
	if (matrix.length === 0 || matrix[0].length === 0) return []
	const rows = matrix.length
	const cols = matrix[0].length
	const out = []
	for (let c = 0; c < cols; c++) {
		const row = []
		for (let i = 0; i < rows; i++) {
			row.push(normalizeRef(matrix[i][c]))
		}
		out.push(row)
	}
	return out
}

function addRational(a, b) {
	return normalizeRef({ num: a.num * b.den + b.num * a.den, den: a.den * b.den })
}

function mulRational(a, b) {
	return normalizeRef({ num: a.num * b.num, den: a.den * b.den })
}

function matMulRef(A, B) {
	const m = A.length
	const k = A[0].length
	const n = B[0].length
	const C = Array.from({ length: m }, () => new Array(n))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = { num: 0n, den: 1n }
			for (let t = 0; t < k; t++) {
				sum = addRational(sum, mulRational(A[i][t], B[t][j]))
			}
			C[i][j] = sum
		}
	}
	return C
}

describe('transposeRationalRecursive', () => {
	it('transposes a 2x3 rectangular matrix and normalizes rationals', () => {
		const M = [
			[r(1, 2), r(-4, 6), r(0, -5)],
			[r(6, -9), r(-10, -15), r(7, 1)],
		]
		const T = transposeRationalRecursive(M)

		assert.deepEqual(T, [
			[r(1, 2), r(-2, 3)],
			[r(-2, 3), r(2, 3)],
			[r(0, 1), r(7, 1)],
		])
		assertMatrixLowestTerms(T)
	})

	it('transposes a 3x2 rectangular matrix', () => {
		const M = [
			[r(3, 4), r(5, 6)],
			[r(-7, 8), r(9, 10)],
			[r(11, 12), r(-13, 14)],
		]
		const T = transposeRationalRecursive(M)

		assert.deepEqual(T, [
			[r(3, 4), r(-7, 8), r(11, 12)],
			[r(5, 6), r(9, 10), r(-13, 14)],
		])
		assertMatrixLowestTerms(T)
	})

	it('transposes a 1x1 matrix', () => {
		const M = [[r(-12, -18)]]
		const T = transposeRationalRecursive(M)
		assert.deepEqual(T, [[r(2, 3)]])
		assertMatrixLowestTerms(T)
	})

	it('transposes row vectors (1 x n) and column vectors (m x 1)', () => {
		const rowVec = [[r(1, 3), r(2, 4), r(-3, -9), r(0, 8), r(5, -10)]]
		const colVec = transposeRationalRecursive(rowVec)

		assert.deepEqual(colVec, [
			[r(1, 3)],
			[r(1, 2)],
			[r(1, 3)],
			[r(0, 1)],
			[r(-1, 2)],
		])
		assertMatrixLowestTerms(colVec)

		const backToRow = transposeRationalRecursive(colVec)
		assert.deepEqual(backToRow, [[r(1, 3), r(1, 2), r(1, 3), r(0, 1), r(-1, 2)]])
		assertMatrixLowestTerms(backToRow)
	})

	it('handles empty matrices [] and zero-column rectangular matrices', () => {
		assert.deepEqual(transposeRationalRecursive([]), [])
		assert.deepEqual(transposeRationalRecursive([[]]), [])
		assert.deepEqual(transposeRationalRecursive([[], [], []]), [])
	})

	it('handles zeros, negative denominators, and unreduced entries cleanly', () => {
		const M = [
			[r(0, 1), r(0, -1), r(0, 999999999999n)],
			[r(100, -250), r(-100, -250), r(-100, 250)],
		]
		const T = transposeRationalRecursive(M)
		assert.deepEqual(T, [
			[r(0, 1), r(-2, 5)],
			[r(0, 1), r(2, 5)],
			[r(0, 1), r(-2, 5)],
		])
		assertMatrixLowestTerms(T)
	})

	it('handles very large BigInts accurately without precision loss', () => {
		const p1 = (1n << 127n) - 1n // Mersenne prime M127
		const p2 = (1n << 89n) - 1n // Mersenne prime M89
		const common = (1n << 61n) - 1n // Mersenne prime M61

		const M = [
			[
				{ num: p1 * common, den: p2 * common },
				{ num: -(p2 * common), den: -(p1 * common) },
			],
			[
				{ num: 0n, den: -p1 },
				{ num: p1 * 42n, den: -p2 * 42n },
			],
		]

		const T = transposeRationalRecursive(M)
		assert.deepEqual(T, [
			[
				{ num: p1, den: p2 },
				{ num: 0n, den: 1n },
			],
			[
				{ num: p2, den: p1 },
				{ num: -p1, den: p2 },
			],
		])
		assertMatrixLowestTerms(T)
	})

	it('does not mutate the input matrix or alias rational objects', () => {
		const e00 = { num: 4n, den: 8n }
		const e01 = { num: -6n, den: -9n }
		const M = [[e00, e01]]

		const T = transposeRationalRecursive(M)

		// Input entries must remain untouched
		assert.deepEqual(M, [[{ num: 4n, den: 8n }, { num: -6n, den: -9n }]])
		assert.notEqual(T[0][0], e00)
		assert.notEqual(T[1][0], e01)

		// Mutating input after transpose must not affect output
		e00.num = 999n
		assert.deepEqual(T[0][0], { num: 1n, den: 2n })
	})

	it('satisfies involution identity: transpose(transpose(M)) === normalized(M)', () => {
		const shapes = [
			[1, 1],
			[1, 7],
			[7, 1],
			[4, 4],
			[5, 8],
			[9, 6],
			[13, 17],
		]

		for (const [rows, cols] of shapes) {
			const M = Array.from({ length: rows }, (_, i) =>
				Array.from({ length: cols }, (_, j) => ({
					num: BigInt((i - 3) * (j + 2) * 6),
					den: BigInt(((i + j) % 2 === 0 ? 1 : -1) * (j + 3) * 6),
				})),
			)

			const T = transposeRationalRecursive(M)
			assert.equal(T.length, cols)
			assert.equal(T[0].length, rows)
			assertMatrixLowestTerms(T)

			const TT = transposeRationalRecursive(T)
			const expectedNormalized = M.map((row) => row.map(normalizeRef))
			assert.deepEqual(TT, expectedNormalized)
		}
	})

	it('matches an independent iterative reference on large non-power-of-two matrices', () => {
		const testShapes = [
			[17, 23],
			[33, 19],
			[32, 32],
		]

		for (const [rows, cols] of testShapes) {
			const M = Array.from({ length: rows }, (_, i) =>
				Array.from({ length: cols }, (_, j) => ({
					num: BigInt(((i * 31 + j * 17) % 97) - 48) * 12n,
					den: BigInt(((i + j) % 3 === 0 ? -1 : 1) * ((i * 7 + j * 13) % 41 + 1)) * 12n,
				})),
			)

			const actual = transposeRationalRecursive(M)
			const expected = iterativeTransposeRef(M)

			assert.deepEqual(actual, expected)
			assertMatrixLowestTerms(actual)
		}
	})

	it('satisfies algebraic product identity: (A * B)^T === B^T * A^T', () => {
		const A = [
			[r(2, 6), r(-3, 4), r(5, -10), r(0, 3)],
			[r(7, 3), r(1, 2), r(-4, -8), r(9, 12)],
			[r(-5, 6), r(2, -3), r(11, 5), r(-1, 4)],
		]
		const B = [
			[r(3, 5), r(-2, 7)],
			[r(4, -6), r(5, 2)],
			[r(0, -9), r(-3, -9)],
			[r(8, 4), r(1, 3)],
		]

		const lhs = transposeRationalRecursive(matMulRef(A, B))
		const rhs = matMulRef(
			transposeRationalRecursive(B),
			transposeRationalRecursive(A),
		)

		assert.deepEqual(lhs, rhs)
		assertMatrixLowestTerms(lhs)
	})

	it('throws TypeError for non-array matrix or non-array rows', () => {
		for (const bad of [null, undefined, 42, 'matrix', {}, new Set()]) {
			assert.throws(() => transposeRationalRecursive(bad), TypeError)
		}

		assert.throws(() => transposeRationalRecursive([1, 2]), TypeError)
		assert.throws(() => transposeRationalRecursive([[r(1, 2)], null]), TypeError)
		assert.throws(() => transposeRationalRecursive([[r(1, 2)], 'row']), TypeError)
		// Sparse outer array (hole at index 0)
		assert.throws(() => transposeRationalRecursive(new Array(2)), TypeError)
	})

	it('throws RangeError for ragged (non-rectangular) matrices', () => {
		assert.throws(
			() => transposeRationalRecursive([[r(1, 2), r(3, 4)], [r(5, 6)]]),
			RangeError,
		)
		assert.throws(
			() => transposeRationalRecursive([[], [r(1, 2)]]),
			RangeError,
		)
		assert.throws(
			() => transposeRationalRecursive([[r(1, 2)], [r(3, 4), r(5, 6)]]),
			RangeError,
		)
	})

	it('throws TypeError for invalid rational entries', () => {
		const invalidEntries = [
			null,
			undefined,
			5,
			'1/2',
			[1n, 2n],
			{},
			{ num: 1, den: 2n },
			{ num: 1n, den: 2 },
			{ num: 1n },
			{ den: 2n },
			{ num: '1', den: '2' },
		]

		for (const entry of invalidEntries) {
			assert.throws(() => transposeRationalRecursive([[entry]]), TypeError)
		}

		// Sparse row array
		const sparseRow = new Array(2)
		sparseRow[1] = r(1, 2)
		assert.throws(() => transposeRationalRecursive([sparseRow]), TypeError)
	})

	it('throws RangeError for zero denominators', () => {
		assert.throws(
			() => transposeRationalRecursive([[{ num: 1n, den: 0n }]]),
			RangeError,
		)
		assert.throws(
			() => transposeRationalRecursive([[{ num: 0n, den: 0n }]]),
			RangeError,
		)
		assert.throws(
			() =>
				transposeRationalRecursive([
					[r(1, 2), r(3, 4)],
					[r(5, 6), { num: -7n, den: 0n }],
				]),
			RangeError,
		)
	})
})
