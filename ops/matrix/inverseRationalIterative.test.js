import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { inverseRationalIterative } from './inverseRationalIterative.js'

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

function norm(num, den) {
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

function ratAdd(a, b) {
	return norm(a.num * b.den + b.num * a.den, a.den * b.den)
}

function ratSub(a, b) {
	return norm(a.num * b.den - b.num * a.den, a.den * b.den)
}

function ratMul(a, b) {
	return norm(a.num * b.num, a.den * b.den)
}

function ratDiv(a, b) {
	return norm(a.num * b.den, a.den * b.num)
}

function matMul(A, B) {
	const n = A.length
	const out = Array.from({ length: n }, () => new Array(n))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let sum = r(0n, 1n)
			for (let k = 0; k < n; k++) {
				sum = ratAdd(sum, ratMul(A[i][k], B[k][j]))
			}
			out[i][j] = sum
		}
	}
	return out
}

function identity(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? r(1n, 1n) : r(0n, 1n)))
	)
}

function assertNormalizedMatrix(M) {
	const seen = new Set()
	for (let i = 0; i < M.length; i++) {
		for (let j = 0; j < M[i].length; j++) {
			const cell = M[i][j]
			assert.equal(typeof cell.num, 'bigint')
			assert.equal(typeof cell.den, 'bigint')
			assert.ok(cell.den > 0n, `den must be positive at [${i}][${j}]`)
			if (cell.num === 0n) {
				assert.equal(cell.den, 1n, `zero must have den 1n at [${i}][${j}]`)
			} else {
				assert.equal(
					gcd(cell.num, cell.den),
					1n,
					`entry must be in lowest terms at [${i}][${j}]`
				)
			}
			assert.ok(!seen.has(cell), 'output cells must not share object references')
			seen.add(cell)
		}
	}
}

function assertInverseIdentity(A, invA) {
	const I = identity(A.length)
	assertNormalizedMatrix(invA)
	assert.deepEqual(matMul(A, invA), I)
	assert.deepEqual(matMul(invA, A), I)
}

function inverse2x2Adjugate(A) {
	const [[a, b], [c, d]] = A
	const det = ratSub(ratMul(a, d), ratMul(b, c))
	return [
		[ratDiv(d, det), ratDiv(norm(-b.num, b.den), det)],
		[ratDiv(norm(-c.num, c.den), det), ratDiv(a, det)],
	]
}

