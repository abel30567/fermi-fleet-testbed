import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { transposeDualSeries } from './transposeDualSeries.js'

/**
 * Helper: dual number addition.
 * @param {{ v: number, d: number }} a
 * @param {{ v: number, d: number }} b
 */
function dualAdd(a, b) {
	return { v: a.v + b.v, d: a.d + b.d }
}

/**
 * Helper: dual number multiplication (a.v + a.d*ε)(b.v + b.d*ε).
 * @param {{ v: number, d: number }} a
 * @param {{ v: number, d: number }} b
 */
function dualMul(a, b) {
	return { v: a.v * b.v, d: a.v * b.d + a.d * b.v }
}

/**
 * Helper: dual matrix multiplication A (m×k) * B (k×n).
 * @param {{ v: number, d: number }[][]} A
 * @param {{ v: number, d: number }[][]} B
 */
function dualMatMul(A, B) {
	const m = A.length
	const k = A[0].length
	const n = B[0].length
	const out = Array.from({ length: m }, () => new Array(n))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let acc = { v: 0, d: 0 }
			for (let p = 0; p < k; p++) {
				acc = dualAdd(acc, dualMul(A[i][p], B[p][j]))
			}
			out[i][j] = acc
		}
	}
	return out
}

describe('transposeDualSeries', () => {
	test('transposes a rectangular 2x3 dual matrix', () => {
		const input = [
			[
				{ v: 1, d: 10 },
				{ v: 2, d: 20 },
				{ v: 3, d: 30 }
			],
			[
				{ v: 4, d: 40 },
				{ v: 5, d: 50 },
				{ v: 6, d: 60 }
			]
		]

		const expected = [
			[
				{ v: 1, d: 10 },
				{ v: 4, d: 40 }
			],
			[
				{ v: 2, d: 20 },
				{ v: 5, d: 50 }
			],
			[
				{ v: 3, d: 30 },
				{ v: 6, d: 60 }
			]
		]

		assert.deepStrictEqual(transposeDualSeries(input), expected)
	})

	test('transposes a square 2x2 dual matrix with negative and fractional values', () => {
		const input = [
			[
				{ v: -1.5, d: 0.25 },
				{ v: 0, d: -3.5 }
			],
			[
				{ v: 7.25, d: 0 },
				{ v: -4, d: 8.5 }
			]
		]

		const expected = [
			[
				{ v: -1.5, d: 0.25 },
				{ v: 7.25, d: 0 }
			],
			[
				{ v: 0, d: -3.5 },
				{ v: -4, d: 8.5 }
			]
		]

		assert.deepStrictEqual(transposeDualSeries(input), expected)
	})

	test('transposes 1x1, row vector (1xn), and column vector (nx1)', () => {
		assert.deepStrictEqual(transposeDualSeries([[{ v: 42, d: -1 }]]), [
			[{ v: 42, d: -1 }]
		])

		const rowVec = [[{ v: 1, d: 0.1 }, { v: 2, d: 0.2 }, { v: 3, d: 0.3 }]]
		const colVec = [[{ v: 1, d: 0.1 }], [{ v: 2, d: 0.2 }], [{ v: 3, d: 0.3 }]]

		assert.deepStrictEqual(transposeDualSeries(rowVec), colVec)
		assert.deepStrictEqual(transposeDualSeries(colVec), rowVec)
	})

	test('handles empty matrices (0x0 and mx0)', () => {
		assert.deepStrictEqual(transposeDualSeries([]), [])
		assert.deepStrictEqual(transposeDualSeries([[]]), [])
		assert.deepStrictEqual(transposeDualSeries([[], [], []]), [])
	})

	test('returns fresh dual objects without aliasing input entries', () => {
		const input = [
			[
				{ v: 1, d: 2 },
				{ v: 3, d: 4 }
			]
		]
		const transposed = transposeDualSeries(input)

		assert.notStrictEqual(transposed[0][0], input[0][0])
		assert.notStrictEqual(transposed[1][0], input[0][1])

		transposed[0][0].v = 999
		transposed[0][0].d = -999
		assert.deepStrictEqual(input[0][0], { v: 1, d: 2 })
	})

	test('validates malformed inputs and throws appropriate errors', () => {
		assert.throws(() => transposeDualSeries(null), TypeError)
		assert.throws(() => transposeDualSeries(undefined), TypeError)
		assert.throws(() => transposeDualSeries(123), TypeError)
		assert.throws(() => transposeDualSeries('matrix'), TypeError)
		assert.throws(() => transposeDualSeries({}), TypeError)

		// Non-array rows
		assert.throws(() => transposeDualSeries([null]), TypeError)
		assert.throws(
			() => transposeDualSeries([[{ v: 1, d: 0 }], 'not-a-row']),
			TypeError
		)

		// Ragged matrices
		assert.throws(
			() =>
				transposeDualSeries([
					[{ v: 1, d: 0 }],
					[
						{ v: 2, d: 0 },
						{ v: 3, d: 0 }
					]
				]),
			RangeError
		)

		// Invalid dual entries
		assert.throws(() => transposeDualSeries([[null]]), TypeError)
		assert.throws(() => transposeDualSeries([[42]]), TypeError)
		assert.throws(() => transposeDualSeries([[[1, 2]]]), TypeError)
		assert.throws(() => transposeDualSeries([[{ v: 1 }]]), TypeError)
		assert.throws(() => transposeDualSeries([[{ d: 1 }]]), TypeError)
		assert.throws(() => transposeDualSeries([[{ v: '1', d: 0 }]]), TypeError)

		// Non-finite numbers
		assert.throws(() => transposeDualSeries([[{ v: NaN, d: 0 }]]), RangeError)
		assert.throws(
			() => transposeDualSeries([[{ v: 1, d: Infinity }]]),
			RangeError
		)
		assert.throws(
			() => transposeDualSeries([[{ v: -Infinity, d: 0 }]]),
			RangeError
		)
	})

	test('satisfies involution identity: (A^T)^T = A', () => {
		const A = [
			[
				{ v: 2.5, d: -1.2 },
				{ v: -0.7, d: 3.4 },
				{ v: 5.1, d: 0.8 }
			],
			[
				{ v: -4.2, d: 2.9 },
				{ v: 1.3, d: -6.1 },
				{ v: 0.0, d: 1.0 }
			]
		]

		assert.deepStrictEqual(transposeDualSeries(transposeDualSeries(A)), A)
	})

	test('satisfies linearity identity: (αA + βB)^T = αA^T + βB^T over dual numbers', () => {
		const alpha = { v: 2.5, d: -0.5 }
		const beta = { v: -1.5, d: 0.75 }
		const A = [
			[
				{ v: 1, d: 2 },
				{ v: -3, d: 0.5 }
			],
			[
				{ v: 4, d: -1 },
				{ v: 2, d: 3 }
			],
			[
				{ v: -2, d: 1.5 },
				{ v: 0.5, d: -2 }
			]
		]
		const B = [
			[
				{ v: -1, d: 0.25 },
				{ v: 2, d: -1.5 }
			],
			[
				{ v: 0.5, d: 2 },
				{ v: -3, d: 1 }
			],
			[
				{ v: 4, d: -0.5 },
				{ v: 1.5, d: 2.5 }
			]
		]

		const lhsInput = A.map((row, i) =>
			row.map((cell, j) =>
				dualAdd(dualMul(alpha, cell), dualMul(beta, B[i][j]))
			)
		)
		const lhs = transposeDualSeries(lhsInput)

		const AT = transposeDualSeries(A)
		const BT = transposeDualSeries(B)
		const rhs = AT.map((row, i) =>
			row.map((cell, j) =>
				dualAdd(dualMul(alpha, cell), dualMul(beta, BT[i][j]))
			)
		)

		for (let i = 0; i < lhs.length; i++) {
			for (let j = 0; j < lhs[0].length; j++) {
				assert.ok(Math.abs(lhs[i][j].v - rhs[i][j].v) < 1e-12)
				assert.ok(Math.abs(lhs[i][j].d - rhs[i][j].d) < 1e-12)
			}
		}
	})

	test('satisfies product transpose identity: (A * B)^T = B^T * A^T over dual numbers', () => {
		const A = [
			[
				{ v: 1.2, d: 0.5 },
				{ v: -0.8, d: 1.1 },
				{ v: 2.3, d: -0.4 }
			],
			[
				{ v: 0.7, d: -1.3 },
				{ v: 3.1, d: 0.2 },
				{ v: -1.5, d: 0.9 }
			]
		]
		const B = [
			[
				{ v: -2.0, d: 0.3 },
				{ v: 1.4, d: -0.6 }
			],
			[
				{ v: 0.9, d: 1.2 },
				{ v: -0.5, d: 0.8 }
			],
			[
				{ v: 1.7, d: -0.9 },
				{ v: 2.2, d: 0.4 }
			]
		]

		const lhs = transposeDualSeries(dualMatMul(A, B))
		const rhs = dualMatMul(transposeDualSeries(B), transposeDualSeries(A))

		assert.equal(lhs.length, rhs.length)
		assert.equal(lhs[0].length, rhs[0].length)
		for (let i = 0; i < lhs.length; i++) {
			for (let j = 0; j < lhs[0].length; j++) {
				assert.ok(Math.abs(lhs[i][j].v - rhs[i][j].v) < 1e-12)
				assert.ok(Math.abs(lhs[i][j].d - rhs[i][j].d) < 1e-12)
			}
		}
	})

	test('matches central finite-difference derivative for a smooth parameterized matrix A(t)', () => {
		const evalMatrix = (t) => [
			[Math.sin(1.3 * t) + 0.5 * t * t, Math.cos(0.7 * t) - 2 * t, Math.exp(0.4 * t)],
			[t * t * t - 1.5 * t, Math.sin(t) * Math.cos(2 * t), 1 / (1 + t * t)]
		]
		const evalDualMatrix = (t) => [
			[
				{ v: Math.sin(1.3 * t) + 0.5 * t * t, d: 1.3 * Math.cos(1.3 * t) + t },
				{ v: Math.cos(0.7 * t) - 2 * t, d: -0.7 * Math.sin(0.7 * t) - 2 },
				{ v: Math.exp(0.4 * t), d: 0.4 * Math.exp(0.4 * t) }
			],
			[
				{ v: t * t * t - 1.5 * t, d: 3 * t * t - 1.5 },
				{
					v: Math.sin(t) * Math.cos(2 * t),
					d: Math.cos(t) * Math.cos(2 * t) - 2 * Math.sin(t) * Math.sin(2 * t)
				},
				{ v: 1 / (1 + t * t), d: (-2 * t) / (1 + t * t) ** 2 }
			]
		]

		const plainTranspose = (M) =>
			M[0].map((_, j) => M.map((row) => row[j]))

		const t0 = 0.85
		const h = 1e-6
		const dualT = transposeDualSeries(evalDualMatrix(t0))
		const plusT = plainTranspose(evalMatrix(t0 + h))
		const minusT = plainTranspose(evalMatrix(t0 - h))
		const baseT = plainTranspose(evalMatrix(t0))

		for (let i = 0; i < dualT.length; i++) {
			for (let j = 0; j < dualT[0].length; j++) {
				const fd = (plusT[i][j] - minusT[i][j]) / (2 * h)
				assert.ok(
					Math.abs(dualT[i][j].v - baseT[i][j]) < 1e-12,
					`value mismatch at [${i}][${j}]`
				)
				assert.ok(
					Math.abs(dualT[i][j].d - fd) < 1e-7,
					`derivative mismatch at [${i}][${j}]: dual=${dualT[i][j].d}, fd=${fd}`
				)
			}
		}
	})
})
