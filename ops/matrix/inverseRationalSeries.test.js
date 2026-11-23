import { test } from 'node:test'
import assert from 'node:assert'
import { inverseRationalSeries } from './inverseRationalSeries.js'

function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function rat(num, den = 1n) {
	const n = BigInt(num)
	const d = BigInt(den)
	if (d === 0n) throw new RangeError('Zero denominator')
	if (n === 0n) return { num: 0n, den: 1n }
	const sign = d < 0n ? -1n : 1n
	const sn = n * sign
	const sd = d * sign
	const g = gcdBigInt(sn, sd)
	return { num: sn / g, den: sd / g }
}

function ratAdd(a, b) {
	return rat(a.num * b.den + b.num * a.den, a.den * b.den)
}

function ratMul(a, b) {
	return rat(a.num * b.num, a.den * b.den)
}

function matMul(A, B) {
	const n = A.length
	const out = Array.from({ length: n }, () => new Array(n))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let sum = rat(0n)
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
		Array.from({ length: n }, (_, j) => (i === j ? rat(1n) : rat(0n)))
	)
}

function assertNormalizedMatrix(M) {
	for (let i = 0; i < M.length; i++) {
		for (let j = 0; j < M[i].length; j++) {
			const e = M[i][j]
			assert.strictEqual(typeof e.num, 'bigint', `entry [${i}][${j}].num must be bigint`)
			assert.strictEqual(typeof e.den, 'bigint', `entry [${i}][${j}].den must be bigint`)
			assert.ok(e.den > 0n, `entry [${i}][${j}].den must be > 0n`)
			assert.strictEqual(gcdBigInt(e.num, e.den), 1n, `entry [${i}][${j}] must be in lowest terms`)
			if (e.num === 0n) {
				assert.strictEqual(e.den, 1n, `zero entry [${i}][${j}] must have den === 1n`)
			}
		}
	}
}

function binomial(n, k) {
	if (k < 0n || k > n) return 0n
	let r = 1n
	const m = k < n - k ? k : n - k
	for (let i = 1n; i <= m; i++) {
		r = (r * (n - m + i)) / i
	}
	return r
}

function hilbertMatrix(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => rat(1n, BigInt(i + j + 1)))
	)
}

function closedFormHilbertInverse(n) {
	const N = BigInt(n)
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => {
			const I = BigInt(i)
			const J = BigInt(j)
			const sign = (i + j) % 2 === 0 ? 1n : -1n
			const c1 = binomial(N + I, N - J - 1n)
			const c2 = binomial(N + J, N - I - 1n)
			const c3 = binomial(I + J, I)
			return rat(sign * (I + J + 1n) * c1 * c2 * c3 * c3, 1n)
		})
	)
}

test('1x1 matrices: positive, negative, fractional, and unreduced input', () => {
	const inv1 = inverseRationalSeries([[rat(5, 1)]])
	assertNormalizedMatrix(inv1)
	assert.deepStrictEqual(inv1, [[rat(1, 5)]])

	const inv2 = inverseRationalSeries([[rat(-3, 7)]])
	assertNormalizedMatrix(inv2)
	assert.deepStrictEqual(inv2, [[rat(-7, 3)]])

	// Unreduced with negative denominator: -6 / -9 === 2 / 3 => inverse 3 / 2
	const inv3 = inverseRationalSeries([[{ num: -6n, den: -9n }]])
	assertNormalizedMatrix(inv3)
	assert.deepStrictEqual(inv3, [[{ num: 3n, den: 2n }]])
})

test('2x2 matrices: integer and fractional entries', () => {
	const A = [
		[rat(4), rat(7)],
		[rat(2), rat(6)],
	]
	const invA = inverseRationalSeries(A)
	assertNormalizedMatrix(invA)
	assert.deepStrictEqual(invA, [
		[rat(3, 5), rat(-7, 10)],
		[rat(-1, 5), rat(2, 5)],
	])
	assert.deepStrictEqual(matMul(A, invA), identity(2))
	assert.deepStrictEqual(matMul(invA, A), identity(2))

	const B = [
		[rat(1, 2), rat(-1, 3)],
		[rat(2, 5), rat(3, 4)],
	]
	const invB = inverseRationalSeries(B)
	assertNormalizedMatrix(invB)
	assert.deepStrictEqual(matMul(B, invB), identity(2))
	assert.deepStrictEqual(matMul(invB, B), identity(2))
	assert.deepStrictEqual(inverseRationalSeries(invB), B)
})

test('3x3 matrices: general rational matrix and pivoting on zero diagonal', () => {
	const A = [
		[rat(2), rat(-1), rat(0)],
		[rat(-1), rat(2), rat(-1)],
		[rat(0), rat(-1), rat(2)],
	]
	const invA = inverseRationalSeries(A)
	assertNormalizedMatrix(invA)
	assert.deepStrictEqual(invA, [
		[rat(3, 4), rat(1, 2), rat(1, 4)],
		[rat(1, 2), rat(1, 1), rat(1, 2)],
		[rat(1, 4), rat(1, 2), rat(3, 4)],
	])
	assert.deepStrictEqual(matMul(A, invA), identity(3))
	assert.deepStrictEqual(matMul(invA, A), identity(3))

	// Zero in top-left requires row swap during elimination
	const P = [
		[rat(0), rat(1, 2), rat(1, 3)],
		[rat(2, 3), rat(0), rat(-1, 5)],
		[rat(1, 4), rat(3, 5), rat(0)],
	]
	const invP = inverseRationalSeries(P)
	assertNormalizedMatrix(invP)
	assert.deepStrictEqual(matMul(P, invP), identity(3))
	assert.deepStrictEqual(matMul(invP, P), identity(3))
	assert.deepStrictEqual(inverseRationalSeries(invP), P)
})

