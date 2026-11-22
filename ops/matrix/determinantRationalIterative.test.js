import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { determinantRationalIterative } from './determinantRationalIterative.js'

/**
 * Helper to construct a rational object `{ num: bigint, den: bigint }`.
 *
 * @param {bigint | number} num
 * @param {bigint | number} [den=1n]
 * @returns {{ num: bigint, den: bigint }}
 */
function r(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) }
}

/**
 * Independent reference rational arithmetic helpers for cross-checks.
 */
function refGcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function refNorm(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = refGcd(n, d)
	return { num: n / g, den: d / g }
}

function refAdd(a, b) {
	return refNorm(a.num * b.den + b.num * a.den, a.den * b.den)
}

function refSub(a, b) {
	return refNorm(a.num * b.den - b.num * a.den, a.den * b.den)
}

function refMul(a, b) {
	return refNorm(a.num * b.num, a.den * b.den)
}

/**
 * Independent Leibniz permutation expansion for n x n rational matrices.
 */
function determinantLeibniz(matrix) {
	const n = matrix.length
	const perm = Array.from({ length: n }, (_, i) => i)
	let total = r(0n, 1n)

	function permute(start, swaps) {
		if (start === n) {
			let term = r(1n, 1n)
			for (let i = 0; i < n; i++) {
				term = refMul(term, matrix[i][perm[i]])
			}
			total = swaps % 2 === 0 ? refAdd(total, term) : refSub(total, term)
			return
		}
		for (let i = start; i < n; i++) {
			;[perm[start], perm[i]] = [perm[i], perm[start]]
			permute(start + 1, swaps + (i === start ? 0 : 1))
			;[perm[start], perm[i]] = [perm[i], perm[start]]
		}
	}

	permute(0, 0)
	return total
}

/**
 * Independent Laplace cofactor expansion along the first row.
 */
function determinantCofactor(matrix) {
	const n = matrix.length
	if (n === 1) {
		return refNorm(matrix[0][0].num, matrix[0][0].den)
	}
	let total = r(0n, 1n)
	for (let col = 0; col < n; col++) {
		const minor = []
		for (let row = 1; row < n; row++) {
			const minorRow = []
			for (let c = 0; c < n; c++) {
				if (c !== col) minorRow.push(matrix[row][c])
			}
			minor.push(minorRow)
		}
		const subDet = determinantCofactor(minor)
		const term = refMul(matrix[0][col], subDet)
		total = col % 2 === 0 ? refAdd(total, term) : refSub(total, term)
	}
	return total
}

/**
 * Exact rational matrix multiplication for `det(A * B) === det(A) * det(B)` check.
 */
function multiplyMatrices(a, b) {
	const n = a.length
	const result = []
	for (let i = 0; i < n; i++) {
		const row = []
		for (let j = 0; j < n; j++) {
			let sum = r(0n, 1n)
			for (let k = 0; k < n; k++) {
				sum = refAdd(sum, refMul(a[i][k], b[k][j]))
			}
			row.push(sum)
		}
		result.push(row)
	}
	return result
}

function transposeMatrix(m) {
	const n = m.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => m[j][i])
	)
}

function hilbertMatrix(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => r(1n, BigInt(i + j + 1)))
	)
}

