import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { transposeDecimalStable } from './transposeDecimalStable.js'

/**
 * Independent reference oracle using explicit BigInt division by 10^drop
 * to verify round-half-even and entry mapping independently of the implementation.
 */
function referenceRoundDecimal(str, precision) {
	const s = str.trim()
	const m = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(s)
	if (!m) throw new Error(`Oracle parse failed: ${str}`)
	const [, signStr, intPart, fracAfterDot, fracOnly, expStr] = m
	const digits = fracOnly !== undefined ? fracOnly : `${intPart}${fracAfterDot ?? ''}`
	const fracLen = fracOnly !== undefined ? fracOnly.length : (fracAfterDot ? fracAfterDot.length : 0)
	let val = BigInt(digits)
	if (val === 0n) return '0'
	const neg = signStr === '-'
	let exp = (expStr !== undefined ? BigInt(expStr) : 0n) - BigInt(fracLen)

	if (precision !== undefined) {
		const target = -BigInt(precision)
		if (exp < target) {
			const drop = target - exp
			const denom = 10n ** drop
			let q = val / denom
			const rem = val % denom
			const twiceRem = rem * 2n
			if (twiceRem > denom || (twiceRem === denom && (q & 1n) === 1n)) {
				q += 1n
			}
			val = q
			exp = target
			if (val === 0n) return '0'
		}
	}

	const sign = neg ? '-' : ''
	const d = val.toString()
	const e = Number(exp)
	if (e >= 0) return `${sign}${d}${'0'.repeat(e)}`
	const frac = -e
	let full
	if (d.length > frac) {
		full = `${d.slice(0, d.length - frac)}.${d.slice(d.length - frac)}`
	} else {
		full = `0.${'0'.repeat(frac - d.length)}${d}`
	}
	full = full.replace(/\.?0+$/, '')
	return `${sign}${full}`
}

