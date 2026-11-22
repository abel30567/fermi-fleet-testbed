import { describe, test } from 'node:test'
import assert from 'node:assert'
import { traceDualRecursive } from './traceDualRecursive.js'

const dual = (v, d = 0) => ({ v, d })

function assertDualClose(actual, expected, eps = 1e-12) {
	assert.strictEqual(typeof actual, 'object')
	assert.notStrictEqual(actual, null)
	assert.ok(
		Math.abs(actual.v - expected.v) <= eps,
		`Expected v=${actual.v} to be within ${eps} of ${expected.v}`,
	)
	assert.ok(
		Math.abs(actual.d - expected.d) <= eps,
		`Expected d=${actual.d} to be within ${eps} of ${expected.d}`,
	)
}

function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

function randomDualMatrix(n, rng) {
	return Array.from({ length: n }, () =>
		Array.from({ length: n }, () => ({
			v: (rng() - 0.5) * 20,
			d: (rng() - 0.5) * 20,
		})),
	)
}

function iterativeTrace(matrix) {
	let v = 0
	let d = 0
	for (let i = 0; i < matrix.length; i++) {
		v += matrix[i][i].v
		d += matrix[i][i].d
	}
	return { v, d }
}

describe('traceDualRecursive', () => {
	describe('normal cases', () => {
		test('1x1 matrix returns a fresh dual equal to the sole entry', () => {
			const entry = dual(3.5, -1.25)
			const result = traceDualRecursive([[entry]])
			assert.deepStrictEqual(result, { v: 3.5, d: -1.25 })
			assert.notStrictEqual(result, entry)
		})

		test('2x2 matrix sums main diagonal and ignores off-diagonal values', () => {
			const m = [
				[dual(2, 1), dual(100, -50)],
				[dual(-77, 99), dual(4, -2)],
			]
			assert.deepStrictEqual(traceDualRecursive(m), { v: 6, d: -1 })
		})

		test('3x3 matrix handles odd dimension split', () => {
			const m = [
				[dual(1, 0.5), dual(2, 1), dual(3, 1.5)],
				[dual(4, 2), dual(5, 2.5), dual(6, 3)],
				[dual(7, 3.5), dual(8, 4), dual(9, 4.5)],
			]
			assert.deepStrictEqual(traceDualRecursive(m), { v: 15, d: 7.5 })
		})

		test('larger power-of-2 (16x16) and non-power-of-2 (65x65) matrices', () => {
			for (const n of [4, 7, 16, 65]) {
				const m = Array.from({ length: n }, (_, i) =>
					Array.from({ length: n }, (_, j) =>
						i === j ? dual(i + 1, 2 * i - 1) : dual(i * j, i - j),
					),
				)
				const expectedV = (n * (n + 1)) / 2
				const expectedD = n * (n - 2) // sum_{i=0}^{n-1} (2i - 1) = n(n-1) - n = n(n-2)
				assert.deepStrictEqual(traceDualRecursive(m), { v: expectedV, d: expectedD })
			}
		})
	})

	describe('edge cases', () => {
		test('zero matrix yields zero dual', () => {
			const zero3 = Array.from({ length: 3 }, () =>
				Array.from({ length: 3 }, () => dual(0, 0)),
			)
			assert.deepStrictEqual(traceDualRecursive(zero3), { v: 0, d: 0 })
		})

		test('negative entries and exact cancellation', () => {
			const m = [
				[dual(-10, 4.5), dual(1, 2), dual(3, 4)],
				[dual(5, 6), dual(10, -4.5), dual(7, 8)],
				[dual(9, 10), dual(11, 12), dual(-3, -2)],
			]
			assert.deepStrictEqual(traceDualRecursive(m), { v: -3, d: -2 })
		})

		test('rejects non-array matrix inputs', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, { v: 1, d: 2 }]) {
				assert.throws(() => traceDualRecursive(bad), TypeError)
			}
		})

		test('rejects empty matrix', () => {
			assert.throws(() => traceDualRecursive([]), RangeError)
		})

		test('rejects non-array rows', () => {
			assert.throws(() => traceDualRecursive([null]), TypeError)
			assert.throws(() => traceDualRecursive([[dual(1, 0), dual(2, 0)], 'bad']), TypeError)
		})

		test('rejects non-square and ragged matrices', () => {
			// 1x2
			assert.throws(() => traceDualRecursive([[dual(1, 0), dual(2, 0)]]), RangeError)
			// 2x1
			assert.throws(() => traceDualRecursive([[dual(1, 0)], [dual(2, 0)]]), RangeError)
			// 2x3
			assert.throws(
				() =>
					traceDualRecursive([
						[dual(1, 0), dual(2, 0), dual(3, 0)],
						[dual(4, 0), dual(5, 0), dual(6, 0)],
					]),
				RangeError,
			)
			// Ragged (row 0 has length 2, row 1 has length 1)
			assert.throws(
				() => traceDualRecursive([[dual(1, 0), dual(2, 0)], [dual(3, 0)]]),
				RangeError,
			)
		})

		test('rejects invalid or non-finite dual entries on diagonal and off-diagonal', () => {
			const typeErrors = [
				null,
				undefined,
				5,
				'1',
				[1, 2],
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 0 },
				{ v: 1, d: '0' },
			]
			for (const bad of typeErrors) {
				// On diagonal
				assert.throws(
					() =>
						traceDualRecursive([
							[bad, dual(0, 0)],
							[dual(0, 0), dual(1, 1)],
						]),
					TypeError,
				)
				// Off diagonal
				assert.throws(
					() =>
						traceDualRecursive([
							[dual(1, 1), bad],
							[dual(0, 0), dual(1, 1)],
						]),
					TypeError,
				)
			}

			const rangeErrors = [
				{ v: Number.NaN, d: 0 },
				{ v: 0, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 0 },
				{ v: 0, d: Number.NEGATIVE_INFINITY },
			]
			for (const bad of rangeErrors) {
				assert.throws(
					() =>
						traceDualRecursive([
							[bad, dual(0, 0)],
							[dual(0, 0), dual(1, 1)],
						]),
					RangeError,
				)
				assert.throws(
					() =>
						traceDualRecursive([
							[dual(1, 1), dual(0, 0)],
							[bad, dual(1, 1)],
						]),
					RangeError,
				)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('matches independent iterative diagonal sum across sizes 1..20', () => {
			const rng = makeRng(20261122)
			for (let n = 1; n <= 20; n++) {
				const m = randomDualMatrix(n, rng)
				const recursive = traceDualRecursive(m)
				const iterative = iterativeTrace(m)
				assertDualClose(recursive, iterative, 1e-12)
			}
		})

		test('satisfies linearity tr(A + B) = tr(A) + tr(B) and scalar scaling tr(c*A) = c*tr(A)', () => {
			const rng = makeRng(424242)
			const n = 9
			const A = randomDualMatrix(n, rng)
			const B = randomDualMatrix(n, rng)
			const alpha = 2.75
			const beta = -1.5

			const sumAB = A.map((row, i) =>
				row.map((a, j) => ({
					v: a.v + B[i][j].v,
					d: a.d + B[i][j].d,
				})),
			)
			const trA = traceDualRecursive(A)
			const trB = traceDualRecursive(B)
			const trSum = traceDualRecursive(sumAB)
			assertDualClose(trSum, { v: trA.v + trB.v, d: trA.d + trB.d }, 1e-12)

			const linComb = A.map((row, i) =>
				row.map((a, j) => ({
					v: alpha * a.v + beta * B[i][j].v,
					d: alpha * a.d + beta * B[i][j].d,
				})),
			)
			const trLin = traceDualRecursive(linComb)
			assertDualClose(
				trLin,
				{
					v: alpha * trA.v + beta * trB.v,
					d: alpha * trA.d + beta * trB.d,
				},
				1e-11,
			)
		})

		test('matches transpose invariance tr(A^T) = tr(A)', () => {
			const rng = makeRng(987654)
			const n = 7
			const A = randomDualMatrix(n, rng)
			const AT = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => A[j][i]),
			)
			assert.deepStrictEqual(traceDualRecursive(AT), traceDualRecursive(A))
		})

		test('matches central finite-difference derivative of smooth matrix function M(t)', () => {
			const evalPrimalMatrix = (t) => [
				[Math.sin(2 * t), t ** 2, Math.cos(t), 1 / (1 + t * t)],
				[Math.exp(-t), t ** 3 - 3 * t, Math.sin(t), t],
				[t + 1, Math.cos(3 * t), Math.exp(0.5 * t), t ** 2 - 1],
				[Math.sin(t), t, Math.exp(t), Math.log(t + 2)],
			]

			const evalDualMatrix = (t) => [
				[
					dual(Math.sin(2 * t), 2 * Math.cos(2 * t)),
					dual(t ** 2, 2 * t),
					dual(Math.cos(t), -Math.sin(t)),
					dual(1 / (1 + t * t), (-2 * t) / (1 + t * t) ** 2),
				],
				[
					dual(Math.exp(-t), -Math.exp(-t)),
					dual(t ** 3 - 3 * t, 3 * t ** 2 - 3),
					dual(Math.sin(t), Math.cos(t)),
					dual(t, 1),
				],
				[
					dual(t + 1, 1),
					dual(Math.cos(3 * t), -3 * Math.sin(3 * t)),
					dual(Math.exp(0.5 * t), 0.5 * Math.exp(0.5 * t)),
					dual(t ** 2 - 1, 2 * t),
				],
				[
					dual(Math.sin(t), Math.cos(t)),
					dual(t, 1),
					dual(Math.exp(t), Math.exp(t)),
					dual(Math.log(t + 2), 1 / (t + 2)),
				],
			]

			const primalTrace = (mat) => mat.reduce((acc, row, i) => acc + row[i], 0)

			const t0 = 0.75
			const h = 1e-6
			const result = traceDualRecursive(evalDualMatrix(t0))
			const expectedV = primalTrace(evalPrimalMatrix(t0))
			const fdDerivative =
				(primalTrace(evalPrimalMatrix(t0 + h)) - primalTrace(evalPrimalMatrix(t0 - h))) /
				(2 * h)

			assertDualClose(result, { v: expectedV, d: fdDerivative }, 1e-8)
		})
	})
})
