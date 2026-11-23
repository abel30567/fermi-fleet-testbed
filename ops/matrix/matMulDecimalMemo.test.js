import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { matMulDecimalMemo } from './matMulDecimalMemo.js'

/**
 * Transposes a 2D matrix.
 * @param {string[][]} m
 * @returns {string[][]}
 */
function transpose(m) {
	const rows = m.length
	const cols = m[0].length
	const out = Array.from({ length: cols }, () => new Array(rows))
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			out[c][r] = m[r][c]
		}
	}
	return out
}

/**
 * Independent exact decimal addition helper (plain BigInt, no memoization)
 * for cross-checking distributivity A(B + C) = AB + AC.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function exactAddDecimal(a, b) {
	const toParts = (s) => {
		const neg = s.startsWith('-')
		const body = neg || s.startsWith('+') ? s.slice(1) : s
		const [i, f = ''] = body.split('.')
		const coeff = BigInt((neg ? '-' : '') + i + f)
		return { coeff, scale: f.length }
	}
	const pa = toParts(a)
	const pb = toParts(b)
	const scale = Math.max(pa.scale, pb.scale)
	const sum =
		pa.coeff * 10n ** BigInt(scale - pa.scale) + pb.coeff * 10n ** BigInt(scale - pb.scale)
	if (sum === 0n) return '0'
	const neg = sum < 0n
	const digits = (neg ? -sum : sum).toString()
	if (scale === 0) return neg ? `-${digits}` : digits
	const padded = digits.padStart(scale + 1, '0')
	const intPart = padded.slice(0, padded.length - scale)
	const fracPart = padded.slice(padded.length - scale).replace(/0+$/, '')
	if (!fracPart) return neg ? `-${intPart}` : intPart
	return `${neg ? '-' : ''}${intPart}.${fracPart}`
}

/**
 * Independent matrix addition helper.
 * @param {string[][]} a
 * @param {string[][]} b
 * @returns {string[][]}
 */
function matAddExact(a, b) {
	return a.map((row, r) => row.map((val, c) => exactAddDecimal(val, b[r][c])))
}

