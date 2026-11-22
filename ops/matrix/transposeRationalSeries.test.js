import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { transposeRationalSeries } from './transposeRationalSeries.js'

/** @param {bigint} num @param {bigint} [den=1n] */
const q = (num, den = 1n) => ({ num, den })

/** @param {bigint} a @param {bigint} b */
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

/** @param {{ num: bigint, den: bigint }} r */
function norm(r) {
	if (r.num === 0n) return { num: 0n, den: 1n }
	const sNum = r.den < 0n ? -r.num : r.num
	const pDen = r.den < 0n ? -r.den : r.den
	const g = gcd(sNum, pDen)
	return { num: sNum / g, den: pDen / g }
}

/** @param {{ num: bigint, den: bigint }} a @param {{ num: bigint, den: bigint }} b */
function qAdd(a, b) {
	return norm({ num: a.num * b.den + b.num * a.den, den: a.den * b.den })
}

/** @param {{ num: bigint, den: bigint }} a @param {{ num: bigint, den: bigint }} b */
function qMul(a, b) {
	return norm({ num: a.num * b.num, den: a.den * b.den })
}

/** Independent exact rational matrix addition A + B */
function matAdd(A, B) {
	return A.map((row, i) => row.map((val, j) => qAdd(val, B[i][j])))
}

/** Independent exact rational matrix scalar multiplication c * A */
function matScale(c, A) {
	return A.map((row) => row.map((val) => qMul(c, val)))
}

/** Independent exact rational matrix multiplication A * B */
function matMul(A, B) {
	const r = A.length
	const k = A[0].length
	const c = B[0].length
	const out = Array.from({ length: r }, () => new Array(c))
	for (let i = 0; i < r; i++) {
		for (let j = 0; j < c; j++) {
			let acc = q(0n, 1n)
			for (let t = 0; t < k; t++) {
				acc = qAdd(acc, qMul(A[i][t], B[t][j]))
			}
			out[i][j] = acc
		}
	}
	return out
}

/** Asserts every entry in matrix M is a canonical lowest-terms rational with den > 0n */
function assertCanonicalMatrix(M) {
	assert.ok(Array.isArray(M) && M.length > 0)
	const cols = M[0].length
	assert.ok(cols > 0)
	for (let i = 0; i < M.length; i++) {
		assert.equal(M[i].length, cols)
		for (let j = 0; j < cols; j++) {
			const { num, den } = M[i][j]
			assert.equal(typeof num, 'bigint', `entry [${i}][${j}].num must be bigint`)
			assert.equal(typeof den, 'bigint', `entry [${i}][${j}].den must be bigint`)
			assert.ok(den > 0n, `entry [${i}][${j}].den must be positive, got ${den}`)
			if (num === 0n) {
				assert.equal(den, 1n, `zero entry [${i}][${j}] must have den === 1n`)
			} else {
				assert.equal(
					gcd(num, den),
					1n,
					`entry [${i}][${j}] = ${num}/${den} is not in lowest terms`
				)
			}
		}
	}
}

