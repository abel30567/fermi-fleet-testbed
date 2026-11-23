import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { inverseDecimalLazy } from './inverseDecimalLazy.js'

/**
 * Independent helper: parses a decimal string into `{ num, scale }` (`num / 10^scale`)
 * for exact decimal matrix multiplication cross-checks without sharing implementation code.
 * @param {string} s
 * @returns {{ num: bigint, scale: number }}
 */
function parseDecimalForCheck(s) {
	const trimmed = s.trim()
	const neg = trimmed.startsWith('-')
	const body = trimmed.replace(/^[+-]/, '')
	const [mantissa, expPart] = body.split(/[eE]/)
	const exp = expPart ? Number(expPart) : 0
	const [intStr = '', fracStr = ''] = mantissa.split('.')
	const digits = BigInt((intStr + fracStr) || '0')
	const netScale = fracStr.length - exp
	if (netScale >= 0) {
		return { num: neg ? -digits : digits, scale: netScale }
	}
	return { num: (neg ? -digits : digits) * (10n ** BigInt(-netScale)), scale: 0 }
}

/**
 * Independent helper: multiplies two decimal string matrices `A` and `B` exactly,
 * and asserts `| (A * B)[i][j] - I[i][j] | <= 10^(-toleranceDigits)`.
 * @param {string[][]} a
 * @param {string[][]} b
 * @param {number} toleranceDigits
 */
function assertProductNearIdentity(a, b, toleranceDigits) {
	const n = a.length
	assert.equal(b.length, n)
	const tolDen = 10n ** BigInt(toleranceDigits)

	for (let i = 0; i < n; i += 1) {
		for (let j = 0; j < n; j += 1) {
			let sumNum = 0n
			let sumScale = 0
			for (let k = 0; k < n; k += 1) {
				const x = parseDecimalForCheck(a[i][k])
				const y = parseDecimalForCheck(b[k][j])
				const prodNum = x.num * y.num
				const prodScale = x.scale + y.scale
				if (prodScale > sumScale) {
					sumNum = sumNum * (10n ** BigInt(prodScale - sumScale)) + prodNum
					sumScale = prodScale
				} else {
					sumNum = sumNum + prodNum * (10n ** BigInt(sumScale - prodScale))
				}
			}

			const expected = i === j ? 10n ** BigInt(sumScale) : 0n
			const diff = sumNum >= expected ? sumNum - expected : expected - sumNum
			const scaleDen = 10n ** BigInt(sumScale)
			// Verify diff / 10^sumScale <= 1 / 10^toleranceDigits  <=>  diff * 10^toleranceDigits <= 10^sumScale
			assert.ok(
				diff * tolDen <= scaleDen,
				`Entry (${i},${j}) error too large: diff=${diff}, scale=10^${sumScale}, tolerance=10^-${toleranceDigits}`
			)
		}
	}
}