describe('matMulDecimalMemo', () => {
	beforeEach(() => {
		matMulDecimalMemo.clearCache()
	})

	describe('normal cases', () => {
		test('multiplies 2x2 integer decimal string matrices', () => {
			const a = [
				['1', '2'],
				['3', '4'],
			]
			const b = [
				['5', '6'],
				['7', '8'],
			]
			assert.deepEqual(matMulDecimalMemo(a, b), [
				['19', '22'],
				['43', '50'],
			])
		})

		test('multiplies fractional decimal matrices without floating-point drift', () => {
			const a = [
				['0.1', '0.2'],
				['0.3', '0.4'],
			]
			const b = [
				['1', '0.1'],
				['1', '0.2'],
			]
			assert.deepEqual(matMulDecimalMemo(a, b), [
				['0.3', '0.05'],
				['0.7', '0.11'],
			])
		})

		test('handles negative numbers, explicit plus signs, shorthand decimals, and scientific notation', () => {
			const a = [
				['-0.5', '+.25', '1e-2'],
				['2.', '-1.5E+1', '-0.0'],
			]
			const b = [
				['4', '-2'],
				['8', '0'],
				['100', '50'],
			]
			// Row 0: (-0.5)*4 + 0.25*8 + 0.01*100 = -2 + 2 + 1 = 1
			//        (-0.5)*(-2) + 0.25*0 + 0.01*50 = 1 + 0 + 0.5 = 1.5
			// Row 1: 2*4 + (-15)*8 + 0*100 = 8 - 120 = -112
			//        2*(-2) + (-15)*0 + 0*50 = -4
			assert.deepEqual(matMulDecimalMemo(a, b), [
				['1', '1.5'],
				['-112', '-4'],
			])
		})

		test('multiplies 3x3 decimal matrices accurately', () => {
			const a = [
				['1.5', '-2.25', '0.5'],
				['0', '3.1', '-4.2'],
				['-1.1', '0.05', '2.5'],
			]
			const b = [
				['2', '0.5', '-1'],
				['-3', '1.5', '0.25'],
				['4', '-2', '0.5'],
			]
			assert.deepEqual(matMulDecimalMemo(a, b), [
				['11.75', '-3.625', '-1.8125'],
				['-26.1', '13.05', '-1.325'],
				['7.65', '-5.475', '2.3625'],
			])
		})
	})

	describe('edge cases', () => {
		test('handles 1x1 matrices', () => {
			assert.deepEqual(matMulDecimalMemo([['-3.75']], [['4.2']]), [['-15.75']])
			assert.deepEqual(matMulDecimalMemo([['0']], [['-999999999999999999999.12345']]), [['0']])
		})

		test('handles rectangular matrices (2x3 * 3x2, 1x4 * 4x1, 3x1 * 1x3)', () => {
			const a = [
				['1.5', '2', '-0.5'],
				['0', '-1', '3.25'],
			]
			const b = [
				['2', '0'],
				['-1', '4'],
				['2', '-2'],
			]
			assert.deepEqual(matMulDecimalMemo(a, b), [
				['0', '9'],
				['7.5', '-10.5'],
			])

			// Inner product: 1x4 * 4x1 -> 1x1
			assert.deepEqual(
				matMulDecimalMemo([['0.1', '0.2', '0.3', '0.4']], [['10'], ['20'], ['30'], ['40']]),
				[['30']]
			)

			// Outer product: 3x1 * 1x3 -> 3x3
			assert.deepEqual(matMulDecimalMemo([['2'], ['-3'], ['0.5']], [['1.5', '-2', '0']]), [
				['3', '-4', '0'],
				['-4.5', '6', '0'],
				['0.75', '-1', '0'],
			])
		})

		test('satisfies identity matrix property A * I = A and I * A = A', () => {
			const a = [
				['12345678901234567890.0001', '-0.00000000000000012345'],
				['-99999999999999999999.9999', '42.42424242424242424242'],
			]
			const id = [
				['1', '0'],
				['0', '1'],
			]
			assert.deepEqual(matMulDecimalMemo(a, id, 25), a)
			assert.deepEqual(matMulDecimalMemo(id, a, 25), a)
		})

		test('normalizes negative zero results to "0"', () => {
			assert.deepEqual(matMulDecimalMemo([['-0.0001']], [['0.0001']], 4), [['0']])
			assert.deepEqual(matMulDecimalMemo([['-0']], [['5']]), [['0']])
		})

		test('handles arbitrary-precision decimals beyond IEEE-754 double and beyond initial pow10 table', () => {
			// 60-digit precision arithmetic
			const x = '1.000000000000000000000000000000000000000000000000000000000001'
			const y = '2.000000000000000000000000000000000000000000000000000000000003'
			// x * y = 2 + 5e-60 + 3e-120
			const expected =
				'2.' + '0'.repeat(59) + '5' + '0'.repeat(59) + '3'
			assert.deepEqual(matMulDecimalMemo([[x]], [[y]], 150), [[expected]])

			// Exceed INITIAL_POW10_LIMIT (128) for scaling and rounding
			const tiny = '1e-140'
			const res = matMulDecimalMemo([[tiny, '1']], [['1'], ['1']], 150)
			assert.deepEqual(res, [['1.' + '0'.repeat(139) + '1']])
			assert.ok(matMulDecimalMemo.getCacheStats().sizes.pow10Extra >= 1)
		})

		test('respects configurable precision with round half-away-from-zero', () => {
			// Exact value: 0.125
			assert.deepEqual(matMulDecimalMemo([['0.5']], [['0.25']], 2), [['0.13']])
			assert.deepEqual(matMulDecimalMemo([['0.5']], [['0.25']], 3), [['0.125']])
			assert.deepEqual(matMulDecimalMemo([['0.5']], [['0.25']], 0), [['0']])

			// Exact value: -0.125 -> -0.13 at precision 2
			assert.deepEqual(matMulDecimalMemo([['-0.5']], [['0.25']], 2), [['-0.13']])

			// Exact value: 0.124 -> 0.12 at precision 2
			assert.deepEqual(matMulDecimalMemo([['0.31']], [['0.4']], 2), [['0.12']])

			// Carry propagation: 0.999 at precision 2 -> 1
			assert.deepEqual(matMulDecimalMemo([['0.999']], [['1']], 2), [['1']])

			// Exact value: 2.5 at precision 0 -> 3; -2.5 at precision 0 -> -3
			assert.deepEqual(matMulDecimalMemo([['5']], [['0.5']], 0), [['3']])
			assert.deepEqual(matMulDecimalMemo([['-5']], [['0.5']], 0), [['-3']])
		})
	})

	describe('memoization and cache safety', () => {
		test('memoizes repeated matrix multiplications and returns defensive copies', () => {
			const a = [
				['1.25', '2.5'],
				['3.75', '4.5'],
			]
			const b = [
				['2', '-1'],
				['0.5', '4'],
			]

			const first = matMulDecimalMemo(a, b, 10)
			const statsAfterFirst = matMulDecimalMemo.getCacheStats()
			assert.equal(statsAfterFirst.matrixMisses, 1)
			assert.equal(statsAfterFirst.matrixHits, 0)

			// Mutate returned matrix to ensure cached value is protected
			first[0][0] = 'CORRUPTED'

			const second = matMulDecimalMemo(a, b, 10)
			const statsAfterSecond = matMulDecimalMemo.getCacheStats()
			assert.equal(statsAfterSecond.matrixHits, 1)
			assert.deepEqual(second, [
				['3.75', '8.75'],
				['9.75', '14.25'],
			])
		})

		test('normalizes equivalent decimal strings to maximize cache hits', () => {
			const a1 = [
				['1.5', '3.00'],
				['1.50', '3'],
			]
			const b1 = [
				['3.0', '3'],
				['1.50', '15e-1'],
			]
			const res1 = matMulDecimalMemo(a1, b1)
			const stats1 = matMulDecimalMemo.getCacheStats()
			// Within cell (0,0): 1.5*3 misses, then 3*1.5 hits PRODUCT_CACHE via commutativity
			assert.ok(stats1.productHits >= 1)
			// Identical rows/cols within a single multiplication hit CELL_CACHE 3 times
			assert.equal(stats1.cellHits, 3)

			// Equivalent representation of the same matrices hits MATRIX_CACHE
			const a2 = [
				['+15e-1', '3.000'],
				['1.5', '+3'],
			]
			const b2 = [
				['3', '30e-1'],
				['1.5', '1.500'],
			]
			const res2 = matMulDecimalMemo(a2, b2)
			const stats2 = matMulDecimalMemo.getCacheStats()
			assert.equal(stats2.matrixHits, 1)
			assert.deepEqual(res2, res1)
		})

		test('keys memoization caches by precision', () => {
			const a = [['0.333333']]
			const b = [['1']]
			assert.deepEqual(matMulDecimalMemo(a, b, 2), [['0.33']])
			assert.deepEqual(matMulDecimalMemo(a, b, 4), [['0.3333']])
			assert.deepEqual(matMulDecimalMemo(a, b, 6), [['0.333333']])
			const stats = matMulDecimalMemo.getCacheStats()
			assert.equal(stats.matrixMisses, 3)
			assert.equal(stats.matrixHits, 0)
		})
	})

	describe('input validation', () => {
		test('rejects non-array or empty matrices', () => {
			assert.throws(() => matMulDecimalMemo(null, [['1']]), TypeError)
			assert.throws(() => matMulDecimalMemo([['1']], undefined), TypeError)
			assert.throws(() => matMulDecimalMemo('1', [['1']]), TypeError)
			assert.throws(() => matMulDecimalMemo([], [['1']]), RangeError)
			assert.throws(() => matMulDecimalMemo([['1']], []), RangeError)
			assert.throws(() => matMulDecimalMemo([[]], [['1']]), RangeError)
			assert.throws(() => matMulDecimalMemo([['1']], [[]]), RangeError)
			assert.throws(() => matMulDecimalMemo(['1'], [['1']]), TypeError)
		})

		test('rejects ragged matrices', () => {
			assert.throws(
				() =>
					matMulDecimalMemo(
						[
							['1', '2'],
							['3'],
						],
						[
							['1'],
							['2'],
						]
					),
				/ragged/i
			)
			assert.throws(
				() =>
					matMulDecimalMemo(
						[['1', '2']],
						[
							['1', '2'],
							['3', '4', '5'],
						]
					),
				/ragged/i
			)
		})

		test('rejects incompatible inner dimensions', () => {
			assert.throws(
				() =>
					matMulDecimalMemo(
						[
							['1', '2', '3'],
							['4', '5', '6'],
						],
						[
							['1', '2'],
							['3', '4'],
						]
					),
				/incompatible/i
			)
		})

		test('rejects non-string and non-decimal entries', () => {
			assert.throws(() => matMulDecimalMemo([[1]], [['1']]), TypeError)
			assert.throws(() => matMulDecimalMemo([['1']], [[null]]), TypeError)
			assert.throws(() => matMulDecimalMemo([[1n]], [['1']]), TypeError)

			// Sparse array hole
			const sparseRow = new Array(2)
			sparseRow[0] = '1'
			assert.throws(() => matMulDecimalMemo([sparseRow], [['1'], ['2']]), TypeError)

			const badStrings = ['', ' ', '.', '+.', 'abc', '1.2.3', 'NaN', 'Infinity', ' 1.5', '1e']
			for (const bad of badStrings) {
				assert.throws(() => matMulDecimalMemo([[bad]], [['1']]), RangeError)
			}
		})

		test('rejects invalid precision arguments', () => {
			assert.throws(() => matMulDecimalMemo([['1']], [['1']], '2'), TypeError)
			assert.throws(() => matMulDecimalMemo([['1']], [['1']], null), TypeError)
			assert.throws(() => matMulDecimalMemo([['1']], [['1']], -1), RangeError)
			assert.throws(() => matMulDecimalMemo([['1']], [['1']], 1.5), RangeError)
			assert.throws(() => matMulDecimalMemo([['1']], [['1']], Number.NaN), RangeError)
			assert.throws(
				() => matMulDecimalMemo([['1']], [['1']], Number.POSITIVE_INFINITY),
				RangeError
			)
		})
	})

	describe('independent mathematical cross-checks', () => {
		test('satisfies associativity: (A * B) * C === A * (B * C)', () => {
			const a = [
				['1.25', '-0.375', '2.125'],
				['-4.5', '0.0625', '3.75'],
			]
			const b = [
				['0.5', '-1.2', '3.4', '0.01'],
				['-2.3', '4.1', '-0.05', '1.75'],
				['1.11', '0', '-2.22', '0.333'],
			]
			const c = [
				['-0.75', '2.5'],
				['1.125', '-3.25'],
				['0.004', '0.8'],
				['-5.5', '1.2'],
			]

			const ab = matMulDecimalMemo(a, b, 30)
			const lhs = matMulDecimalMemo(ab, c, 30)

			const bc = matMulDecimalMemo(b, c, 30)
			const rhs = matMulDecimalMemo(a, bc, 30)

			assert.deepEqual(lhs, rhs)
		})

		test('satisfies transpose identity: (A * B)^T === B^T * A^T', () => {
			const a = [
				['1.123456789012345', '-2.987654321098765', '0.5', '100.001'],
				['-3.25', '0', '4.75', '-0.000125'],
				['7.7', '-8.8', '9.9', '1.1'],
			]
			const b = [
				['0.25', '-1.5'],
				['3.141592653589793', '2.718281828459045'],
				['-0.01', '1000'],
				['42.5', '-0.125'],
			]

			const lhs = transpose(matMulDecimalMemo(a, b, 40))
			const rhs = matMulDecimalMemo(transpose(b), transpose(a), 40)

			assert.deepEqual(lhs, rhs)
		})

		test('satisfies distributivity: A * (B + C) === A * B + A * C', () => {
			const a = [
				['0.125', '-1.75', '3.2'],
				['-2.4', '0.5', '1.125'],
			]
			const b = [
				['1.1', '-2.2'],
				['3.3', '4.4'],
				['-5.5', '0.6'],
			]
			const c = [
				['-0.35', '1.8'],
				['0.7', '-2.15'],
				['4.25', '0.4'],
			]

			const lhs = matMulDecimalMemo(a, matAddExact(b, c), 30)
			const rhs = matAddExact(matMulDecimalMemo(a, b, 30), matMulDecimalMemo(a, c, 30))

			assert.deepEqual(lhs, rhs)
		})
	})
})
