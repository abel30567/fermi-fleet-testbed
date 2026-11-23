import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { transposeDecimalMemo } from './transposeDecimalMemo.js'

describe('transposeDecimalMemo', () => {
	test('transposes standard square and rectangular matrices', () => {
		const square = [
			['1', '2', '3'],
			['4', '5', '6'],
			['7', '8', '9'],
		]
		assert.deepEqual(transposeDecimalMemo(square), [
			['1', '4', '7'],
			['2', '5', '8'],
			['3', '6', '9'],
		])

		const rect = [
			['1.5', '-2.25', '0.125'],
			['10', '+004.50', '.75'],
		]
		assert.deepEqual(transposeDecimalMemo(rect), [
			['1.5', '10'],
			['-2.25', '4.5'],
			['0.125', '0.75'],
		])
	})

	test('handles 1x1, 1xN row vector, and Nx1 column vector edge cases', () => {
		assert.deepEqual(transposeDecimalMemo([['42.5']]), [['42.5']])

		assert.deepEqual(transposeDecimalMemo([['1', '2', '3', '4']]), [
			['1'],
			['2'],
			['3'],
			['4'],
		])

		assert.deepEqual(
			transposeDecimalMemo([['-10.5'], ['0'], ['3.14'], ['99.']]),
			[['-10.5', '0', '3.14', '99']]
		)
	})

	test('supports arbitrary-precision decimals beyond IEEE-754 and configurable precision rounding', () => {
		const bigA = '123456789012345678901234567890.1234567890123456789012345678905'
		const bigB = '-987654321098765432109876543210.9999999999999999999999999999996'
		const bigC = '0.' + '0'.repeat(70) + '5'
		const bigD = '9.999'

		const mat = [
			[bigA, bigB],
			[bigC, bigD],
		]

		// Round to 30 decimal places (half away from zero)
		assert.deepEqual(transposeDecimalMemo(mat, 30), [
			[
				'123456789012345678901234567890.123456789012345678901234567891',
				'0',
			],
			['-987654321098765432109876543211', '9.999'],
		])

		// Precision > precomputed pow10 table limit (64)
		assert.deepEqual(transposeDecimalMemo([[bigC]], 70), [
			['0.' + '0'.repeat(69) + '1'],
		])
		assert.deepEqual(transposeDecimalMemo([[bigC]], 71), [[bigC]])

		// Precision 0 (integer rounding, half away from zero)
		assert.deepEqual(
			transposeDecimalMemo(
				[
					['0.5', '-0.5'],
					['2.49999999999999999999', '-2.50000000000000000001'],
				],
				0
			),
			[
				['1', '2'],
				['-1', '-3'],
			]
		)

		// Default precision (20)
		assert.deepEqual(
			transposeDecimalMemo([['1.123456789012345678905']]),
			[['1.12345678901234567891']]
		)
	})

	test('normalizes negative zeros, signed zeros, leading zeros, and rounded-to-zero negatives', () => {
		const mat = [
			['-0', '-0.0', '-0.000000', '+0.00'],
			['-0.0004', '0000.0000', '-000.0000001', '007.00'],
		]
		assert.deepEqual(transposeDecimalMemo(mat, 2), [
			['0', '0'],
			['0', '0'],
			['0', '0'],
			['0', '7'],
		])
	})

	test('memoization returns safe independent copies and isolates precision and shape keys', () => {
		const input = [
			['1.236', '4.564'],
			['-7.895', '0.005'],
		]

		const first = transposeDecimalMemo(input, 2)
		assert.deepEqual(first, [
			['1.24', '-7.9'],
			['4.56', '0.01'],
		])

		// Mutate returned output aggressively
		first[0][0] = '999999'
		first[0].push('extra')
		first.push(['injected'])

		// Subsequent cached call must remain completely uncorrupted
		const second = transposeDecimalMemo(input, 2)
		assert.deepEqual(second, [
			['1.24', '-7.9'],
			['4.56', '0.01'],
		])
		assert.notEqual(first, second)
		assert.notEqual(first[0], second[0])

		// Same matrix with different precision must not collide in cache
		const higherPrec = transposeDecimalMemo(input, 3)
		assert.deepEqual(higherPrec, [
			['1.236', '-7.895'],
			['4.564', '0.005'],
		])

		// Same flattened values with different shapes must not collide in cache
		assert.deepEqual(transposeDecimalMemo([['1', '2', '3', '4']], 2), [
			['1'],
			['2'],
			['3'],
			['4'],
		])
		assert.deepEqual(
			transposeDecimalMemo(
				[
					['1', '2'],
					['3', '4'],
				],
				2
			),
			[
				['1', '3'],
				['2', '4'],
			]
		)

		// Cache eviction beyond capacity still yields exact results
		for (let i = 0; i < 300; i++) {
			const res = transposeDecimalMemo([[String(i), `${i}.5`]], 2)
			assert.deepEqual(res, [[String(i)], [`${i}.5`]])
		}
	})

	test('validates invalid matrices, ragged rows, non-decimal entries, and bad precision', () => {
		// Non-array matrix
		assert.throws(() => transposeDecimalMemo(null), TypeError)
		assert.throws(() => transposeDecimalMemo('123'), TypeError)
		assert.throws(() => transposeDecimalMemo({}), TypeError)

		// Empty matrix or empty rows
		assert.throws(() => transposeDecimalMemo([]), RangeError)
		assert.throws(() => transposeDecimalMemo([[]]), RangeError)
		assert.throws(() => transposeDecimalMemo([[], []]), RangeError)

		// Non-array row
		assert.throws(() => transposeDecimalMemo(['1', '2']), TypeError)
		assert.throws(() => transposeDecimalMemo([['1'], null]), TypeError)

		// Ragged matrices
		assert.throws(
			() => transposeDecimalMemo([['1', '2'], ['3']]),
			RangeError
		)
		assert.throws(
			() => transposeDecimalMemo([['1'], ['2', '3']]),
			RangeError
		)

		// Non-string entries
		assert.throws(() => transposeDecimalMemo([[1, 2]]), TypeError)
		assert.throws(() => transposeDecimalMemo([[1n]]), TypeError)
		assert.throws(() => transposeDecimalMemo([[null]]), TypeError)
		assert.throws(() => transposeDecimalMemo([[undefined]]), TypeError)
		assert.throws(() => transposeDecimalMemo([new Array(2)]), TypeError)

		// Non-decimal strings
		for (const bad of [
			'',
			' ',
			' 1.5 ',
			'abc',
			'NaN',
			'Infinity',
			'-Infinity',
			'.',
			'+.',
			'-.',
			'+',
			'-',
			'1.2.3',
			'1e5',
			'1,000',
			'1_000',
		]) {
			assert.throws(
				() => transposeDecimalMemo([[bad]]),
				RangeError,
				`Expected RangeError for ${JSON.stringify(bad)}`
			)
		}

		// Invalid precision
		assert.throws(() => transposeDecimalMemo([['1']], '2'), TypeError)
		assert.throws(() => transposeDecimalMemo([['1']], null), TypeError)
		assert.throws(() => transposeDecimalMemo([['1']], -1), RangeError)
		assert.throws(() => transposeDecimalMemo([['1']], 1.5), RangeError)
		assert.throws(() => transposeDecimalMemo([['1']], NaN), RangeError)
		assert.throws(() => transposeDecimalMemo([['1']], Infinity), RangeError)
	})

	test('independent algebraic cross-checks: involution, dimension swap, and diagonal preservation', () => {
		const matrices = [
			[
				['1.1', '-2.2', '3.3', '4.4'],
				['5.5', '0', '-6.6', '7.7'],
				['8.8', '9.9', '-10.1', '11.11'],
			],
			[
				['1000000000000000000000000.00000000000000000001', '-0.5'],
				['42', '99999999999999999999999999.123456789'],
			],
			[['0.123456789', '-987654321.1', '0', '55', '-1']],
		]

		for (const mat of matrices) {
			const m = mat.length
			const n = mat[0].length
			const t = transposeDecimalMemo(mat, 25)

			// 1. Dimension swap: m x n -> n x m
			assert.equal(t.length, n)
			for (const row of t) {
				assert.equal(row.length, m)
			}

			// 2. Entry-wise definition: (A^T)[j][i] === A[i][j]
			for (let i = 0; i < m; i++) {
				for (let j = 0; j < n; j++) {
					assert.equal(t[j][i], mat[i][j])
				}
			}

			// 3. Involution: (A^T)^T === A
			const tt = transposeDecimalMemo(t, 25)
			assert.deepEqual(tt, mat)

			// 4. Diagonal preservation on square matrices
			if (m === n) {
				for (let d = 0; d < m; d++) {
					assert.equal(t[d][d], mat[d][d])
				}
			}
		}
	})
})
