import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { traceDecimalMemo } from './traceDecimalMemo.js'

/**
 * Helper: transpose a square 2D matrix.
 * @param {string[][]} m
 * @returns {string[][]}
 */
function transpose(m) {
	const n = m.length
	return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => m[j][i]))
}

/**
 * Helper: exact BigInt-based decimal addition for independent cross-checks.
 * Expects non-scientific decimal strings with at most `scale` fractional digits.
 * @param {string} a
 * @param {string} b
 * @param {number} scale
 * @returns {string}
 */
function exactAddFixed(a, b, scale) {
	const toBigInt = (s) => {
		const neg = s.startsWith('-')
		const clean = neg || s.startsWith('+') ? s.slice(1) : s
		const [intP, fracP = ''] = clean.split('.')
		const padded = intP + fracP.padEnd(scale, '0')
		const val = BigInt(padded)
		return neg ? -val : val
	}
	const sum = toBigInt(a) + toBigInt(b)
	if (sum === 0n) return '0'
	const neg = sum < 0n
	const digits = (neg ? -sum : sum).toString().padStart(scale + 1, '0')
	const intP = digits.slice(0, digits.length - scale)
	const fracP = digits.slice(digits.length - scale).replace(/0+$/, '')
	return (neg ? '-' : '') + (fracP ? `${intP}.${fracP}` : intP)
}

/**
 * Helper: exact BigInt-based decimal matrix multiplication for independent cross-checks.
 * Inputs must be simple decimal strings with at most `inputScale` fractional digits.
 * @param {string[][]} A
 * @param {string[][]} B
 * @param {number} inputScale
 * @returns {string[][]}
 */
function matMulFixed(A, B, inputScale) {
	const n = A.length
	const toScaled = (s) => {
		const neg = s.startsWith('-')
		const clean = neg || s.startsWith('+') ? s.slice(1) : s
		const [intP, fracP = ''] = clean.split('.')
		const val = BigInt(intP + fracP.padEnd(inputScale, '0'))
		return neg ? -val : val
	}
	const prodScale = inputScale * 2
	const format = (val) => {
		if (val === 0n) return '0'
		const neg = val < 0n
		const digits = (neg ? -val : val).toString().padStart(prodScale + 1, '0')
		const intP = digits.slice(0, digits.length - prodScale)
		const fracP = digits.slice(digits.length - prodScale).replace(/0+$/, '')
		return (neg ? '-' : '') + (fracP ? `${intP}.${fracP}` : intP)
	}
	const aInt = A.map((r) => r.map(toScaled))
	const bInt = B.map((r) => r.map(toScaled))
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => {
			let acc = 0n
			for (let k = 0; k < n; k++) acc += aInt[i][k] * bInt[k][j]
			return format(acc)
		}),
	)
}