describe('transposeDecimalStable', () => {
	test('transposes square matrices', () => {
		const m2 = [
			['1', '2'],
			['3', '4'],
		]
		assert.deepEqual(transposeDecimalStable(m2), [
			['1', '3'],
			['2', '4'],
		])

		const m3 = [
			['1.1', '-2.2', '3.3'],
			['4.4', '5.5', '-6.6'],
			['-7.7', '8.8', '9.9'],
		]
		assert.deepEqual(transposeDecimalStable(m3), [
			['1.1', '4.4', '-7.7'],
			['-2.2', '5.5', '8.8'],
			['3.3', '-6.6', '9.9'],
		])
	})

	test('transposes rectangular matrices', () => {
		const m2x3 = [
			['1', '2', '3'],
			['4', '5', '6'],
		]
		assert.deepEqual(transposeDecimalStable(m2x3), [
			['1', '4'],
			['2', '5'],
			['3', '6'],
		])

		const m3x2 = [
			['0.1', '0.2'],
			['0.3', '0.4'],
			['0.5', '0.6'],
		]
		assert.deepEqual(transposeDecimalStable(m3x2), [
			['0.1', '0.3', '0.5'],
			['0.2', '0.4', '0.6'],
		])
	})

	test('transposes 1x1 matrices without mutating input', () => {
		const input = [['  +0042.500  ']]
		const out = transposeDecimalStable(input)
		assert.deepEqual(out, [['42.5']])
		assert.deepEqual(input, [['  +0042.500  ']])
		assert.notEqual(out, input)
		assert.notEqual(out[0], input[0])
	})

	test('transposes row and column vectors', () => {
		const rowVec = [['10', '-20.5', '30.25', '0']]
		const colVec = transposeDecimalStable(rowVec)
		assert.deepEqual(colVec, [['10'], ['-20.5'], ['30.25'], ['0']])
		assert.deepEqual(transposeDecimalStable(colVec), [['10', '-20.5', '30.25', '0']])
	})

	test('preserves arbitrary high precision without floating-point loss', () => {
		const pi50 = '3.1415926535897932384626433832795028841971693993751'
		const huge = '9876543210987654321098765432109876543210.012345678901234567890123456789'
		const tiny = '-0.000000000000000000000000000000000000000123456789'
		const mat = [
			[pi50, huge],
			[tiny, '100000000000000000000000000000000000000000000000001'],
		]
		assert.deepEqual(transposeDecimalStable(mat), [
			[pi50, tiny],
			[huge, '100000000000000000000000000000000000000000000000001'],
		])
	})

	test('handles scientific notation and canonicalizes negative zero', () => {
		const mat = [
			['1.25e3', '-5E-4', '.5e+2', '7.e-1'],
			['-0', '-0.0000', '-0e-50', '+0.00E+999999999999'],
		]
		assert.deepEqual(transposeDecimalStable(mat), [
			['1250', '0'],
			['-0.0005', '0'],
			['50', '0'],
			['0.7', '0'],
		])

		// Negative values rounding to zero must also normalize to "0", never "-0"
		const negTiny = [['-0.0004', '-0.005', '-1e-500']]
		assert.deepEqual(transposeDecimalStable(negTiny, 2), [['0'], ['0'], ['0']])
	})

	test('applies exact round-half-even (banker rounding) at configurable precision', () => {
		const mat = [
			['2.5', '3.5', '-2.5', '-3.5'],
			['1.225', '1.235', '1.225000000000000000001', '9.995'],
			['0.5', '-0.5', '99999999999999999999999999.995', '1.2'],
		]

		assert.deepEqual(transposeDecimalStable(mat, 0), [
			['2', '1', '0'],
			['4', '1', '0'],
			['-2', '1', '100000000000000000000000000'],
			['-4', '10', '1'],
		])

		assert.deepEqual(transposeDecimalStable(mat, 2), [
			['2.5', '1.22', '0.5'],
			['3.5', '1.24', '-0.5'],
			['-2.5', '1.23', '100000000000000000000000000'],
			['-3.5', '10', '1.2'],
		])
	})

	test('rejects invalid, empty, ragged matrices and bad decimals or precision', () => {
		// Invalid matrix container
		assert.throws(() => transposeDecimalStable(null), TypeError)
		assert.throws(() => transposeDecimalStable('123'), TypeError)
		assert.throws(() => transposeDecimalStable([]), RangeError)
		assert.throws(() => transposeDecimalStable([[]]), RangeError)
		assert.throws(() => transposeDecimalStable(['1', '2']), TypeError)
		assert.throws(() => transposeDecimalStable([['1'], 'bad']), TypeError)

		// Ragged matrix
		assert.throws(
			() =>
				transposeDecimalStable([
					['1', '2'],
					['3'],
				]),
			RangeError
		)

		// Invalid entry types & sparse holes
		assert.throws(() => transposeDecimalStable([[1]]), TypeError)
		assert.throws(() => transposeDecimalStable([[null]]), TypeError)
		const sparse = new Array(2)
		sparse[0] = '1'
		assert.throws(() => transposeDecimalStable([sparse]), TypeError)

		// Malformed decimal strings
		for (const bad of ['', '   ', '.', '+.', '-.', 'NaN', 'Infinity', '-Infinity', '1.2.3', '1e', '1e+', '0x10', '1_000', '1,000']) {
			assert.throws(() => transposeDecimalStable([[bad]]), RangeError, `Expected throw for ${JSON.stringify(bad)}`)
		}

		// Invalid precision
		for (const badPrec of [null, '2', NaN, Infinity, -Infinity, 1.5, {}]) {
			assert.throws(() => transposeDecimalStable([['1']], badPrec), TypeError)
		}
		assert.throws(() => transposeDecimalStable([['1']], -1), RangeError)
		assert.throws(() => transposeDecimalStable([['1']], 100001), RangeError)

		// Extreme non-zero exponent beyond formatting bound
		assert.throws(() => transposeDecimalStable([['1e500000']]), RangeError)
	})

	test('cross-check: involution (A^T)^T = A, dimension swap, and independent BigInt oracle across tiled sizes', () => {
		const rows = 41
		const cols = 37
		const inputs = Array.from({ length: rows }, (_, r) =>
			Array.from({ length: cols }, (_, c) => {
				const sign = (r + c) % 3 === 0 ? '-' : ''
				if ((r * 7 + c * 13) % 19 === 0) return '-0.000'
				if ((r + c) % 5 === 0) return `${sign}${r + 1}.${c}5e-2`
				return `${sign}${BigInt(r + 1) * 1000000000000000000n + BigInt(c)}.${String(r * 100 + c).padStart(4, '0')}5`
			})
		)

		for (const prec of [undefined, 0, 3, 6]) {
			const transposed = transposeDecimalStable(inputs, prec)

			// Dimension swap check
			assert.equal(transposed.length, cols)
			for (let c = 0; c < cols; c++) {
				assert.equal(transposed[c].length, rows)
			}

			// Independent entry-mapping oracle check
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					assert.equal(transposed[c][r], referenceRoundDecimal(inputs[r][c], prec))
				}
			}

			// Involution check: ((A^T)^T) equals normalized A
			const doubleTransposed = transposeDecimalStable(transposed, prec)
			assert.equal(doubleTransposed.length, rows)
			assert.equal(doubleTransposed[0].length, cols)
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					assert.equal(doubleTransposed[r][c], referenceRoundDecimal(inputs[r][c], prec))
				}
			}
		}
	})
})
