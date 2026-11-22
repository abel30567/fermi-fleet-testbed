import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { projectionDecimalIterative } from './projectionDecimalIterative.js'

/**
 * Independent BigInt rational helper for cross-checking mathematical identities.
 * Represents a decimal string as exact `{ num, den }` with `den = 10^scale`.
 */
function decimalToRational(str) {
	const negative = str.startsWith('-')
	const unsigned = negative || str.startsWith('+') ? str.slice(1) : str
	const [mantissa, expPart] = unsigned.split(/[eE]/)
	const [intPart = '0', fracPart = ''] = mantissa.split('.')
	const sciExp = expPart ? Number(expPart) : 0
	const totalExp = sciExp - fracPart.length
	let coeff = BigInt(intPart + fracPart)
	if (negative) coeff = -coeff
	if (totalExp >= 0) {
		return { num: coeff * (10n ** BigInt(totalExp)), den: 1n }
	}
	return { num: coeff, den: 10n ** BigInt(-totalExp) }
}

function addRational(x, y) {
	return { num: x.num * y.den + y.num * x.den, den: x.den * y.den }
}

function subRational(x, y) {
	return { num: x.num * y.den - y.num * x.den, den: x.den * y.den }
}

function mulRational(x, y) {
	return { num: x.num * y.num, den: x.den * y.den }
}

function absRational(x) {
	return { num: x.num < 0n ? -x.num : x.num, den: x.den < 0n ? -x.den : x.den }
}

function lessThanRational(x, y) {
	return x.num * y.den < y.num * x.den
}

function exactDotRational(u, v) {
	let acc = { num: 0n, den: 1n }
	for (let i = 0; i < u.length; i += 1) {
		acc = addRational(acc, mulRational(decimalToRational(u[i]), decimalToRational(v[i])))
	}
	return acc
}

