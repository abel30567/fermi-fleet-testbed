import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { determinantRationalSeries } from './determinantRationalSeries.js'

function q(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) }
}

function absBigInt(x) {
	return x < 0n ? -x : x
}

function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

function normQ(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

function addQ(a, b) {
	return normQ(a.num * b.den + b.num * a.den, a.den * b.den)
}

function subQ(a, b) {
	return normQ(a.num * b.den - b.num * a.den, a.den * b.den)
}

function mulQ(a, b) {
	return normQ(a.num * b.num, a.den * b.den)
}

function negQ(a) {
	return a.num === 0n ? { num: 0n, den: 1n } : { num: -a.num, den: a.den }
}

function matMulQ(A, B) {
	const n = A.length
	const C = Array.from({ length: n }, () => new Array(n))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let sum = q(0n, 1n)
			for (let k = 0; k < n; k++) {
				sum = addQ(sum, mulQ(A[i][k], B[k][j]))
			}
			C[i][j] = sum
		}
	}
	return C
}

function transposeQ(M) {
	const n = M.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => M[j][i])
	)
}

/**
 * Independent reference determinant via Laplace cofactor expansion.
 */
function detCofactorRef(M) {
	const n = M.length
	if (n === 1) return normQ(M[0][0].num, M[0][0].den)
	if (n === 2) {
		return subQ(mulQ(M[0][0], M[1][1]), mulQ(M[0][1], M[1][0]))
	}
	let total = q(0n, 1n)
	for (let col = 0; col < n; col++) {
		const minor = []
		for (let i = 1; i < n; i++) {
			const row = []
			for (let j = 0; j < n; j++) {
				if (j !== col) row.push(M[i][j])
			}
			minor.push(row)
		}
		const term = mulQ(M[0][col], detCofactorRef(minor))
		total = col % 2 === 0 ? addQ(total, term) : subQ(total, term)
	}
	return total
}

/**
 * Independent reference determinant for 3x3 matrices via explicit Leibniz 6-term sum.
 */
function detLeibniz3x3(M) {
	const [a, b, c] = M[0]
	const [d, e, f] = M[1]
	const [g, h, i] = M[2]
	const pos = addQ(
		addQ(mulQ(mulQ(a, e), i), mulQ(mulQ(b, f), g)),
		mulQ(mulQ(c, d), h)
	)
	const neg = addQ(
		addQ(mulQ(mulQ(c, e), g), mulQ(mulQ(b, d), i)),
		mulQ(mulQ(a, f), h)
	)
	return subQ(pos, neg)
}

function assertCanonicalRational(actual, expectedNum, expectedDen) {
	assert.equal(typeof actual, 'object')
	assert.notEqual(actual, null)
	assert.equal(typeof actual.num, 'bigint')
	assert.equal(typeof actual.den, 'bigint')
	assert.ok(actual.den > 0n, `Expected den > 0n, got ${actual.den}`)
	if (actual.num === 0n) {
		assert.equal(actual.den, 1n, `Zero rational must have den === 1n, got ${actual.den}`)
	} else {
		assert.equal(
			gcdBigInt(actual.num, actual.den),
			1n,
			`Expected lowest terms, got ${actual.num}/${actual.den}`
		)
	}
	assert.equal(actual.num, expectedNum)
	assert.equal(actual.den, expectedDen)
}

function hilbertMatrix(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => q(1n, BigInt(i + j + 1)))
	)
}

function identityMatrix(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? q(1n, 1n) : q(0n, 1n)))
	)
}

