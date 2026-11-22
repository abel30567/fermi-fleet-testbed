import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { traceRationalIterative } from './traceRationalIterative.js'

const r = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function reduce(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

function addRat(a, b) {
	return reduce(a.num * b.den + b.num * a.den, a.den * b.den)
}

function mulRat(a, b) {
	return reduce(a.num * b.num, a.den * b.den)
}

function addMat(A, B) {
	return A.map((row, i) => row.map((val, j) => addRat(val, B[i][j])))
}

function scaleMat(c, A) {
	return A.map((row) => row.map((val) => mulRat(c, val)))
}

function mulMat(A, B) {
	const n = A.length
	const out = []
	for (let i = 0; i < n; i++) {
		const row = []
		for (let j = 0; j < n; j++) {
			let sum = r(0n, 1n)
			for (let k = 0; k < n; k++) {
				sum = addRat(sum, mulRat(A[i][k], B[k][j]))
			}
			row.push(sum)
		}
		out.push(row)
	}
	return out
}

function transposeMat(A) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => A[j][i])
	)
}

function identityMat(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? r(1n, 1n) : r(0n, 1n)))
	)
}

function zeroMat(n) {
	return Array.from({ length: n }, () =>
		Array.from({ length: n }, () => r(0n, 1n))
	)
}