describe('projectionDecimalIterative', () => {
	describe('normal cases', () => {
		test('projects onto standard basis vectors', () => {
			assert.deepEqual(projectionDecimalIterative(['3', '4'], ['1', '0']), ['3', '0'])
			assert.deepEqual(projectionDecimalIterative(['-7.25', '12.5', '0.125'], ['0', '1', '0']), [
				'0',
				'12.5',
				'0',
			])
		})

		test('projects general integer and decimal vectors with exact terminating results', () => {
			// a = [3, 4], b = [1, 1] -> (a·b)/(b·b) = 7/2 = 3.5 -> [3.5, 3.5]
			assert.deepEqual(projectionDecimalIterative(['3', '4'], ['1', '1']), ['3.5', '3.5'])

			// a = [1.5, -2.5], b = [2, 4] -> a·b = 3 - 10 = -7, b·b = 20 -> (-7/20)*[2,4] = [-0.7, -1.4]
			assert.deepEqual(projectionDecimalIterative(['1.5', '-2.5'], ['2', '4']), ['-0.7', '-1.4'])
		})

		test('handles non-terminating rational projections to 30+ and 50+ decimal places', () => {
			// proj_{[1,1,1]}([1,0,0]) = [1/3, 1/3, 1/3]
			const expectedOneThird40 = `0.${'3'.repeat(40)}`
			assert.deepEqual(projectionDecimalIterative(['1', '0', '0'], ['1', '1', '1'], 40), [
				expectedOneThird40,
				expectedOneThird40,
				expectedOneThird40,
			])

			// proj_{[1,1,1]}([2,0,0]) = [2/3, 2/3, 2/3] -> rounds last digit up to 7
			const expectedTwoThirds40 = `0.${'6'.repeat(39)}7`
			assert.deepEqual(projectionDecimalIterative(['2', '0', '0'], ['1', '1', '1'], 40), [
				expectedTwoThirds40,
				expectedTwoThirds40,
				expectedTwoThirds40,
			])

			// a = [1, 2, 3], b = [4, 5, 6] -> a·b = 32, b·b = 77
			// 128/77 = 1.(662337), 160/77 = 2.(077922), 192/77 = 2.(493506)
			// At 36 decimal places (exact multiple of period 6):
			// Next digit for 128/77 is 6 -> rounds last 7 to 8
			// Next digit for 160/77 is 0 -> stays 2
			// Next digit for 192/77 is 4 -> stays 6
			const p36 = projectionDecimalIterative(['1', '2', '3'], ['4', '5', '6'], 36)
			assert.deepEqual(p36, [
				`1.${'662337'.repeat(5)}662338`,
				`2.${'077922'.repeat(6)}`,
				`2.${'493506'.repeat(6)}`,
			])
		})

		test('preserves precision beyond IEEE-754 float64 (catastrophic cancellation & large decimals)', () => {
			// In float64, 1 + 1e-30 === 1, so a·b would collapse to 0!
			// Exact: a·b = 1e-30, b·b = 2 -> proj_b(a) = [5e-31, -5e-31]
			const a = ['1.000000000000000000000000000001', '1']
			const b = ['1', '-1']
			const res = projectionDecimalIterative(a, b, 35)
			assert.deepEqual(res, [
				'0.0000000000000000000000000000005',
				'-0.0000000000000000000000000000005',
			])

			// Large 50-digit values projected onto [1, 0]
			const big = '123456789012345678901234567890.98765432109876543210987654321'
			assert.deepEqual(projectionDecimalIterative([big, '42'], ['1', '0'], 35), [big, '0'])
		})

		test('supports leading plus signs, shorthand decimals, and scientific notation', () => {
			assert.deepEqual(
				projectionDecimalIterative(['+1.5e1', '.5', '5.'], ['1e0', '0', '0'], 10),
				['15', '0', '0'],
			)
			// a = [1e-25, 0], b = [3e-25, 0] -> parallel in 1st coord -> [1e-25, 0]
			assert.deepEqual(projectionDecimalIterative(['1e-25', '0'], ['3e-25', '0'], 30), [
				'0.0000000000000000000000001',
				'0',
			])
		})
	})

	describe('edge cases', () => {
		test('orthogonal vectors project to the zero vector', () => {
			assert.deepEqual(projectionDecimalIterative(['1', '2', '-3'], ['3', '0', '1']), [
				'0',
				'0',
				'0',
			])
			assert.deepEqual(projectionDecimalIterative(['-4.5', '2.25'], ['1', '2']), ['0', '0'])
		})

		test('parallel and anti-parallel vectors project onto a itself', () => {
			// Parallel
			assert.deepEqual(
				projectionDecimalIterative(['2.5', '-5', '7.5'], ['1', '-2', '3']),
				['2.5', '-5', '7.5'],
			)
			// Anti-parallel
			assert.deepEqual(
				projectionDecimalIterative(['2.5', '-5', '7.5'], ['-0.5', '1', '-1.5']),
				['2.5', '-5', '7.5'],
			)
		})

		test('zero vector a projects to zero vector without negative zero', () => {
			assert.deepEqual(projectionDecimalIterative(['0', '-0.0'], ['-3', '-4']), ['0', '0'])
		})

		test('1-dimensional vectors always project to a', () => {
			assert.deepEqual(projectionDecimalIterative(['-98765.4321'], ['0.0001'], 10), [
				'-98765.4321',
			])
		})

		test('precision = 0 rounds to nearest integer (half away from zero) and avoids -0', () => {
			// a = [1, 0], b = [1, 1] -> [0.5, 0.5] -> rounds to ['1', '1']
			assert.deepEqual(projectionDecimalIterative(['1', '0'], ['1', '1'], 0), ['1', '1'])
			// a = [-1, 0], b = [1, 1] -> [-0.5, -0.5] -> rounds to ['-1', '-1']
			assert.deepEqual(projectionDecimalIterative(['-1', '0'], ['1', '1'], 0), ['-1', '-1'])
			// a = [-1, 0], b = [1, 2] -> [-0.2, -0.4] -> rounds to ['0', '0'] (never '-0')
			assert.deepEqual(projectionDecimalIterative(['-1', '0'], ['1', '2'], 0), ['0', '0'])
		})

		test('negative components and default precision = 20', () => {
			// a = [-1, 0, 0], b = [1, 1, 1] -> [-1/3, -1/3, -1/3]
			const negOneThird20 = `-0.${'3'.repeat(20)}`
			assert.deepEqual(projectionDecimalIterative(['-1', '0', '0'], ['1', '1', '1']), [
				negOneThird20,
				negOneThird20,
				negOneThird20,
			])
		})

		test('throws RangeError when target vector b is the zero vector', () => {
			assert.throws(() => projectionDecimalIterative(['1', '2'], ['0', '0']), RangeError)
			assert.throws(
				() => projectionDecimalIterative(['1', '2', '3'], ['-0.0', '+0', '0e10']),
				RangeError,
			)
		})

		test('validates input types, dimensions, decimal syntax, and precision', () => {
			// Non-array inputs
			assert.throws(() => projectionDecimalIterative(null, ['1']), TypeError)
			assert.throws(() => projectionDecimalIterative(['1'], '1'), TypeError)
			assert.throws(() => projectionDecimalIterative({}, ['1']), TypeError)

			// Empty arrays
			assert.throws(() => projectionDecimalIterative([], []), RangeError)
			assert.throws(() => projectionDecimalIterative([], ['1']), RangeError)
			assert.throws(() => projectionDecimalIterative(['1'], []), RangeError)

			// Mismatched lengths
			assert.throws(() => projectionDecimalIterative(['1', '2'], ['1']), RangeError)
			assert.throws(() => projectionDecimalIterative(['1'], ['1', '2']), RangeError)

			// Non-string elements
			assert.throws(() => projectionDecimalIterative([1, 2], ['1', '2']), TypeError)
			assert.throws(() => projectionDecimalIterative(['1', '2'], ['1', null]), TypeError)

			// Invalid decimal strings
			for (const bad of ['', '   ', 'abc', '1.2.3', 'NaN', 'Infinity', '.', '+', '1e', ' 1 ']) {
				assert.throws(() => projectionDecimalIterative([bad], ['1']), RangeError)
				assert.throws(() => projectionDecimalIterative(['1'], [bad]), RangeError)
			}

			// Invalid precision
			assert.throws(() => projectionDecimalIterative(['1'], ['1'], '10'), TypeError)
			assert.throws(() => projectionDecimalIterative(['1'], ['1'], null), TypeError)
			assert.throws(() => projectionDecimalIterative(['1'], ['1'], -1), RangeError)
			assert.throws(() => projectionDecimalIterative(['1'], ['1'], 2.5), RangeError)
			assert.throws(() => projectionDecimalIterative(['1'], ['1'], NaN), RangeError)
			assert.throws(() => projectionDecimalIterative(['1'], ['1'], Infinity), RangeError)
		})
	})

	describe('independent mathematical cross-checks', () => {
		test('residual (a - proj_b(a)) is orthogonal to b within rounding tolerance', () => {
			const a = ['17.1234567890123456789', '-42.9876543210987654321', '103.5', '-0.00001234567']
			const b = ['-3.14159265358979323846', '2.71828182845904523536', '-1.4142135623730950488', '7']
			const precision = 50
			const proj = projectionDecimalIterative(a, b, precision)

			// Compute exact residual dot b using independent rational arithmetic
			let residualDotB = { num: 0n, den: 1n }
			let sumAbsB = { num: 0n, den: 1n }
			for (let i = 0; i < a.length; i += 1) {
				const ai = decimalToRational(a[i])
				const pi = decimalToRational(proj[i])
				const bi = decimalToRational(b[i])
				const residualI = subRational(ai, pi)
				residualDotB = addRational(residualDotB, mulRational(residualI, bi))
				sumAbsB = addRational(sumAbsB, absRational(bi))
			}

			// Each component error <= 0.5 * 10^-precision, so |(a - proj) · b| <= sum(|b_i|) * 10^-precision
			const tolerance = mulRational(sumAbsB, { num: 1n, den: 10n ** BigInt(precision) })
			assert.ok(
				lessThanRational(absRational(residualDotB), tolerance),
				'Expected residual (a - proj_b(a)) to be orthogonal to b within 10^-50 tolerance',
			)
		})

		test('idempotence: proj_b(proj_b(a)) equals proj_b(a) to high precision', () => {
			const a = ['31.415926535897932384626', '-27.182818284590452353602', '16.180339887498948482045']
			const b = ['11', '-13', '17']

			const p1 = projectionDecimalIterative(a, b, 50)
			const p2 = projectionDecimalIterative(p1, b, 50)

			const tol = { num: 1n, den: 10n ** 45n }
			for (let i = 0; i < a.length; i += 1) {
				const diff = absRational(subRational(decimalToRational(p1[i]), decimalToRational(p2[i])))
				assert.ok(
					lessThanRational(diff, tol),
					`Component ${i} failed idempotence check: ${p1[i]} vs ${p2[i]}`,
				)
			}
		})

		test('Pythagorean identity: ||a||^2 = ||proj_b(a)||^2 + ||a - proj_b(a)||^2', () => {
			const a = ['13.7', '-29.3', '41.11', '5.9']
			const b = ['2.3', '7.1', '-3.7', '11.3']
			const precision = 45
			const proj = projectionDecimalIterative(a, b, precision)

			const normSqA = exactDotRational(a, a)
			const normSqProj = exactDotRational(proj, proj)

			let normSqRes = { num: 0n, den: 1n }
			for (let i = 0; i < a.length; i += 1) {
				const r = subRational(decimalToRational(a[i]), decimalToRational(proj[i]))
				normSqRes = addRational(normSqRes, mulRational(r, r))
			}

			const lhs = normSqA
			const rhs = addRational(normSqProj, normSqRes)
			const diff = absRational(subRational(lhs, rhs))
			const tol = { num: 1n, den: 10n ** 40n }

			assert.ok(
				lessThanRational(diff, tol),
				'Expected ||a||^2 to equal ||proj_b(a)||^2 + ||a - proj_b(a)||^2 within 10^-40',
			)
		})

		test('scale invariance: proj_{k*b}(a) equals proj_b(a) for non-zero scalar k', () => {
			const a = ['5', '-11', '23']
			const b = ['3', '7', '-13']
			const kb = ['-1.5', '-3.5', '6.5'] // k = -0.5

			assert.deepEqual(
				projectionDecimalIterative(a, b, 35),
				projectionDecimalIterative(a, kb, 35),
			)
		})
	})
})