test('Hilbert matrices H_3, H_4, H_5 match exact closed-form integer inverse', () => {
	for (const n of [3, 4, 5]) {
		const H = hilbertMatrix(n)
		const invH = inverseRationalSeries(H)
		const expected = closedFormHilbertInverse(n)
		assertNormalizedMatrix(invH)
		assert.deepStrictEqual(invH, expected)
		assert.deepStrictEqual(matMul(H, invH), identity(n))
		assert.deepStrictEqual(matMul(invH, H), identity(n))
		assert.deepStrictEqual(inverseRationalSeries(invH), H)
	}
})

test('edge cases: identity and permutation matrices', () => {
	for (const n of [1, 2, 3, 4]) {
		const I = identity(n)
		const invI = inverseRationalSeries(I)
		assertNormalizedMatrix(invI)
		assert.deepStrictEqual(invI, I)
	}

	// 4x4 cyclic permutation matrix: P^-1 === P^T
	const P = [
		[rat(0), rat(1), rat(0), rat(0)],
		[rat(0), rat(0), rat(1), rat(0)],
		[rat(0), rat(0), rat(0), rat(1)],
		[rat(1), rat(0), rat(0), rat(0)],
	]
	const PT = [
		[rat(0), rat(0), rat(0), rat(1)],
		[rat(1), rat(0), rat(0), rat(0)],
		[rat(0), rat(1), rat(0), rat(0)],
		[rat(0), rat(0), rat(1), rat(0)],
	]
	const invP = inverseRationalSeries(P)
	assertNormalizedMatrix(invP)
	assert.deepStrictEqual(invP, PT)
	assert.deepStrictEqual(matMul(P, invP), identity(4))
})

test('edge cases: singular matrices throw', () => {
	assert.throws(() => inverseRationalSeries([[rat(0)]]), /singular/i)

	assert.throws(
		() =>
			inverseRationalSeries([
				[rat(1), rat(2)],
				[rat(2), rat(4)],
			]),
		/singular/i
	)

	assert.throws(
		() =>
			inverseRationalSeries([
				[rat(1), rat(2), rat(3)],
				[rat(4), rat(5), rat(6)],
				[rat(7), rat(8), rat(9)],
			]),
		/singular/i
	)

	// Zero column
	assert.throws(
		() =>
			inverseRationalSeries([
				[rat(1), rat(0), rat(2)],
				[rat(3), rat(0), rat(4)],
				[rat(5), rat(0), rat(6)],
			]),
		/singular/i
	)
})

test('invalid inputs throw descriptive errors', () => {
	assert.throws(() => inverseRationalSeries(null), TypeError)
	assert.throws(() => inverseRationalSeries(undefined), TypeError)
	assert.throws(() => inverseRationalSeries(42), TypeError)
	assert.throws(() => inverseRationalSeries('matrix'), TypeError)
	assert.throws(() => inverseRationalSeries([]), RangeError)

	// Non-array row
	assert.throws(() => inverseRationalSeries([null]), TypeError)

	// Non-square matrices
	assert.throws(
		() =>
			inverseRationalSeries([
				[rat(1), rat(2), rat(3)],
				[rat(4), rat(5), rat(6)],
			]),
		RangeError
	)
	assert.throws(
		() =>
			inverseRationalSeries([
				[rat(1), rat(2)],
				[rat(3)],
			]),
		RangeError
	)

	// Invalid rational entries
	assert.throws(() => inverseRationalSeries([[1]]), TypeError)
	assert.throws(() => inverseRationalSeries([[null]]), TypeError)
	assert.throws(() => inverseRationalSeries([[{ num: 1, den: 2 }]]), TypeError)
	assert.throws(() => inverseRationalSeries([[{ num: 1n, den: 2 }]]), TypeError)
	assert.throws(() => inverseRationalSeries([[{ num: 1n, den: 0n }]]), RangeError)
})

test('independent cross-checks: product inverse identity (A*B)^-1 === B^-1 * A^-1 and immutability', () => {
	const A = [
		[rat(3, 2), rat(-1, 4), rat(2, 5)],
		[rat(1, 3), rat(5, 6), rat(-2, 7)],
		[rat(-4, 5), rat(1, 2), rat(7, 3)],
	]
	const B = [
		[rat(2, 7), rat(3, 5), rat(-1, 2)],
		[rat(-5, 3), rat(1, 4), rat(4, 9)],
		[rat(1, 6), rat(-2, 3), rat(5, 4)],
	]

	const snapshotA = JSON.stringify(A, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
	const invA = inverseRationalSeries(A)
	const invB = inverseRationalSeries(B)
	const invAB = inverseRationalSeries(matMul(A, B))

	assertNormalizedMatrix(invA)
	assertNormalizedMatrix(invB)
	assertNormalizedMatrix(invAB)

	// (A * B)^-1 === B^-1 * A^-1
	assert.deepStrictEqual(invAB, matMul(invB, invA))
	// A * A^-1 === I, A^-1 * A === I, (A^-1)^-1 === A
	assert.deepStrictEqual(matMul(A, invA), identity(3))
	assert.deepStrictEqual(matMul(invA, A), identity(3))
	assert.deepStrictEqual(inverseRationalSeries(invA), A)

	// Verify input matrix was not mutated
	const afterA = JSON.stringify(A, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
	assert.strictEqual(afterA, snapshotA)
})
