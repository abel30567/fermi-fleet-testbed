import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { crossProductDecimalIterative } from './crossProductDecimalIterative.js'

/**
 * Independent BigInt decimal helpers for mathematical cross-checks in tests.
 */
function toExactDecimal(str) {
	const neg = str.startsWith('-')
	const clean = neg || str.startsWith('+') ? str.slice(1) : str
	const [intPart, fracPart = ''] = clean.split('.')
	const raw = BigInt(intPart + fracPart)
	return { value: neg ? -raw : raw, scale: fracPart.length }
}

function addExact(x, y) {
	const scale = Math.max(x.scale, y.scale)
	const xv = x.value * (10n ** BigInt(scale - x.scale))
	const yv = y.value * (10n ** BigInt(scale - y.scale))
	return { value: xv + yv, scale }
}

function subExact(x, y) {
	return addExact(x, { value: -y.value, scale: y.scale })
}

function mulExact(x, y) {
	return { value: x.value * y.value, scale: x.scale + y.scale }
}

function eqExact(x, y) {
	const scale = Math.max(x.scale, y.scale)
	const xv = x.value * (10n ** BigInt(scale - x.scale))
	const yv = y.value * (10n ** BigInt(scale - y.scale))
	return xv === yv
}

function dotExact(u, v) {
	let acc = { value: 0n, scale: 0 }
	for (let i = 0; i < 3; i++) {
		acc = addExact(acc, mulExact(toExactDecimal(u[i]), toExactDecimal(v[i])))
	}
	return acc
}

function normSqExact(u) {
	return dotExact(u, u)
}

function negateVec(u) {
	return u.map((s) => (s === '0' ? '0' : s.startsWith('-') ? s.slice(1) : `-${s}`))
}

