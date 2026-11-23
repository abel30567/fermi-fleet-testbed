import { test, describe } from 'node:test'
import assert from 'node:assert'
import { tensorProductDecimalSeries } from './tensorProductDecimalSeries.js'

/**
 * Independent BigInt exact rational helper for cross-checking algebraic identities.
 * Represents a decimal string as exact `num * 10^(-scale)` normalized to a common scale.
 */
function parseExactDecimal(str) {
	const negative = str.startsWith('-')
	const unsigned = negative || str.startsWith('+') ? str.slice(1) : str
	const [intPart, fracPart = ''] = unsigned.split('.')
	const digits = intPart + fracPart
	const coeff = (negative ? -1n : 1n) * BigInt(digits)
	return { coeff, scale: fracPart.length }
}

function addExact(x, y) {
	if (x.scale === y.scale) {
		return { coeff: x.coeff + y.coeff, scale: x.scale }
	}
	if (x.scale > y.scale) {
		return { coeff: x.coeff + y.coeff * 10n ** BigInt(x.scale - y.scale), scale: x.scale }
	}
	return { coeff: x.coeff * 10n ** BigInt(y.scale - x.scale) + y.coeff, scale: y.scale }
}

function mulExact(x, y) {
	return { coeff: x.coeff * y.coeff, scale: x.scale + y.scale }
}

function equalsExact(x, y) {
	const maxScale = Math.max(x.scale, y.scale)
	const xc = x.coeff * 10n ** BigInt(maxScale - x.scale)
	const yc = y.coeff * 10n ** BigInt(maxScale - y.scale)
	return xc === yc
}

function sumTensorExact(tensor) {
	if (typeof tensor === 'string') {
		return parseExactDecimal(tensor)
	}
	let acc = { coeff: 0n, scale: 0 }
	for (const item of tensor) {
		acc = addExact(acc, sumTensorExact(item))
	}
	return acc
}

function sumSquaresTensorExact(tensor) {
	if (typeof tensor === 'string') {
		const v = parseExactDecimal(tensor)
		return mulExact(v, v)
	}
	let acc = { coeff: 0n, scale: 0 }
	for (const item of tensor) {
		acc = addExact(acc, sumSquaresTensorExact(item))
	}
	return acc
}

function addTensorsExact(a, b) {
	if (typeof a === 'string' && typeof b === 'string') {
		const sum = addExact(parseExactDecimal(a), parseExactDecimal(b))
		if (sum.coeff === 0n) return '0'
		const neg = sum.coeff < 0n
		const abs = neg ? -sum.coeff : sum.coeff
		const s = abs.toString()
		if (sum.scale === 0) return (neg ? '-' : '') + s
		const padded = s.length <= sum.scale ? '0'.repeat(sum.scale - s.length + 1) + s : s
		const split = padded.length - sum.scale
		const intPart = padded.slice(0, split)
		const fracPart = padded.slice(split).replace(/0+$/, '')
		return (neg ? '-' : '') + (fracPart ? `${intPart}.${fracPart}` : intPart)
	}
	return a.map((item, idx) => addTensorsExact(item, b[idx]))
}