describe('determinantRationalIterative', () => {
	describe('1x1 and 2x2 matrices', () => {
		it('computes 1x1 determinants and normalizes output', () => {
			assert.deepEqual(determinantRationalIterative([[r(7, 1)]]), r(7, 1))
			assert.deepEqual(determinantRationalIterative([[r(-6, 4)]]), r(-3, 2))
			assert.deepEqual(determinantRationalIterative([[r(6, -4)]]), r(-3, 2))
			assert.deepEqual(determinantRationalIterative([[r(0, 9)]]), r(0, 1))
			assert.deepEqual(determinantRationalIterative([[r(0, -5)]]), r(0, 1))
		})

		it('computes 2x2 determinants with integer, negative, and fractional entries', () => {
			// det([[3, 8], [4, 6]]) = 18 - 32 = -14
			const m1 = [
				[r(3), r(8)],
				[r(4), r(6)],
			]
			assert.deepEqual(determinantRationalIterative(m1), r(-14, 1))

			// det([[1/2, -3/4], [2/3, 5/6]]) = 5/12 - (-1/2) = 11/12
			const m2 = [
				[r(1, 2), r(-3, 4)],
				[r(2, 3), r(5, 6)],
			]
			assert.deepEqual(determinantRationalIterative(m2), r(11, 12))
		})
	})

	describe('3x3, 4x4, and Hilbert matrices', () => {
		it('computes 3x3 determinants', () => {
			// det([[6, 1, 1], [4, -2, 5], [2, 8, 7]]) = -306
			const m = [
				[r(6), r(1), r(1)],
				[r(4), r(-2), r(5)],
				[r(2), r(8), r(7)],
			]
			assert.deepEqual(determinantRationalIterative(m), r(-306, 1))
		})

		it('computes 4x4 determinants with fractional entries', () => {
			const m = [
				[r(1, 2), r(-1, 3), r(2, 5), r(1, 7)],
				[r(3, 4), r(2, 3), r(-1, 2), r(5, 6)],
				[r(-2, 5), r(1, 4), r(3, 7), r(-1, 3)],
				[r(1, 6), r(-3, 5), r(1, 2), r(2, 9)],
			]
			const actual = determinantRationalIterative(m)
			const expected = determinantLeibniz(m)
			assert.deepEqual(actual, expected)
			assert.ok(actual.den > 0n)
			assert.equal(refGcd(actual.num, actual.den), 1n)
		})

		it('computes exact determinants of ill-conditioned Hilbert matrices H3, H4, H5', () => {
			assert.deepEqual(
				determinantRationalIterative(hilbertMatrix(3)),
				r(1n, 2160n)
			)
			assert.deepEqual(
				determinantRationalIterative(hilbertMatrix(4)),
				r(1n, 6048000n)
			)
			assert.deepEqual(
				determinantRationalIterative(hilbertMatrix(5)),
				r(1n, 266716800000n)
			)
		})
	})

	describe('singular matrices and row swaps', () => {
		it('returns 0/1 for singular matrices', () => {
			// Zero row
			assert.deepEqual(
				determinantRationalIterative([
					[r(1, 2), r(3, 4)],
					[r(0), r(0)],
				]),
				r(0, 1)
			)

			// Zero column
			assert.deepEqual(
				determinantRationalIterative([
					[r(1), r(0), r(2)],
					[r(3), r(0), r(4)],
					[r(5), r(0), r(6)],
				]),
				r(0, 1)
			)

			// Linearly dependent 3x3 (row 2 = row 0 + 2 * row 1)
			assert.deepEqual(
				determinantRationalIterative([
					[r(1, 3), r(-2, 5), r(7, 2)],
					[r(4, 7), r(1, 2), r(-3, 4)],
					[r(31, 21), r(3, 5), r(2, 1)],
				]),
				r(0, 1)
			)

			// Linearly dependent 4x4 (row 3 = row 0 - row 1 + row 2)
			assert.deepEqual(
				determinantRationalIterative([
					[r(2), r(1), r(-1), r(3)],
					[r(1), r(4), r(2), r(-1)],
					[r(0), r(3), r(5), r(2)],
					[r(1), r(0), r(2), r(6)],
				]),
				r(0, 1)
			)
		})

		it('handles row swaps accurately for permutation and zero-diagonal matrices', () => {
			// 2x2 anti-diagonal: 1 swap -> det = -1
			assert.deepEqual(
				determinantRationalIterative([
					[r(0), r(1)],
					[r(1), r(0)],
				]),
				r(-1, 1)
			)

			// 3-cycle permutation matrix (even permutation, 2 swaps) -> det = 1
			assert.deepEqual(
				determinantRationalIterative([
					[r(0), r(1), r(0)],
					[r(0), r(0), r(1)],
					[r(1), r(0), r(0)],
				]),
				r(1, 1)
			)

			// 4-cycle permutation matrix (odd permutation, 3 swaps) -> det = -1
			assert.deepEqual(
				determinantRationalIterative([
					[r(0), r(1), r(0), r(0)],
					[r(0), r(0), r(1), r(0)],
					[r(0), r(0), r(0), r(1)],
					[r(1), r(0), r(0), r(0)],
				]),
				r(-1, 1)
			)

			// Zero pivots forcing swaps at multiple columns with fractional entries
			const m = [
				[r(0), r(0), r(2, 3), r(1, 2)],
				[r(0), r(5, 7), r(-1, 3), r(4, 5)],
				[r(3, 4), r(1, 2), r(0), r(-2, 3)],
				[r(1, 8), r(-3, 4), r(5, 6), r(0)],
			]
			assert.deepEqual(
				determinantRationalIterative(m),
				determinantLeibniz(m)
			)
		})
	})

	describe('immutability and exact BigInt precision', () => {
		it('does not mutate input matrix or its rational entries', () => {
			const e00 = { num: 2n, den: 4n }
			const e01 = { num: -3n, den: -6n }
			const e10 = { num: 5n, den: 10n }
			const e11 = { num: 7n, den: 1n }
			const matrix = [
				[e00, e01],
				[e10, e11],
			]
			const snapshot = JSON.stringify(matrix, (_, v) =>
				typeof v === 'bigint' ? `${v}n` : v
			)

			const det = determinantRationalIterative(matrix)
			// [[1/2, 1/2], [1/2, 7]] -> 7/2 - 1/4 = 13/4
			assert.deepEqual(det, r(13, 4))

			const after = JSON.stringify(matrix, (_, v) =>
				typeof v === 'bigint' ? `${v}n` : v
			)
			assert.equal(after, snapshot)
		})

		it('preserves exact precision beyond Number.MAX_SAFE_INTEGER', () => {
			const big = 10n ** 30n
			// det([[big + 1, big], [big, big - 1]]) = (big^2 - 1) - big^2 = -1
			const m = [
				[r(big + 1n, 1n), r(big, 1n)],
				[r(big, 1n), r(big - 1n, 1n)],
			]
			assert.deepEqual(determinantRationalIterative(m), r(-1n, 1n))
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		const sample3x3A = [
			[r(2, 3), r(-5, 7), r(1, 2)],
			[r(0, 1), r(3, 4), r(-7, 5)],
			[r(-4, 9), r(2, 11), r(5, 6)],
		]
		const sample3x3B = [
			[r(-1, 2), r(4, 5), r(3, 8)],
			[r(7, 3), r(0, 1), r(-2, 7)],
			[r(5, 4), r(-3, 2), r(1, 3)],
		]
		const sample4x4A = [
			[r(0, 1), r(3, 2), r(-1, 4), r(5, 3)],
			[r(2, 5), r(-1, 3), r(4, 7), r(0, 1)],
			[r(-3, 4), r(0, 1), r(2, 3), r(-1, 5)],
			[r(1, 2), r(5, 6), r(-3, 8), r(7, 4)],
		]
		const sample4x4B = [
			[r(3, 5), r(-2, 3), r(1, 7), r(4, 9)],
			[r(1, 4), r(5, 2), r(0, 1), r(-3, 5)],
			[r(-2, 7), r(1, 3), r(6, 5), r(1, 2)],
			[r(4, 3), r(-1, 6), r(2, 9), r(-5, 4)],
		]

		it('matches independent Leibniz and cofactor expansions for 3x3 and 4x4 matrices', () => {
			for (const mat of [sample3x3A, sample3x3B, sample4x4A, sample4x4B]) {
				const iterDet = determinantRationalIterative(mat)
				const leibnizDet = determinantLeibniz(mat)
				const cofactorDet = determinantCofactor(mat)
				assert.deepEqual(iterDet, leibnizDet)
				assert.deepEqual(iterDet, cofactorDet)
			}
		})

		it('satisfies det(A * B) === det(A) * det(B) for 3x3 and 4x4 matrices', () => {
			const pairs = [
				[sample3x3A, sample3x3B],
				[sample4x4A, sample4x4B],
			]
			for (const [A, B] of pairs) {
				const detA = determinantRationalIterative(A)
				const detB = determinantRationalIterative(B)
				const detAB = determinantRationalIterative(multiplyMatrices(A, B))
				assert.deepEqual(detAB, refMul(detA, detB))
			}

			// Also check when one factor is singular
			const singular3x3 = [
				[r(1, 2), r(2, 3), r(3, 4)],
				[r(2, 2), r(4, 3), r(6, 4)],
				[r(-1, 5), r(7, 2), r(1, 3)],
			]
			assert.deepEqual(
				determinantRationalIterative(multiplyMatrices(sample3x3A, singular3x3)),
				r(0, 1)
			)
		})

		it('satisfies det(A^T) === det(A) and det(c * A) === c^n * det(A)', () => {
			assert.deepEqual(
				determinantRationalIterative(transposeMatrix(sample4x4A)),
				determinantRationalIterative(sample4x4A)
			)

			const c = r(-3, 5)
			const scaled = sample3x3A.map((row) =>
				row.map((entry) => refMul(c, entry))
			)
			const cCubed = refMul(refMul(c, c), c)
			assert.deepEqual(
				determinantRationalIterative(scaled),
				refMul(cCubed, determinantRationalIterative(sample3x3A))
			)
		})
	})

	describe('invalid input validation', () => {
		it('throws TypeError when matrix is not an array', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, true]) {
				assert.throws(() => determinantRationalIterative(bad), TypeError)
			}
		})

		it('throws RangeError when matrix is empty or non-square', () => {
			assert.throws(() => determinantRationalIterative([]), RangeError)
			assert.throws(() => determinantRationalIterative([[]]), RangeError)
			assert.throws(
				() => determinantRationalIterative([[r(1), r(2)]]),
				RangeError
			)
			assert.throws(
				() => determinantRationalIterative([[r(1)], [r(2)]]),
				RangeError
			)
			assert.throws(
				() =>
					determinantRationalIterative([
						[r(1), r(2)],
						[r(3)],
					]),
				RangeError
			)
		})

		it('throws TypeError when any row is not an array', () => {
			assert.throws(() => determinantRationalIterative([null]), TypeError)
			assert.throws(
				() => determinantRationalIterative([[r(1), r(2)], 'bad']),
				TypeError
			)
		})

		it('throws TypeError when any entry is not a valid rational object', () => {
			const invalidEntries = [
				null,
				undefined,
				1,
				1n,
				'1/2',
				[1n, 2n],
				{},
				{ num: 1, den: 1n },
				{ num: 1n, den: 1 },
				{ num: 1n },
				{ den: 1n },
			]
			for (const bad of invalidEntries) {
				assert.throws(() => determinantRationalIterative([[bad]]), TypeError)
			}

			// Sparse row
			const sparseRow = new Array(2)
			sparseRow[0] = r(1)
			assert.throws(
				() => determinantRationalIterative([sparseRow, [r(1), r(2)]]),
				TypeError
			)
		})

		it('throws RangeError when any entry has zero denominator', () => {
			assert.throws(
				() => determinantRationalIterative([[{ num: 1n, den: 0n }]]),
				RangeError
			)
			assert.throws(
				() =>
					determinantRationalIterative([
						[r(1), r(2)],
						[r(3), { num: 0n, den: 0n }],
					]),
				RangeError
			)
		})
	})
})
