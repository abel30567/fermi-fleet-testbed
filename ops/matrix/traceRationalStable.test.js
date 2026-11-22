import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { traceRationalStable } from './traceRationalStable.js'

const R = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

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

function naiveReduce({ num, den }) {
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

function naiveAdd(a, b) {
	return naiveReduce({
		num: a.num * b.den + b.num * a.den,
		den: a.den * b.den,
	})
}

function naiveTrace(matrix) {
	let acc = { num: 0n, den: 1n }
	for (let i = 0; i < matrix.length; i++) {
		acc = naiveAdd(acc, naiveReduce(matrix[i][i]))
	}
	return acc
}

function addMatrices(A, B) {
	return A.map((row, i) => row.map((entry, j) => naiveAdd(entry, B[i][j])))
}

function generatePrimes(count) {
	const primes = []
	let candidate = 2n
	while (primes.length < count) {
		let isPrime = true
		for (const p of primes) {
			if (p * p > candidate) break
			if (candidate % p === 0n) {
				isPrime = false
				break
			}
		}
		if (isPrime) primes.push(candidate)
		candidate += candidate === 2n ? 1n : 2n
	}
	return primes
}

function makeDiagonalMatrix(diag, offDiag = R(0n, 1n)) {
	const n = diag.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? diag[i] : offDiag)),
	)
}