describe('crossProductDecimalIterative', () => {
	describe('standard basis vectors', () => {
		const i = ['1', '0', '0']
		const j = ['0', '1', '0']
		const k = ['0', '0', '1']

		test('cyclic right-hand rule: i×j=k, j×k=i, k×i=j', () => {
			assert.deepEqual(crossProductDecimalIterative(i, j), ['0', '0', '1'])
			assert.deepEqual(crossProductDecimalIterative(j, k), ['1', '0', '0'])
			assert.deepEqual(crossProductDecimalIterative(k, i), ['0', '1', '0'])
		})

		test('anti-cyclic basis products: j×i=-k, k×j=-i, i×k=-j', () => {
			assert.deepEqual(crossProductDecimalIterative(j, i), ['0', '0', '-1'])
			assert.deepEqual(crossProductDecimalIterative(k, j), ['-1', '0', '0'])
			assert.deepEqual(crossProductDecimalIterative(i, k), ['0', '-1', '0'])
		})
	})

	describe('normal cases', () => {
		test('computes cross product of integer vectors', () => {
			assert.deepEqual(
				crossProductDecimalIterative(['1', '2', '3'], ['4', '5', '6']),
				['-3', '6', '-3'],
			)
			assert.deepEqual(
				crossProductDecimalIterative(['2', '3', '4'], ['5', '6', '7']),
				['-3', '6', '-3'],
			)
		})

		test('computes exact decimal cross product without IEEE 754 float drift', () => {
			// In JS floats, 0.2*0.6 - 0.3*0.5 = -0.030000000000000027
			assert.deepEqual(
				crossProductDecimalIterative(['0.1', '0.2', '0.3'], ['0.4', '0.5', '0.6']),
				['-0.03', '0.06', '-0.03'],
			)
		})

		test('handles negative numbers, explicit plus signs, leading/trailing zeros, and shorthand decimals', () => {
			assert.deepEqual(
				crossProductDecimalIterative(['-1.5', '+2.00', '.5'], ['4.', '-0.50', '-003.25']),
				['-6.25', '-2.875', '-7.25'],
			)
		})

		test('supports scientific notation inputs', () => {
			assert.deepEqual(
				crossProductDecimalIterative(['1e-3', '2e-3', '3e-3'], ['4e3', '5e3', '6e3']),
				['-3', '6', '-3'],
			)
			assert.deepEqual(
				crossProductDecimalIterative(['1.5E+2', '-2.5e-1', '0'], ['0', '4e-2', '1e-1']),
				['-0.025', '-15', '6'],
			)
		})
	})

	describe('edge cases: zero and parallel vectors', () => {
		test('zero vector yields [0, 0, 0] with no negative zero', () => {
			const zero = ['0', '0', '0']
			const v = ['-3.14', '2.71', '-1.41']
			assert.deepEqual(crossProductDecimalIterative(zero, v), ['0', '0', '0'])
			assert.deepEqual(crossProductDecimalIterative(v, zero), ['0', '0', '0'])
			assert.deepEqual(crossProductDecimalIterative(['-0.0', '-0', '+0.00'], v), ['0', '0', '0'])
		})

		test('parallel and anti-parallel vectors yield [0, 0, 0]', () => {
			const v = ['1.25', '-3.75', '5.5']
			const scaledPos = ['3.75', '-11.25', '16.5']
			const scaledNeg = ['-2.5', '7.5', '-11']
			assert.deepEqual(crossProductDecimalIterative(v, v), ['0', '0', '0'])
			assert.deepEqual(crossProductDecimalIterative(v, scaledPos), ['0', '0', '0'])
			assert.deepEqual(crossProductDecimalIterative(v, scaledNeg), ['0', '0', '0'])
		})
	})

	describe('precision and high-precision arithmetic', () => {
		test('rounds components using round-half-away-from-zero at configured precision', () => {
			// [1, 0, 0] × [0, 0.005, 0] = [0, 0, 0.005]
			assert.deepEqual(crossProductDecimalIterative(['1', '0', '0'], ['0', '0.005', '0'], 2), [
				'0',
				'0',
				'0.01',
			])
			// [0, 0.005, 0] × [1, 0, 0] = [0, 0, -0.005]
			assert.deepEqual(crossProductDecimalIterative(['0', '0.005', '0'], ['1', '0', '0'], 2), [
				'0',
				'0',
				'-0.01',
			])
			// [1, 0, 0] × [0, 0.0049, 0] = [0, 0, 0.0049] -> 0 at precision 2
			assert.deepEqual(crossProductDecimalIterative(['1', '0', '0'], ['0', '0.0049', '0'], 2), [
				'0',
				'0',
				'0',
			])
			// Tiny negative value rounds to canonical '0', never '-0'
			assert.deepEqual(crossProductDecimalIterative(['0', '0.0001', '0'], ['1', '0', '0'], 2), [
				'0',
				'0',
				'0',
			])
		})

		test('precision = 0 rounds results to integers', () => {
			assert.deepEqual(
				crossProductDecimalIterative(['1.5', '2.5', '3.5'], ['4.2', '5.3', '6.7'], 0),
				['-2', '5', '-3'],
			)
		})

		test('preserves arbitrary precision well beyond IEEE 754 limits (50+ decimal places)', () => {
			const a = [
				'0.0000000000000000000000001', // 1e-25
				'0',
				'0',
			]
			const b = [
				'0',
				'0.000000000000000000000000000001', // 1e-30
				'0',
			]
			// Product is 1e-55
			const expected = '0.' + '0'.repeat(54) + '1'
			assert.deepEqual(crossProductDecimalIterative(a, b, 60), ['0', '0', expected])
			// With default precision (20), 1e-55 rounds to '0'
			assert.deepEqual(crossProductDecimalIterative(a, b), ['0', '0', '0'])
		})

		test('avoids catastrophic cancellation with large integers beyond MAX_SAFE_INTEGER', () => {
			// a = [10^30 + 1, 10^30, 0], b = [10^30, 10^30 - 1, 0]
			// z = (10^30 + 1)(10^30 - 1) - (10^30)^2 = (10^60 - 1) - 10^60 = -1
			const ten30 = '1' + '0'.repeat(30)
			const ten30Plus1 = '1' + '0'.repeat(29) + '1'
			const ten30Minus1 = '9'.repeat(30)
			assert.deepEqual(
				crossProductDecimalIterative([ten30Plus1, ten30, '0'], [ten30, ten30Minus1, '0'], 0),
				['0', '0', '-1'],
			)
		})
	})

	describe('input validation', () => {
		test('rejects non-array vectors', () => {
			for (const bad of [null, undefined, '1,2,3', 123, { 0: '1', 1: '2', 2: '3' }]) {
				assert.throws(() => crossProductDecimalIterative(bad, ['1', '0', '0']), TypeError)
				assert.throws(() => crossProductDecimalIterative(['1', '0', '0'], bad), TypeError)
			}
		})

		test('rejects non-3D vectors', () => {
			for (const bad of [[], ['1'], ['1', '2'], ['1', '2', '3', '4']]) {
				assert.throws(() => crossProductDecimalIterative(bad, ['1', '0', '0']), RangeError)
				assert.throws(() => crossProductDecimalIterative(['1', '0', '0'], bad), RangeError)
			}
		})

		test('rejects non-string vector components', () => {
			assert.throws(() => crossProductDecimalIterative([1, '2', '3'], ['4', '5', '6']), TypeError)
			assert.throws(
				() => crossProductDecimalIterative(['1', '2', '3'], ['4', null, '6']),
				TypeError,
			)
			assert.throws(
				() => crossProductDecimalIterative(['1', undefined, '3'], ['4', '5', '6']),
				TypeError,
			)
			assert.throws(() => crossProductDecimalIterative(['1', '2', 3n], ['4', '5', '6']), TypeError)
		})

		test('rejects malformed decimal strings', () => {
			const invalidStrings = [
				'',
				'   ',
				'abc',
				'.',
				'+',
				'-',
				'1.2.3',
				'NaN',
				'Infinity',
				'-Infinity',
				'1e',
				'1e+',
				'1e2.5',
				' 1.5',
				'1.5 ',
				'1_000',
			]
			for (const s of invalidStrings) {
				assert.throws(
					() => crossProductDecimalIterative([s, '0', '0'], ['1', '0', '0']),
					RangeError,
					`Expected "${s}" to be rejected`,
				)
			}
		})

		test('rejects invalid precision arguments', () => {
			for (const badType of ['10', null, {}, true, 10n]) {
				assert.throws(
					() => crossProductDecimalIterative(['1', '0', '0'], ['0', '1', '0'], badType),
					TypeError,
				)
			}
			for (const badRange of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(
					() => crossProductDecimalIterative(['1', '0', '0'], ['0', '1', '0'], badRange),
					RangeError,
				)
			}
		})
	})

	describe('independent mathematical cross-checks', () => {
		const vectors = [
			[
				['3.14159265358979323846', '-2.71828182845904523536', '1.6180339887498948482'],
				['-0.57721566490153286061', '1.4142135623730950488', '-2.2360679774997896964'],
			],
			[
				['123456789012345.6789012345', '-98765432109876.54321', '0.000000123456789'],
				['-0.9876543210987654321', '424242424242.424242', '999999999999999.999999'],
			],
			[
				['-7.25', '0.125', '19.875'],
				['3.5', '-11.75', '2.0625'],
			],
		]

		test('orthogonality: a · (a × b) = 0 and b · (a × b) = 0', () => {
			for (const [a, b] of vectors) {
				const c = crossProductDecimalIterative(a, b, 100)
				assert.equal(eqExact(dotExact(a, c), { value: 0n, scale: 0 }), true)
				assert.equal(eqExact(dotExact(b, c), { value: 0n, scale: 0 }), true)
			}
		})

		test('anti-commutativity: a × b = -(b × a)', () => {
			for (const [a, b] of vectors) {
				const ab = crossProductDecimalIterative(a, b, 100)
				const ba = crossProductDecimalIterative(b, a, 100)
				assert.deepEqual(ab, negateVec(ba))
			}
		})

		test("Lagrange's identity: ‖a × b‖² = ‖a‖² ‖b‖² - (a · b)²", () => {
			for (const [a, b] of vectors) {
				const c = crossProductDecimalIterative(a, b, 100)
				const lhs = normSqExact(c)
				const rhs = subExact(mulExact(normSqExact(a), normSqExact(b)), mulExact(dotExact(a, b), dotExact(a, b)))
				assert.equal(eqExact(lhs, rhs), true)
			}
		})

		test('Jacobi identity: a × (b × c) + b × (c × a) + c × (a × b) = [0, 0, 0]', () => {
			const a = ['1.25', '-3.5', '2.75']
			const b = ['-4.125', '0.5', '-6.25']
			const c = ['2.5', '7.75', '-1.125']

			const t1 = crossProductDecimalIterative(a, crossProductDecimalIterative(b, c, 50), 50)
			const t2 = crossProductDecimalIterative(b, crossProductDecimalIterative(c, a, 50), 50)
			const t3 = crossProductDecimalIterative(c, crossProductDecimalIterative(a, b, 50), 50)

			for (let idx = 0; idx < 3; idx++) {
				const sum = addExact(
					addExact(toExactDecimal(t1[idx]), toExactDecimal(t2[idx])),
					toExactDecimal(t3[idx]),
				)
				assert.equal(eqExact(sum, { value: 0n, scale: 0 }), true)
			}
		})
	})
})