describe('inverseRationalIterative', () => {
	test('1x1 matrices (integer, negative, fractional)', () => {
		const m1 = [[r(5)]]
		const inv1 = inverseRationalIterative(m1)
		assert.deepEqual(inv1, [[r(1, 5)]])
		assertInverseIdentity(m1, inv1)

		const m2 = [[r(-3, 7)]]
		const inv2 = inverseRationalIterative(m2)
		assert.deepEqual(inv2, [[r(-7, 3)]])
		assertInverseIdentity(m2, inv2)

		const m3 = [[r(1)]]
		const inv3 = inverseRationalIterative(m3)
		assert.deepEqual(inv3, [[r(1)]])
		assertInverseIdentity(m3, inv3)
	})

	test('identity matrices of various sizes', () => {
		for (const n of [1, 2, 3, 4]) {
			const I = identity(n)
			const invI = inverseRationalIterative(I)
			assert.deepEqual(invI, I)
			assertInverseIdentity(I, invI)
		}
	})

	test('2x2 matrices cross-checked with closed-form adjugate formula', () => {
		const cases = [
			[
				[r(4), r(7)],
				[r(2), r(6)],
			],
			[
				[r(-3, 4), r(5, 6)],
				[r(7, 2), r(-1, 3)],
			],
			[
				[r(0), r(2, 3)],
				[r(-5, 7), r(11, 13)],
			],
			[
				[r(1, 100000000000000000001n), r(3, 7)],
				[r(-2, 5), r(9, 11)],
			],
		]

		for (const A of cases) {
			const invA = inverseRationalIterative(A)
			const expected = inverse2x2Adjugate(A)
			assert.deepEqual(invA, expected)
			assertInverseIdentity(A, invA)
		}
	})

	test('3x3 matrices with integer, negative, and fractional entries', () => {
		const A = [
			[r(1), r(2), r(3)],
			[r(0), r(1), r(4)],
			[r(5), r(6), r(0)],
		]
		const expectedA = [
			[r(-24), r(18), r(5)],
			[r(20), r(-15), r(-4)],
			[r(-5), r(4), r(1)],
		]
		const invA = inverseRationalIterative(A)
		assert.deepEqual(invA, expectedA)
		assertInverseIdentity(A, invA)

		const B = [
			[r(1, 2), r(-2, 3), r(3, 4)],
			[r(-4, 5), r(5, 6), r(-6, 7)],
			[r(7, 8), r(8, 9), r(9, 10)],
		]
		const invB = inverseRationalIterative(B)
		assertInverseIdentity(B, invB)
		assert.deepEqual(inverseRationalIterative(invB), B)
	})

	test('matrices requiring row pivoting (zero diagonals and permutations)', () => {
		const antiDiag = [
			[r(0), r(0), r(2)],
			[r(0), r(-3, 5), r(0)],
			[r(7, 4), r(0), r(0)],
		]
		const invAnti = inverseRationalIterative(antiDiag)
		assert.deepEqual(invAnti, [
			[r(0), r(0), r(4, 7)],
			[r(0), r(-5, 3), r(0)],
			[r(1, 2), r(0), r(0)],
		])
		assertInverseIdentity(antiDiag, invAnti)

		const needsMultipleSwaps = [
			[r(0), r(0), r(1), r(2)],
			[r(0), r(3), r(0), r(-1)],
			[r(4), r(0), r(1), r(0)],
			[r(0), r(0), r(0), r(5)],
		]
		const invSwaps = inverseRationalIterative(needsMultipleSwaps)
		assertInverseIdentity(needsMultipleSwaps, invSwaps)
	})

	test('4x4 Hilbert matrix has exact integer inverse', () => {
		const H4 = Array.from({ length: 4 }, (_, i) =>
			Array.from({ length: 4 }, (_, j) => r(1n, BigInt(i + j + 1)))
		)
		const expectedInvH4 = [
			[r(16), r(-120), r(240), r(-140)],
			[r(-120), r(1200), r(-2700), r(1680)],
			[r(240), r(-2700), r(6480), r(-4200)],
			[r(-140), r(1680), r(-4200), r(2800)],
		]
		const invH4 = inverseRationalIterative(H4)
		assert.deepEqual(invH4, expectedInvH4)
		assertInverseIdentity(H4, invH4)
	})

	test('normalizes unreduced and negative-denominator inputs without mutating input', () => {
		const A = [
			[{ num: 2n, den: 4n }, { num: -3n, den: -6n }],
			[{ num: 0n, den: -5n }, { num: 6n, den: -9n }],
		]
		const snapshot = A.map((row) => row.map((cell) => ({ num: cell.num, den: cell.den })))

		const invA = inverseRationalIterative(A)
		assert.deepEqual(A, snapshot, 'input matrix must not be mutated')
		assert.deepEqual(invA, [
			[r(2), r(3, 2)],
			[r(0), r(-3, 2)],
		])
		assertInverseIdentity(
			A.map((row) => row.map((c) => norm(c.num, c.den))),
			invA
		)
	})

	test('large BigInt entries beyond Number.MAX_SAFE_INTEGER', () => {
		const big = 10n ** 30n
		const A = [
			[r(big + 1n, 3n), r(big, 5n)],
			[r(big, 7n), r(big + 2n, 11n)],
		]
		const invA = inverseRationalIterative(A)
		assert.deepEqual(invA, inverse2x2Adjugate(A))
		assertInverseIdentity(A, invA)
	})

	test('throws RangeError on singular matrices', () => {
		const singularCases = [
			[[r(0)]],
			[
				[r(0), r(0)],
				[r(0), r(0)],
			],
			[
				[r(1), r(2)],
				[r(2), r(4)],
			],
			[
				[r(1, 2), r(1, 3)],
				[r(-3, 2), r(-1)],
			],
			[
				[r(1), r(2), r(3)],
				[r(4), r(5), r(6)],
				[r(7), r(8), r(9)],
			],
			[
				[r(1), r(0), r(2)],
				[r(0), r(0), r(3)],
				[r(2), r(0), r(4)],
			],
		]

		for (const S of singularCases) {
			assert.throws(() => inverseRationalIterative(S), RangeError)
		}
	})

	test('throws TypeError and RangeError on invalid inputs', () => {
		// Non-array matrix
		for (const bad of [null, undefined, 42, 'matrix', {}, 1n]) {
			assert.throws(() => inverseRationalIterative(bad), TypeError)
		}

		// Empty matrix
		assert.throws(() => inverseRationalIterative([]), RangeError)

		// Non-array row
		assert.throws(() => inverseRationalIterative([123]), TypeError)
		assert.throws(() => inverseRationalIterative([[r(1), r(2)], null]), TypeError)

		// Non-square matrices
		assert.throws(() => inverseRationalIterative([[]]), RangeError)
		assert.throws(() => inverseRationalIterative([[r(1), r(2)]]), RangeError)
		assert.throws(() => inverseRationalIterative([[r(1)], [r(2)]]), RangeError)
		assert.throws(
			() =>
				inverseRationalIterative([
					[r(1), r(2)],
					[r(3)],
				]),
			RangeError
		)

		// Invalid rational entries
		for (const badEntry of [
			null,
			undefined,
			1,
			1n,
			'1/2',
			[1n, 2n],
			{},
			{ num: 1n },
			{ den: 1n },
			{ num: 1, den: 1n },
			{ num: 1n, den: 1 },
		]) {
			assert.throws(() => inverseRationalIterative([[badEntry]]), TypeError)
		}

		// Zero denominator
		assert.throws(() => inverseRationalIterative([[{ num: 1n, den: 0n }]]), RangeError)
		assert.throws(() => inverseRationalIterative([[{ num: 0n, den: 0n }]]), RangeError)
	})
})
