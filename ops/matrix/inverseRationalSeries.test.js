import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { inverseRationalSeries } from './inverseRationalSeries.js'

function r(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) }
}

function gcd(a, b) {
	a = a < 0n ? -a : a
	b = b < 0n ? -b : b
	while (b !== 0n) {
		const t = a % b
		a = b
		b = t
	}
	return a
}

function normalize(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

function ratAdd(a, b) {
	return normalize(a.num * b.den + b.num * a.den, a.den * b.den)
}

function ratMul(a, b) {
	return normalize(a.num * b.num, a.den * b.den)
}

function matMul(A, B) {
	const n = A.length
	const C = Array.from({ length: n }, () => new Array(n))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let sum = r(0n, 1n)
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
		Array.from({ length: n }, (_, j) => (i === j ? r(1n) : r(0n)))
	)
}

function assertLowestTerms(M) {
	for (let i = 0; i < M.length; i++) {
		for (let j = 0; j < M[i].length; j++) {
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

function assertInverseExact(A, Ainv) {
	assertLowestTerms(Ainv)
	const I = identity(A.length)
	assert.deepEqual(matMul(A, Ainv), I, 'A * A^-1 must equal I exactly')
	assert.deepEqual(matMul(Ainv, A), I, 'A^-1 * A must equal I exactly')
}

function binomial(n, k) {
	if (k < 0n || k > n) return 0n
	if (k === 0n || k === n) return 1n
	if (k > n - k) k = n - k
	let res = 1n
	for (let i = 1n; i <= k; i++) {
		res = (res * (n - k + i)) / i
	}
	return res
}

function hilbertMatrix(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => r(1n, BigInt(i + j + 1)))
	)
}

function closedFormHilbertInverse(n) {
	const N = BigInt(n)
	return Array.from({ length: n }, (_, i0) => {
		const i = BigInt(i0 + 1)
		return Array.from({ length: n }, (_, j0) => {
			const j = BigInt(j0 + 1)
			const sign = (i + j) % 2n === 0n ? 1n : -1n
			const b1 = binomial(N + i - 1n, N - j)
			const b2 = binomial(N + j - 1n, N - i)
			const b3 = binomial(i + j - 2n, i - 1n)
			return r(sign * (i + j - 1n) * b1 * b2 * b3 * b3, 1n)
		})
	})
}

describe('inverseRationalSeries', () => {
	describe('1x1 matrices', () => {
		it('inverts positive, negative, and fractional 1x1 matrices', () => {
			const m1 = [[r(5n)]]
			const inv1 = inverseRationalSeries(m1)
			assert.deepEqual(inv1, [[r(1n, 5n)]])
			assertInverseExact(m1, inv1)

			const m2 = [[r(-3n, 7n)]]
			const inv2 = inverseRationalSeries(m2)
			assert.deepEqual(inv2, [[r(-7n, 3n)]])
			assertInverseExact(m2, inv2)

			const m3 = [[r(6n, -10n)]]
			const inv3 = inverseRationalSeries(m3)
			assert.deepEqual(inv3, [[r(-5n, 3n)]])
			assertInverseExact(m3, inv3)
		})
	})

	describe('identity matrices', () => {
		it('returns the exact identity matrix for 1x1, 3x3, and 4x4 identities', () => {
			for (const n of [1, 3, 4]) {
				const I = identity(n)
				const inv = inverseRationalSeries(I)
				assert.deepEqual(inv, I)
				assertInverseExact(I, inv)
			}
		})
	})

	describe('2x2 matrices', () => {
		it('inverts integer and rational 2x2 matrices and matches closed-form formula', () => {
			const cases = [
				[
					[r(4n), r(7n)],
					[r(2n), r(6n)],
				],
				[
					[r(1n, 2n), r(-3n, 4n)],
					[r(5n, 6n), r(2n, 3n)],
				],
				[
					[r(0n), r(3n)],
					[r(-2n), r(5n)],
				],
			]

			for (const A of cases) {
				const inv = inverseRationalSeries(A)
				assertInverseExact(A, inv)

				// Independent 2x2 closed-form cross-check: (1 / (ad - bc)) * [[d, -b], [-c, a]]
				const [[a, b], [c, d]] = A
				const det = ratAdd(ratMul(a, d), { num: -ratMul(b, c).num, den: ratMul(b, c).den })
				const invDet = normalize(det.den, det.num)
				const expected = [
					[ratMul(d, invDet), ratMul({ num: -b.num, den: b.den }, invDet)],
					[ratMul({ num: -c.num, den: c.den }, invDet), ratMul(a, invDet)],
				]
				assert.deepEqual(inv, expected)
			}
		})
	})

	describe('3x3 matrices', () => {
		it('inverts general 3x3 matrix and verifies exact product and cofactor cross-check', () => {
			const A = [
				[r(1n), r(2n), r(3n)],
				[r(0n), r(1n), r(4n)],
				[r(5n), r(6n), r(0n)],
			]
			const inv = inverseRationalSeries(A)
			assert.deepEqual(inv, [
				[r(-24n), r(18n), r(5n)],
				[r(20n), r(-15n), r(-4n)],
				[r(-5n), r(4n), r(1n)],
			])
			assertInverseExact(A, inv)
		})

		it('handles row swaps when leading diagonal entries are zero', () => {
			const A = [
				[r(0n), r(0n), r(2n)],
				[r(0n), r(3n), r(1n)],
				[r(4n), r(1n), r(0n)],
			]
			const inv = inverseRationalSeries(A)
			assertInverseExact(A, inv)
		})

		it('inverts a 3x3 rational matrix and agrees with floating-point inverse within tolerance', () => {
			const A = [
				[r(2n, 3n), r(-1n, 5n), r(3n, 7n)],
				[r(4n, 9n), r(1n, 2n), r(-2n, 3n)],
				[r(-1n, 4n), r(5n, 6n), r(7n, 8n)],
			]
			const inv = inverseRationalSeries(A)
			assertInverseExact(A, inv)

			// Cross-check numeric product A_float * inv_float ≈ I within 1e-12
			const toNum = (q) => Number(q.num) / Number(q.den)
			for (let i = 0; i < 3; i++) {
				for (let j = 0; j < 3; j++) {
					let sum = 0
					for (let k = 0; k < 3; k++) {
						sum += toNum(A[i][k]) * toNum(inv[k][j])
					}
					const target = i === j ? 1 : 0
					assert.ok(Math.abs(sum - target) < 1e-12)
				}
			}
		})
	})

	describe('Hilbert matrices (ill-conditioned exact rational stress test)', () => {
		it('computes exact integer inverses of 3x3, 4x4, and 5x5 Hilbert matrices', () => {
			for (const n of [3, 4, 5]) {
				const H = hilbertMatrix(n)
				const inv = inverseRationalSeries(H)
				const expected = closedFormHilbertInverse(n)
				assert.deepEqual(inv, expected, `H_${n}^-1 must match closed-form formula`)
				assertInverseExact(H, inv)
			}
		})
	})

	describe('algebraic identities and edge cases', () => {
		it('satisfies involution (A^-1)^-1 === A and product rule (A*B)^-1 === B^-1 * A^-1', () => {
			const A = [
				[r(3n, 2n), r(-1n), r(1n, 4n)],
				[r(2n), r(5n, 3n), r(-2n)],
				[r(-1n, 2n), r(1n), r(4n, 5n)],
			]
			const B = [
				[r(1n), r(2n, 5n), r(-3n)],
				[r(0n), r(3n, 4n), r(1n)],
				[r(2n, 3n), r(-1n, 2n), r(2n)],
			]

			const Ainv = inverseRationalSeries(A)
			const Binv = inverseRationalSeries(B)
			assertInverseExact(A, Ainv)
			assertInverseExact(B, Binv)

			// (A^-1)^-1 === A
			assert.deepEqual(inverseRationalSeries(Ainv), A)

			// (A * B)^-1 === B^-1 * A^-1
			const AB = matMul(A, B)
			const ABinv = inverseRationalSeries(AB)
			assertInverseExact(AB, ABinv)
			assert.deepEqual(ABinv, matMul(Binv, Ainv))
		})

		it('normalizes unreduced inputs and negative denominators without mutating input', () => {
			const M = [
				[{ num: -6n, den: -9n }, { num: 0n, den: -5n }],
				[{ num: 4n, den: -8n }, { num: 10n, den: 15n }],
			]
			const snapshot = M.map((row) => row.map((q) => ({ ...q })))

			const inv = inverseRationalSeries(M)
			assert.deepEqual(M, snapshot, 'Input matrix must not be mutated')
			assertInverseExact(M, inv)
			assert.deepEqual(inv, [
				[r(3n, 2n), r(0n, 1n)],
				[r(9n, 8n), r(3n, 2n)],
			])
		})

		it('handles large BigInt entries beyond Number.MAX_SAFE_INTEGER exactly', () => {
			const big = 10n ** 30n
			const A = [
				[r(big + 1n, 1n), r(big, 1n)],
				[r(big, 1n), r(big - 1n, 1n)],
			]
			// det = (big+1)(big-1) - big^2 = -1
			const inv = inverseRationalSeries(A)
			assert.deepEqual(inv, [
				[r(-(big - 1n), 1n), r(big, 1n)],
				[r(big, 1n), r(-(big + 1n), 1n)],
			])
			assertInverseExact(A, inv)
		})
	})

	describe('singular matrices', () => {
		it('throws RangeError for singular matrices of various sizes', () => {
			const singularCases = [
				[[r(0n)]],
				[
					[r(0n), r(0n)],
					[r(0n), r(0n)],
				],
				[
					[r(1n, 2n), r(1n, 3n)],
					[r(3n, 2n), r(1n, 1n)],
				],
				[
					[r(1n), r(2n), r(3n)],
					[r(4n), r(5n), r(6n)],
					[r(5n), r(7n), r(9n)], // row3 = row1 + row2
				],
				[
					[r(1n), r(0n), r(2n)],
					[r(3n), r(0n), r(4n)],
					[r(5n), r(0n), r(6n)], // zero column
				],
			]

			for (const S of singularCases) {
				assert.throws(
					() => inverseRationalSeries(S),
					{ name: 'RangeError' },
					'Singular matrix must throw RangeError'
				)
			}
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-array matrix or rows', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, true]) {
				assert.throws(() => inverseRationalSeries(bad), { name: 'TypeError' })
			}
			assert.throws(() => inverseRationalSeries([1]), { name: 'TypeError' })
			assert.throws(() => inverseRationalSeries([[r(1n)], null]), { name: 'TypeError' })
		})

		it('throws RangeError for empty or non-square matrices', () => {
			assert.throws(() => inverseRationalSeries([]), { name: 'RangeError' })
			assert.throws(() => inverseRationalSeries([[r(1n), r(2n)]]), { name: 'RangeError' })
			assert.throws(() => inverseRationalSeries([[r(1n)], [r(2n)]]), { name: 'RangeError' })
			assert.throws(
				() =>
					inverseRationalSeries([
						[r(1n), r(2n)],
						[r(3n)],
					]),
				{ name: 'RangeError' }
			)
		})

		it('throws TypeError for malformed rational entries', () => {
			const badEntries = [
				null,
				undefined,
				1,
				'1/2',
				{ num: 1, den: 1n },
				{ num: 1n, den: 1 },
				{ num: 1n },
				{ den: 1n },
				{},
			]
			for (const entry of badEntries) {
				assert.throws(() => inverseRationalSeries([[entry]]), { name: 'TypeError' })
			}
		})

		it('throws RangeError for zero denominators', () => {
			assert.throws(() => inverseRationalSeries([[{ num: 1n, den: 0n }]]), {
				name: 'RangeError',
			})
			assert.throws(() => inverseRationalSeries([[{ num: 0n, den: 0n }]]), {
				name: 'RangeError',
			})
		})
	})
})
