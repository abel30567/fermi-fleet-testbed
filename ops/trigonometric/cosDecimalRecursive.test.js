import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cosDecimalRecursive } from './cosDecimalRecursive.js'

const PI_60 = '3.141592653589793238462643383279502884197169399375105820974945'
const HALF_PI_60 = '1.570796326794896619231321691639751442098584699687552910487472'
const THIRD_PI_60 = '1.047197551196597746154214461093167628065723133125035273658315'
const TWO_PI_60 = '6.283185307179586476925286766559005768394338798750211641949889'

// Reference value of cos(1) to 60 decimal places
const COS_1_60 = '0.540302305868139717400936607442976603732310420617922227670097'

/**
 * Helper: parse a fixed-point decimal string with `precision` fractional digits
 * into a scaled BigInt value (value * 10^precision).
 */
function parseFixed(str, precision) {
	const negative = str.startsWith('-')
	const unsigned = negative ? str.slice(1) : str
	const [intPart, fracPart = ''] = unsigned.split('.')
	assert.equal(fracPart.length, precision, `Expected ${precision} fractional digits in "${str}"`)
	const mag = BigInt(intPart + fracPart)
	return negative ? -mag : mag
}

describe('cosDecimalRecursive', () => {
	describe('zero and special angles', () => {
		it('returns exact 1 for zero inputs with default and custom precisions', () => {
			assert.equal(cosDecimalRecursive('0'), '1.00000000000000000000')
			assert.equal(cosDecimalRecursive('-0'), '1.00000000000000000000')
			assert.equal(cosDecimalRecursive('+0'), '1.00000000000000000000')
			assert.equal(cosDecimalRecursive('0.000000'), '1.00000000000000000000')
			assert.equal(cosDecimalRecursive('0e10'), '1.00000000000000000000')
			assert.equal(cosDecimalRecursive(0), '1.00000000000000000000')
			assert.equal(cosDecimalRecursive(0n), '1.00000000000000000000')
			assert.equal(cosDecimalRecursive('0', 0), '1')
			assert.equal(cosDecimalRecursive('0', 5), '1.00000')
			assert.equal(cosDecimalRecursive('0', 50), '1.' + '0'.repeat(50))
		})

		it('evaluates pi/3, pi/2, pi, and 2*pi accurately without negative zero', () => {
			assert.equal(cosDecimalRecursive(THIRD_PI_60, 40), '0.5' + '0'.repeat(39))
			assert.equal(cosDecimalRecursive(HALF_PI_60, 40), '0.' + '0'.repeat(40))
			assert.equal(cosDecimalRecursive(PI_60, 40), '-1.' + '0'.repeat(40))
			assert.equal(cosDecimalRecursive(TWO_PI_60, 40), '1.' + '0'.repeat(40))
			assert.equal(cosDecimalRecursive(HALF_PI_60, 0), '0')
			assert.equal(cosDecimalRecursive(PI_60, 0), '-1')
		})

		it('handles tiny angles and scientific notation', () => {
			assert.equal(cosDecimalRecursive('1e-10', 20), '1.00000000000000000000')
			assert.equal(cosDecimalRecursive('2e-10', 20), '0.99999999999999999998')
			assert.equal(cosDecimalRecursive('1e-1000', 30), '1.' + '0'.repeat(30))
			assert.equal(cosDecimalRecursive('  +0.5  ', 20), cosDecimalRecursive('.5', 20))
			assert.equal(cosDecimalRecursive('5.', 20), cosDecimalRecursive('5', 20))
		})
	})

	describe('high precision', () => {
		it('matches known 45+, 50, and 60-digit values of cos(1)', () => {
			assert.equal(cosDecimalRecursive('1', 20), '0.54030230586813971740')
			assert.equal(
				cosDecimalRecursive('1', 45),
				'0.540302305868139717400936607442976603732310421'
			)
			assert.equal(
				cosDecimalRecursive('1', 50),
				'0.54030230586813971740093660744297660373231042061792'
			)
			assert.equal(cosDecimalRecursive('1', 60), COS_1_60)
		})

		it('agrees with an independent BigInt Taylor series for cos(1) at 100 digits', () => {
			const digits = 100
			const guard = 15
			const scale = 10n ** BigInt(digits + guard)
			let sum = scale
			let term = scale
			for (let n = 1n; n <= 80n; n++) {
				term = -term / ((2n * n - 1n) * (2n * n))
				sum += term
			}
			const drop = 10n ** BigInt(guard)
			const rounded = (sum + (drop >> 1n)) / drop
			const expected = '0.' + rounded.toString().padStart(digits, '0')
			assert.equal(cosDecimalRecursive('1', digits), expected)
		})
	})

	describe('negative and large angles', () => {
		it('satisfies even function symmetry cos(-x) === cos(x)', () => {
			const angles = [
				'0.001',
				'0.5',
				'1',
				'2.71828182845904523536',
				'3.14159',
				'10',
				'100.25',
				'1e15',
				'123456789012345678901234567890.5'
			]
			for (const angle of angles) {
				assert.equal(
					cosDecimalRecursive('-' + angle, 35),
					cosDecimalRecursive(angle, 35),
					`Even function symmetry failed for angle ${angle}`
				)
			}
		})

		it('handles very large angles with accurate high-precision pi reduction', () => {
			// Verify large angles preserve double-angle identity at 35 digits
			const largeAngles = ['1000', '1000000', '1e20', '1e50', '-9876543210987654321098765.4321']
			const prec = 35
			const calcPrec = 45
			const scale = 10n ** BigInt(calcPrec)

			for (const x of largeAngles) {
				const cx = parseFixed(cosDecimalRecursive(x, calcPrec), calcPrec)
				const twoX = x.startsWith('-')
					? '-' + multiplyDecimalBy2(x.slice(1))
					: multiplyDecimalBy2(x)
				const c2x = parseFixed(cosDecimalRecursive(twoX, calcPrec), calcPrec)
				// 2 * cos(x)^2 - 1
				const lhs = (2n * cx * cx) / scale - scale
				const diff = lhs >= c2x ? lhs - c2x : c2x - lhs
				// Agreement to well beyond 35 decimal places (diff < 10^(calcPrec - prec))
				assert.ok(
					diff < 10n ** BigInt(calcPrec - prec),
					`Double-angle identity failed for large angle ${x}: diff=${diff}`
				)
			}
		})
	})

	describe('trigonometric identities and Math.cos cross-checks', () => {
		it('satisfies double-angle identity 2*cos(x)^2 - 1 == cos(2x) to 45+ digits', () => {
			const cases = [
				['0.1', '0.2'],
				['0.5', '1'],
				['1', '2'],
				['1.234567890123456789', '2.469135780246913578'],
				['-3.75', '-7.5'],
				['17.25', '34.5'],
				['500', '1000']
			]
			const calcPrec = 50
			const scale = 10n ** BigInt(calcPrec)

			for (const [x, twoX] of cases) {
				const cx = parseFixed(cosDecimalRecursive(x, calcPrec), calcPrec)
				const c2x = parseFixed(cosDecimalRecursive(twoX, calcPrec), calcPrec)
				const lhs = (2n * cx * cx) / scale - scale
				const diff = lhs >= c2x ? lhs - c2x : c2x - lhs
				assert.ok(
					diff <= 10n,
					`2*cos(${x})^2 - 1 != cos(${twoX}) at ${calcPrec} digits (diff=${diff})`
				)
			}
		})

		it('satisfies triple-angle identity 4*cos(x)^3 - 3*cos(x) == cos(3x)', () => {
			const cases = [
				['0.25', '0.75'],
				['1', '3'],
				['-2.5', '-7.5']
			]
			const calcPrec = 40
			const scale = 10n ** BigInt(calcPrec)

			for (const [x, threeX] of cases) {
				const cx = parseFixed(cosDecimalRecursive(x, calcPrec), calcPrec)
				const c3x = parseFixed(cosDecimalRecursive(threeX, calcPrec), calcPrec)
				const cx3 = (cx * cx * cx) / (scale * scale)
				const lhs = 4n * cx3 - 3n * cx
				const diff = lhs >= c3x ? lhs - c3x : c3x - lhs
				assert.ok(diff <= 20n, `4*cos(${x})^3 - 3*cos(${x}) != cos(${threeX}) (diff=${diff})`)
			}
		})

		it('agrees with Math.cos across a sweep of angles', () => {
			const values = [
				-50, -10.5, -Math.PI, -2.5, -1, -0.5, -0.001, 0, 0.001, 0.25, 0.5, 1, 1.5, 2, 3,
				Math.PI, 4.7, 6.28, 10, 25.125, 100
			]
			for (const x of values) {
				const got = Number(cosDecimalRecursive(String(x), 20))
				const expected = Math.cos(x)
				assert.ok(
					Math.abs(got - expected) < 1e-13,
					`Mismatch vs Math.cos(${x}): got=${got}, expected=${expected}`
				)
			}
		})
	})

	describe('input validation', () => {
		it('throws on invalid radians types and malformed strings', () => {
			const typeErrors = [null, undefined, {}, [], true, false, Symbol('rad')]
			for (const bad of typeErrors) {
				assert.throws(() => cosDecimalRecursive(bad), TypeError)
			}

			const rangeErrors = [
				NaN,
				Infinity,
				-Infinity,
				'',
				'   ',
				'abc',
				'1.2.3',
				'--1',
				'++1',
				'.',
				'+',
				'-',
				'1e',
				'1e+',
				'1e-',
				'NaN',
				'Infinity',
				'-Infinity',
				'1e99999999999999999999'
			]
			for (const bad of rangeErrors) {
				assert.throws(() => cosDecimalRecursive(bad), RangeError)
			}
		})

		it('throws on invalid precision values', () => {
			const typeErrors = ['20', null, {}, [], true]
			for (const bad of typeErrors) {
				assert.throws(() => cosDecimalRecursive('1', bad), TypeError)
			}

			const rangeErrors = [-1, -100, 1.5, 0.1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]
			for (const bad of rangeErrors) {
				assert.throws(() => cosDecimalRecursive('1', bad), RangeError)
			}
		})
	})
})

/**
 * Exact multiplication by 2 for an unsigned decimal string (supports scientific notation).
 */
function multiplyDecimalBy2(str) {
	const [mantissa, expPart] = str.split(/[eE]/)
	const dotIdx = mantissa.indexOf('.')
	const digits = dotIdx === -1 ? mantissa : mantissa.slice(0, dotIdx) + mantissa.slice(dotIdx + 1)
	const fracLen = dotIdx === -1 ? 0 : mantissa.length - dotIdx - 1
	const doubled = (BigInt(digits) * 2n).toString()
	let result
	if (fracLen === 0) {
		result = doubled
	} else {
		const padded = doubled.padStart(fracLen + 1, '0')
		result = padded.slice(0, padded.length - fracLen) + '.' + padded.slice(padded.length - fracLen)
	}
	return expPart !== undefined ? `${result}e${expPart}` : result
}
