import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { magnitudeDecimalRecursive } from './magnitudeDecimalRecursive.js'

/**
 * Helper: parses a decimal string into exact `{ m: bigint, e: number }`
 * representing `m * 10^e` for exact BigInt cross-checks.
 */
function toExactDecimal(str) {
	let expPart = 0
	let coeff = str
	const eIdx = str.search(/[eE]/)
	if (eIdx !== -1) {
		coeff = str.slice(0, eIdx)
		expPart = Number(str.slice(eIdx + 1))
	}
	const dotIdx = coeff.indexOf('.')
	if (dotIdx === -1) {
		return { m: BigInt(coeff), e: expPart }
	}
	const fracLen = coeff.length - dotIdx - 1
	return {
		m: BigInt(coeff.slice(0, dotIdx) + coeff.slice(dotIdx + 1)),
		e: expPart - fracLen,
	}
}

/**
 * Helper: multiplies two decimal strings and returns exact `{ m, e }`.
 */
function mulDecimal(a, b) {
	return { m: a.m * b.m, e: a.e + b.e }
}

/**
 * Helper: subtracts two exact decimals `a - b` returning `{ m, e }`.
 */
function subDecimal(a, b) {
	if (a.e === b.e) return { m: a.m - b.m, e: a.e }
	if (a.e > b.e) return { m: a.m * 10n ** BigInt(a.e - b.e) - b.m, e: b.e }
	return { m: a.m - b.m * 10n ** BigInt(b.e - a.e), e: a.e }
}

/**
 * Helper: adds two exact decimals `a + b` returning `{ m, e }`.
 */
function addDecimal(a, b) {
	if (a.e === b.e) return { m: a.m + b.m, e: a.e }
	if (a.e > b.e) return { m: a.m * 10n ** BigInt(a.e - b.e) + b.m, e: b.e }
	return { m: a.m + b.m * 10n ** BigInt(b.e - a.e), e: a.e }
}

/**
 * Helper: returns true iff |a - b| <= tolerance (all as exact decimals).
 */
function withinTolerance(a, b, tol) {
	const diff = subDecimal(a, b)
	const absDiff = { m: diff.m < 0n ? -diff.m : diff.m, e: diff.e }
	const cmp = subDecimal(absDiff, tol)
	return cmp.m <= 0n
}

/**
 * Helper: multiplies a decimal string by an integer or decimal scalar string,
 * returning an exact decimal string.
 */
function scaleDecimalStr(valStr, scalarStr) {
	const prod = mulDecimal(toExactDecimal(valStr), toExactDecimal(scalarStr))
	if (prod.m === 0n) return '0'
	const neg = prod.m < 0n
	const digits = (neg ? -prod.m : prod.m).toString()
	const sign = neg ? '-' : ''
	if (prod.e >= 0) {
		return sign + digits + '0'.repeat(prod.e)
	}
	const fracLen = -prod.e
	if (digits.length <= fracLen) {
		return `${sign}0.${'0'.repeat(fracLen - digits.length)}${digits}`
	}
	const splitAt = digits.length - fracLen
	return `${sign}${digits.slice(0, splitAt)}.${digits.slice(splitAt)}`
}