describe('traceRationalIterative', () => {
	it('computes trace of 1x1 matrices including unreduced and negative forms', () => {
		assert.deepEqual(traceRationalIterative([[r(7, 3)]]), { num: 7n, den: 3n })
		assert.deepEqual(traceRationalIterative([[r(-4, 6)]]), { num: -2n, den: 3n })
		assert.deepEqual(traceRationalIterative([[r(6, -9)]]), { num: -2n, den: 3n })
		assert.deepEqual(traceRationalIterative([[r(-8, -12)]]), { num: 2n, den: 3n })
		assert.deepEqual(traceRationalIterative([[r(0, -5)]]), { num: 0n, den: 1n })
	})

	it('computes trace of 2x2 matrices', () => {
		const m = [
			[r(1, 2), r(99, 7)],
			[r(-42, 5), r(1, 3)],
		]
		assert.deepEqual(traceRationalIterative(m), { num: 5n, den: 6n })

		// Diagonal sums to zero
		const cancels = [
			[r(3, 4), r(1, 1)],
			[r(2, 1), r(-9, 12)],
		]
		assert.deepEqual(traceRationalIterative(cancels), { num: 0n, den: 1n })
	})

	it('computes trace of 3x3 matrices with mixed signs and unreduced entries', () => {
		const m = [
			[r(4, 6), r(10, -20), r(3, 9)],
			[r(0, -4), r(5, -10), r(7, 14)],
			[r(-6, -8), r(1, 3), r(-10, -12)],
		]
		// 4/6 + (-5/10) + (10/12) = 2/3 - 1/2 + 5/6 = (4 - 3 + 5)/6 = 6/6 = 1/1
		assert.deepEqual(traceRationalIterative(m), { num: 1n, den: 1n })
	})

	it('computes trace of zero and identity matrices', () => {
		for (const n of [1, 2, 3, 4]) {
			assert.deepEqual(traceRationalIterative(zeroMat(n)), { num: 0n, den: 1n })
			assert.deepEqual(traceRationalIterative(identityMat(n)), {
				num: BigInt(n),
				den: 1n,
			})
		}
	})

	it('handles large BigInt values without precision loss and does not mutate input', () => {
		const big = 10n ** 40n
		const entry00 = { num: big + 1n, den: 3n }
		const entry11 = { num: -(big - 2n), den: 3n }
		const m = [
			[entry00, r(5, 7)],
			[r(-2, 11), entry11],
		]
		// (big + 1 - big + 2) / 3 = 3 / 3 = 1 / 1
		assert.deepEqual(traceRationalIterative(m), { num: 1n, den: 1n })
		assert.deepEqual(entry00, { num: big + 1n, den: 3n })
		assert.deepEqual(entry11, { num: -(big - 2n), den: 3n })
	})

	it('rejects non-array, empty, and non-square matrices', () => {
		assert.throws(() => traceRationalIterative(null), TypeError)
		assert.throws(() => traceRationalIterative(undefined), TypeError)
		assert.throws(() => traceRationalIterative(42), TypeError)
		assert.throws(() => traceRationalIterative({}), TypeError)

		assert.throws(() => traceRationalIterative([]), RangeError)
		assert.throws(() => traceRationalIterative([[]]), RangeError)
		assert.throws(() => traceRationalIterative([[r(1, 1), r(2, 1)]]), RangeError)
		assert.throws(() => traceRationalIterative([[r(1, 1)], [r(2, 1)]]), RangeError)
		assert.throws(
			() =>
				traceRationalIterative([
					[r(1, 1), r(2, 1)],
					[r(3, 1)],
				]),
			RangeError
		)
		assert.throws(() => traceRationalIterative([null]), TypeError)
		assert.throws(
			() => traceRationalIterative([[r(1, 1), r(2, 1)], 'not-a-row']),
			TypeError
		)
	})

	it('rejects invalid rational entries on both diagonal and off-diagonal positions', () => {
		// Invalid diagonal entry
		assert.throws(() => traceRationalIterative([[null]]), TypeError)
		assert.throws(() => traceRationalIterative([[[1n, 2n]]]), TypeError)
		assert.throws(() => traceRationalIterative([[{ num: 1, den: 2n }]]), TypeError)
		assert.throws(() => traceRationalIterative([[{ num: 1n, den: 2 }]]), TypeError)
		assert.throws(() => traceRationalIterative([[{ num: 1n }]]), TypeError)
		assert.throws(() => traceRationalIterative([[{ num: 1n, den: 0n }]]), RangeError)
		assert.throws(() => traceRationalIterative([[{ num: 0n, den: 0n }]]), RangeError)

		// Invalid off-diagonal entry must also throw
		assert.throws(
			() =>
				traceRationalIterative([
					[r(1, 1), { num: 1n, den: 0n }],
					[r(0, 1), r(2, 1)],
				]),
			RangeError
		)
		assert.throws(
			() =>
				traceRationalIterative([
					[r(1, 1), r(0, 1)],
					[{ num: '3', den: 1n }, r(2, 1)],
				]),
			TypeError
		)

		// Sparse array row
		const sparseRow = new Array(2)
		sparseRow[0] = r(1, 1)
		assert.throws(
			() => traceRationalIterative([sparseRow, [r(0, 1), r(2, 1)]]),
			TypeError
		)
	})

	it('satisfies linearity tr(A + B) === tr(A) + tr(B) and tr(c*A) === c*tr(A)', () => {
		const A = [
			[r(3, 4), r(-5, 6), r(2, -3)],
			[r(7, 8), r(4, -10), r(1, 5)],
			[r(-9, -12), r(11, 7), r(5, 6)],
		]
		const B = [
			[r(-1, 3), r(2, 5), r(4, 9)],
			[r(3, -7), r(5, 8), r(-6, 11)],
			[r(8, 15), r(-2, -3), r(-7, 12)],
		]

		const trSum = traceRationalIterative(addMat(A, B))
		const sumTr = addRat(traceRationalIterative(A), traceRationalIterative(B))
		assert.deepEqual(trSum, sumTr)

		const scalar = r(-7, 13)
		const trScaled = traceRationalIterative(scaleMat(scalar, A))
		const scaledTr = mulRat(scalar, traceRationalIterative(A))
		assert.deepEqual(trScaled, scaledTr)
	})

	it('satisfies cyclic property tr(A * B) === tr(B * A) and transpose invariance tr(A^T) === tr(A)', () => {
		const A = [
			[r(2, 3), r(-4, 5), r(7, -6)],
			[r(1, 2), r(3, 7), r(-5, 4)],
			[r(-8, -9), r(5, 11), r(1, -3)],
		]
		const B = [
			[r(-3, 5), r(1, 4), r(2, 7)],
			[r(6, -11), r(-2, 3), r(9, 8)],
			[r(4, 9), r(-7, 10), r(5, 6)],
		]

		const trAB = traceRationalIterative(mulMat(A, B))
		const trBA = traceRationalIterative(mulMat(B, A))
		assert.deepEqual(trAB, trBA)

		assert.deepEqual(
			traceRationalIterative(transposeMat(A)),
			traceRationalIterative(A)
		)
	})

	it('matches an independent common-denominator reference computation on a 5x5 matrix', () => {
		const diag = [
			r(17, 19),
			r(-23, 29),
			r(31, -37),
			r(-41, -43),
			r(100000000000000000001n, 47n),
		]
		const M = Array.from({ length: 5 }, (_, i) =>
			Array.from({ length: 5 }, (_, j) =>
				i === j ? diag[i] : r(BigInt(i - j), BigInt(i + j + 2))
			)
		)

		// Independent naive reference: multiply all denominators into a single product
		let commonDen = 1n
		for (const d of diag) {
			commonDen *= d.den
		}
		let totalNum = 0n
		for (const d of diag) {
			totalNum += d.num * (commonDen / d.den)
		}
		const expected = reduce(totalNum, commonDen)

		assert.deepEqual(traceRationalIterative(M), expected)
	})
})
