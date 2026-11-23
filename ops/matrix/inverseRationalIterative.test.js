import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { inverseRationalIterative } from './inverseRationalIterative.js'

const R = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

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
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

function ratAdd(a, b) {
	return norm(a.num * b.den + b.num * a.den, a.den * b.den)
}

function ratMul(a, b) {
	return norm(a.num * b.num, a.den * b.den)
}

function matMul(A, B) {
	const n = A.length
	const C = Array.from({ length: n }, () => new Array(n))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let sum = R(0n, 1n)
			for (let k = 0; k < n; k++) {
				sum = ratAdd(sum, ratMul(A[i][k], B[k][j]))
			}
			C[i][j] = sum
		}
	}
	return C
}

function identity(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => R(i === j ? 1n : 0n, 1n))
	)
}

function transpose(A) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => ({ num: A[j][i].num, den: A[j][i].den }))
	)
}

function assertCanonicalRationals(M) {
	for (let i = 0; i < M.length; i++) {
		for (let j = 0; j < M[i].length; j++) {
			const { num, den } = M[i][j]
			assert.equal(typeof num, 'bigint', `(${i},${j}).num should be bigint`)
			assert.equal(typeof den, 'bigint', `(${i},${j}).den should be bigint`)
			assert.ok(den > 0n, `(${i},${j}).den should be positive`)
			if (num === 0n) {
				assert.equal(den, 1n, `(${i},${j}) zero must have den === 1n`)
			} else {
				assert.equal(gcd(num, den), 1n, `(${i},${j}) must be in lowest terms`)
			}
		}
	}
}

function binomial(n, k) {
	if (k < 0n || k > n) return 0n
	let kk = k > n - k ? n - k : k
	let res = 1n
	for (let i = 1n; i <= kk; i++) {
		res = (res * (n - kk + i)) / i
	}
	return res
}

function hilbertMatrix(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => R(1n, BigInt(i + j + 1)))
	)
}

// Analytical closed-form inverse of the n x n Hilbert matrix (all entries are exact integers)
function exactHilbertInverse(n) {
	const N = BigInt(n)
	return Array.from({ length: n }, (_, i0) => {
		const i = BigInt(i0 + 1)
		return Array.from({ length: n }, (_, j0) => {
			const j = BigInt(j0 + 1)
			const sign = (i + j) % 2n === 0n ? 1n : -1n
			const b1 = binomial(N + i - 1n, N - j)
			const b2 = binomial(N + j - 1n, N - i)
			const b3 = binomial(i + j - 2n, i - 1n)
			return R(sign * (i + j - 1n) * b1 * b2 * b3 * b3, 1n)
		})
	})
}