describe('traceDecimalMemo', () => {
	describe('normal cases', () => {
		it('computes trace of integer matrices', () => {
			assert.equal(
				traceDecimalMemo([
					['1', '2', '3'],
					['4', '5', '6'],
					['7', '8', '9'],
				]),
				'15',
			)
		})

		it('computes exact trace for 0.1 + 0.2 without IEEE-754 drift', () => {
			assert.equal(
				traceDecimalMemo([
					['0.1', '999.99'],
					['-42.5', '0.2'],
				]),
				'0.3',
			)
		})

		it('handles negative values, leading plus signs, and shorthand decimals', () => {
			assert.equal(
				traceDecimalMemo([
					['+1.5', '0', '0'],
					['0', '-.25', '0'],
					['0', '0', '2.'],
				]),
				'3.25',
			)
		})

		it('handles scientific notation entries', () => {
			assert.equal(
				traceDecimalMemo([
					['1.25e2', '0'],
					['0', '2.5E-2'],
				]),
				'125.025',
			)
		})
	})

	describe('edge cases and high precision', () => {
		it('handles 1x1 matrices', () => {
			assert.equal(traceDecimalMemo([['42.125']]), '42.125')
			assert.equal(traceDecimalMemo([['-0.000']]), '0')
		})

		it('handles exact diagonal cancellation to zero (no negative zero)', () => {
			assert.equal(
				traceDecimalMemo([
					['12345678901234567890.0000000001', '7'],
					['-8', '-12345678901234567890.0000000001'],
				]),
				'0',
			)
			assert.equal(
				traceDecimalMemo([
					['-0.001', '0'],
					['0', '-0.001'],
				], 2),
				'0',
			)
		})

		it('preserves arbitrary high precision beyond 128 fractional digits', () => {
			const fracA = '0.' + '0'.repeat(149) + '7'
			const fracB = '0.' + '0'.repeat(149) + '8'
			const expected = '0.' + '0'.repeat(148) + '15'
			assert.equal(
				traceDecimalMemo(
					[
						[fracA, '1'],
						['2', fracB],
					],
					160,
				),
				expected,
			)
		})

		it('handles huge integers exceeding Number.MAX_SAFE_INTEGER', () => {
			const big1 = '9999999999999999999999999999999999999999.1234567890123456789012345'
			const big2 = '0.8765432109876543210987655'
			assert.equal(
				traceDecimalMemo(
					[
						[big1, '0'],
						['0', big2],
					],
					30,
				),
				'10000000000000000000000000000000000000000',
			)
		})

		it('rounds half away from zero according to precision', () => {
			const mPos = [
				['1.234', '0'],
				['0', '0.001'],
			] // exact 1.235
			assert.equal(traceDecimalMemo(mPos, 2), '1.24')
			assert.equal(traceDecimalMemo(mPos, 3), '1.235')
			assert.equal(traceDecimalMemo(mPos, 0), '1')

			const mNeg = [
				['-1.234', '0'],
				['0', '-0.001'],
			] // exact -1.235
			assert.equal(traceDecimalMemo(mNeg, 2), '-1.24')
			assert.equal(traceDecimalMemo(mNeg, 0), '-1')

			// Carry propagation across decimal point during rounding
			assert.equal(
				traceDecimalMemo(
					[
						['9.994', '0'],
						['0', '0.005'],
					],
					2,
				),
				'10',
			)

			// Halfway at precision 0
			assert.equal(traceDecimalMemo([['0.5']], 0), '1')
			assert.equal(traceDecimalMemo([['-0.5']], 0), '-1')
		})
	})

	describe('memoization behavior', () => {
		it('returns consistent results on repeated calls and respects precision changes', () => {
			const m = [
				['1.111111111111111111111111', '0'],
				['0', '2.222222222222222222222222'],
			]
			const r24a = traceDecimalMemo(m, 24)
			const r24b = traceDecimalMemo(m, 24)
			const r4 = traceDecimalMemo(m, 4)
			const rDefault = traceDecimalMemo(m)

			assert.equal(r24a, '3.333333333333333333333333')
			assert.equal(r24b, r24a)
			assert.equal(r4, '3.3333')
			assert.equal(rDefault, '3.33333333333333333333')
		})

		it('does not return stale cached values when input matrix is mutated', () => {
			const m = [
				['1.5', '0'],
				['0', '2.5'],
			]
			assert.equal(traceDecimalMemo(m), '4')
			m[0][0] = '10.5'
			assert.equal(traceDecimalMemo(m), '13')
		})

		it('still validates off-diagonal entries even when diagonal is already cached', () => {
			assert.equal(
				traceDecimalMemo([
					['1', '2'],
					['3', '4'],
				]),
				'5',
			)
			assert.throws(
				() =>
					traceDecimalMemo([
						['1', 'not-a-number'],
						['3', '4'],
					]),
				SyntaxError,
			)
		})
	})

	describe('input validation', () => {
		it('rejects non-array or empty matrices', () => {
			assert.throws(() => traceDecimalMemo(null), TypeError)
			assert.throws(() => traceDecimalMemo('1'), TypeError)
			assert.throws(() => traceDecimalMemo({}), TypeError)
			assert.throws(() => traceDecimalMemo([]), RangeError)
		})

		it('rejects non-square and ragged matrices', () => {
			assert.throws(() => traceDecimalMemo([['1', '2']]), RangeError)
			assert.throws(() => traceDecimalMemo([['1'], ['2']]), RangeError)
			assert.throws(
				() =>
					traceDecimalMemo([
						['1', '2'],
						['3'],
					]),
				RangeError,
			)
			assert.throws(() => traceDecimalMemo(['1']), TypeError)
		})

		it('rejects non-string and malformed decimal entries', () => {
			assert.throws(() => traceDecimalMemo([[1]]), TypeError)
			assert.throws(() => traceDecimalMemo([[null]]), TypeError)
			assert.throws(() => traceDecimalMemo([[1n]]), TypeError)
			assert.throws(() => traceDecimalMemo([['']]), SyntaxError)
			assert.throws(() => traceDecimalMemo([[' ']]), SyntaxError)
			assert.throws(() => traceDecimalMemo([[' 1.5']]), SyntaxError)
			assert.throws(() => traceDecimalMemo([['1.5 ']]), SyntaxError)
			assert.throws(() => traceDecimalMemo([['.']]), SyntaxError)
			assert.throws(() => traceDecimalMemo([['+']]), SyntaxError)
			assert.throws(() => traceDecimalMemo([['1.2.3']]), SyntaxError)
			assert.throws(() => traceDecimalMemo([['NaN']]), SyntaxError)
			assert.throws(() => traceDecimalMemo([['Infinity']]), SyntaxError)
			assert.throws(() => traceDecimalMemo([['1e']]), SyntaxError)
			assert.throws(() => traceDecimalMemo([['1e+']]), SyntaxError)
			assert.throws(() => traceDecimalMemo([['1_000']]), SyntaxError)
			assert.throws(() => traceDecimalMemo([['1e9999999']]), RangeError)
		})

		it('rejects invalid precision values', () => {
			assert.throws(() => traceDecimalMemo([['1']], '2'), TypeError)
			assert.throws(() => traceDecimalMemo([['1']], null), TypeError)
			assert.throws(() => traceDecimalMemo([['1']], -1), RangeError)
			assert.throws(() => traceDecimalMemo([['1']], 1.5), RangeError)
			assert.throws(() => traceDecimalMemo([['1']], Number.NaN), RangeError)
			assert.throws(() => traceDecimalMemo([['1']], Number.POSITIVE_INFINITY), RangeError)
		})
	})

	describe('independent algebraic cross-checks', () => {
		const A = [
			['1.25', '-3.4', '0.125'],
			['7.8', '0.05', '-2.25'],
			['-0.5', '4.125', '9.7'],
		]
		const B = [
			['-0.75', '2.1', '3.5'],
			['1.4', '-5.25', '0.8'],
			['6.2', '-1.1', '2.35'],
		]

		it('satisfies transpose invariance: tr(A^T) = tr(A)', () => {
			assert.equal(traceDecimalMemo(transpose(A), 20), traceDecimalMemo(A, 20))
		})

		it('satisfies linearity: tr(A + B) = tr(A) + tr(B)', () => {
			const AplusB = A.map((row, i) =>
				row.map((val, j) => exactAddFixed(val, B[i][j], 4)),
			)
			const lhs = traceDecimalMemo(AplusB, 20)
			const rhs = exactAddFixed(traceDecimalMemo(A, 20), traceDecimalMemo(B, 20), 4)
			assert.equal(lhs, rhs)
		})

		it('satisfies cyclic property: tr(AB) = tr(BA)', () => {
			const AB = matMulFixed(A, B, 3)
			const BA = matMulFixed(B, A, 3)
			assert.equal(traceDecimalMemo(AB, 20), traceDecimalMemo(BA, 20))
		})
	})
})
