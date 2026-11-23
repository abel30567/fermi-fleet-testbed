import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { matMulComplexLazy } from './matMulComplexLazy.js'

const c = (re, im = 0) => ({ re, im })

function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`real part mismatch: got ${actual.re}, expected ${expected.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`imag part mismatch: got ${actual.im}, expected ${expected.im}`
	)
}

function assertMatrixClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, expected.length, 'row count mismatch')
	for (let i = 0; i < expected.length; i++) {
		assert.equal(actual[i].length, expected[i].length, `col count mismatch at row ${i}`)
		for (let j = 0; j < expected[i].length; j++) {
			assertComplexClose(actual[i][j], expected[i][j], eps)
		}
	}
}

describe('matMulComplexLazy', () => {
	describe('normal cases', () => {
		it('multiplies 2x2 complex matrices accurately', () => {
			const A = [
				[c(1, 2), c(3, -1)],
				[c(0, 4), c(-2, 1)],
			]
			const B = [
				[c(2, -1), c(1, 1)],
				[c(-1, 3), c(0, -2)],
			]
			// Row 0, Col 0: (1+2i)(2-i) + (3-i)(-1+3i) = (4+3i) + (0+10i) = 4+13i
			// Row 0, Col 1: (1+2i)(1+i) + (3-i)(-2i)   = (-1+3i) + (-2-6i) = -3-3i
			// Row 1, Col 0: (4i)(2-i)   + (-2+i)(-1+3i)= (4+8i) + (-1-7i) = 3+i
			// Row 1, Col 1: (4i)(1+i)   + (-2+i)(-2i)  = (-4+4i) + (2+4i) = -2+8i
			const expected = [
				[c(4, 13), c(-3, -3)],
				[c(3, 1), c(-2, 8)],
			]

			const result = [...matMulComplexLazy(A, B)]
			assert.deepStrictEqual(result, expected)
		})

		it('multiplies rectangular matrices (2x3 * 3x2 and 3x1 * 1x3)', () => {
			const A = [
				[c(1, 1), c(2, 0), c(0, -1)],
				[c(-1, 2), c(0, 3), c(1, 1)],
			]
			const B = [
				[c(1, 0), c(0, 1)],
				[c(0, -1), c(2, 1)],
				[c(3, 2), c(-1, 0)],
			]
			// R0C0: (1+i)(1) + (2)(-i) + (-i)(3+2i) = 1+i - 2i + 2-3i = 3-4i
			// R0C1: (1+i)(i) + (2)(2+i) + (-i)(-1)  = -1+i + 4+2i + i = 3+4i
			// R1C0: (-1+2i)(1) + (3i)(-i) + (1+i)(3+2i) = -1+2i + 3 + 1+5i = 3+7i
			// R1C1: (-1+2i)(i) + (3i)(2+i) + (1+i)(-1)  = -2-i + -3+6i - 1-i = -6+4i
			const expected = [
				[c(3, -4), c(3, 4)],
				[c(3, 7), c(-6, 4)],
			]
			assert.deepStrictEqual([...matMulComplexLazy(A, B)], expected)

			// Outer product: (3x1) * (1x2)
			const col = [[c(1, 0)], [c(0, 1)], [c(1, -1)]]
			const row = [[c(2, 1), c(-1, 3)]]
			const outer = [...matMulComplexLazy(col, row)]
			assert.deepStrictEqual(outer, [
				[c(2, 1), c(-1, 3)],
				[c(-1, 2), c(-3, -1)],
				[c(3, -1), c(2, 4)],
			])
		})

		it('handles 1x1 complex matrices and pure imaginary units', () => {
			const iMat = [[c(0, 1)]]
			assert.deepStrictEqual([...matMulComplexLazy(iMat, iMat)], [[c(-1, 0)]])
		})

		it('multiplies a matrix by itself when passed the same array reference', () => {
			const M = [
				[c(0, 1), c(1, 0)],
				[c(1, 0), c(0, -1)],
			]
			// M^2 = [[0, 0], [0, 0]]? Wait:
			// (0,0): i*i + 1*1 = -1 + 1 = 0
			// (0,1): i*1 + 1*(-i) = 0
			// (1,0): 1*i + (-i)*1 = 0
			// (1,1): 1*1 + (-i)(-i) = 1 - 1 = 0
			assert.deepStrictEqual([...matMulComplexLazy(M, M)], [
				[c(0, 0), c(0, 0)],
				[c(0, 0), c(0, 0)],
			])
		})

		it('supports single-pass nested generator inputs for both A and B', () => {
			function* genRow(arr) {
				for (const x of arr) yield x
			}
			function* genMat(rows) {
				for (const r of rows) yield genRow(r)
			}

			const A = [
				[c(2, 1), c(0, -3)],
				[c(1, -1), c(4, 2)],
				[c(-2, 0), c(1, 1)],
			]
			const B = [
				[c(1, 2), c(-1, 0)],
				[c(0, 1), c(3, -1)],
			]

			const fromArrays = [...matMulComplexLazy(A, B)]
			const fromGenerators = [...matMulComplexLazy(genMat(A), genMat(B))]
			assert.deepStrictEqual(fromGenerators, fromArrays)
		})
	})

	describe('edge cases', () => {
		it('handles empty A (0 rows) without yielding or consuming B', () => {
			let bTouched = false
			function* genB() {
				bTouched = true
				yield [c(1, 0)]
			}

			const res = [...matMulComplexLazy([], genB())]
			assert.deepStrictEqual(res, [])
			assert.equal(bTouched, false)
		})

		it('handles 0-width A (m x 0) with 0-row B (0 x 0)', () => {
			const res = [...matMulComplexLazy([[], []], [])]
			assert.deepStrictEqual(res, [[], []])
		})

		it('handles A (m x k) with 0-column B (k x 0)', () => {
			const res = [...matMulComplexLazy([[c(1, 2)], [c(3, 4)]], [[]])]
			assert.deepStrictEqual(res, [[], []])
		})

		it('normalizes -0 to +0 in output components', () => {
			const A = [[c(0, 0)]]
			const B = [[c(-1, 0)]]
			const [[entry]] = [...matMulComplexLazy(A, B)]
			assert.equal(Object.is(entry.re, 0), true)
			assert.equal(Object.is(entry.im, 0), true)
		})

		it('accepts custom iterables such as Set of rows', () => {
			const A = new Set([new Set([c(1, 2), c(3, 4)])])
			const B = new Set([new Set([c(1, 0)]), new Set([c(0, 1)])])
			// (1+2i)(1) + (3+4i)(i) = 1+2i - 4+3i = -3+5i
			assert.deepStrictEqual([...matMulComplexLazy(A, B)], [[c(-3, 5)]])
		})
	})

	describe('validation and error handling', () => {
		it('throws TypeError synchronously for non-iterable or string top-level arguments', () => {
			assert.throws(() => matMulComplexLazy(null, []), TypeError)
			assert.throws(() => matMulComplexLazy([], undefined), TypeError)
			assert.throws(() => matMulComplexLazy(42, []), TypeError)
			assert.throws(() => matMulComplexLazy('abc', []), TypeError)
			assert.throws(() => matMulComplexLazy([], 'abc'), TypeError)
			assert.throws(() => matMulComplexLazy({}, []), TypeError)
		})

		it('throws TypeError for non-iterable or string rows', () => {
			assert.throws(() => [...matMulComplexLazy([null], [[c(1, 0)]])], TypeError)
			assert.throws(() => [...matMulComplexLazy(['row'], [[c(1, 0)]])], TypeError)
			assert.throws(() => [...matMulComplexLazy([[c(1, 0)]], ['row'])], TypeError)
			assert.throws(() => [...matMulComplexLazy([[c(1, 0)]], [123])], TypeError)
		})

		it('throws TypeError for malformed complex entries', () => {
			assert.throws(() => [...matMulComplexLazy([[1]], [[c(1, 0)]])], TypeError)
			assert.throws(() => [...matMulComplexLazy([[null]], [[c(1, 0)]])], TypeError)
			assert.throws(() => [...matMulComplexLazy([[[1, 2]]], [[c(1, 0)]])], TypeError)
			assert.throws(() => [...matMulComplexLazy([[{ re: 1 }]], [[c(1, 0)]])], TypeError)
			assert.throws(() => [...matMulComplexLazy([[c(1, 0)]], [[{ re: '1', im: 0 }]])], TypeError)
		})

		it('throws RangeError for non-finite complex components', () => {
			assert.throws(() => [...matMulComplexLazy([[c(NaN, 0)]], [[c(1, 0)]])], RangeError)
			assert.throws(() => [...matMulComplexLazy([[c(1, Infinity)]], [[c(1, 0)]])], RangeError)
			assert.throws(() => [...matMulComplexLazy([[c(1, 0)]], [[c(0, -Infinity)]])], RangeError)
		})

		it('throws RangeError for dimension mismatches', () => {
			// A is 1x2, B is 1x1 (too few rows in B)
			assert.throws(
				() => [...matMulComplexLazy([[c(1, 0), c(2, 0)]], [[c(1, 0)]])],
				RangeError
			)
			// A is 1x1, B is 2x1 (too many rows in B)
			assert.throws(
				() => [...matMulComplexLazy([[c(1, 0)]], [[c(1, 0)], [c(2, 0)]])],
				RangeError
			)
			// A is 1x0, B is 1x1
			assert.throws(() => [...matMulComplexLazy([[]], [[c(1, 0)]])], RangeError)
		})

		it('throws RangeError for ragged A or ragged B', () => {
			const raggedA = [[c(1, 0), c(2, 0)], [c(3, 0)]]
			const validB = [[c(1, 0)], [c(1, 0)]]
			assert.throws(() => [...matMulComplexLazy(raggedA, validB)], RangeError)

			const validA = [[c(1, 0), c(2, 0)]]
			const raggedB = [[c(1, 0)], [c(1, 0), c(2, 0)]]
			assert.throws(() => [...matMulComplexLazy(validA, raggedB)], RangeError)

			const raggedBShort = [[c(1, 0), c(2, 0)], [c(1, 0)]]
			assert.throws(() => [...matMulComplexLazy(validA, raggedBShort)], RangeError)
		})
	})

	describe('lazy consumption verification', () => {
		it('consumes zero rows of A and B until next() is invoked, then pulls A one row at a time', () => {
			let aPulled = 0
			let bPulled = 0

			function* genA() {
				const rows = [
					[c(1, 0), c(0, 1)],
					[c(2, -1), c(3, 0)],
					[c(0, 2), c(-1, 1)],
				]
				for (const row of rows) {
					aPulled++
					yield row
				}
			}

			function* genB() {
				const rows = [
					[c(1, 1)],
					[c(2, 0)],
				]
				for (const row of rows) {
					bPulled++
					yield row
				}
			}

			const iter = matMulComplexLazy(genA(), genB())
			assert.equal(aPulled, 0)
			assert.equal(bPulled, 0)

			const r0 = iter.next()
			assert.equal(r0.done, false)
			assert.equal(aPulled, 1)
			assert.equal(bPulled, 2)
			// (1)(1+i) + (i)(2) = 1+3i
			assert.deepStrictEqual(r0.value, [c(1, 3)])

			const r1 = iter.next()
			assert.equal(r1.done, false)
			assert.equal(aPulled, 2)
			assert.equal(bPulled, 2) // B was cached, not re-iterated
			// (2-i)(1+i) + (3)(2) = (3+i) + 6 = 9+i
			assert.deepStrictEqual(r1.value, [c(9, 1)])

			// Stop early without pulling row 2 of A
			iter.return()
			assert.equal(aPulled, 2)
		})

		it('streams finite prefix from an infinite generator A (and chained pipelines)', () => {
			let aPulled = 0
			function* infiniteA() {
				let k = 0
				while (true) {
					aPulled++
					yield [c(k, 1), c(1, -k)]
					k++
				}
			}

			const B = [
				[c(1, 0), c(0, 1)],
				[c(0, -1), c(1, 0)],
			]
			const C = [
				[c(2, 0)],
				[c(0, 1)],
			]

			// Pipeline: (infiniteA * B) * C, take only first 3 rows
			const pipeline = matMulComplexLazy(matMulComplexLazy(infiniteA(), B), C)
			const firstThree = []
			for (const row of pipeline) {
				firstThree.push(row)
				if (firstThree.length === 3) break
			}

			assert.equal(aPulled, 3)
			assert.equal(firstThree.length, 3)

			// Verify values match eager computation on first 3 rows
			const eagerA = [
				[c(0, 1), c(1, 0)],
				[c(1, 1), c(1, -1)],
				[c(2, 1), c(1, -2)],
			]
			const expected = [...matMulComplexLazy([...matMulComplexLazy(eagerA, B)], C)]
			assert.deepStrictEqual(firstThree, expected)
		})

		it('fails fast on an infinite B with too many rows without hanging', () => {
			let bPulled = 0
			function* infiniteB() {
				while (true) {
					bPulled++
					yield [c(1, 0)]
				}
			}

			const A = [[c(1, 0), c(2, 0)]] // expects exactly 2 rows in B
			const iter = matMulComplexLazy(A, infiniteB())
			assert.throws(() => iter.next(), RangeError)
			assert.equal(bPulled, 3) // stops immediately on the 3rd row
		})

		it('fails fast on an infinite ragged row in A without hanging', () => {
			let elemsPulled = 0
			function* infiniteRow() {
				while (true) {
					elemsPulled++
					yield c(1, 0)
				}
			}

			const A = [[c(1, 0), c(2, 0)], infiniteRow()]
			const B = [[c(1, 0)], [c(0, 1)]]
			const iter = matMulComplexLazy(A, B)

			// First row succeeds lazily before touching the ragged second row
			assert.deepStrictEqual(iter.next().value, [c(1, 2)])
			assert.equal(elemsPulled, 0)

			// Second row fails fast on element index 2 (3rd element pulled)
			assert.throws(() => iter.next(), RangeError)
			assert.equal(elemsPulled, 3)
		})
	})

	describe('independent cross-checks', () => {
		it('matches real 2x2 block-matrix isomorphism Phi(AB) = Phi(A)Phi(B)', () => {
			// Deterministic LCG PRNG for reproducible test matrices
			let seed = 0x12345678
			const nextRand = () => {
				seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
				return (seed / 0xffffffff) * 10 - 5
			}

			const m = 4
			const k = 5
			const n = 3
			const A = Array.from({ length: m }, () =>
				Array.from({ length: k }, () => c(nextRand(), nextRand()))
			)
			const B = Array.from({ length: k }, () =>
				Array.from({ length: n }, () => c(nextRand(), nextRand()))
			)

			// Embed complex matrix M (r x s) as real 2r x 2s block matrix [[Re, -Im], [Im, Re]]
			const embedReal = (M) => {
				const r = M.length
				const s = M[0].length
				const out = Array.from({ length: 2 * r }, () => new Array(2 * s).fill(0))
				for (let i = 0; i < r; i++) {
					for (let j = 0; j < s; j++) {
						out[i][j] = M[i][j].re
						out[i][j + s] = -M[i][j].im
						out[i + r][j] = M[i][j].im
						out[i + r][j + s] = M[i][j].re
					}
				}
				return out
			}

			const realMatMul = (X, Y) => {
				const r = X.length
				const p = Y.length
				const s = Y[0].length
				const out = Array.from({ length: r }, () => new Array(s).fill(0))
				for (let i = 0; i < r; i++) {
					for (let j = 0; j < s; j++) {
						let sum = 0
						for (let t = 0; t < p; t++) sum += X[i][t] * Y[t][j]
						out[i][j] = sum
					}
				}
				return out
			}

			const C = [...matMulComplexLazy(A, B)]
			const phiAB = embedReal(C)
			const phiAphiB = realMatMul(embedReal(A), embedReal(B))

			assert.equal(phiAB.length, phiAphiB.length)
			for (let i = 0; i < phiAB.length; i++) {
				for (let j = 0; j < phiAB[i].length; j++) {
					assert.ok(
						Math.abs(phiAB[i][j] - phiAphiB[i][j]) < 1e-10,
						`block mismatch at (${i},${j}): ${phiAB[i][j]} vs ${phiAphiB[i][j]}`
					)
				}
			}
		})

		it('satisfies DFT unitarity F * F^H = N * I and Hermitian adjoint (AB)^H = B^H * A^H', () => {
			const N = 6
			const F = Array.from({ length: N }, (_, j) =>
				Array.from({ length: N }, (_, k) => {
					const angle = (-2 * Math.PI * j * k) / N
					return c(Math.cos(angle), Math.sin(angle))
				})
			)
			const dagger = (M) =>
				Array.from({ length: M[0].length }, (_, j) =>
					Array.from({ length: M.length }, (_, i) => c(M[i][j].re, -M[i][j].im))
				)

			const product = [...matMulComplexLazy(F, dagger(F))]
			const nIdentity = Array.from({ length: N }, (_, i) =>
				Array.from({ length: N }, (_, j) => c(i === j ? N : 0, 0))
			)
			assertMatrixClose(product, nIdentity, 1e-11)

			// (AB)^H = B^H A^H
			const A = [
				[c(1, -2), c(3, 1), c(0, 4)],
				[c(-2, 3), c(1, 0), c(5, -1)],
			]
			const B = [
				[c(2, 1), c(-1, 2)],
				[c(0, -3), c(4, 1)],
				[c(1, 1), c(2, -2)],
			]
			const lhs = dagger([...matMulComplexLazy(A, B)])
			const rhs = [...matMulComplexLazy(dagger(B), dagger(A))]
			assertMatrixClose(lhs, rhs, 1e-12)
		})

		it('satisfies Pauli matrix algebra (sigma_x * sigma_y = i * sigma_z, sigma_k^2 = I)', () => {
			const sx = [
				[c(0, 0), c(1, 0)],
				[c(1, 0), c(0, 0)],
			]
			const sy = [
				[c(0, 0), c(0, -1)],
				[c(0, 1), c(0, 0)],
			]
			const sz = [
				[c(1, 0), c(0, 0)],
				[c(0, 0), c(-1, 0)],
			]
			const I = [
				[c(1, 0), c(0, 0)],
				[c(0, 0), c(1, 0)],
			]
			const iSz = [
				[c(0, 1), c(0, 0)],
				[c(0, 0), c(0, -1)],
			]

			assert.deepStrictEqual([...matMulComplexLazy(sx, sy)], iSz)
			assert.deepStrictEqual([...matMulComplexLazy(sx, sx)], I)
			assert.deepStrictEqual([...matMulComplexLazy(sy, sy)], I)
			assert.deepStrictEqual([...matMulComplexLazy(sz, sz)], I)
		})
	})
})
