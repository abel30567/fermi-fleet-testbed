import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { traceRationalRecursive } from './traceRationalRecursive.js'

function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

function assertLowestTerms(r) {
	assert.equal(typeof r, 'object')
	assert.notEqual(r, null)
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `Expected den > 0n, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n, `Expected zero to have den === 1n, got ${r.den}`)
	} else {
		assert.equal(
			gcd(r.num, r.den),
			1n,
			`Expected gcd(|${r.num}|, ${r.den}) === 1n`
		)
	}
}

function rat(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) }
}

/**
 * Independent iterative reference implementation using naive cross-multiplication
 * and final reduction, for cross-checking against the recursive implementation.
 */
function referenceTraceIterative(matrix) {
	let num = 0n
	let den = 1n
	for (let i = 0; i < matrix.length; i++) {
		let a = matrix[i][i].num
		let b = matrix[i][i].den
		if (b < 0n) {
			a = -a
			b = -b
		}
		num = num * b + a * den
		den = den * b
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

function addRef(a, b) {
	let num = a.num * b.den + b.num * a.den
	let den = a.den * b.den
	if (den < 0n) {
		num = -num
		den = -den
	}
	if (num === 0n) return { num: 0n, den: 1n }
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

function mulRef(a, b) {
	let num = a.num * b.num
	let den = a.den * b.den
	if (den < 0n) {
		num = -num
		den = -den
	}
	if (num === 0n) return { num: 0n, den: 1n }
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

function matMulRef(A, B) {
	const n = A.length
	const C = Array.from({ length: n }, () => new Array(n))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let sum = rat(0, 1)
			for (let k = 0; k < n; k++) {
				sum = addRef(sum, mulRef(A[i][k], B[k][j]))
			}
			C[i][j] = sum
		}
	}
	return C
}

describe('traceRationalRecursive', () => {
	test('computes exact trace for 1x1 matrices', () => {
		const r1 = traceRationalRecursive([[rat(7, 3)]])
		assertLowestTerms(r1)
		assert.deepEqual(r1, { num: 7n, den: 3n })

		const r2 = traceRationalRecursive([[rat(-12, 18)]])
		assertLowestTerms(r2)
		assert.deepEqual(r2, { num: -2n, den: 3n })

		const r3 = traceRationalRecursive([[rat(0, -9)]])
		assertLowestTerms(r3)
		assert.deepEqual(r3, { num: 0n, den: 1n })
	})

	test('computes exact trace for 2x2, 3x3, and 4x4 matrices', () => {
		const m2 = [
			[rat(1, 2), rat(99, 7)],
			[rat(-13, 5), rat(1, 3)],
		]
		const t2 = traceRationalRecursive(m2)
		assertLowestTerms(t2)
		assert.deepEqual(t2, { num: 5n, den: 6n })

		const m3 = [
			[rat(1, 2), rat(2, 3), rat(3, 4)],
			[rat(4, 5), rat(1, 3), rat(6, 7)],
			[rat(7, 8), rat(8, 9), rat(1, 6)],
		]
		const t3 = traceRationalRecursive(m3)
		assertLowestTerms(t3)
		assert.deepEqual(t3, { num: 1n, den: 1n })

		const m4 = [
			[rat(1, 4), rat(5, 1), rat(0, 1), rat(2, 3)],
			[rat(1, 1), rat(3, 8), rat(4, 5), rat(-1, 2)],
			[rat(9, 2), rat(1, 7), rat(-1, 8), rat(3, 1)],
			[rat(0, 1), rat(2, 9), rat(8, 3), rat(1, 2)],
		]
		const t4 = traceRationalRecursive(m4)
		assertLowestTerms(t4)
		// 1/4 + 3/8 - 1/8 + 1/2 = 2/8 + 3/8 - 1/8 + 4/8 = 8/8 = 1
		assert.deepEqual(t4, { num: 1n, den: 1n })
	})

	test('handles zeros, exact cancellation, negatives, and unreduced inputs', () => {
		const allZero = [
			[rat(0, 5), rat(1, 2), rat(-3, 4)],
			[rat(7, 8), rat(0, -3), rat(9, 10)],
			[rat(-1, 6), rat(2, 3), rat(0, 100)],
		]
		const tZero = traceRationalRecursive(allZero)
		assertLowestTerms(tZero)
		assert.deepEqual(tZero, { num: 0n, den: 1n })

		const cancelling = [
			[rat(10, 20), rat(1, 1), rat(2, 1)],
			[rat(3, 1), rat(-6, -18), rat(4, 1)],
			[rat(5, 1), rat(6, 1), rat(25, -30)],
		]
		// 1/2 + 1/3 - 5/6 = 0
		const tCancel = traceRationalRecursive(cancelling)
		assertLowestTerms(tCancel)
		assert.deepEqual(tCancel, { num: 0n, den: 1n })

		const negDens = [
			[rat(4, -6), rat(1, -2)],
			[rat(-3, -9), rat(-10, -15)],
		]
		// -2/3 + 2/3 = 0
		const tNegDen = traceRationalRecursive(negDens)
		assertLowestTerms(tNegDen)
		assert.deepEqual(tNegDen, { num: 0n, den: 1n })

		const negResult = [
			[rat(-5, 6), rat(0, 1)],
			[rat(0, 1), rat(7, -12)],
		]
		// -5/6 - 7/12 = -17/12
		const tNeg = traceRationalRecursive(negResult)
		assertLowestTerms(tNeg)
		assert.deepEqual(tNeg, { num: -17n, den: 12n })
	})

	test('handles large BigInt numerators and denominators accurately', () => {
		const bigA = 10n ** 60n + 7n
		const bigB = 10n ** 60n + 9n
		const bigC = 10n ** 60n + 11n
		const M = [
			[{ num: 1n, den: bigA }, rat(0, 1), rat(0, 1)],
			[rat(0, 1), { num: 1n, den: bigB }, rat(0, 1)],
			[rat(0, 1), rat(0, 1), { num: 1n, den: bigC }],
		]
		const res = traceRationalRecursive(M)
		assertLowestTerms(res)
		const expected = referenceTraceIterative(M)
		assert.deepEqual(res, expected)
	})

	test('does not mutate input matrix or entries', () => {
		const entry00 = { num: -6n, den: -9n }
		const entry11 = { num: 4n, den: -6n }
		const M = [
			[entry00, { num: 2n, den: 4n }],
			[{ num: 3n, den: 6n }, entry11],
		]
		const res = traceRationalRecursive(M)
		assertLowestTerms(res)
		assert.deepEqual(res, { num: 0n, den: 1n })
		assert.deepEqual(entry00, { num: -6n, den: -9n })
		assert.deepEqual(entry11, { num: 4n, den: -6n })
	})

	test('cross-checks against iterative reference and Math floating-point sum', () => {
		// Harmonic diagonal of size 37: sum_{k=1}^{37} 1/k
		const n = 37
		const M = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) =>
				i === j ? rat(1, i + 1) : rat(i - j, i + j + 1)
			)
		)
		const exact = traceRationalRecursive(M)
		assertLowestTerms(exact)

		const ref = referenceTraceIterative(M)
		assert.deepEqual(exact, ref)

		let floatSum = 0
		for (let k = 1; k <= n; k++) {
			floatSum += 1 / k
		}
		// Scale to 1e15 to compare high-precision BigInt ratio against Number sum
		const scale = 10n ** 15n
		const exactApprox = Number((exact.num * scale) / exact.den) / 1e15
		assert.ok(
			Math.abs(exactApprox - floatSum) < 1e-12,
			`Expected ${exactApprox} to match ${floatSum} within 1e-12`
		)
	})

	test('satisfies matrix trace algebraic identities (linearity, transpose, tr(AB) = tr(BA))', () => {
		const A = [
			[rat(1, 2), rat(-3, 4), rat(5, 6)],
			[rat(7, 8), rat(2, 3), rat(-1, 5)],
			[rat(-4, 7), rat(9, 11), rat(3, 13)],
		]
		const B = [
			[rat(2, 5), rat(1, 7), rat(-3, 2)],
			[rat(-5, 3), rat(4, 9), rat(7, 4)],
			[rat(8, 11), rat(-2, 3), rat(5, 6)],
		]

		// tr(A^T) === tr(A)
		const AT = A[0].map((_, j) => A.map((row) => row[j]))
		assert.deepEqual(traceRationalRecursive(AT), traceRationalRecursive(A))

		// tr(A + B) === tr(A) + tr(B)
		const AplusB = A.map((row, i) => row.map((val, j) => addRef(val, B[i][j])))
		const trA = traceRationalRecursive(A)
		const trB = traceRationalRecursive(B)
		const trAplusB = traceRationalRecursive(AplusB)
		assertLowestTerms(trAplusB)
		assert.deepEqual(trAplusB, addRef(trA, trB))

		// tr(c * A) === c * tr(A)
		const c = rat(-7, 15)
		const cA = A.map((row) => row.map((val) => mulRef(c, val)))
		const trcA = traceRationalRecursive(cA)
		assertLowestTerms(trcA)
		assert.deepEqual(trcA, mulRef(c, trA))

		// tr(A * B) === tr(B * A)
		const AB = matMulRef(A, B)
		const BA = matMulRef(B, A)
		const trAB = traceRationalRecursive(AB)
		const trBA = traceRationalRecursive(BA)
		assertLowestTerms(trAB)
		assertLowestTerms(trBA)
		assert.deepEqual(trAB, trBA)
	})

	test('throws TypeError on non-array matrix or non-array rows', () => {
		for (const bad of [null, undefined, 42, '[[1]]', {}, rat(1, 1)]) {
			assert.throws(() => traceRationalRecursive(bad), TypeError)
		}
		assert.throws(() => traceRationalRecursive([rat(1, 1)]), TypeError)
		assert.throws(
			() => traceRationalRecursive([[rat(1, 1), rat(2, 1)], null]),
			TypeError
		)
		assert.throws(
			() => traceRationalRecursive([[rat(1, 1)], 'not-a-row']),
			TypeError
		)
		// Sparse array
		const sparse = new Array(2)
		assert.throws(() => traceRationalRecursive(sparse), TypeError)
	})

	test('throws RangeError on empty or non-square matrices', () => {
		assert.throws(() => traceRationalRecursive([]), RangeError)
		assert.throws(() => traceRationalRecursive([[]]), RangeError)
		// 1x2 rectangular
		assert.throws(
			() => traceRationalRecursive([[rat(1, 1), rat(2, 1)]]),
			RangeError
		)
		// 2x1 rectangular
		assert.throws(
			() => traceRationalRecursive([[rat(1, 1)], [rat(2, 1)]]),
			RangeError
		)
		// Jagged
		assert.throws(
			() =>
				traceRationalRecursive([
					[rat(1, 1), rat(2, 1)],
					[rat(3, 1)],
				]),
			RangeError
		)
	})

	test('throws TypeError or RangeError on invalid entries (diagonal and off-diagonal)', () => {
		// Non-object entry on diagonal
		assert.throws(() => traceRationalRecursive([[null]]), TypeError)
		assert.throws(() => traceRationalRecursive([[undefined]]), TypeError)
		assert.throws(() => traceRationalRecursive([[1]]), TypeError)
		assert.throws(() => traceRationalRecursive([['1/2']]), TypeError)

		// Non-bigint num or den
		assert.throws(
			() => traceRationalRecursive([[{ num: 1, den: 2 }]]),
			TypeError
		)
		assert.throws(
			() => traceRationalRecursive([[{ num: 1n, den: 2 }]]),
			TypeError
		)
		assert.throws(
			() => traceRationalRecursive([[{ num: 1, den: 2n }]]),
			TypeError
		)
		assert.throws(() => traceRationalRecursive([[{ num: 1n }]]), TypeError)
		assert.throws(() => traceRationalRecursive([[{ den: 1n }]]), TypeError)

		// Invalid off-diagonal entry must still be rejected
		assert.throws(
			() =>
				traceRationalRecursive([
					[rat(1, 1), { num: 1, den: 2 }],
					[rat(0, 1), rat(1, 1)],
				]),
			TypeError
		)

		// Zero denominator on diagonal
		assert.throws(
			() => traceRationalRecursive([[{ num: 1n, den: 0n }]]),
			RangeError
		)
		assert.throws(
			() => traceRationalRecursive([[{ num: 0n, den: 0n }]]),
			RangeError
		)

		// Zero denominator off-diagonal must also be rejected
		assert.throws(
			() =>
				traceRationalRecursive([
					[rat(1, 1), { num: 5n, den: 0n }],
					[rat(0, 1), rat(2, 1)],
				]),
			RangeError
		)
	})
})