describe('inverseRationalIterative', () => {
	test('1x1 matrices (positive, negative, fractional)', () => {
		assert.deepEqual(inverseRationalIterative([[R(5, 1)]]), [[R(1, 5)]])
		assert.deepEqual(inverseRationalIterative([[R(-3, 7)]]), [[R(-7, 3)]])
		assert.deepEqual(inverseRationalIterative([[R(1, 1)]]), [[R(1, 1)]])
		assert.deepEqual(inverseRationalIterative([[R(-1, 1)]]), [[R(-1, 1)]])
	})

	test('2x2 matrix matches closed-form formula', () => {
		const A = [
			[R(4, 1), R(7, 1)],
			[R(2, 1), R(6, 1)],
		]
		const inv = inverseRationalIterative(A)
		assertCanonicalRationals(inv)
		assert.deepEqual(inv, [
			[R(3, 5), R(-7, 10)],
			[R(-1, 5), R(2, 5)],
		])
	})

	test('3x3 matrix requiring row swaps (zero pivots on diagonal)', () => {
		const A = [
			[R(0, 1), R(2, 3), R(1, 1)],
			[R(1, 2), R(0, 1), R(-3, 4)],
			[R(3, 5), R(1, 1), R(0, 1)],
		]
		const inv = inverseRationalIterative(A)
		assertCanonicalRationals(inv)
		assert.deepEqual(matMul(A, inv), identity(3))
		assert.deepEqual(matMul(inv, A), identity(3))
		assert.deepEqual(inverseRationalIterative(inv), A)
	})

	test('identity, diagonal, and permutation matrices', () => {
		const I4 = identity(4)
		assert.deepEqual(inverseRationalIterative(I4), I4)

		const D = [
			[R(2, 3), R(0), R(0)],
			[R(0), R(-5, 7), R(0)],
			[R(0), R(0), R(11, 13)],
		]
		assert.deepEqual(inverseRationalIterative(D), [
			[R(3, 2), R(0), R(0)],
			[R(0), R(-7, 5), R(0)],
			[R(0), R(0), R(13, 11)],
		])

		const P = [
			[R(0), R(1), R(0)],
			[R(0), R(0), R(1)],
			[R(1), R(0), R(0)],
		]
		const Pinv = inverseRationalIterative(P)
		assert.deepEqual(Pinv, transpose(P))
		assert.deepEqual(matMul(P, Pinv), identity(3))
	})

	test('normalizes unreduced inputs and negative denominators, accepts BigInt/int shorthands, does not mutate input', () => {
		const raw = [
			[
				{ num: 4n, den: -6n },
				{ num: 6n, den: 9n },
			],
			[
				{ num: -2n, den: -4n },
				{ num: 0n, den: -5n },
			],
		]
		const snapshot = raw.map((row) => row.map((e) => ({ ...e })))
		const inv = inverseRationalIterative(raw)
		assertCanonicalRationals(inv)
		assert.deepEqual(raw, snapshot)

		const expected = [
			[R(0, 1), R(2, 1)],
			[R(3, 2), R(2, 1)],
		]
		assert.deepEqual(inv, expected)

		// Bare BigInt and safe integer inputs
		const invInt = inverseRationalIterative([
			[1, 2],
			[3n, 4n],
		])
		assertCanonicalRationals(invInt)
		assert.deepEqual(invInt, [
			[R(-2, 1), R(1, 1)],
			[R(3, 2), R(-1, 2)],
		])
	})

	test('Hilbert matrices exact inverse (n = 3, 4, 5, 6, 8) matches analytical formula', () => {
		for (const n of [3, 4, 5, 6, 8]) {
			const H = hilbertMatrix(n)
			const invH = inverseRationalIterative(H)
			assertCanonicalRationals(invH)

			const expected = exactHilbertInverse(n)
			assert.deepEqual(invH, expected)

			// Independent cross-checks: H * inv(H) = I, inv(H) * H = I, inv(inv(H)) = H
			assert.deepEqual(matMul(H, invH), identity(n))
			assert.deepEqual(matMul(invH, H), identity(n))
			assert.deepEqual(inverseRationalIterative(invH), H)
		}
	})

	test('large BigInt entries beyond Number.MAX_SAFE_INTEGER remain exact', () => {
		const big = 10n ** 30n
		const A = [
			[R(big, 1n), R(big + 1n, 1n)],
			[R(big + 2n, 1n), R(big + 3n, 1n)],
		]
		// det = big*(big+3) - (big+1)*(big+2) = (big^2 + 3big) - (big^2 + 3big + 2) = -2
		const inv = inverseRationalIterative(A)
		assertCanonicalRationals(inv)
		assert.deepEqual(matMul(A, inv), identity(2))
		assert.deepEqual(matMul(inv, A), identity(2))
		assert.deepEqual(inverseRationalIterative(inv), A)
	})

	test('independent algebraic cross-checks: (AB)^-1 = B^-1 A^-1 and (A^T)^-1 = (A^-1)^T', () => {
		const A = [
			[R(2, 3), R(-1, 5), R(4, 7), R(1, 2)],
			[R(3, 4), R(5, 6), R(-2, 3), R(0, 1)],
			[R(-1, 2), R(0, 1), R(3, 5), R(7, 8)],
			[R(1, 3), R(2, 7), R(-1, 4), R(5, 9)],
		]
		const B = [
			[R(1, 2), R(3, 4), R(-1, 3), R(2, 5)],
			[R(-2, 3), R(1, 5), R(4, 7), R(-1, 2)],
			[R(5, 6), R(-3, 8), R(1, 4), R(3, 7)],
			[R(0, 1), R(2, 3), R(-5, 6), R(1, 3)],
		]

		const invA = inverseRationalIterative(A)
		const invB = inverseRationalIterative(B)
		const AB = matMul(A, B)
		const invAB = inverseRationalIterative(AB)

		assertCanonicalRationals(invA)
		assertCanonicalRationals(invB)
		assertCanonicalRationals(invAB)

		// A * inv(A) = I and inv(A) * A = I
		assert.deepEqual(matMul(A, invA), identity(4))
		assert.deepEqual(matMul(invA, A), identity(4))
		// inv(inv(A)) = A
		assert.deepEqual(inverseRationalIterative(invA), A)
		// inv(A * B) = inv(B) * inv(A)
		assert.deepEqual(invAB, matMul(invB, invA))
		// inv(A^T) = (inv(A))^T
		assert.deepEqual(inverseRationalIterative(transpose(A)), transpose(invA))
	})

	test('singular matrices throw', () => {
		// 1x1 zero
		assert.throws(() => inverseRationalIterative([[R(0, 1)]]), /singular/i)

		// 2x2 proportional rows
		assert.throws(
			() =>
				inverseRationalIterative([
					[R(1, 2), R(2, 3)],
					[R(3, 2), R(2, 1)],
				]),
			/singular/i
		)

		// 3x3 rank-deficient (row 3 = row 1 + row 2)
		assert.throws(
			() =>
				inverseRationalIterative([
					[R(1, 3), R(2, 5), R(3, 7)],
					[R(4, 9), R(-1, 2), R(5, 11)],
					[R(7, 9), R(-1, 10), R(68, 77)],
				]),
			/singular/i
		)

		// Zero column
		assert.throws(
			() =>
				inverseRationalIterative([
					[R(1), R(0), R(2)],
					[R(3), R(0), R(4)],
					[R(5), R(0), R(6)],
				]),
			/singular/i
		)
	})

	test('invalid inputs throw appropriate errors', () => {
		assert.throws(() => inverseRationalIterative(null), TypeError)
		assert.throws(() => inverseRationalIterative(undefined), TypeError)
		assert.throws(() => inverseRationalIterative(123), TypeError)
		assert.throws(() => inverseRationalIterative([]), TypeError)
		assert.throws(() => inverseRationalIterative([1, 2]), TypeError)
		assert.throws(
			() => inverseRationalIterative([[R(1), R(2)]]),
			TypeError
		)
		assert.throws(
			() =>
				inverseRationalIterative([
					[R(1), R(2)],
					[R(3)],
				]),
			TypeError
		)
		assert.throws(
			() => inverseRationalIterative([[{ num: 1n, den: 0n }]]),
			RangeError
		)
		assert.throws(() => inverseRationalIterative([[1.5]]), TypeError)
		assert.throws(() => inverseRationalIterative([[NaN]]), TypeError)
		assert.throws(() => inverseRationalIterative([[Infinity]]), TypeError)
		assert.throws(() => inverseRationalIterative([['1']]), TypeError)
		assert.throws(() => inverseRationalIterative([[{}]]), TypeError)
		assert.throws(
			() => inverseRationalIterative([[{ num: 1n, den: '2' }]]),
			TypeError
		)
		assert.throws(() => inverseRationalIterative([[null]]), TypeError)
	})
})