describe('magnitudeDecimalRecursive', () => {
	describe('Pythagorean triples and exact norms', () => {
		it('computes classic 2D Pythagorean triples exactly', () => {
			assert.equal(magnitudeDecimalRecursive(['3', '4']), '5')
			assert.equal(magnitudeDecimalRecursive(['5', '12']), '13')
			assert.equal(magnitudeDecimalRecursive(['8', '15']), '17')
			assert.equal(magnitudeDecimalRecursive(['7', '24']), '25')
		})

		it('computes 3D Pythagorean quadruples and decimal scaled triples', () => {
			assert.equal(magnitudeDecimalRecursive(['3', '4', '12']), '13')
			assert.equal(magnitudeDecimalRecursive(['2', '3', '6']), '7')
			assert.equal(magnitudeDecimalRecursive(['0.3', '0.4']), '0.5')
			assert.equal(magnitudeDecimalRecursive(['-0.05', '0.12']), '0.13')
		})

		it('handles scientific notation, explicit signs, and huge integer triples beyond Number.MAX_SAFE_INTEGER', () => {
			assert.equal(magnitudeDecimalRecursive(['3e-10', '4e-10']), '0.0000000005')
			assert.equal(magnitudeDecimalRecursive(['+3.', '-.4e1']), '5')
			assert.equal(
				magnitudeDecimalRecursive([
					'300000000000000000000000000',
					'400000000000000000000000000',
				]),
				'500000000000000000000000000',
			)
		})

		it('handles large vectors across deep divide-and-conquer trees', () => {
			const ones100 = Array.from({ length: 100 }, () => '1')
			assert.equal(magnitudeDecimalRecursive(ones100), '10')

			const mixed = Array.from({ length: 64 }, (_, i) => (i % 2 === 0 ? '0.5' : '-0.5'))
			assert.equal(magnitudeDecimalRecursive(mixed), '4')
		})
	})

	describe('zero vector', () => {
		it('returns "0" for zero vectors of any dimension and representation', () => {
			assert.equal(magnitudeDecimalRecursive(['0']), '0')
			assert.equal(magnitudeDecimalRecursive(['0', '0', '0']), '0')
			assert.equal(magnitudeDecimalRecursive(['-0', '+0.000', '0.0', '0e-100']), '0')
			assert.equal(magnitudeDecimalRecursive(['0', '0'], 0), '0')
			assert.equal(magnitudeDecimalRecursive(['0', '0'], 50), '0')
		})
	})

	describe('single-element negative vector and rounding edge cases', () => {
		it('returns the exact absolute value for single-element negative vectors', () => {
			assert.equal(magnitudeDecimalRecursive(['-5']), '5')
			assert.equal(magnitudeDecimalRecursive(['-0.75']), '0.75')
			assert.equal(
				magnitudeDecimalRecursive(['-123.45678901234567890123456789'], 30),
				'123.45678901234567890123456789',
			)
		})

		it('applies exact half-up rounding when input precision exceeds requested precision', () => {
			assert.equal(magnitudeDecimalRecursive(['-0.05'], 1), '0.1')
			assert.equal(magnitudeDecimalRecursive(['-0.049'], 1), '0')
			assert.equal(magnitudeDecimalRecursive(['-42.5'], 0), '43')
			assert.equal(magnitudeDecimalRecursive(['-42.49999999999999999999'], 0), '42')
		})
	})

	describe('high-precision (>30 digits)', () => {
		it('computes sqrt(2) from [1, 1] to 50 decimal places', () => {
			const expectedSqrt2_50 = '1.41421356237309504880168872420969807856967187537695'
			assert.equal(magnitudeDecimalRecursive(['1', '1'], 50), expectedSqrt2_50)
		})

		it('computes sqrt(3) from [1, 1, 1] and sqrt(5) from [1, 2] to 40 decimal places', () => {
			const expectedSqrt3_40 = '1.7320508075688772935274463415058723669428'
			const expectedSqrt5_40 = '2.2360679774997896964091736687312762354406'
			assert.equal(magnitudeDecimalRecursive(['1', '1', '1'], 40), expectedSqrt3_40)
			assert.equal(magnitudeDecimalRecursive(['1', '2'], 40), expectedSqrt5_40)
		})

		it('uses default precision of 20 decimal places and supports precision 0', () => {
			// 20th digit of sqrt(2) is 0, so canonical form strips trailing zero
			assert.equal(magnitudeDecimalRecursive(['1', '1']), '1.4142135623730950488')
			assert.equal(magnitudeDecimalRecursive(['1', '1'], 0), '1')
			assert.equal(magnitudeDecimalRecursive(['2', '2'], 0), '3')
		})

		it('computes norms of very tiny decimals accurately at high precision', () => {
			assert.equal(
				magnitudeDecimalRecursive(['1e-35', '1e-35'], 45),
				'0.000000000000000000000000000000000014142135624',
			)
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when vec is not an array', () => {
			for (const bad of [null, undefined, '3,4', 123, { 0: '3', 1: '4' }]) {
				assert.throws(() => magnitudeDecimalRecursive(bad), TypeError)
			}
		})

		it('throws RangeError when vec is empty', () => {
			assert.throws(() => magnitudeDecimalRecursive([]), RangeError)
		})

		it('throws TypeError when any element is not a string', () => {
			for (const badVec of [[3, 4], ['3', 4], ['3', null], ['3', undefined], [3n]]) {
				assert.throws(() => magnitudeDecimalRecursive(badVec), TypeError)
			}
		})

		it('throws RangeError for malformed decimal strings', () => {
			const malformed = [
				'',
				'   ',
				'abc',
				'NaN',
				'Infinity',
				'-Infinity',
				'1.2.3',
				'.',
				'+',
				'-',
				'+.',
				'-.',
				'1e',
				'1e+',
				'1e1.5',
				' 3',
				'3 ',
				'1_000',
			]
			for (const s of malformed) {
				assert.throws(
					() => magnitudeDecimalRecursive([s]),
					RangeError,
					`Expected RangeError for "${s}"`,
				)
			}
		})

		it('throws TypeError or RangeError for invalid precision values', () => {
			for (const badType of ['20', null, true, {}, 20n]) {
				assert.throws(() => magnitudeDecimalRecursive(['3', '4'], badType), TypeError)
			}
			for (const badRange of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => magnitudeDecimalRecursive(['3', '4'], badRange), RangeError)
			}
		})
	})

	describe('mathematical cross-checks', () => {
		it('squaring the magnitude equals the exact sum of squares within rounding error', () => {
			const cases = [
				{ vec: ['1', '1'], precision: 40 },
				{ vec: ['1.23456789', '-9.87654321', '42.0001'], precision: 35 },
				{ vec: ['12345678901234567890.12345', '-0.000000000000000123456789'], precision: 40 },
				{ vec: ['2', '3', '5', '7', '11', '13', '17'], precision: 45 },
			]

			for (const { vec, precision } of cases) {
				const magStr = magnitudeDecimalRecursive(vec, precision)
				const mag = toExactDecimal(magStr)
				const magSq = mulDecimal(mag, mag)

				const expectedSumSq = vec
					.map(toExactDecimal)
					.map((x) => mulDecimal(x, x))
					.reduce((acc, sq) => addDecimal(acc, sq), { m: 0n, e: 0 })

				// Since |mag - trueMag| <= 0.5 * 10^-p,
				// |mag^2 - sumSq| <= (mag + 0.5*10^-p) * 10^-p + 0.25 * 10^-2p <= (mag + 1) * 10^-p
				const ulp = { m: 1n, e: -precision }
				const magPlusOne = addDecimal(mag, { m: 1n, e: 0 })
				const tolerance = mulDecimal(magPlusOne, ulp)

				assert.ok(
					withinTolerance(magSq, expectedSumSq, tolerance),
					`mag^2 did not match sum of squares for [${vec.join(', ')}] at precision ${precision}`,
				)
			}
		})

		it('satisfies scaling homogeneity ||k * v|| == |k| * ||v|| at high precision', () => {
			const vec = ['1.5', '-2.75', '3.125', '-0.625']
			const scalars = ['7', '-13.25', '0.000125', '-1000000000000.5']
			const precision = 35
			const baseMag = toExactDecimal(magnitudeDecimalRecursive(vec, precision + 15))

			for (const k of scalars) {
				const scaledVec = vec.map((x) => scaleDecimalStr(x, k))
				const lhs = toExactDecimal(magnitudeDecimalRecursive(scaledVec, precision))

				const kExact = toExactDecimal(k)
				const absK = { m: kExact.m < 0n ? -kExact.m : kExact.m, e: kExact.e }
				const rhs = mulDecimal(absK, baseMag)

				// Tolerance accounts for rounding of lhs (0.5 * 10^-precision) + scaled baseMag error
				const tol = { m: 1n, e: -(precision - 1) }
				assert.ok(
					withinTolerance(lhs, rhs, tol),
					`Homogeneity failed for scalar ${k}`,
				)
			}
		})

		it('matches Math.hypot within IEEE-754 floating-point precision', () => {
			const vectors = [
				['3', '4'],
				['-1.5', '2.5', '-3.5'],
				['0.1', '0.2', '0.3', '0.4', '0.5'],
				['12345.6789', '-98765.4321', '54321.1234'],
				['1e-6', '2e-6', '3e-6'],
			]

			for (const vec of vectors) {
				const exactStr = magnitudeDecimalRecursive(vec, 25)
				const approx = Number(exactStr)
				const expected = Math.hypot(...vec.map(Number))
				const relErr = Math.abs(approx - expected) / expected
				assert.ok(
					relErr < 1e-14,
					`Expected ${approx} to match Math.hypot ${expected} (relErr=${relErr})`,
				)
			}
		})

		it('is invariant to component permutation and sign flips', () => {
			const vec = ['1.1', '-2.2', '3.3', '-4.4', '5.5']
			const reversed = [...vec].reverse()
			const allPositive = vec.map((s) => (s.startsWith('-') ? s.slice(1) : s))
			const expected = magnitudeDecimalRecursive(vec, 35)

			assert.equal(magnitudeDecimalRecursive(reversed, 35), expected)
			assert.equal(magnitudeDecimalRecursive(allPositive, 35), expected)
		})
	})
})