describe('inverseDecimalLazy', () => {
	describe('normal cases', () => {
		it('inverts a 1x1 matrix', () => {
			assert.deepEqual([...inverseDecimalLazy([['4']])], [['0.25']])
			assert.deepEqual([...inverseDecimalLazy([['-8']])], [['-0.125']])
			assert.deepEqual([...inverseDecimalLazy([['0.125']])], [['8']])
		})

		it('inverts a 2x2 matrix with exact decimals', () => {
			const mat = [
				['4', '7'],
				['2', '6'],
			]
			assert.deepEqual([...inverseDecimalLazy(mat)], [
				['0.6', '-0.7'],
				['-0.2', '0.4'],
			])
		})

		it('inverts an identity matrix to itself', () => {
			const id = [
				['1', '0', '0'],
				['0', '1', '0'],
				['0', '0', '1'],
			]
			assert.deepEqual([...inverseDecimalLazy(id)], id)
		})

		it('inverts a matrix requiring row swaps (partial pivoting)', () => {
			const mat = [
				['0', '1', '2'],
				['1', '0', '3'],
				['4', '-3', '8'],
			]
			// det = -2; exact inverse has halves:
			// [[-4.5, 7, -1.5], [-2, 4, -1], [1.5, -2, 0.5]]
			assert.deepEqual([...inverseDecimalLazy(mat, 10)], [
				['-4.5', '7', '-1.5'],
				['-2', '4', '-1'],
				['1.5', '-2', '0.5'],
			])
		})

		it('handles scientific notation, leading/trailing signs, and shorthand decimals', () => {
			const mat = [
				['+2e-2', '.0'],
				['-0.0', '5.e1'],
			]
			assert.deepEqual([...inverseDecimalLazy(mat, 10)], [
				['50', '0'],
				['0', '0.02'],
			])
		})

		it('formats repeating decimals with round-half-away-from-zero and respects precision=0', () => {
			assert.deepEqual([...inverseDecimalLazy([['3']], 6)], [['0.333333']])
			assert.deepEqual([...inverseDecimalLazy([['1.5']], 6)], [['0.666667']])
			assert.deepEqual([...inverseDecimalLazy([['-1.5']], 6)], [['-0.666667']])
			assert.deepEqual([...inverseDecimalLazy([['2']], 0)], [['1']])
			assert.deepEqual([...inverseDecimalLazy([['-2']], 0)], [['-1']])
			assert.deepEqual([...inverseDecimalLazy([['-1000']], 2)], [['0']])
		})
	})

	describe('lazy and generator-based behavior', () => {
		it('does not consume input iterable until the returned generator is iterated', () => {
			let pulledRows = 0
			function* lazyMatrix() {
				pulledRows += 1
				yield ['1', '2']
				pulledRows += 1
				yield ['3', '4']
			}

			const gen = inverseDecimalLazy(lazyMatrix(), 10)
			assert.equal(pulledRows, 0)

			const first = gen.next()
			assert.equal(pulledRows, 2)
			assert.equal(first.done, false)
			assert.deepEqual(first.value, ['-2', '1'])

			const second = gen.next()
			assert.equal(second.done, false)
			assert.deepEqual(second.value, ['1.5', '-0.5'])

			const end = gen.next()
			assert.equal(end.done, true)
		})

		it('consumes nested generators (generator of generators) and custom iterables', () => {
			function* rowGen(values) {
				for (const v of values) {
					yield v
				}
			}
			function* matrixGen() {
				yield rowGen(['2', '1', '0'])
				yield rowGen(['1', '2', '1'])
				yield rowGen(['0', '1', '2'])
			}

			const inv = [...inverseDecimalLazy(matrixGen(), 10)]
			assert.deepEqual(inv, [
				['0.75', '-0.5', '0.25'],
				['-0.5', '1', '-0.5'],
				['0.25', '-0.5', '0.75'],
			])
		})

		it('accepts Set and custom iterable objects', () => {
			const customMatrix = {
				*[Symbol.iterator]() {
					yield new Set(['1', '0'])
					yield new Set(['0', '4'])
				},
			}
			assert.deepEqual([...inverseDecimalLazy(customMatrix, 5)], [
				['1', '0'],
				['0', '0.25'],
			])
		})

		it('fails fast during lazy consumption without pulling subsequent rows on ragged or invalid input', () => {
			let rowsPulled = 0
			function* raggedGen() {
				rowsPulled += 1
				yield ['1', '2']
				rowsPulled += 1
				yield ['3'] // ragged!
				rowsPulled += 1
				yield ['4', '5'] // should never be pulled
			}

			const gen = inverseDecimalLazy(raggedGen(), 5)
			assert.equal(rowsPulled, 0)
			assert.throws(() => gen.next(), RangeError)
			assert.equal(rowsPulled, 2)

			let cellsPulled = 0
			function* excessColsGen() {
				yield ['1', '2']
				yield (function* () {
					cellsPulled += 1
					yield '3'
					cellsPulled += 1
					yield '4'
					cellsPulled += 1
					yield '5' // 3rd column triggers fail-fast
					cellsPulled += 1
					yield '6' // should never be pulled
				})()
			}
			assert.throws(() => [...inverseDecimalLazy(excessColsGen(), 5)], RangeError)
			assert.equal(cellsPulled, 3)

			let excessRowsPulled = 0
			function* tooManyRowsGen() {
				excessRowsPulled += 1
				yield ['1', '0']
				excessRowsPulled += 1
				yield ['0', '1']
				excessRowsPulled += 1
				yield ['9', '9'] // 3rd row triggers fail-fast
				excessRowsPulled += 1
				yield ['8', '8'] // should never be pulled
			}
			assert.throws(() => [...inverseDecimalLazy(tooManyRowsGen(), 5)], RangeError)
			assert.equal(excessRowsPulled, 3)
		})

		it('supports early termination when consumer only takes a prefix of rows', () => {
			const mat = [
				['1', '2', '3'],
				['0', '1', '4'],
				['5', '6', '0'],
			]
			const gen = inverseDecimalLazy(mat, 50)
			const first = gen.next()
			assert.deepEqual(first.value, ['-24', '18', '5'])
			assert.equal(gen.return().done, true)
			assert.equal(gen.next().done, true)
		})
	})

	describe('high precision and arbitrary-precision edge cases', () => {
		it('computes 60-digit precision accurately for repeating rationals', () => {
			const expected = '0.' + '142857'.repeat(10)
			assert.deepEqual([...inverseDecimalLazy([['7']], 60)], [[expected]])
		})

		it('inverts a nearly singular matrix beyond IEEE-754 float64 precision', () => {
			const mat = [
				['1', '1'],
				['1', '1.000000000000000000000000000001'],
			]
			const inv = [...inverseDecimalLazy(mat, 10)]
			assert.deepEqual(inv, [
				['1000000000000000000000000000001', '-1000000000000000000000000000000'],
				['-1000000000000000000000000000000', '1000000000000000000000000000000'],
			])
			assertProductNearIdentity(mat, inv, 50)
		})

		it('handles very small and very large magnitudes accurately', () => {
			const mat = [
				['1e-40', '0'],
				['0', '2e40'],
			]
			const inv = [...inverseDecimalLazy(mat, 50)]
			assert.equal(inv[0][0], '1' + '0'.repeat(40))
			assert.equal(inv[0][1], '0')
			assert.equal(inv[1][0], '0')
			assert.equal(inv[1][1], '0.' + '0'.repeat(40) + '5')
			assertProductNearIdentity(mat, inv, 50)
		})
	})

	describe('independent cross-checks', () => {
		it('satisfies A * A^-1 ≈ I and A^-1 * A ≈ I for a 4x4 decimal matrix at 40-digit precision', () => {
			const mat = [
				['1.25', '-3.5', '0.1', '7.75'],
				['2.125', '4.0', '-1.3', '0.5'],
				['-0.75', '1.1', '6.25', '-2.4'],
				['3.3', '-0.2', '1.5', '5.125'],
			]
			const precision = 40
			const inv = [...inverseDecimalLazy(mat, precision)]

			assertProductNearIdentity(mat, inv, precision - 4)
			assertProductNearIdentity(inv, mat, precision - 4)
		})

		it('satisfies (A^-1)^-1 === A exactly for a 4x4 unimodular Pascal matrix', () => {
			// Lower-triangular Pascal matrix has determinant 1, so its inverse is exact integer-valued
			const pascal = [
				['1', '0', '0', '0'],
				['1', '1', '0', '0'],
				['1', '2', '1', '0'],
				['1', '3', '3', '1'],
			]
			const inv = [...inverseDecimalLazy(pascal, 15)]
			assert.deepEqual(inv, [
				['1', '0', '0', '0'],
				['-1', '1', '0', '0'],
				['1', '-2', '1', '0'],
				['-1', '3', '-3', '1'],
			])
			const doubleInv = [...inverseDecimalLazy(inv, 15)]
			assert.deepEqual(doubleInv, pascal)
		})

		it('satisfies A * A^-1 ≈ I for an ill-conditioned 5x5 Vandermonde matrix', () => {
			const xs = ['0.1', '0.2', '0.3', '0.4', '0.5']
			const vandermonde = xs.map((x) => {
				const v = Number(x)
				return [
					'1',
					x,
					(v ** 2).toFixed(2),
					(v ** 3).toFixed(3),
					(v ** 4).toFixed(4),
				]
			})
			const precision = 35
			const inv = [...inverseDecimalLazy(vandermonde, precision)]

			assertProductNearIdentity(vandermonde, inv, precision - 8)
			assertProductNearIdentity(inv, vandermonde, precision - 8)
		})
	})

	describe('error handling and input validation', () => {
		it('throws RangeError for singular matrices', () => {
			assert.throws(() => [...inverseDecimalLazy([['0']])], /singular/i)
			assert.throws(
				() => [...inverseDecimalLazy([['1', '2'], ['2', '4']])],
				/singular/i
			)
			assert.throws(
				() =>
					[
						...inverseDecimalLazy([
							['1', '2', '3'],
							['4', '5', '6'],
							['7', '8', '9'],
						]),
					],
				/singular/i
			)
		})

		it('throws TypeError for non-iterable or string matrix/row inputs', () => {
			assert.throws(() => inverseDecimalLazy(null), TypeError)
			assert.throws(() => inverseDecimalLazy(undefined), TypeError)
			assert.throws(() => inverseDecimalLazy(42), TypeError)
			assert.throws(() => inverseDecimalLazy('1234'), TypeError)
			assert.throws(() => [...inverseDecimalLazy(['12', '34'])], TypeError)
			assert.throws(() => [...inverseDecimalLazy([null])], TypeError)
		})

		it('throws RangeError for empty, non-square, or ragged matrices', () => {
			assert.throws(() => [...inverseDecimalLazy([])], RangeError)
			assert.throws(() => [...inverseDecimalLazy([[]])], RangeError)
			assert.throws(
				() => [...inverseDecimalLazy([['1', '2', '3'], ['4', '5', '6']])],
				RangeError
			)
			assert.throws(
				() => [...inverseDecimalLazy([['1', '2'], ['3', '4'], ['5', '6']])],
				RangeError
			)
			assert.throws(
				() => [...inverseDecimalLazy([['1', '2'], ['3']])],
				RangeError
			)
		})

		it('throws on non-string entries and malformed decimal strings', () => {
			assert.throws(() => [...inverseDecimalLazy([[1]])], TypeError)
			assert.throws(() => [...inverseDecimalLazy([[1n]])], TypeError)
			assert.throws(() => [...inverseDecimalLazy([[null]])], TypeError)
			assert.throws(() => [...inverseDecimalLazy([['']])], RangeError)
			assert.throws(() => [...inverseDecimalLazy([['   ']])], RangeError)
			assert.throws(() => [...inverseDecimalLazy([['NaN']])], RangeError)
			assert.throws(() => [...inverseDecimalLazy([['Infinity']])], RangeError)
			assert.throws(() => [...inverseDecimalLazy([['1.2.3']])], RangeError)
			assert.throws(() => [...inverseDecimalLazy([['.']])], RangeError)
			assert.throws(() => [...inverseDecimalLazy([['1e']])], RangeError)
			assert.throws(() => [...inverseDecimalLazy([['0x10']])], RangeError)
			assert.throws(() => [...inverseDecimalLazy([['1e1000000']])], RangeError)
		})

		it('throws immediately on invalid precision arguments', () => {
			assert.throws(() => inverseDecimalLazy([['1']], -1), RangeError)
			assert.throws(() => inverseDecimalLazy([['1']], 1.5), RangeError)
			assert.throws(() => inverseDecimalLazy([['1']], NaN), RangeError)
			assert.throws(() => inverseDecimalLazy([['1']], Infinity), RangeError)
			assert.throws(() => inverseDecimalLazy([['1']], '10'), TypeError)
			assert.throws(() => inverseDecimalLazy([['1']], null), TypeError)
			assert.throws(() => inverseDecimalLazy([['1']], 10n), TypeError)
		})
	})
})