function assertCanonical(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`)
	}
}

describe('traceRationalStable', () => {
	it('computes trace of normal 2x2 and 3x3 rational matrices and ignores off-diagonal values', () => {
		const m2 = [
			[R(1, 2), R(999, 7)],
			[R(-500, 13), R(1, 3)],
		]
		assert.deepEqual(traceRationalStable(m2), R(5, 6))

		const m3 = [
			[R(3, 4), R(7, 11), R(-2, 5)],
			[R(100, 3), R(-5, 6), R(8, 9)],
			[R(-1, 2), R(4, 15), R(7, 12)],
		]
		// 3/4 - 5/6 + 7/12 = (9 - 10 + 7) / 12 = 6/12 = 1/2
		const res = traceRationalStable(m3)
		assertCanonical(res)
		assert.deepEqual(res, R(1, 2))
	})

	it('handles 1x1 matrices including zero, negative, and unreduced entries', () => {
		assert.deepEqual(traceRationalStable([[R(0, 5)]]), R(0, 1))
		assert.deepEqual(traceRationalStable([[R(0, -9)]]), R(0, 1))
		assert.deepEqual(traceRationalStable([[R(6, 9)]]), R(2, 3))
		assert.deepEqual(traceRationalStable([[R(-14, 21)]]), R(-2, 3))
		assert.deepEqual(traceRationalStable([[R(15, -25)]]), R(-3, 5))
		assert.deepEqual(traceRationalStable([[R(-15, -25)]]), R(3, 5))
	})

	it('handles cancelling diagonal entries to canonical 0/1', () => {
		// Same-denominator cancellation
		const sameDen = makeDiagonalMatrix([R(7, 13), R(-7, 13), R(4, 19), R(-4, 19)])
		assert.deepEqual(traceRationalStable(sameDen), R(0, 1))

		// Multi-term distinct-denominator cancellation: 1/2 + 1/3 + 1/6 - 1 = 0
		const distinctDen = makeDiagonalMatrix([R(1, 2), R(1, 3), R(1, 6), R(-1, 1)])
		assert.deepEqual(traceRationalStable(distinctDen), R(0, 1))

		// Pairwise intermediate cancellation with remaining survivor
		const withSurvivor = makeDiagonalMatrix([R(1, 2), R(1, 3), R(-5, 6), R(11, 17)])
		assert.deepEqual(traceRationalStable(withSurvivor), R(11, 17))

		// All-zero diagonal
		const allZero = makeDiagonalMatrix([R(0, 3), R(0, -5), R(0, 11)], R(5, 7))
		assert.deepEqual(traceRationalStable(allZero), R(0, 1))
	})

	it('normalizes negative denominators and unreduced inputs', () => {
		const m = [
			[R(12, -18), R(-4, -8)],
			[R(0, -3), R(-10, -15)],
		]
		// -2/3 + 2/3 = 0/1
		assert.deepEqual(traceRationalStable(m), R(0, 1))

		const m2 = [
			[R(-18, -24), R(2, -4)],
			[R(6, -12), R(20, -30)],
		]
		// 3/4 - 2/3 = 1/12
		const res = traceRationalStable(m2)
		assertCanonical(res)
		assert.deepEqual(res, R(1, 12))
	})

	it('handles very large BigInt values accurately without precision loss', () => {
		const bigA = (1n << 128n) + 1n
		const bigB = (1n << 128n) + 3n
		const m = makeDiagonalMatrix([
			{ num: bigA, den: bigB },
			{ num: -bigA, den: bigB },
			{ num: 1n, den: 1n << 100n },
		])
		const res = traceRationalStable(m)
		assertCanonical(res)
		assert.deepEqual(res, { num: 1n, den: 1n << 100n })
	})

	it('does not mutate inputs or return aliases to input objects', () => {
		const entry = R(6, 9)
		const m = [[entry]]
		const res = traceRationalStable(m)
		assert.deepEqual(res, R(2, 3))
		assert.deepEqual(entry, R(6, 9))
		assert.notEqual(res, entry)

		const alreadyReduced = R(2, 3)
		const res2 = traceRationalStable([[alreadyReduced]])
		assert.deepEqual(res2, R(2, 3))
		assert.notEqual(res2, alreadyReduced)
	})

	it('matches sequential naive rational summation on a large diagonal with many distinct primes', () => {
		const primes = generatePrimes(100)
		const diag = primes.map((p, idx) => ({
			num: idx % 3 === 0 ? -BigInt(idx + 1) : BigInt(idx + 1),
			den: idx % 5 === 0 ? -p : p,
		}))
		const matrix = makeDiagonalMatrix(diag, R(1, 2))

		const stable = traceRationalStable(matrix)
		const naive = naiveTrace(matrix)

		assertCanonical(stable)
		assert.deepEqual(stable, naive)

		// Verify denominator equals product of all 100 distinct primes
		// (since each numerator is not divisible by its prime denominator, except if idx+1 is a multiple of p).
		// Check specifically that stable matches naive numerator and denominator bit-for-bit.
		assert.ok(stable.den > 10n ** 150n, 'expected large exact BigInt denominator across 100 primes')
	})

	it('satisfies linearity tr(A + B) === tr(A) + tr(B) and matches naive summation on dense matrices', () => {
		const n = 12
		const A = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => ({
				num: BigInt(((i * 7 - j * 5 + 3) % 19) - 9),
				den: BigInt(((i + j) % 2 === 0 ? 1 : -1) * (2 + ((i * 3 + j * 5) % 17))),
			})),
		)
		const B = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => ({
				num: BigInt(((i * 11 + j * 3 - 4) % 23) - 11),
				den: BigInt(((i * j) % 3 === 0 ? -1 : 1) * (3 + ((i * 5 + j * 2) % 19))),
			})),
		)

		const trA = traceRationalStable(A)
		const trB = traceRationalStable(B)
		const trSum = traceRationalStable(addMatrices(A, B))
		const sumTr = naiveAdd(trA, trB)

		assertCanonical(trA)
		assertCanonical(trB)
		assertCanonical(trSum)
		assert.deepEqual(trA, naiveTrace(A))
		assert.deepEqual(trB, naiveTrace(B))
		assert.deepEqual(trSum, sumTr)
	})

	it('rejects invalid, empty, non-square, and malformed inputs (including off-diagonal entries)', () => {
		// Non-array matrices
		assert.throws(() => traceRationalStable(null), TypeError)
		assert.throws(() => traceRationalStable(undefined), TypeError)
		assert.throws(() => traceRationalStable(42), TypeError)
		assert.throws(() => traceRationalStable({}), TypeError)

		// Empty matrix
		assert.throws(() => traceRationalStable([]), RangeError)

		// Non-array rows
		assert.throws(() => traceRationalStable([null]), TypeError)
		assert.throws(() => traceRationalStable(['not a row']), TypeError)

		// Non-square matrices
		assert.throws(() => traceRationalStable([[R(1, 1), R(2, 1)]]), RangeError)
		assert.throws(() => traceRationalStable([[R(1, 1)], [R(2, 1)]]), RangeError)
		assert.throws(
			() => traceRationalStable([[R(1, 1), R(2, 1)], [R(3, 1)]]),
			RangeError,
		)

		// Invalid entry types (diagonal and off-diagonal)
		assert.throws(() => traceRationalStable([[null]]), TypeError)
		assert.throws(() => traceRationalStable([[undefined]]), TypeError)
		assert.throws(() => traceRationalStable([[{ num: 1, den: 2n }]]), TypeError)
		assert.throws(() => traceRationalStable([[{ num: 1n, den: 2 }]]), TypeError)
		assert.throws(() => traceRationalStable([[{ num: 1n }]]), TypeError)
		assert.throws(() => traceRationalStable([[[]]]), TypeError)

		// Invalid off-diagonal entry must still be rejected
		assert.throws(
			() =>
				traceRationalStable([
					[R(1, 1), { num: 1, den: 2n }],
					[R(0, 1), R(2, 1)],
				]),
			TypeError,
		)

		// Zero denominators (diagonal and off-diagonal)
		assert.throws(() => traceRationalStable([[R(1, 0)]]), RangeError)
		assert.throws(() => traceRationalStable([[R(0, 0)]]), RangeError)
		assert.throws(
			() =>
				traceRationalStable([
					[R(1, 1), R(5, 0)],
					[R(0, 1), R(2, 1)],
				]),
			RangeError,
		)
	})
})
