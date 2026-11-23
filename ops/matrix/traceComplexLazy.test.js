import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { traceComplexLazy } from './traceComplexLazy.js'

const c = (re, im = 0) => ({ re, im })

function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.equal(typeof actual.re, 'number')
	assert.equal(typeof actual.im, 'number')
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`Expected re=${actual.re} to be within ${eps} of ${expected.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`Expected im=${actual.im} to be within ${eps} of ${expected.im}`
	)
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function complexAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function complexConj(a) {
	return { re: a.re, im: a.im === 0 ? 0 : -a.im }
}

function matMulComplex(A, B) {
	const m = A.length
	const k = B.length
	const n = B[0].length
	const out = Array.from({ length: m }, () =>
		Array.from({ length: n }, () => ({ re: 0, im: 0 }))
	)
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let acc = { re: 0, im: 0 }
			for (let p = 0; p < k; p++) {
				acc = complexAdd(acc, complexMul(A[i][p], B[p][j]))
			}
			out[i][j] = acc
		}
	}
	return out
}

function matTranspose(A) {
	const m = A.length
	const n = m === 0 ? 0 : A[0].length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: m }, (_, j) => A[j][i])
	)
}

function matConjugateTranspose(A) {
	const m = A.length
	const n = m === 0 ? 0 : A[0].length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: m }, (_, j) => complexConj(A[j][i]))
	)
}

describe('traceComplexLazy', () => {
	describe('normal cases', () => {
		test('computes trace of a 1x1 complex matrix', () => {
			assert.deepStrictEqual(traceComplexLazy([[c(3.5, -2.25)]]), {
				re: 3.5,
				im: -2.25,
			})
		})

		test('computes trace of a 2x2 complex matrix', () => {
			const matrix = [
				[c(1, 2), c(3, 4)],
				[c(5, 6), c(7, -8)],
			]
			assert.deepStrictEqual(traceComplexLazy(matrix), { re: 8, im: -6 })
		})

		test('computes trace of a 3x3 complex matrix with negative and fractional values', () => {
			const matrix = [
				[c(-1.5, 0.5), c(10, -10), c(0, 1)],
				[c(2, 3), c(4.25, -1.75), c(-5, 6)],
				[c(7, -8), c(9, 0), c(-2.75, 1.25)],
			]
			assert.deepStrictEqual(traceComplexLazy(matrix), { re: 0, im: 0 })
		})

		test('computes trace of complex identity and zero matrices', () => {
			const n = 5
			const identity = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => (i === j ? c(1, 0) : c(0, 0)))
			)
			const zero = Array.from({ length: n }, () =>
				Array.from({ length: n }, () => c(0, 0))
			)

			assert.deepStrictEqual(traceComplexLazy(identity), { re: n, im: 0 })
			assert.deepStrictEqual(traceComplexLazy(zero), { re: 0, im: 0 })
		})
	})

	describe('edge cases', () => {
		test('returns { re: 0, im: 0 } for empty 0x0 matrix (array and generator)', () => {
			assert.deepStrictEqual(traceComplexLazy([]), { re: 0, im: 0 })

			function* emptyGen() {}
			assert.deepStrictEqual(traceComplexLazy(emptyGen()), { re: 0, im: 0 })
		})

		test('normalizes negative zero (-0) to +0', () => {
			const res = traceComplexLazy([[c(-0, -0)]])
			assert.ok(Object.is(res.re, 0))
			assert.ok(Object.is(res.im, 0))
			assert.deepStrictEqual(res, { re: 0, im: 0 })
		})

		test('preserves precision with Neumaier compensated summation on cancellation', () => {
			const matrix = [
				[c(1e16, -1e16), c(0, 0), c(0, 0)],
				[c(0, 0), c(1, 2), c(0, 0)],
				[c(0, 0), c(0, 0), c(-1e16, 1e16)],
			]
			assert.deepStrictEqual(traceComplexLazy(matrix), { re: 1, im: 2 })
		})

		test('works with purely real and purely imaginary diagonal entries', () => {
			const pureImag = [
				[c(0, 3), c(1, 1)],
				[c(-1, 2), c(0, -7)],
			]
			assert.deepStrictEqual(traceComplexLazy(pureImag), { re: 0, im: -4 })
		})

		test('throws RangeError if running sum overflows to Infinity', () => {
			const huge = [
				[c(1e308, 0), c(0, 0)],
				[c(0, 0), c(1e308, 0)],
			]
			assert.throws(() => traceComplexLazy(huge), RangeError)
		})
	})

	describe('lazy and streaming behavior', () => {
		test('consumes single-pass generator of generators lazily', () => {
			let rowsCreated = 0
			let cellsYielded = 0

			function* makeRow(i, n) {
				for (let j = 0; j < n; j++) {
					cellsYielded += 1
					yield c(i === j ? i + 1 : -100, i === j ? -(i + 1) : 200)
				}
			}

			function* makeMatrix(n) {
				for (let i = 0; i < n; i++) {
					rowsCreated += 1
					yield makeRow(i, n)
				}
			}

			const result = traceComplexLazy(makeMatrix(4))
			assert.deepStrictEqual(result, { re: 10, im: -10 })
			assert.equal(rowsCreated, 4)
			assert.equal(cellsYielded, 16)
		})

		test('supports heterogeneous iterables (Set, Map.values, custom iterables, generators)', () => {
			const row0 = new Set([c(1, 1), c(2, 3), c(4, 5)])
			const row1Map = new Map([
				['a', c(6, 7)],
				['b', c(8, -2)],
				['c', c(9, 10)],
			])
			const row2Custom = {
				*[Symbol.iterator]() {
					yield c(11, 12)
					yield c(13, 14)
					yield c(-3, 5)
				},
			}
			const matrixIterable = {
				*[Symbol.iterator]() {
					yield row0
					yield row1Map.values()
					yield row2Custom
				},
			}

			assert.deepStrictEqual(traceComplexLazy(matrixIterable), {
				re: 6,
				im: 4,
			})
		})

		test('fails fast on infinite row generator without consuming beyond width and closes generator', () => {
			let rowsPulled = 0
			let outerClosed = false

			function* infiniteRows() {
				try {
					while (true) {
						rowsPulled += 1
						yield [c(1, 1), c(2, 2)]
					}
				} finally {
					outerClosed = true
				}
			}

			assert.throws(() => traceComplexLazy(infiniteRows()), RangeError)
			// Pulls row 0 (width=2), row 1, then sees row 2 (rowIndex=2 >= 2) and stops immediately
			assert.equal(rowsPulled, 3)
			assert.equal(outerClosed, true)
		})

		test('fails fast on infinite column generator in a subsequent row and closes iterators', () => {
			let row1CellsPulled = 0
			let row1Closed = false
			let outerClosed = false
			let rowsPulled = 0

			function* infiniteRow() {
				try {
					while (true) {
						row1CellsPulled += 1
						yield c(1, 0)
					}
				} finally {
					row1Closed = true
				}
			}

			function* matrixGen() {
				try {
					rowsPulled += 1
					yield [c(1, 0), c(2, 0)]
					rowsPulled += 1
					yield infiniteRow()
					rowsPulled += 1
					yield [c(3, 0), c(4, 0)]
				} finally {
					outerClosed = true
				}
			}

			assert.throws(() => traceComplexLazy(matrixGen()), RangeError)
			assert.equal(rowsPulled, 2)
			// Pulls index 0, index 1, then index 2 triggers colIndex >= expectedWidth (2)
			assert.equal(row1CellsPulled, 3)
			assert.equal(row1Closed, true)
			assert.equal(outerClosed, true)
		})

		test('fails fast on invalid cell without pulling remaining cells or rows', () => {
			let rowsPulled = 0
			let row0CellsPulled = 0

			function* row0() {
				row0CellsPulled += 1
				yield c(1, 2)
				row0CellsPulled += 1
				yield { re: 'bad', im: 0 }
				row0CellsPulled += 1
				yield c(3, 4)
			}

			function* matrixGen() {
				rowsPulled += 1
				yield row0()
				rowsPulled += 1
				yield [c(5, 6), c(7, 8), c(9, 10)]
			}

			assert.throws(() => traceComplexLazy(matrixGen()), TypeError)
			assert.equal(rowsPulled, 1)
			assert.equal(row0CellsPulled, 2)
		})

		test('handles reused mutable complex buffer objects yielded from a stream', () => {
			const n = 4
			function* streamingRows() {
				const buf = { re: 0, im: 0 }
				for (let i = 0; i < n; i++) {
					yield (function* () {
						for (let j = 0; j < n; j++) {
							buf.re = i === j ? i + 1 : 999
							buf.im = i === j ? (i + 1) * 2 : -999
							yield buf
						}
					})()
				}
			}

			assert.deepStrictEqual(traceComplexLazy(streamingRows()), {
				re: 10,
				im: 20,
			})
		})

		test('streams a large 300x300 generated matrix accurately', () => {
			const n = 300
			function* largeMatrix() {
				for (let i = 0; i < n; i++) {
					yield (function* () {
						for (let j = 0; j < n; j++) {
							yield c(i === j ? i + 1 : 0, i === j ? -(i + 1) : 0)
						}
					})()
				}
			}

			const expected = (n * (n + 1)) / 2
			assert.deepStrictEqual(traceComplexLazy(largeMatrix()), {
				re: expected,
				im: -expected,
			})
		})
	})

	describe('invalid input handling', () => {
		test('rejects non-iterable and string matrix inputs with TypeError', () => {
			for (const bad of [null, undefined, 42, true, {}, () => {}, 'abc', '']) {
				assert.throws(() => traceComplexLazy(bad), TypeError)
			}
		})

		test('rejects non-iterable and string rows with TypeError', () => {
			for (const badRow of [null, undefined, 123, false, {}, 'xy']) {
				assert.throws(() => traceComplexLazy([badRow]), TypeError)
			}
		})

		test('rejects malformed complex entries with TypeError', () => {
			const badEntries = [
				null,
				undefined,
				5,
				'1+2i',
				[1, 2],
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 0 },
				{ re: 0, im: null },
				{ re: 1n, im: 2n },
			]
			for (const bad of badEntries) {
				assert.throws(() => traceComplexLazy([[bad]]), TypeError)
			}
		})

		test('rejects non-finite complex components (NaN, Infinity, -Infinity) with RangeError', () => {
			const nonFinite = [
				c(Number.NaN, 0),
				c(0, Number.NaN),
				c(Number.POSITIVE_INFINITY, 0),
				c(0, Number.NEGATIVE_INFINITY),
			]
			for (const bad of nonFinite) {
				assert.throws(() => traceComplexLazy([[bad]]), RangeError)
			}
		})

		test('rejects non-square and ragged matrices with RangeError', () => {
			const invalidShapes = [
				[[]], // 1x0
				[[c(1, 0), c(2, 0)]], // 1x2
				[[c(1, 0)], [c(2, 0)]], // 2x1
				[
					[c(1, 0), c(2, 0), c(3, 0)],
					[c(4, 0), c(5, 0), c(6, 0)],
				], // 2x3
				[
					[c(1, 0), c(2, 0)],
					[c(3, 0), c(4, 0)],
					[c(5, 0), c(6, 0)],
				], // 3x2
				[
					[c(1, 0), c(2, 0)],
					[c(3, 0)],
				], // ragged short
				[
					[c(1, 0)],
					[c(2, 0), c(3, 0)],
				], // ragged long
			]
			for (const shape of invalidShapes) {
				assert.throws(() => traceComplexLazy(shape), RangeError)
			}
		})
	})

	describe('independent mathematical cross-checks', () => {
		test('satisfies cyclic invariance tr(AB) = tr(BA) for rectangular complex matrices', () => {
			// A is 2x3, B is 3x2 => AB is 2x2, BA is 3x3
			const A = [
				[c(1, 2), c(-3, 0.5), c(0, -1)],
				[c(4, -2), c(1.5, 1.5), c(-2, 3)],
			]
			const B = [
				[c(2, -1), c(0, 3)],
				[c(-1, 4), c(2.5, -0.5)],
				[c(3, 1), c(-4, 2)],
			]

			const trAB = traceComplexLazy(matMulComplex(A, B))
			const trBA = traceComplexLazy(matMulComplex(B, A))
			assertComplexClose(trAB, trBA)
		})

		test('satisfies linearity tr(alpha*A + beta*B) = alpha*tr(A) + beta*tr(B)', () => {
			const A = [
				[c(2, -3), c(1, 4), c(-5, 2)],
				[c(0, 1), c(-1, 2), c(3, -1)],
				[c(4, 0), c(2, -2), c(6, 5)],
			]
			const B = [
				[c(-1, 2), c(3, -1), c(2, 0)],
				[c(5, 1), c(4, -3), c(-2, 4)],
				[c(1, -5), c(0, 2), c(-3, 1)],
			]
			const alpha = c(2.5, -1.5)
			const beta = c(-0.75, 3.25)

			const combo = A.map((row, i) =>
				row.map((cell, j) =>
					complexAdd(complexMul(alpha, cell), complexMul(beta, B[i][j]))
				)
			)

			const lhs = traceComplexLazy(combo)
			const rhs = complexAdd(
				complexMul(alpha, traceComplexLazy(A)),
				complexMul(beta, traceComplexLazy(B))
			)
			assertComplexClose(lhs, rhs)
		})

		test('satisfies transpose and Hermitian adjoint identities tr(A^T) = tr(A) and tr(A*) = conj(tr(A))', () => {
			const A = [
				[c(3, -4), c(1, 2), c(-2, 5)],
				[c(6, 1), c(-1, 7), c(0, -3)],
				[c(2, -2), c(4, 4), c(5, 1)],
			]

			const trA = traceComplexLazy(A)
			const trAT = traceComplexLazy(matTranspose(A))
			const trAH = traceComplexLazy(matConjugateTranspose(A))

			assert.deepStrictEqual(trAT, trA)
			assert.deepStrictEqual(trAH, complexConj(trA))
		})

		test('matches independent eager reference across deterministic pseudo-random matrices', () => {
			let seed = 0x12345678
			const nextRand = () => {
				seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
				return (seed / 0x100000000) * 20 - 10
			}

			for (const n of [1, 2, 5, 12]) {
				const arr = Array.from({ length: n }, () =>
					Array.from({ length: n }, () => c(nextRand(), nextRand()))
				)

				// Independent eager reference sum
				let refRe = 0
				let refIm = 0
				for (let i = 0; i < n; i++) {
					refRe += arr[i][i].re
					refIm += arr[i][i].im
				}

				function* asLazyStream() {
					for (const row of arr) {
						yield (function* () {
							for (const cell of row) yield cell
						})()
					}
				}

				assertComplexClose(
					traceComplexLazy(asLazyStream()),
					{ re: refRe, im: refIm },
					1e-11
				)
			}
		})
	})
})