describe('tensorProductDecimalSeries', () => {
	describe('normal cases', () => {
		test('rank-0 scalar tensor products avoid IEEE-754 floating-point drift', () => {
			assert.strictEqual(tensorProductDecimalSeries('0.1', '0.2'), '0.02')
			assert.strictEqual(tensorProductDecimalSeries('-1.5', '2.5'), '-3.75')
			assert.strictEqual(tensorProductDecimalSeries('12345678901234567890', '2'), '24691357802469135780')
		})

		test('rank-1 vector outer product', () => {
			const result = tensorProductDecimalSeries(['0.1', '-0.2', '3'], ['0.3', '0.4'])
			assert.deepStrictEqual(result, [
				['0.03', '0.04'],
				['-0.06', '-0.08'],
				['0.9', '1.2'],
			])
		})

		test('rank-2 matrix tensor product produces rank-4 tensor', () => {
			const a = [
				['1', '2'],
				['3', '4'],
			]
			const b = [
				['0.5', '-1'],
				['2', '0.25'],
			]
			const result = tensorProductDecimalSeries(a, b)
			assert.deepStrictEqual(result, [
				[
					[
						['0.5', '-1'],
						['2', '0.25'],
					],
					[
						['1', '-2'],
						['4', '0.5'],
					],
				],
				[
					[
						['1.5', '-3'],
						['6', '0.75'],
					],
					[
						['2', '-4'],
						['8', '1'],
					],
				],
			])
		})

		test('mixed-rank tensors (scalar x vector, vector x matrix, matrix x vector)', () => {
			assert.deepStrictEqual(tensorProductDecimalSeries('2.5', ['1', '-2', '0.4']), ['2.5', '-5', '1'])
			assert.deepStrictEqual(tensorProductDecimalSeries(['1', '-2'], '0.5'), ['0.5', '-1'])
			assert.deepStrictEqual(
				tensorProductDecimalSeries(['2', '-1'], [['1.5', '0.25']]),
				[
					[['3', '0.5']],
					[['-1.5', '-0.25']],
				]
			)
			assert.deepStrictEqual(
				tensorProductDecimalSeries([['2'], ['3']], ['0.5', '1.5']),
				[
					[['1', '3']],
					[['1.5', '4.5']],
				]
			)
		})

		test('high-precision arbitrary-precision decimals beyond IEEE-754 double precision', () => {
			const a = ['0.12345678901234567890123456789']
			const b = ['0.98765432109876543210987654321']
			// Exact product of 12345678901234567890123456789n * 98765432109876543210987654321n
			const expected =
				'0.1219326311370217952261850327336229233322374638011112635269'
			assert.deepStrictEqual(tensorProductDecimalSeries(a, b, 60), [[expected]])
			// Rounded to 20 decimal places
			assert.deepStrictEqual(tensorProductDecimalSeries(a, b, 20), [['0.12193263113702179523']])
			// Default precision is 20
			assert.deepStrictEqual(tensorProductDecimalSeries(a, b), [['0.12193263113702179523']])
		})

		test('scientific notation and optional decimal forms', () => {
			assert.deepStrictEqual(
				tensorProductDecimalSeries(['1.25e-20', '.5', '5.', '+3.0'], ['8e20', '2E-2']),
				[
					['10', '0.00000000000000000000025'],
					['400000000000000000000', '0.01'],
					['4000000000000000000000', '0.1'],
					['2400000000000000000000', '0.06'],
				].map((row) =>
					row.map((v) =>
						v === '0.00000000000000000000025' ? '0' : v
					)
				)
			)
			// With enough precision, 1.25e-20 * 2e-2 = 2.5e-22 is preserved exactly
			assert.strictEqual(
				tensorProductDecimalSeries('1.25e-20', '2E-2', 25),
				'0.00000000000000000000025'
			)
		})

		test('configurable precision with round-half-to-even (banker rounding)', () => {
			assert.strictEqual(tensorProductDecimalSeries('0.5', '1', 0), '0')
			assert.strictEqual(tensorProductDecimalSeries('1.5', '1', 0), '2')
			assert.strictEqual(tensorProductDecimalSeries('2.5', '1', 0), '2')
			assert.strictEqual(tensorProductDecimalSeries('3.5', '1', 0), '4')
			assert.strictEqual(tensorProductDecimalSeries('-2.5', '1', 0), '-2')
			assert.strictEqual(tensorProductDecimalSeries('-3.5', '1', 0), '-4')
			assert.strictEqual(tensorProductDecimalSeries('0.005', '1', 2), '0')
			assert.strictEqual(tensorProductDecimalSeries('0.015', '1', 2), '0.02')
			assert.strictEqual(tensorProductDecimalSeries('0.025', '1', 2), '0.02')
			assert.strictEqual(tensorProductDecimalSeries('0.999', '1', 2), '1')
			assert.strictEqual(tensorProductDecimalSeries('0.50000000000000000001', '1', 0), '1')
		})
	})

	describe('edge cases', () => {
		test('normalizes signed zeros and underflow to canonical "0"', () => {
			assert.strictEqual(tensorProductDecimalSeries('-0', '5'), '0')
			assert.strictEqual(tensorProductDecimalSeries('5', '-0.000'), '0')
			assert.strictEqual(tensorProductDecimalSeries('-0e-50', '+0.0e50'), '0')
			assert.strictEqual(tensorProductDecimalSeries('-1e-30', '1e-30', 10), '0')
		})

		test('very large positive exponents format without loss of precision', () => {
			const res = tensorProductDecimalSeries('1e40', '2.5e30', 0)
			assert.strictEqual(res, '25' + '0'.repeat(69))
		})

		test('empty rectangular tensors preserve tensor product shapes', () => {
			assert.deepStrictEqual(tensorProductDecimalSeries([], ['1', '2']), [])
			assert.deepStrictEqual(tensorProductDecimalSeries(['1', '2'], []), [[], []])
			assert.deepStrictEqual(tensorProductDecimalSeries([], []), [])
			assert.deepStrictEqual(tensorProductDecimalSeries([[], []], ['1', '2']), [[], []])
		})

		test('does not mutate input arrays', () => {
			const a = ['1.1', '2.2']
			const b = [['3.3'], ['4.4']]
			const aCopy = structuredClone(a)
			const bCopy = structuredClone(b)
			tensorProductDecimalSeries(a, b, 5)
			assert.deepStrictEqual(a, aCopy)
			assert.deepStrictEqual(b, bCopy)
		})
	})

	describe('invalid inputs', () => {
		test('rejects non-string/non-array operands and elements', () => {
			for (const bad of [null, undefined, 42, true, {}, 10n, () => {}]) {
				assert.throws(() => tensorProductDecimalSeries(bad, '1'), TypeError)
				assert.throws(() => tensorProductDecimalSeries('1', bad), TypeError)
				assert.throws(() => tensorProductDecimalSeries(['1', bad], ['1']), TypeError)
			}
		})

		test('rejects malformed decimal strings', () => {
			const malformed = [
				'',
				'   ',
				' 1.0',
				'1.0 ',
				'.',
				'+',
				'-',
				'NaN',
				'Infinity',
				'-Infinity',
				'abc',
				'1.2.3',
				'1e',
				'1e+',
				'1e-',
				'0x10',
				'1_000',
			]
			for (const str of malformed) {
				assert.throws(() => tensorProductDecimalSeries(str, '1'), RangeError)
				assert.throws(() => tensorProductDecimalSeries(['1'], [str]), RangeError)
			}
		})

		test('validates both operands even when one operand is empty', () => {
			assert.throws(() => tensorProductDecimalSeries([], ['invalid']), RangeError)
			assert.throws(() => tensorProductDecimalSeries(['invalid'], []), RangeError)
			assert.throws(() => tensorProductDecimalSeries([], [123]), TypeError)
		})

		test('rejects ragged tensors, mixed-depth arrays, sparse arrays, and circular references', () => {
			assert.throws(() => tensorProductDecimalSeries([['1', '2'], ['3']], ['1']), RangeError)
			assert.throws(() => tensorProductDecimalSeries(['1', ['2']], ['1']), RangeError)
			assert.throws(() => tensorProductDecimalSeries([[], ['1']], ['1']), RangeError)

			// Sparse array
			const sparse = new Array(2)
			sparse[0] = '1'
			assert.throws(() => tensorProductDecimalSeries(sparse, ['1']), TypeError)

			// Circular reference
			const circular = []
			circular.push(circular)
			assert.throws(() => tensorProductDecimalSeries(circular, ['1']), TypeError)
		})

		test('rejects invalid precision values and extreme exponents', () => {
			assert.throws(() => tensorProductDecimalSeries('1', '1', '10'), TypeError)
			assert.throws(() => tensorProductDecimalSeries('1', '1', null), TypeError)
			assert.throws(() => tensorProductDecimalSeries('1', '1', -1), RangeError)
			assert.throws(() => tensorProductDecimalSeries('1', '1', 1.5), RangeError)
			assert.throws(() => tensorProductDecimalSeries('1', '1', Number.NaN), RangeError)
			assert.throws(() => tensorProductDecimalSeries('1', '1', Number.POSITIVE_INFINITY), RangeError)
			assert.throws(() => tensorProductDecimalSeries('1', '1', 1_000_000), RangeError)
			assert.throws(() => tensorProductDecimalSeries('1e1000000', '1', 10), RangeError)
		})
	})

	describe('independent mathematical cross-checks', () => {
		test('geometric series identity: sum(u ⊗ v) = ((1 - r^m)/(1 - r)) * ((1 - s^n)/(1 - s))', () => {
			// u_i = (0.5)^i for i = 0..7, v_j = (0.25)^j for j = 0..5
			const u = ['1', '0.5', '0.25', '0.125', '0.0625', '0.03125', '0.015625', '0.0078125']
			const v = ['1', '0.25', '0.0625', '0.015625', '0.00390625', '0.0009765625']
			const tp = tensorProductDecimalSeries(u, v, 30)

			// Closed-form sum of u: (1 - 2^-8) / (1 - 2^-1) = 2 * (1 - 1/256) = 255 / 128 = 1.9921875
			// Closed-form sum of v: (1 - 4^-6) / (1 - 4^-1) = (4/3) * (4095/4096) = 1365 / 1024 = 1.3330078125
			const closedFormProduct = mulExact(
				parseExactDecimal('1.9921875'),
				parseExactDecimal('1.3330078125')
			)
			const tensorSum = sumTensorExact(tp)
			assert.ok(equalsExact(tensorSum, closedFormProduct))
		})

		test('distributive sum and Frobenius norm squared identities', () => {
			const a = [
				['1.125', '-2.375', '0.0625'],
				['4.5', '0.125', '-3.25'],
			]
			const b = [
				['0.875', '1.5'],
				['-0.25', '2.125'],
			]
			const tp = tensorProductDecimalSeries(a, b, 20)

			// sum(A ⊗ B) === sum(A) * sum(B)
			assert.ok(equalsExact(sumTensorExact(tp), mulExact(sumTensorExact(a), sumTensorExact(b))))

			// ||A ⊗ B||_F^2 === ||A||_F^2 * ||B||_F^2
			assert.ok(
				equalsExact(
					sumSquaresTensorExact(tp),
					mulExact(sumSquaresTensorExact(a), sumSquaresTensorExact(b))
				)
			)
		})

		test('associativity (A ⊗ B) ⊗ C === A ⊗ (B ⊗ C) and bilinearity (A + B) ⊗ C === (A ⊗ C) + (B ⊗ C)', () => {
			const a = ['1.23456789', '-0.98765432']
			const b = ['0.11111111', '2.22222222']
			const c = [
				['3.5', '-1.25'],
				['0.75', '4.125'],
			]

			const leftAssoc = tensorProductDecimalSeries(tensorProductDecimalSeries(a, b, 30), c, 30)
			const rightAssoc = tensorProductDecimalSeries(a, tensorProductDecimalSeries(b, c, 30), 30)
			assert.deepStrictEqual(leftAssoc, rightAssoc)

			const sumAB = addTensorsExact(a, b)
			const leftDist = tensorProductDecimalSeries(sumAB, c, 30)
			const rightDist = addTensorsExact(
				tensorProductDecimalSeries(a, c, 30),
				tensorProductDecimalSeries(b, c, 30)
			)
			assert.deepStrictEqual(leftDist, rightDist)
		})

		test('Kronecker trace identity: sum_{i,k} (A ⊗ B)[i][i][k][k] === tr(A) * tr(B)', () => {
			const a = [
				['1.23456789012345', '9.87654321'],
				['-4.5', '2.76543210987655'],
			]
			const b = [
				['3.1415926535', '0.5'],
				['-1.5', '-0.1415926535'],
			]
			const tp = tensorProductDecimalSeries(a, b, 30)

			let kronTrace = { coeff: 0n, scale: 0 }
			for (let i = 0; i < a.length; i++) {
				for (let k = 0; k < b.length; k++) {
					kronTrace = addExact(kronTrace, parseExactDecimal(tp[i][i][k][k]))
				}
			}

			// tr(A) = 1.23456789012345 + 2.76543210987655 = 4
			// tr(B) = 3.1415926535 + (-0.1415926535) = 3
			// tr(A) * tr(B) = 12
			assert.ok(equalsExact(kronTrace, parseExactDecimal('12')))
		})
	})
})
