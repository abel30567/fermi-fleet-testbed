import { describe, test } from 'node:test'
import assert from 'node:assert'
import { transposeRationalIterative } from './transposeRationalIterative.js'

/**
 * Helper to construct a raw rational object.
 * @param {bigint | number} num
 * @param {bigint | number} [den=1n]
 * @returns {{ num: bigint, den: bigint }}
 */
function q(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) }
}

/**
 * Independent BigInt GCD for test cross-checks.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		;[x, y] = [y, x % y]
	}
	return x
}

/**
 * Independent rational normalizer for test cross-checks.
 * @param {{ num: bigint, den: bigint }} r
 * @returns {{ num: bigint, den: bigint }}
 */
function norm(r) {
	if (r.num === 0n) return { num: 0n, den: 1n }
	const sign = r.den < 0n ? -1n : 1n
	const n = r.num * sign
	const d = r.den * sign
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Independent rational addition.
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function qAdd(a, b) {
	return norm({ num: a.num * b.den + b.num * a.den, den: a.den * b.den })
}

/**
 * Independent rational multiplication.
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function qMul(a, b) {
	return norm({ num: a.num * b.num, den: a.den * b.den })
}

/**
 * Independent exact rational matrix multiplication.
 * @param {{ num: bigint, den: bigint }[][]} A
 * @param {{ num: bigint, den: bigint }[][]} B
 * @returns {{ num: bigint, den: bigint }[][]}
 */
function matMul(A, B) {
	const m = A.length
	const k = A[0].length
	const n = B[0].length
	const out = []
	for (let i = 0; i < m; i++) {
		const row = []
		for (let j = 0; j < n; j++) {
			let sum = q(0, 1)
			for (let p = 0; p < k; p++) {
				sum = qAdd(sum, qMul(A[i][p], B[p][j]))
			}
			row.push(sum)
		}
		out.push(row)
	}
	return out
}

/**
 * Independent exact rational matrix addition.
 * @param {{ num: bigint, den: bigint }[][]} A
 * @param {{ num: bigint, den: bigint }[][]} B
 * @returns {{ num: bigint, den: bigint }[][]}
 */
function matAdd(A, B) {
	return A.map((row, i) => row.map((val, j) => qAdd(val, B[i][j])))
}

describe('transposeRationalIterative', () => {
	test('transposes a rectangular 2x3 matrix', () => {
		const A = [
			[q(1, 2), q(3, 4), q(-5, 6)],
			[q(7, 8), q(0, 1), q(9, 10)],
		]
		const expected = [
			[q(1, 2), q(7, 8)],
			[q(3, 4), q(0, 1)],
			[q(-5, 6), q(9, 10)],
		]
		assert.deepStrictEqual(transposeRationalIterative(A), expected)
	})

	test('transposes a square 3x3 matrix', () => {
		const A = [
			[q(1, 1), q(2, 3), q(4, 5)],
			[q(-1, 7), q(0, 1), q(8, 9)],
			[q(11, 13), q(-2, 15), q(17, 19)],
		]
		const expected = [
			[q(1, 1), q(-1, 7), q(11, 13)],
			[q(2, 3), q(0, 1), q(-2, 15)],
			[q(4, 5), q(8, 9), q(17, 19)],
		]
		assert.deepStrictEqual(transposeRationalIterative(A), expected)
	})

	test('transposes row vector, column vector, and 1x1 matrix', () => {
		const rowVec = [[q(1, 2), q(2, 3), q(3, 4)]]
		const colVec = [[q(1, 2)], [q(2, 3)], [q(3, 4)]]
		assert.deepStrictEqual(transposeRationalIterative(rowVec), colVec)
		assert.deepStrictEqual(transposeRationalIterative(colVec), rowVec)

		const single = [[q(-6, -9)]]
		assert.deepStrictEqual(transposeRationalIterative(single), [[q(2, 3)]])
	})

	test('normalizes fractions to lowest terms with positive denominators', () => {
		const A = [
			[q(6, 9), q(-4, 8), q(10, -15)],
			[q(-12, -18), q(0, 5), q(0, -7)],
		]
		const expected = [
			[q(2, 3), q(2, 3)],
			[q(-1, 2), q(0, 1)],
			[q(-2, 3), q(0, 1)],
		]
		assert.deepStrictEqual(transposeRationalIterative(A), expected)
	})

	test('handles huge BigInt numerators and denominators accurately', () => {
		const factor = 10n ** 30n + 7n
		const bigA = [
			[
				{ num: 3n * factor, den: 5n * factor },
				{ num: -11n * factor, den: -13n * factor },
			],
			[
				{ num: 17n * factor, den: -19n * factor },
				{ num: 0n, den: -99n * factor },
			],
		]
		const expected = [
			[q(3, 5), q(-17, 19)],
			[q(11, 13), q(0, 1)],
		]
		assert.deepStrictEqual(transposeRationalIterative(bigA), expected)
	})

	test('handles empty matrices', () => {
		assert.deepStrictEqual(transposeRationalIterative([]), [])
		assert.deepStrictEqual(transposeRationalIterative([[]]), [])
		assert.deepStrictEqual(transposeRationalIterative([[], []]), [])
	})

	test('does not mutate input matrix or alias rational objects', () => {
		const entry = { num: 4n, den: 6n }
		const A = [[entry]]
		const T = transposeRationalIterative(A)

		assert.deepStrictEqual(A, [[{ num: 4n, den: 6n }]])
		assert.deepStrictEqual(T, [[{ num: 2n, den: 3n }]])
		assert.notStrictEqual(T[0][0], entry)

		T[0][0].num = 99n
		assert.strictEqual(entry.num, 4n)
	})

	test('validates malformed inputs and throws appropriate errors', () => {
		assert.throws(() => transposeRationalIterative(null), TypeError)
		assert.throws(() => transposeRationalIterative(undefined), TypeError)
		assert.throws(() => transposeRationalIterative(123), TypeError)
		assert.throws(() => transposeRationalIterative({}), TypeError)

		assert.throws(() => transposeRationalIterative([null]), TypeError)
		assert.throws(() => transposeRationalIterative([q(1, 2)]), TypeError)

		assert.throws(
			() => transposeRationalIterative([[q(1, 1)], [q(1, 1), q(2, 1)]]),
			RangeError,
		)
		assert.throws(
			() => transposeRationalIterative([[], [q(1, 1)]]),
			RangeError,
		)

		assert.throws(() => transposeRationalIterative([[null]]), TypeError)
		assert.throws(() => transposeRationalIterative([[undefined]]), TypeError)
		assert.throws(() => transposeRationalIterative([[[]]]), TypeError)
		assert.throws(
			() => transposeRationalIterative([[{ num: 1, den: 2 }]]),
			TypeError,
		)
		assert.throws(
			() => transposeRationalIterative([[{ num: 1n, den: '2' }]]),
			TypeError,
		)
		assert.throws(
			() => transposeRationalIterative([[{ num: 1n }]]),
			TypeError,
		)

		assert.throws(
			() => transposeRationalIterative([[q(1, 0)]]),
			RangeError,
		)
		assert.throws(
			() => transposeRationalIterative([[q(0, 0)]]),
			RangeError,
		)
	})

	test('cross-check: involution T(T(A)) = normalize(A)', () => {
		const A = [
			[q(6, -8), q(0, -3), q(15, 25), q(-14, -21)],
			[q(22, 33), q(-9, 12), q(100, -40), q(7, 1)],
			[q(0, 9), q(18, 24), q(-3, -9), q(5, -10)],
		]
		const normalizedA = A.map((row) => row.map(norm))
		const doubleTransposed = transposeRationalIterative(
			transposeRationalIterative(A),
		)
		assert.deepStrictEqual(doubleTransposed, normalizedA)
	})

	test('cross-check: product identity (A * B)^T = B^T * A^T', () => {
		const A = [
			[q(1, 2), q(-2, 3), q(3, 5)],
			[q(4, 7), q(0, 1), q(-5, 6)],
		]
		const B = [
			[q(2, 5), q(-1, 4)],
			[q(3, 7), q(5, 8)],
			[q(-7, 9), q(1, 3)],
		]

		const lhs = transposeRationalIterative(matMul(A, B))
		const rhs = matMul(
			transposeRationalIterative(B),
			transposeRationalIterative(A),
		)
		assert.deepStrictEqual(lhs, rhs)
	})

	test('cross-check: linearity (A + B)^T = A^T + B^T and Gram symmetry (A^T * A)^T = A^T * A', () => {
		const A = [
			[q(1, 3), q(-2, 5), q(4, 7)],
			[q(5, 6), q(0, 1), q(-3, 4)],
		]
		const B = [
			[q(-7, 9), q(3, 10), q(2, 7)],
			[q(1, 6), q(-4, 11), q(9, 8)],
		]

		const lhsAdd = transposeRationalIterative(matAdd(A, B))
		const rhsAdd = matAdd(
			transposeRationalIterative(A),
			transposeRationalIterative(B),
		)
		assert.deepStrictEqual(lhsAdd, rhsAdd)

		const gram = matMul(transposeRationalIterative(A), A)
		assert.deepStrictEqual(transposeRationalIterative(gram), gram)
	})
})
