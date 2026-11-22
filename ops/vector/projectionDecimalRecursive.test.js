import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { projectionDecimalRecursive } from './projectionDecimalRecursive.js'

/**
 * Exact decimal string parser for test verification helpers.
 * Returns { num, scale } representing num * 10^(-scale).
 */
function parseDec(str) {
	const trimmed = str.trim()
	const neg = trimmed.startsWith('-')
	const body = trimmed.replace(/^[+-]/, '')
	const [intPart, fracPart = ''] = body.split('.')
	const digits = (intPart || '0') + fracPart
	const val = BigInt(digits)
	return { num: neg && val !== 0n ? -val : val, scale: fracPart.length }
}

/**
 * Exact subtraction of two decimal strings returning { num, scale }.
 */
function subDec(aStr, bStr) {
	const a = parseDec(aStr)
	const b = parseDec(bStr)
	const scale = Math.max(a.scale, b.scale)
	const aScaled = a.num * 10n ** BigInt(scale - a.scale)
	const bScaled = b.num * 10n ** BigInt(scale - b.scale)
	return { num: aScaled - bScaled, scale }
}

/**
 * Exact addition of two decimal strings returning a canonical decimal string.
 */
function addDecStr(aStr, bStr) {
	const a = parseDec(aStr)
	const b = parseDec(bStr)
	const scale = Math.max(a.scale, b.scale)
	const sum = a.num * 10n ** BigInt(scale - a.scale) + b.num * 10n ** BigInt(scale - b.scale)
	if (sum === 0n) return '0'
	const neg = sum < 0n
	const digits = (neg ? -sum : sum).toString()
	if (scale === 0) return neg ? `-${digits}` : digits
	const padded = digits.padStart(scale + 1, '0')
	const intPart = padded.slice(0, padded.length - scale)
	const fracPart = padded.slice(padded.length - scale).replace(/0+$/, '')
	const out = fracPart ? `${intPart}.${fracPart}` : intPart
	return neg ? `-${out}` : out
}

/**
 * Exact dot product of two decimal string vectors returning { num, scale }.
 */
function dotDec(vecX, vecY) {
	let sum = 0n
	let maxScale = 0
	const products = vecX.map((xStr, i) => {
		const x = parseDec(xStr)
		const y = parseDec(vecY[i])
		const s = x.scale + y.scale
		if (s > maxScale) maxScale = s
		return { num: x.num * y.num, scale: s }
	})
	for (const p of products) {
		sum += p.num * 10n ** BigInt(maxScale - p.scale)
	}
	return { num: sum, scale: maxScale }
}

/**
 * Asserts |a - b| <= 10^(-tolDigits) for two decimal strings.
 */
function assertCloseDecimal(actualStr, expectedStr, tolDigits) {
	const diff = subDec(actualStr, expectedStr)
	const absNum = diff.num < 0n ? -diff.num : diff.num
	const maxScale = Math.max(diff.scale, tolDigits)
	const lhs = absNum * 10n ** BigInt(maxScale - diff.scale)
	const rhs = 10n ** BigInt(maxScale - tolDigits)
	assert.ok(
		lhs <= rhs,
		`Expected |${actualStr} - ${expectedStr}| <= 1e-${tolDigits}`
	)
}