describe('determinantRationalSeries', () => {
	it('computes 1x1 determinants including zero, negative, and unreduced inputs', () => {
		assertCanonicalRational(determinantRationalSeries([[q(5, 3)]]), 5n, 3n)
		assertCanonicalRational(determinantRationalSeries([[q(-7, 4)]]), -7n, 4n)
		assertCanonicalRational(determinantRationalSeries([[q(0, 5)]]), 0n, 1n)
		assertCanonicalRational(determinantRationalSeries([[q(0, -9)]]), 0n, 1n)
		assertCanonicalRational(determinantRationalSeries([[q(6, -9)]]), -2n, 3n)
		assertCanonicalRational(determinantRationalSeries([[q(-12, -18)]]), 2n, 3n)
	})

	it('computes 2x2 determinants over integers and fractions', () => {
		const M1 = [
			[q(3), q(8)],
			[q(4), q(6)],
		]
		assertCanonicalRational(determinantRationalSeries(M1), -14n, 1n)

		const M2 = [
			[q(1, 2), q(2, 3)],
			[q(3, 4), q(5, 6)],
		]
		// (1/2)*(5/6) - (2/3)*(3/4) = 5/12 - 1/2 = -1/12
		assertCanonicalRational(determinantRationalSeries(M2), -1n, 12n)
	})

	it('computes 3x3 determinants over integers and rationals', () => {
		const M1 = [
			[q(6), q(1), q(1)],
			[q(4), q(-2), q(5)],
			[q(2), q(8), q(7)],
		]
		assertCanonicalRational(determinantRationalSeries(M1), -306n, 1n)

		const M2 = [
			[q(1, 2), q(-1, 3), q(1, 4)],
			[q(2, 5), q(3, 7), q(-1, 2)],
			[q(-1, 6), q(1, 5), q(2, 3)],
		]
		const expected = detLeibniz3x3(M2)
		assertCanonicalRational(determinantRationalSeries(M2), expected.num, expected.den)
	})

	it('computes 4x4 determinants over integers and rationals', () => {
		const M1 = [
			[q(1), q(0), q(2), q(-1)],
			[q(3), q(0), q(0), q(5)],
			[q(2), q(1), q(4), q(-3)],
			[q(1), q(0), q(5), q(0)],
		]
		assertCanonicalRational(determinantRationalSeries(M1), 30n, 1n)

		const M2 = [
			[q(1, 2), q(1, 3), q(-1, 4), q(1, 5)],
			[q(2, 3), q(-1, 2), q(1, 6), q(3, 4)],
			[q(-1, 5), q(2, 7), q(3, 5), q(-1, 3)],
			[q(1, 4), q(1, 5), q(-2, 3), q(2, 5)],
		]
		const ref = detCofactorRef(M2)
		assertCanonicalRational(determinantRationalSeries(M2), ref.num, ref.den)
	})

	it('returns 1/1 for identity matrices of various sizes', () => {
		for (const n of [1, 2, 3, 4, 6]) {
			assertCanonicalRational(determinantRationalSeries(identityMatrix(n)), 1n, 1n)
		}
	})

	it('returns 0/1 for singular matrices', () => {
		// All-zero matrix
		const zero3 = Array.from({ length: 3 }, () => [q(0), q(0), q(0)])
		assertCanonicalRational(determinantRationalSeries(zero3), 0n, 1n)

		// Zero column
		const zeroCol = [
			[q(1, 2), q(0), q(3, 4)],
			[q(5, 6), q(0), q(7, 8)],
			[q(9, 10), q(0), q(11, 12)],
		]
		assertCanonicalRational(determinantRationalSeries(zeroCol), 0n, 1n)

		// Linearly dependent rows (row2 = 2*row0 - 3*row1)
		const dependent = [
			[q(1, 2), q(1, 3), q(1, 4)],
			[q(2, 5), q(-1, 6), q(3, 7)],
			[q(-1, 5), q(7, 6), q(-11, 14)],
		]
		assertCanonicalRational(determinantRationalSeries(dependent), 0n, 1n)

		// Singular 4x4 with rank 3 (magic-like arithmetic progression rows)
		const singular4 = [
			[q(1), q(2), q(3), q(4)],
			[q(5), q(6), q(7), q(8)],
			[q(9), q(10), q(11), q(12)],
			[q(13), q(14), q(15), q(16)],
		]
		assertCanonicalRational(determinantRationalSeries(singular4), 0n, 1n)
	})

	it('computes exact determinants of ill-conditioned Hilbert matrices H_1..H_5', () => {
		assertCanonicalRational(determinantRationalSeries(hilbertMatrix(1)), 1n, 1n)
		assertCanonicalRational(determinantRationalSeries(hilbertMatrix(2)), 1n, 12n)
		assertCanonicalRational(determinantRationalSeries(hilbertMatrix(3)), 1n, 2160n)
		assertCanonicalRational(determinantRationalSeries(hilbertMatrix(4)), 1n, 6048000n)
		assertCanonicalRational(determinantRationalSeries(hilbertMatrix(5)), 1n, 266716800000n)
	})

	it('handles row swaps, permutation matrices, and zero pivots requiring partial pivoting', () => {
		// Anti-diagonal 3x3 (odd number of swaps -> -1)
		const anti3 = [
			[q(0), q(0), q(1)],
			[q(0), q(1), q(0)],
			[q(1), q(0), q(0)],
		]
		assertCanonicalRational(determinantRationalSeries(anti3), -1n, 1n)

		// Anti-diagonal 4x4 (2 swaps -> +1)
		const anti4 = [
			[q(0), q(0), q(0), q(2, 3)],
			[q(0), q(0), q(3, 5), q(0)],
			[q(0), q(5, 7), q(0), q(0)],
			[q(7, 11), q(0), q(0), q(0)],
		]
		// (+1) * (2/3)*(3/5)*(5/7)*(7/11) = 2/11
		assertCanonicalRational(determinantRationalSeries(anti4), 2n, 11n)

		// Zero intermediate pivot with non-unit prevPivot (tests Bareiss divisibility across swap)
		const midZeroPivot = [
			[q(2), q(1), q(3)],
			[q(4), q(2), q(1)],
			[q(1), q(3), q(2)],
		]
		assertCanonicalRational(determinantRationalSeries(midZeroPivot), 25n, 1n)

		// Swapping two rows negates determinant
		const base = [
			[q(3, 2), q(-1, 4), q(2, 5)],
			[q(1, 3), q(5, 6), q(-1, 2)],
			[q(-2, 7), q(1, 5), q(4, 3)],
		]
		const swapped = [base[2], base[1], base[0]]
		const detBase = determinantRationalSeries(base)
		const detSwapped = determinantRationalSeries(swapped)
		const negBase = negQ(detBase)
		assertCanonicalRational(detSwapped, negBase.num, negBase.den)
	})

	it('cross-checks against Leibniz/cofactor expansion on multiple 3x3 matrices', () => {
		const matrices = [
			[
				[q(0), q(3, 2), q(-5, 4)],
				[q(7, 3), q(0), q(2, 5)],
				[q(-1, 6), q(4, 7), q(0)],
			],
			[
				[q(-11, 13), q(17, 19), q(-23, 29)],
				[q(31, 37), q(-41, 43), q(47, 53)],
				[q(-59, 61), q(67, 71), q(-73, 79)],
			],
			[
				[q(4, 6), q(-6, 9), q(10, -15)], // unnormalized inputs
				[q(2, -4), q(3, 6), q(-8, -12)],
				[q(9, 12), q(-14, 21), q(15, 25)],
			],
		]

		for (const M of matrices) {
			const expectedLeibniz = detLeibniz3x3(M)
			const expectedCofactor = detCofactorRef(M)
			assert.deepEqual(expectedLeibniz, expectedCofactor)
			const actual = determinantRationalSeries(M)
			assertCanonicalRational(actual, expectedLeibniz.num, expectedLeibniz.den)
		}
	})

	it('satisfies the multiplicative property det(A * B) = det(A) * det(B)', () => {
		const A = [
			[q(1, 2), q(-2, 3), q(3, 4)],
			[q(4, 5), q(1, 6), q(-5, 7)],
			[q(-3, 8), q(2, 9), q(1, 3)],
		]
		const B = [
			[q(2, 3), q(1, 5), q(-1, 2)],
			[q(-3, 4), q(4, 7), q(2, 5)],
			[q(5, 6), q(-2, 3), q(3, 8)],
		]
		const detA = determinantRationalSeries(A)
		const detB = determinantRationalSeries(B)
		const detAB = determinantRationalSeries(matMulQ(A, B))
		const prod = mulQ(detA, detB)
		assertCanonicalRational(detAB, prod.num, prod.den)

		// 4x4 multiplicative check
		const H4 = hilbertMatrix(4)
		const U4 = [
			[q(2, 1), q(-1, 3), q(1, 2), q(3, 5)],
			[q(1, 4), q(3, 2), q(-2, 7), q(1, 3)],
			[q(-1, 2), q(2, 5), q(5, 3), q(-1, 4)],
			[q(3, 7), q(-1, 2), q(1, 6), q(7, 4)],
		]
		const detH4 = determinantRationalSeries(H4)
		const detU4 = determinantRationalSeries(U4)
		const detH4U4 = determinantRationalSeries(matMulQ(H4, U4))
		const expected4 = mulQ(detH4, detU4)
		assertCanonicalRational(detH4U4, expected4.num, expected4.den)
	})

	it('satisfies transpose invariance and Vandermonde closed form', () => {
		const xs = [q(1, 2), q(-1, 3), q(3, 4), q(5, 6)]
		const V = xs.map((x) => {
			const r0 = q(1, 1)
			const r1 = x
			const r2 = mulQ(r1, x)
			const r3 = mulQ(r2, x)
			return [r0, r1, r2, r3]
		})
		// Closed form: prod_{0 <= i < j < 4} (x_j - x_i)
		let expected = q(1, 1)
		for (let i = 0; i < xs.length; i++) {
			for (let j = i + 1; j < xs.length; j++) {
				expected = mulQ(expected, subQ(xs[j], xs[i]))
			}
		}
		const detV = determinantRationalSeries(V)
		assertCanonicalRational(detV, expected.num, expected.den)

		// Transpose invariance: det(V^T) === det(V)
		const detVT = determinantRationalSeries(transposeQ(V))
		assertCanonicalRational(detVT, expected.num, expected.den)
	})

	it('preserves exact precision for large BigInt values and does not mutate input', () => {
		const big = 10n ** 30n
		const M = [
			[q(big + 1n, 3n), q(big, 3n)],
			[q(big, 3n), q(big - 1n, 3n)],
		]
		const snapshot = M.map((row) => row.map((cell) => ({ num: cell.num, den: cell.den })))
		// ((big+1)(big-1) - big^2) / 9 = (big^2 - 1 - big^2) / 9 = -1/9
		assertCanonicalRational(determinantRationalSeries(M), -1n, 9n)
		assert.deepEqual(M, snapshot)
	})

	it('throws TypeError or RangeError on invalid inputs', () => {
		// Non-array matrix
		assert.throws(() => determinantRationalSeries(null), TypeError)
		assert.throws(() => determinantRationalSeries(undefined), TypeError)
		assert.throws(() => determinantRationalSeries(42), TypeError)
		assert.throws(() => determinantRationalSeries('matrix'), TypeError)
		assert.throws(() => determinantRationalSeries({}), TypeError)

		// Empty matrix
		assert.throws(() => determinantRationalSeries([]), RangeError)

		// Non-array row
		assert.throws(() => determinantRationalSeries([null]), TypeError)
		assert.throws(() => determinantRationalSeries([q(1)]), TypeError)

		// Non-square / ragged matrices
		assert.throws(() => determinantRationalSeries([[q(1), q(2)]]), RangeError)
		assert.throws(() => determinantRationalSeries([[q(1)], [q(2)]]), RangeError)
		assert.throws(
			() => determinantRationalSeries([[q(1), q(2)], [q(3)]]),
			RangeError
		)

		// Invalid entries
		assert.throws(() => determinantRationalSeries([[null]]), TypeError)
		assert.throws(() => determinantRationalSeries([[undefined]]), TypeError)
		assert.throws(() => determinantRationalSeries([[1]]), TypeError)
		assert.throws(() => determinantRationalSeries([[{ num: 1, den: 1n }]]), TypeError)
		assert.throws(() => determinantRationalSeries([[{ num: 1n, den: 1 }]]), TypeError)
		assert.throws(() => determinantRationalSeries([[{ num: 1n }]]), TypeError)

		// Sparse array hole
		const sparseRow = new Array(2)
		sparseRow[0] = q(1)
		assert.throws(
			() => determinantRationalSeries([sparseRow, [q(1), q(1)]]),
			TypeError
		)

		// Zero denominator
		assert.throws(() => determinantRationalSeries([[q(1, 0)]]), RangeError)
		assert.throws(() => determinantRationalSeries([[q(0, 0)]]), RangeError)

		// Zero denominator in a later row after an all-zero first row must still throw
		assert.throws(
			() =>
				determinantRationalSeries([
					[q(0), q(0)],
					[q(1, 0), q(1)],
				]),
			RangeError
		)
	})
})
