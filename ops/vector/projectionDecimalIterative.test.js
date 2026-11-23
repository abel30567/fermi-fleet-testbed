import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { projectionDecimalIterative } from './projectionDecimalIterative.js'

/**
 * Independent BigInt rational helper used solely for mathematical cross-checks
 * in tests (orthogonality of residual, idempotence, linearity, Pythagorean check).
 */
function parseToRational(str) {
	const s = str.trim()
	const neg = s.startsWith('-')
	const body = neg || s.startsWith('+') ? s.slice(1) : s
	const [mantissa, expPart] = body.split(/[eE]/)
	const exp = expPart ? Number(expPart) : 0
	const [intPart, fracPart = ''] = mantissa.split('.')
	const digits = intPart + fracPart
	const totalExp = exp - fracPart.length
	const raw = BigInt(digits)
	const signed = neg ? -raw : raw
	if (signed === 0n) return { n: 0n, d: 1n }
	if (totalExp >= 0) {
		return { n: signed * 10n ** BigInt(totalExp), d: 1n }
	}
	return { n: signed, d: 10n ** BigInt(-totalExp) }
}

function ratAdd(a, b) {
	return { n: a.n * b.d + b.n * a.d, d: a.d * b.d }
}

function ratSub(a, b) {
	return { n: a.n * b.d - b.n * a.d, d: a.d * b.d }
}

function ratMul(a, b) {
	return { n: a.n * b.n, d: a.d * b.d }
}

function ratAbsLessThanPow10(r, negExp) {
	// Checks |r.n / r.d| < 10^(-negExp)  <=>  |r.n| * 10^negExp < |r.d|
	const absN = r.n < 0n ? -r.n : r.n
	const absD = r.d < 0n ? -r.d : r.d
	if (negExp >= 0) {
		return absN * 10n ** BigInt(negExp) < absD
	}
	return absN < absD * 10n ** BigInt(-negExp)
}

function dotRational(a, b) {
	let acc = { n: 0n, d: 1n }
	for (let i = 0; i < a.length; i++) {
		acc = ratAdd(acc, ratMul(parseToRational(a[i]), parseToRational(b[i])))
	}
	return acc
}