describe('projectionDecimalRecursive', () => {
	describe('normal 1D, 2D, 3D, and nD projections', () => {
		test('1D projection always returns vecA', () => {
			assert.deepEqual(projectionDecimalRecursive(['-7.25'], ['3.5']), ['-7.25'])
			assert.deepEqual(projectionDecimalRecursive(['0'], ['-42']), ['0'])
		})

		test('2D projection onto axis and diagonal vectors', () => {
			assert.deepEqual(projectionDecimalRecursive(['3', '4'], ['1', '0']), ['3', '0'])
			assert.deepEqual(projectionDecimalRecursive(['3', '4'], ['0', '5']), ['0', '4'])
			// proj of (3, 4) onto (1, 1): ((3+4)/2) * (1, 1) = (3.5, 3.5)
			assert.deepEqual(projectionDecimalRecursive(['3', '4'], ['1', '1']), ['3.5', '3.5'])
			// decimal inputs: proj of (1.5, 2.25) onto (0.5, 0.5) = (1.875, 1.875)
			assert.deepEqual(projectionDecimalRecursive(['1.5', '2.25'], ['0.5', '0.5']), ['1.875', '1.875'])
		})

		test('3D projection with positive and negative components', () => {
			// A = (2, -3, 4), B = (1, 2, -2) => A·B = 2 - 6 - 8 = -12, B·B = 1 + 4 + 4 = 9
			// k = -12/9 = -4/3 => proj = (-4/3, -8/3, 8/3)
			const proj = projectionDecimalRecursive(['2', '-3', '4'], ['1', '2', '-2'], 20)
			assert.deepEqual(proj, [
				'-1.33333333333333333333',
				'-2.66666666666666666667',
				'2.66666666666666666667'
			])
		})

		test('nD projections (odd and even lengths, 5D and 8D)', () => {
			// 5D: A = (1, 2, 3, 4, 5), B = (1, 0, -1, 0, 1)
			// A·B = 1 - 3 + 5 = 3, B·B = 3 => k = 1 => proj = B
			assert.deepEqual(
				projectionDecimalRecursive(['1', '2', '3', '4', '5'], ['1', '0', '-1', '0', '1']),
				['1', '0', '-1', '0', '1']
			)

			// 8D: A = (1,2,3,4,5,6,7,8), B = (1,1,1,1,1,1,1,1)
			// A·B = 36, B·B = 8 => k = 4.5 => proj = all 4.5
			assert.deepEqual(
				projectionDecimalRecursive(
					['1', '2', '3', '4', '5', '6', '7', '8'],
					['1', '1', '1', '1', '1', '1', '1', '1']
				),
				['4.5', '4.5', '4.5', '4.5', '4.5', '4.5', '4.5', '4.5']
			)
		})

		test('supports leading/trailing whitespace, plus signs, shorthand decimals, and scientific notation', () => {
			assert.deepEqual(
				projectionDecimalRecursive([' +1.5e1 ', '2e1'], ['.5e1', '0.']),
				['15', '0']
			)
			// A = (1e-5, 2e-5), B = (1e-5, 1e-5) => k = 1.5 => proj = (0.000015, 0.000015)
			assert.deepEqual(
				projectionDecimalRecursive(['1e-5', '2e-5'], ['1e-5', '1e-5']),
				['0.000015', '0.000015']
			)
		})

		test('zero vecA projects to the zero vector without negative zero', () => {
			assert.deepEqual(projectionDecimalRecursive(['0', '0', '0'], ['-1', '2', '-3']), ['0', '0', '0'])
			assert.deepEqual(projectionDecimalRecursive(['-0.0', '0.00'], ['-5', '5']), ['0', '0'])
		})
	})

	describe('orthogonal and parallel vectors', () => {
		test('orthogonal vectors project to the zero vector', () => {
			assert.deepEqual(projectionDecimalRecursive(['1', '0'], ['0', '1']), ['0', '0'])
			assert.deepEqual(projectionDecimalRecursive(['3', '-4'], ['4', '3']), ['0', '0'])
			assert.deepEqual(
				projectionDecimalRecursive(['1.25', '-2.5', '3.75'], ['2', '1', '0']),
				['0', '0', '0']
			)
			assert.deepEqual(
				projectionDecimalRecursive(['1', '-1', '1', '-1'], ['2', '2', '2', '2']),
				['0', '0', '0', '0']
			)
		})

		test('parallel vectors (same and opposite direction) project to vecA', () => {
			// Same direction
			assert.deepEqual(projectionDecimalRecursive(['2', '4'], ['1', '2']), ['2', '4'])
			assert.deepEqual(
				projectionDecimalRecursive(['1.25', '-3.75', '6.25'], ['0.5', '-1.5', '2.5']),
				['1.25', '-3.75', '6.25']
			)
			// Anti-parallel (opposite direction)
			assert.deepEqual(
				projectionDecimalRecursive(['-6', '9', '-12'], ['2', '-3', '4']),
				['-6', '9', '-12']
			)
		})
	})

	describe('high precision and rounding behavior', () => {
		test('high precision (>30 digits) for repeating decimals', () => {
			// A = (1, 0, 0), B = (1, 1, 1) => proj = (1/3, 1/3, 1/3)
			const proj35 = projectionDecimalRecursive(['1', '0', '0'], ['1', '1', '1'], 35)
			const expectedOneThird35 = '0.' + '3'.repeat(35)
			assert.deepEqual(proj35, [expectedOneThird35, expectedOneThird35, expectedOneThird35])

			// A = (1, 0), B = (1, 2, ...): 1/7 cycle = 142857
			// A = (1, 0, 0), B = (1, 2, 1) => B·B = 6; let B = (1, 1, 1, 2) => B·B = 7
			// A = (1, 0, 0, 0), B = (1, 1, 1, 2) => A·B = 1, B·B = 7 => proj = (1/7, 1/7, 1/7, 2/7)
			const proj48 = projectionDecimalRecursive(['1', '0', '0', '0'], ['1', '1', '1', '2'], 48)
			const oneSeventh48 = '0.' + '142857'.repeat(8)
			const twoSevenths48 = '0.' + '285714'.repeat(8)
			assert.deepEqual(proj48, [oneSeventh48, oneSeventh48, oneSeventh48, twoSevenths48])
		})

		test('high precision (50 digits) with large arbitrary-precision inputs', () => {
			const bigA = ['123456789012345678901234567890.123456789012345678901234567890', '0']
			const bigB = ['1', '0']
			const proj = projectionDecimalRecursive(bigA, bigB, 50)
			assert.deepEqual(proj, ['123456789012345678901234567890.12345678901234567890123456789', '0'])
		})

		test('precision = 0 and precision < input scale round half away from zero', () => {
			assert.deepEqual(projectionDecimalRecursive(['2.5', '0'], ['1', '0'], 0), ['3', '0'])
			assert.deepEqual(projectionDecimalRecursive(['-2.5', '0'], ['1', '0'], 0), ['-3', '0'])
			assert.deepEqual(projectionDecimalRecursive(['1.235', '-1.235'], ['1', '-1'], 2), ['1.24', '-1.24'])
			// Small negative number rounding to 0 must be '0', never '-0'
			assert.deepEqual(projectionDecimalRecursive(['-0.0001', '0'], ['1', '0'], 2), ['0', '0'])
		})
	})

	describe('mathematical cross-checks', () => {
		const cases = [
			{
				name: '2D rational',
				a: ['7.125', '-3.875'],
				b: ['2.5', '1.75'],
				precision: 35
			},
			{
				name: '3D irrational-like denominator',
				a: ['11.3', '-5.7', '2.9'],
				b: ['3.1', '4.2', '-1.9'],
				precision: 40
			},
			{
				name: '6D mixed magnitudes',
				a: ['100.001', '-0.00025', '42', '-17.5', '0.123456789', '-99.9'],
				b: ['3', '-7.5', '1.25', '0.5', '-2.25', '4.1'],
				precision: 40
			}
		]

		for (const { name, a, b, precision } of cases) {
			test(`residual (vecA - proj) is orthogonal to vecB: ${name}`, () => {
				const proj = projectionDecimalRecursive(a, b, precision)
				const residual = a.map((ai, i) => {
					const d = subDec(ai, proj[i])
					const neg = d.num < 0n
					const digits = (neg ? -d.num : d.num).toString()
					if (d.scale === 0) return neg ? `-${digits}` : digits
					const padded = digits.padStart(d.scale + 1, '0')
					const intPart = padded.slice(0, padded.length - d.scale)
					const fracPart = padded.slice(padded.length - d.scale)
					return `${neg ? '-' : ''}${intPart}.${fracPart}`
				})

				const dot = dotDec(residual, b)
				const absDot = dot.num < 0n ? -dot.num : dot.num
				// Tolerance: residual error per component is <= 0.5 * 10^(-precision),
				// so |residual · b| <= 10^(-(precision - 4)) generously covers sum(|b_i|).
				const tolDigits = precision - 5
				const maxScale = Math.max(dot.scale, tolDigits)
				const lhs = absDot * 10n ** BigInt(maxScale - dot.scale)
				const rhs = 10n ** BigInt(maxScale - tolDigits)
				assert.ok(lhs <= rhs, `Residual dot vecB not orthogonal for ${name}`)
			})

			test(`idempotence proj(proj(a, b), b) == proj(a, b): ${name}`, () => {
				const first = projectionDecimalRecursive(a, b, precision)
				const second = projectionDecimalRecursive(first, b, precision)
				for (let i = 0; i < first.length; i++) {
					assertCloseDecimal(second[i], first[i], precision - 2)
				}
			})

			test(`scale invariance proj(a, c*b) == proj(a, b): ${name}`, () => {
				const base = projectionDecimalRecursive(a, b, precision)
				const scaledB = b.map((bi) => {
					const d = parseDec(bi)
					const scaled = d.num * -3n
					const neg = scaled < 0n
					const digits = (neg ? -scaled : scaled).toString()
					if (d.scale === 0) return neg ? `-${digits}` : digits
					const padded = digits.padStart(d.scale + 1, '0')
					return `${neg ? '-' : ''}${padded.slice(0, padded.length - d.scale)}.${padded.slice(padded.length - d.scale)}`
				})
				const withScaledB = projectionDecimalRecursive(a, scaledB, precision)
				assert.deepEqual(withScaledB, base)
			})
		}

		test('exact idempotence when projection terminates', () => {
			const a = ['5', '-3', '1']
			const b = ['1', '1', '0']
			const once = projectionDecimalRecursive(a, b)
			const twice = projectionDecimalRecursive(once, b)
			assert.deepEqual(twice, once)
		})

		test('linearity proj(a1 + a2, b) == proj(a1, b) + proj(a2, b)', () => {
			const a1 = ['1.5', '-2.25', '3']
			const a2 = ['4.5', '1.75', '-2']
			const b = ['2', '-1', '2']
			const aSum = a1.map((v, i) => addDecStr(v, a2[i]))

			const lhs = projectionDecimalRecursive(aSum, b, 30)
			const p1 = projectionDecimalRecursive(a1, b, 30)
			const p2 = projectionDecimalRecursive(a2, b, 30)
			const rhs = p1.map((v, i) => addDecStr(v, p2[i]))

			for (let i = 0; i < lhs.length; i++) {
				assertCloseDecimal(lhs[i], rhs[i], 28)
			}
		})
	})

	describe('error handling and input validation', () => {
		test('throws RangeError when vecB is the zero vector', () => {
			assert.throws(() => projectionDecimalRecursive(['1', '2'], ['0', '0']), RangeError)
			assert.throws(() => projectionDecimalRecursive(['1', '2'], ['0.000', '-0.0']), RangeError)
			assert.throws(() => projectionDecimalRecursive(['1', '2'], ['0e5', '0.0e-3']), RangeError)
		})

		test('throws TypeError for non-array vector inputs', () => {
			assert.throws(() => projectionDecimalRecursive(null, ['1']), TypeError)
			assert.throws(() => projectionDecimalRecursive(['1'], undefined), TypeError)
			assert.throws(() => projectionDecimalRecursive('1', ['1']), TypeError)
			assert.throws(() => projectionDecimalRecursive(['1'], { 0: '1', length: 1 }), TypeError)
		})

		test('throws RangeError for empty or mismatched-length vectors', () => {
			assert.throws(() => projectionDecimalRecursive([], []), RangeError)
			assert.throws(() => projectionDecimalRecursive([], ['1']), RangeError)
			assert.throws(() => projectionDecimalRecursive(['1', '2'], ['1']), RangeError)
			assert.throws(() => projectionDecimalRecursive(['1'], ['1', '2']), RangeError)
		})

		test('throws TypeError for non-string vector elements', () => {
			assert.throws(() => projectionDecimalRecursive([1, 2], ['1', '2']), TypeError)
			assert.throws(() => projectionDecimalRecursive(['1', '2'], ['1', 2]), TypeError)
			assert.throws(() => projectionDecimalRecursive([null], ['1']), TypeError)
			assert.throws(() => projectionDecimalRecursive(['1'], [undefined]), TypeError)
		})

		test('throws RangeError for invalid decimal strings', () => {
			const invalid = ['', '   ', 'abc', 'NaN', 'Infinity', '1.2.3', '.', '+', '-', '1e', '1e+', '--1', '1 2']
			for (const bad of invalid) {
				assert.throws(() => projectionDecimalRecursive([bad], ['1']), RangeError, `Expected throw for vecA=["${bad}"]`)
				assert.throws(() => projectionDecimalRecursive(['1'], [bad]), RangeError, `Expected throw for vecB=["${bad}"]`)
			}
		})

		test('throws on invalid precision values', () => {
			assert.throws(() => projectionDecimalRecursive(['1'], ['1'], -1), RangeError)
			assert.throws(() => projectionDecimalRecursive(['1'], ['1'], 1.5), RangeError)
			assert.throws(() => projectionDecimalRecursive(['1'], ['1'], Number.NaN), RangeError)
			assert.throws(() => projectionDecimalRecursive(['1'], ['1'], Number.POSITIVE_INFINITY), RangeError)
			assert.throws(() => projectionDecimalRecursive(['1'], ['1'], '20'), TypeError)
			assert.throws(() => projectionDecimalRecursive(['1'], ['1'], null), TypeError)
		})
	})
})