describe('transposeRationalSeries', () => {
	describe('normal cases', () => {
		test('1x1 square matrix', () => {
			const M = [[q(-7n, 3n)]]
			const T = transposeRationalSeries(M)
			assertCanonicalMatrix(T)
			assert.deepEqual(T, [[q(-7n, 3n)]])
		})

		test('2x2 square matrix', () => {
			const M = [
				[q(1n, 2n), q(-3n, 4n)],
				[q(5n, 6n), q(0n, 1n)],
			]
			const T = transposeRationalSeries(M)
			assertCanonicalMatrix(T)
			assert.deepEqual(T, [
				[q(1n, 2n), q(5n, 6n)],
				[q(-3n, 4n), q(0n, 1n)],
			])
		})

		test('3x3 square matrix', () => {
			const M = [
				[q(1n, 1n), q(2n, 3n), q(-5n, 7n)],
				[q(0n, 1n), q(11n, 13n), q(17n, 19n)],
				[q(-23n, 29n), q(31n, 37n), q(41n, 43n)],
			]
			const T = transposeRationalSeries(M)
			assertCanonicalMatrix(T)
			assert.deepEqual(T, [
				[q(1n, 1n), q(0n, 1n), q(-23n, 29n)],
				[q(2n, 3n), q(11n, 13n), q(31n, 37n)],
				[q(-5n, 7n), q(17n, 19n), q(41n, 43n)],
			])
		})

		test('rectangular 2x3 matrix transposes to 3x2', () => {
			const M = [
				[q(1n, 2n), q(2n, 3n), q(3n, 4n)],
				[q(-4n, 5n), q(5n, 6n), q(-6n, 7n)],
			]
			const T = transposeRationalSeries(M)
			assertCanonicalMatrix(T)
			assert.equal(T.length, 3)
			assert.equal(T[0].length, 2)
			assert.deepEqual(T, [
				[q(1n, 2n), q(-4n, 5n)],
				[q(2n, 3n), q(5n, 6n)],
				[q(3n, 4n), q(-6n, 7n)],
			])
		})

		test('rectangular 3x2 matrix transposes to 2x3', () => {
			const M = [
				[q(7n, 8n), q(-9n, 10n)],
				[q(0n, 1n), q(11n, 12n)],
				[q(-13n, 14n), q(15n, 16n)],
			]
			const T = transposeRationalSeries(M)
			assertCanonicalMatrix(T)
			assert.equal(T.length, 2)
			assert.equal(T[0].length, 3)
			assert.deepEqual(T, [
				[q(7n, 8n), q(0n, 1n), q(-13n, 14n)],
				[q(-9n, 10n), q(11n, 12n), q(15n, 16n)],
			])
		})

		test('1xN row vector transposes to Nx1 column vector', () => {
			const M = [[q(1n, 3n), q(-2n, 5n), q(0n, 7n), q(9n, 11n)]]
			const T = transposeRationalSeries(M)
			assertCanonicalMatrix(T)
			assert.equal(T.length, 4)
			assert.equal(T[0].length, 1)
			assert.deepEqual(T, [[q(1n, 3n)], [q(-2n, 5n)], [q(0n, 1n)], [q(9n, 11n)]])
		})

		test('Nx1 column vector transposes to 1xN row vector', () => {
			const M = [[q(10n, 1n)], [q(-3n, 8n)], [q(0n, 1n)], [q(4n, 9n)]]
			const T = transposeRationalSeries(M)
			assertCanonicalMatrix(T)
			assert.equal(T.length, 1)
			assert.equal(T[0].length, 4)
			assert.deepEqual(T, [[q(10n, 1n), q(-3n, 8n), q(0n, 1n), q(4n, 9n)]])
		})
	})

	describe('normalization, precision, and immutability', () => {
		test('normalizes unreduced fractions, negative denominators, and zero variants', () => {
			const M = [
				[q(6n, 9n), q(6n, -9n), q(-4n, -8n)],
				[q(0n, 5n), q(0n, -12n), q(-15n, 25n)],
			]
			const T = transposeRationalSeries(M)
			assertCanonicalMatrix(T)
			assert.deepEqual(T, [
				[q(2n, 3n), q(0n, 1n)],
				[q(-2n, 3n), q(0n, 1n)],
				[q(1n, 2n), q(-3n, 5n)],
			])
		})

		test('preserves exact precision for large BigInt numerators and denominators', () => {
			const p = 10n ** 40n + 7n
			const r = 10n ** 40n + 9n
			const k = 10n ** 20n + 3n
			const M = [
				[q(p * k, r * k), q(-(r * k), -(p * k))],
				[q(0n, -(p * k)), q(10n ** 50n, 2n * 10n ** 50n)],
			]
			const T = transposeRationalSeries(M)
			assertCanonicalMatrix(T)
			assert.deepEqual(T, [
				[q(p, r), q(0n, 1n)],
				[q(r, p), q(1n, 2n)],
			])
		})

		test('does not mutate input matrix or share entry references', () => {
			const entry00 = q(4n, -6n)
			const entry01 = q(0n, -9n)
			const M = [[entry00, entry01]]
			const T = transposeRationalSeries(M)

			// Original input remains untouched
			assert.deepEqual(M, [[{ num: 4n, den: -6n }, { num: 0n, den: -9n }]])
			assert.notEqual(T[0][0], entry00)
			assert.notEqual(T[1][0], entry01)

			// Mutating returned matrix does not affect M
			T[0][0].num = 999n
			assert.equal(M[0][0].num, 4n)
		})
	})

	describe('input validation', () => {
		test('throws TypeError when M is not an array', () => {
			for (const bad of [null, undefined, 42, 'matrix', { 0: [q(1n)] }, true]) {
				assert.throws(() => transposeRationalSeries(bad), TypeError)
			}
		})

		test('throws RangeError for empty matrix or empty rows', () => {
			assert.throws(() => transposeRationalSeries([]), RangeError)
			assert.throws(() => transposeRationalSeries([[]]), RangeError)
			assert.throws(() => transposeRationalSeries([[], []]), RangeError)
		})

		test('throws TypeError when any row is not an array or is a sparse hole', () => {
			assert.throws(() => transposeRationalSeries([null]), TypeError)
			assert.throws(() => transposeRationalSeries([[q(1n)], 'not-a-row']), TypeError)
			assert.throws(() => transposeRationalSeries([[q(1n)], 123]), TypeError)
			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => transposeRationalSeries([[q(1n)], ,]), TypeError)
			const sparseFirst = new Array(2)
			sparseFirst[1] = [q(1n)]
			assert.throws(() => transposeRationalSeries(sparseFirst), TypeError)
		})

		test('throws RangeError for ragged / non-rectangular matrices', () => {
			assert.throws(
				() =>
					transposeRationalSeries([
						[q(1n), q(2n)],
						[q(3n)],
					]),
				RangeError
			)
			assert.throws(
				() =>
					transposeRationalSeries([
						[q(1n)],
						[q(2n), q(3n)],
					]),
				RangeError
			)
			assert.throws(
				() =>
					transposeRationalSeries([
						[q(1n), q(2n)],
						[],
					]),
				RangeError
			)
		})

		test('throws TypeError for invalid rational entries', () => {
			const badEntries = [
				null,
				undefined,
				5,
				'1/2',
				{},
				{ num: 1n },
				{ den: 1n },
				{ num: 1, den: 2 },
				{ num: 1n, den: 2 },
				{ num: 1, den: 2n },
				{ num: '1', den: '2' },
			]
			for (const bad of badEntries) {
				assert.throws(() => transposeRationalSeries([[bad]]), TypeError)
			}
			// Sparse cell inside a row
			const sparseRow = new Array(2)
			sparseRow[0] = q(1n)
			assert.throws(() => transposeRationalSeries([sparseRow]), TypeError)
		})

		test('throws RangeError for zero denominators', () => {
			assert.throws(() => transposeRationalSeries([[q(1n, 0n)]]), RangeError)
			assert.throws(() => transposeRationalSeries([[q(0n, 0n)]]), RangeError)
			assert.throws(
				() =>
					transposeRationalSeries([
						[q(1n, 2n), q(3n, 4n)],
						[q(5n, 6n), q(-7n, 0n)],
					]),
				RangeError
			)
		})
	})

	describe('algebraic and numerical cross-checks', () => {
		test('involution identity: (M^T)^T = M (normalized) across shapes', () => {
			const matrices = [
				[[q(4n, -6n)]],
				[[q(2n, 4n), q(-9n, 12n), q(0n, -3n)]],
				[[q(-10n, -15n)], [q(7n, -14n)], [q(0n, 8n)]],
				[
					[q(6n, 8n), q(-12n, 18n), q(21n, -14n)],
					[q(0n, -5n), q(-9n, -27n), q(35n, 49n)],
				],
			]

			for (const M of matrices) {
				const T = transposeRationalSeries(M)
				const TT = transposeRationalSeries(T)
				assertCanonicalMatrix(T)
				assertCanonicalMatrix(TT)
				const expectedNormalized = M.map((row) => row.map(norm))
				assert.deepEqual(TT, expectedNormalized)
			}
		})

		test('linearity (additivity): (A + B)^T = A^T + B^T', () => {
			const A = [
				[q(1n, 2n), q(-3n, 4n), q(5n, 6n)],
				[q(7n, -8n), q(0n, 3n), q(-11n, -12n)],
			]
			const B = [
				[q(2n, 3n), q(5n, 8n), q(-1n, 6n)],
				[q(3n, 4n), q(-9n, 10n), q(1n, 12n)],
			]

			const lhs = transposeRationalSeries(matAdd(A, B))
			const rhs = matAdd(transposeRationalSeries(A), transposeRationalSeries(B))

			assertCanonicalMatrix(lhs)
			assertCanonicalMatrix(rhs)
			assert.deepEqual(lhs, rhs)
		})

		test('scalar linearity: (c * A)^T = c * A^T', () => {
			const c = q(-7n, 15n)
			const A = [
				[q(3n, 5n), q(-10n, 21n)],
				[q(0n, 1n), q(14n, 9n)],
				[q(-25n, 28n), q(6n, -11n)],
			]

			const lhs = transposeRationalSeries(matScale(c, A))
			const rhs = matScale(c, transposeRationalSeries(A))

			assertCanonicalMatrix(lhs)
			assertCanonicalMatrix(rhs)
			assert.deepEqual(lhs, rhs)
		})

		test('product reversal identity: (A * B)^T = B^T * A^T', () => {
			const A = [
				[q(1n, 2n), q(-2n, 3n), q(3n, 4n)],
				[q(-4n, 5n), q(5n, 6n), q(0n, 1n)],
			]
			const B = [
				[q(2n, 7n), q(-1n, 3n)],
				[q(3n, 5n), q(4n, 9n)],
				[q(-5n, 6n), q(7n, 8n)],
			]

			const lhs = transposeRationalSeries(matMul(A, B))
			const rhs = matMul(transposeRationalSeries(B), transposeRationalSeries(A))

			assertCanonicalMatrix(lhs)
			assertCanonicalMatrix(rhs)
			assert.deepEqual(lhs, rhs)
		})

		test('floating-point cross-check against independent Number transposition', () => {
			const M = [
				[q(1n, 3n), q(-22n, 7n), q(355n, 113n), q(0n, 5n)],
				[q(-13n, 17n), q(19n, 23n), q(-29n, 31n), q(37n, 41n)],
				[q(43n, 47n), q(-53n, 59n), q(61n, 67n), q(-71n, 73n)],
			]

			const T = transposeRationalSeries(M)
			assertCanonicalMatrix(T)

			const floatM = M.map((row) => row.map((r) => Number(r.num) / Number(r.den)))
			const floatT = Array.from({ length: floatM[0].length }, (_, j) =>
				Array.from({ length: floatM.length }, (_, i) => floatM[i][j])
			)

			assert.equal(T.length, floatT.length)
			assert.equal(T[0].length, floatT[0].length)
			for (let j = 0; j < T.length; j++) {
				for (let i = 0; i < T[0].length; i++) {
					const actual = Number(T[j][i].num) / Number(T[j][i].den)
					assert.ok(
						Math.abs(actual - floatT[j][i]) < 1e-12,
						`Mismatch at [${j}][${i}]: ${actual} vs ${floatT[j][i]}`
					)
				}
			}
		})
	})
})