describe('projectionDecimalIterative', () => {
	describe('normal cases', () => {
		test('projects onto coordinate axis', () => {
			assert.deepEqual(projectionDecimalIterative(['3', '4'], ['1', '0']), ['3', '0'])
			assert.deepEqual(projectionDecimalIterative(['3', '4'], ['0', '5']), ['0', '4'])
		})

		test('projects 2D vectors with exact finite decimal result', () => {
			// u·v = 24, v·v = 25 => (24/25) * [4, 3] = [3.84, 2.88]
			assert.deepEqual(projectionDecimalIterative(['3', '4'], ['4', '3']), ['3.84', '2.88'])
		})

		test('projects 3D vectors with negative entries', () => {
			// u·v = 2 - 2 - 3 = -3, v·v = 4 + 1 + 1 = 6 => -0.5 * [2, 1, -1] = [-1, -0.5, 0.5]
			assert.deepEqual(
				projectionDecimalIterative(['1', '-2', '3'], ['2', '1', '-1']),
				['-1', '-0.5', '0.5']
			)
		})

		test('projects 1D vector onto any non-zero 1D vector yields u', () => {
			assert.deepEqual(projectionDecimalIterative(['-42.125'], ['0.007']), ['-42.125'])
		})

		test('respects configurable precision for repeating decimals', () => {
			const u = ['1', '0', '0']
			const v = ['1', '1', '1']
			assert.deepEqual(projectionDecimalIterative(u, v, 0), ['0', '0', '0'])
			assert.deepEqual(projectionDecimalIterative(u, v, 5), ['0.33333', '0.33333', '0.33333'])
			assert.deepEqual(projectionDecimalIterative(u, v), [
				'0.33333333333333333333',
				'0.33333333333333333333',
				'0.33333333333333333333',
			])
		})

		test('uses round-half-to-even at precision boundary', () => {
			// proj_[1,1]([1,0]) = [0.5, 0.5] -> rounds to 0 (even)
			assert.deepEqual(projectionDecimalIterative(['1', '0'], ['1', '1'], 0), ['0', '0'])
			// proj_[1,1]([3,0]) = [1.5, 1.5] -> rounds to 2 (even)
			assert.deepEqual(projectionDecimalIterative(['3', '0'], ['1', '1'], 0), ['2', '2'])
			// proj_[1,1]([5,0]) = [2.5, 2.5] -> rounds to 2 (even)
			assert.deepEqual(projectionDecimalIterative(['5', '0'], ['1', '1'], 0), ['2', '2'])
			// negative half tie: -1.5 -> -2 (even), -0.5 -> 0 (never -0)
			assert.deepEqual(projectionDecimalIterative(['-3', '0'], ['1', '1'], 0), ['-2', '-2'])
			assert.deepEqual(projectionDecimalIterative(['-1', '0'], ['1', '1'], 0), ['0', '0'])
		})

		test('supports scientific notation, leading plus, and decimal shorthand', () => {
			assert.deepEqual(
				projectionDecimalIterative(['+3e0', '.5E1'], ['4.', '3.000'], 6),
				['4.32', '3.24']
			)
		})

		test('does not mutate input arrays', () => {
			const u = ['1.5', '-2.5', '3.5']
			const v = ['2', '0', '-2']
			const uCopy = [...u]
			const vCopy = [...v]
			projectionDecimalIterative(u, v, 10)
			assert.deepEqual(u, uCopy)
			assert.deepEqual(v, vCopy)
		})
	})

	describe('edge cases', () => {
		test('orthogonal vectors project to zero vector without negative zero', () => {
			assert.deepEqual(projectionDecimalIterative(['1', '-2', '1'], ['2', '1', '0']), [
				'0',
				'0',
				'0',
			])
			assert.deepEqual(projectionDecimalIterative(['-3.5', '2.5'], ['2.5', '3.5']), ['0', '0'])
		})

		test('parallel and anti-parallel vectors project to u', () => {
			const u = ['1.25', '-3.75', '0.5']
			const parallel = ['2.5', '-7.5', '1']
			const antiParallel = ['-3.75', '11.25', '-1.5']
			assert.deepEqual(projectionDecimalIterative(u, parallel), u)
			assert.deepEqual(projectionDecimalIterative(u, antiParallel), u)
		})

		test('zero source vector u projects to zero vector', () => {
			assert.deepEqual(projectionDecimalIterative(['0', '0.0', '-0'], ['1.2', '-3.4', '5.6']), [
				'0',
				'0',
				'0',
			])
		})

		test('extreme scale in v avoids intermediate rounding loss', () => {
			assert.deepEqual(projectionDecimalIterative(['1', '0'], ['3e40', '0'], 5), ['1', '0'])
			assert.deepEqual(projectionDecimalIterative(['1', '2'], ['3e-40', '0'], 5), ['1', '0'])
		})

		test('high precision beyond IEEE-754 float64 limits', () => {
			// u = [1, 0, 0, 0, 0, 0, 0], v = [1, 1, 1, 1, 1, 1, 1] => 1/7 repeating 142857
			const u = ['1', '0', '0', '0', '0', '0', '0']
			const v = ['1', '1', '1', '1', '1', '1', '1']
			const expected60 = '0.' + '142857'.repeat(10)
			const actual = projectionDecimalIterative(u, v, 60)
			assert.equal(actual[0], expected60)
			assert.deepEqual(actual, new Array(7).fill(expected60))

			// Arbitrary-precision integer + tiny perturbation beyond 53-bit mantissa
			const big = '1000000000000000000000000000001'
			const tiny = '0.000000000000000000000000000001'
			const res = projectionDecimalIterative([big, tiny], ['1', '0'], 40)
			assert.deepEqual(res, [big, '0'])

			const resParallel = projectionDecimalIterative([big, tiny], [big, tiny], 40)
			assert.deepEqual(resParallel, [big, tiny])
		})
	})

	describe('input validation', () => {
		test('throws on zero target vector v', () => {
			assert.throws(() => projectionDecimalIterative(['1', '2'], ['0', '0']), RangeError)
			assert.throws(() => projectionDecimalIterative(['1', '2'], ['0.00', '-0e5']), RangeError)
			// Even when u is also zero, zero v must be rejected
			assert.throws(() => projectionDecimalIterative(['0', '0'], ['0', '0']), RangeError)
		})

		test('throws on mismatched vector lengths', () => {
			assert.throws(() => projectionDecimalIterative(['1', '2'], ['1']), RangeError)
			assert.throws(() => projectionDecimalIterative(['1'], ['1', '2', '3']), RangeError)
		})

		test('throws on empty vectors', () => {
			assert.throws(() => projectionDecimalIterative([], []), RangeError)
		})

		test('throws on non-array vector arguments', () => {
			assert.throws(() => projectionDecimalIterative(null, ['1']), TypeError)
			assert.throws(() => projectionDecimalIterative(['1'], undefined), TypeError)
			assert.throws(() => projectionDecimalIterative('12', ['1', '2']), TypeError)
			assert.throws(() => projectionDecimalIterative({ 0: '1' }, ['1']), TypeError)
		})

		test('throws on non-string vector elements', () => {
			assert.throws(() => projectionDecimalIterative([1, 2], ['1', '2']), TypeError)
			assert.throws(() => projectionDecimalIterative(['1', '2'], ['1', 2]), TypeError)
			assert.throws(() => projectionDecimalIterative(['1', null], ['1', '2']), TypeError)
		})

		test('throws on malformed decimal strings', () => {
			for (const bad of ['', ' ', 'abc', 'NaN', 'Infinity', '-Infinity', '1.2.3', '.', '1e', '1e2.5', ' 1', '1 ']) {
				assert.throws(() => projectionDecimalIterative([bad, '1'], ['1', '1']), RangeError)
				assert.throws(() => projectionDecimalIterative(['1', '1'], [bad, '1']), RangeError)
			}
		})

		test('throws on invalid precision argument', () => {
			assert.throws(() => projectionDecimalIterative(['1'], ['1'], -1), RangeError)
			assert.throws(() => projectionDecimalIterative(['1'], ['1'], 1.5), RangeError)
			assert.throws(() => projectionDecimalIterative(['1'], ['1'], Number.NaN), RangeError)
			assert.throws(() => projectionDecimalIterative(['1'], ['1'], Number.POSITIVE_INFINITY), RangeError)
			assert.throws(() => projectionDecimalIterative(['1'], ['1'], '10'), TypeError)
		})
	})

	describe('independent mathematical cross-checks', () => {
		const testPairs = [
			{
				u: ['3.14159265358979323846', '-2.71828182845904523536', '1.41421356237309504880'],
				v: ['1.61803398874989484820', '0.57721566490153286060', '-2.23606797749978969640'],
				precision: 35,
			},
			{
				u: ['123456789.987654321', '-0.000012345', '42', '-9999.5', '0.1'],
				v: ['-7.3', '19.125', '-0.25', '101.001', '-3.75'],
				precision: 30,
			},
			{
				u: ['1e-12', '-2.5e-12', '7e-13'],
				v: ['3e-12', '4e-12', '-5e-12'],
				precision: 40,
			},
		]

		test('residual (u - proj_v(u)) is orthogonal to v', () => {
			for (const { u, v, precision } of testPairs) {
				const proj = projectionDecimalIterative(u, v, precision)
				// Compute exact rational (u - proj) · v
				let residualDotV = { n: 0n, d: 1n }
				for (let i = 0; i < u.length; i++) {
					const diff = ratSub(parseToRational(u[i]), parseToRational(proj[i]))
					residualDotV = ratAdd(residualDotV, ratMul(diff, parseToRational(v[i])))
				}
				// Each component of proj has error <= 0.5 * 10^(-precision), so |(u-proj)·v| <= 0.5 * sum(|v_i|) * 10^(-precision)
				// Check against a tight tolerance of 10^(-(precision - 4))
				assert.ok(
					ratAbsLessThanPow10(residualDotV, precision - 4),
					`Residual not orthogonal to v for precision=${precision}`
				)
			}
		})

		test('projection is idempotent: proj_v(proj_v(u)) ≈ proj_v(u)', () => {
			for (const { u, v, precision } of testPairs) {
				const p1 = projectionDecimalIterative(u, v, precision)
				const p2 = projectionDecimalIterative(p1, v, precision)
				for (let i = 0; i < u.length; i++) {
					const diff = ratSub(parseToRational(p2[i]), parseToRational(p1[i]))
					assert.ok(
						ratAbsLessThanPow10(diff, precision - 2),
						`Idempotence check failed at index ${i}: p1=${p1[i]}, p2=${p2[i]}`
					)
				}
			}
		})

		test('Pythagorean decomposition: ||u||^2 ≈ ||proj_v(u)||^2 + ||u - proj_v(u)||^2', () => {
			for (const { u, v, precision } of testPairs) {
				const p = projectionDecimalIterative(u, v, precision)
				const uNormSq = dotRational(u, u)
				const pNormSq = dotRational(p, p)
				let rNormSq = { n: 0n, d: 1n }
				for (let i = 0; i < u.length; i++) {
					const diff = ratSub(parseToRational(u[i]), parseToRational(p[i]))
					rNormSq = ratAdd(rNormSq, ratMul(diff, diff))
				}
				const err = ratSub(uNormSq, ratAdd(pNormSq, rNormSq))
				// For ||u|| up to ~1e8, relative error is ~10^(-precision), so tolerance precision - 12 is strict yet safe
				assert.ok(
					ratAbsLessThanPow10(err, precision - 12),
					`Pythagorean check failed for precision=${precision}`
				)
			}
		})

		test('scale invariance in v: proj_{k*v}(u) === proj_v(u)', () => {
			const u = ['7.125', '-3.5', '11.25']
			const v = ['2.5', '-1.25', '3.75']
			const vScaled = ['-25000', '12500', '-37500'] // k = -10000
			assert.deepEqual(
				projectionDecimalIterative(u, v, 30),
				projectionDecimalIterative(u, vScaled, 30)
			)
		})
	})
})
