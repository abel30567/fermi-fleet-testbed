import { describe, test } from 'node:test'
import assert from 'node:assert'
import { crossProductDecimalRecursive } from './crossProductDecimalRecursive.js'

/**
 * Exact arbitrary-precision decimal helpers for independent algebraic
 * cross-checks (anticommutativity, orthogonality, Lagrange's identity).
 */
function parseExact(str) {
	const negative = str.startsWith('-')
	const body = str.replace(/^[+-]/, '')
	const dot = body.indexOf('.')
	if (dot === -1) {
		const n = BigInt(body)
		return { unscaled: negative ? -n : n, scale: 0 }
	}
	const digits = body.slice(0, dot) + body.slice(dot + 1)
	const n = BigInt(digits)
	return { unscaled: negative ? -n : n, scale: body.length - dot - 1 }
}

function addExact(a, b) {
	if (a.scale === b.scale) {
		return { unscaled: a.unscaled + b.unscaled, scale: a.scale }
	}
	if (a.scale > b.scale) {
		const f = 10n ** BigInt(a.scale - b.scale)
		return { unscaled: a.unscaled + b.unscaled * f, scale: a.scale }
	}
	const f = 10n ** BigInt(b.scale - a.scale)
	return { unscaled: a.unscaled * f + b.unscaled, scale: b.scale }
}

function subExact(a, b) {
	return addExact(a, { unscaled: -b.unscaled, scale: b.scale })
}

function mulExact(a, b) {
	return { unscaled: a.unscaled * b.unscaled, scale: a.scale + b.scale }
}

function equalsExact(a, b) {
	return subExact(a, b).unscaled === 0n
}

function dotExact(u, v) {
	return u.reduce(
		(acc, _, i) => addExact(acc, mulExact(parseExact(u[i]), parseExact(v[i]))),
		{ unscaled: 0n, scale: 0 },
	)
}

function normSqExact(u) {
	return dotExact(u, u)
}

function negateVec(v) {
	return v.map((s) => (s === '0' ? '0' : s.startsWith('-') ? s.slice(1) : `-${s}`))
}

describe('crossProductDecimalRecursive', () => {
	test('standard basis vectors (right-hand rule)', () => {
		const i = ['1', '0', '0']
		const j = ['0', '1', '0']
		const k = ['0', '0', '1']

		assert.deepStrictEqual(crossProductDecimalRecursive(i, j), ['0', '0', '1'])
		assert.deepStrictEqual(crossProductDecimalRecursive(j, k), ['1', '0', '0'])
		assert.deepStrictEqual(crossProductDecimalRecursive(k, i), ['0', '1', '0'])

		assert.deepStrictEqual(crossProductDecimalRecursive(j, i), ['0', '0', '-1'])
		assert.deepStrictEqual(crossProductDecimalRecursive(k, j), ['-1', '0', '0'])
		assert.deepStrictEqual(crossProductDecimalRecursive(i, k), ['0', '-1', '0'])
	})

	test('parallel and antiparallel vectors yield zero vector', () => {
		assert.deepStrictEqual(
			crossProductDecimalRecursive(['2', '4', '6'], ['1', '2', '3']),
			['0', '0', '0'],
		)
		assert.deepStrictEqual(
			crossProductDecimalRecursive(
				['1.25', '-2.5', '3.75'],
				['-3.75', '7.5', '-11.25'],
			),
			['0', '0', '0'],
		)
		assert.deepStrictEqual(
			crossProductDecimalRecursive(['0', '0', '0'], ['99.99', '-42.1', '0.001']),
			['0', '0', '0'],
		)
		const selfVec = ['12345678901234567890.123456789', '-98765432109876543210.987654321', '55555555555555555555.5']
		assert.deepStrictEqual(
			crossProductDecimalRecursive(selfVec, selfVec, 40),
			['0', '0', '0'],
		)
	})

	test('negative components and signed/leading-dot decimal strings', () => {
		assert.deepStrictEqual(
			crossProductDecimalRecursive(['-3', '4', '-5'], ['2', '-1', '6']),
			['19', '8', '-5'],
		)
		assert.deepStrictEqual(
			crossProductDecimalRecursive(['-.5', '+.25', '-0.125'], ['+2', '-4', '+8']),
			['1.5', '3.75', '1.5'],
		)
		assert.deepStrictEqual(
			crossProductDecimalRecursive(['-0', '+0.000', '-1.0'], ['0', '2.50', '-0.0']),
			['2.5', '0', '0'],
		)
	})

	test('high-precision (>30 digits) exact multiplication via Karatsuba', () => {
		const a = [
			'123456789012345678901234567890123456.789012345678901234567890123456789',
			'0',
			'0',
		]
		const b = [
			'0',
			'987654321098765432109876543210987654.321098765432109876543210987654321',
			'0',
		]

		const expectedZ =
			'121932631137021795226185032733866788594511507391563633592367611644557861.606461673677792956119493974487120865336229233322374638011112635269'
		const actual = crossProductDecimalRecursive(a, b, 100)
		assert.deepStrictEqual(actual, ['0', '0', expectedZ])
		// Verify more than 30 digits both before and after decimal point
		const [intPart, fracPart] = actual[2].split('.')
		assert.ok(intPart.length > 30)
		assert.ok(fracPart.length > 30)
	})

	test('high-precision (>30 fractional digits) general 3D vectors', () => {
		const a = [
			'0.12345678901234567890123456789012345',
			'0.98765432109876543210987654321098765',
			'-0.55555555555555555555555555555555555',
		]
		const b = [
			'-0.11111111111111111111111111111111111',
			'0.22222222222222222222222222222222222',
			'0.33333333333333333333333333333333333',
		]

		// 35 fractional digits * 35 fractional digits => up to 70 fractional digits exact
		const result = crossProductDecimalRecursive(a, b, 70)
		for (let idx = 0; idx < 3; idx++) {
			const j = (idx + 1) % 3
			const k = (idx + 2) % 3
			const expected = subExact(
				mulExact(parseExact(a[j]), parseExact(b[k])),
				mulExact(parseExact(a[k]), parseExact(b[j])),
			)
			assert.ok(equalsExact(parseExact(result[idx]), expected))
			const frac = result[idx].split('.')[1] ?? ''
			assert.ok(frac.length > 30, `component ${idx} should have >30 fractional digits`)
		}
	})

	test('configurable precision rounding and negative-zero normalization', () => {
		const a = ['0.123456789', '0', '0']
		const b = ['0', '0.987654321', '0']
		// Exact product = 0.121932631112635269

		assert.deepStrictEqual(crossProductDecimalRecursive(a, b, 18), [
			'0',
			'0',
			'0.121932631112635269',
		])
		assert.deepStrictEqual(crossProductDecimalRecursive(a, b, 6), ['0', '0', '0.121933'])
		assert.deepStrictEqual(crossProductDecimalRecursive(a, b, 2), ['0', '0', '0.12'])
		assert.deepStrictEqual(crossProductDecimalRecursive(a, b, 0), ['0', '0', '0'])

		// Half-away-from-zero tie breaking (positive & negative)
		assert.deepStrictEqual(
			crossProductDecimalRecursive(['0.5', '0', '0'], ['0', '1', '0'], 0),
			['0', '0', '1'],
		)
		assert.deepStrictEqual(
			crossProductDecimalRecursive(['-0.5', '0', '0'], ['0', '1', '0'], 0),
			['0', '0', '-1'],
		)

		// Tiny negative value rounded to 0 must normalize to "0", never "-0"
		assert.deepStrictEqual(
			crossProductDecimalRecursive(['0.00001', '0', '0'], ['0', '-0.00001', '0'], 4),
			['0', '0', '0'],
		)
	})

	test('cross-checks: anticommutativity, orthogonality, and Lagrange identity', () => {
		const testPairs = [
			[
				['3.5', '-7.25', '11.125'],
				['-2.75', '5.5', '-8.0625'],
				20,
			],
			[
				[
					'123456789012345678901234567890.12345678901234567890123456789012345',
					'-987654321098765432109876543210.98765432109876543210987654321098765',
					'314159265358979323846264338327.95028841971693993751058209749445923',
				],
				[
					'271828182845904523536028747135.26624977572470936999595749669676277',
					'161803398874989484820458683436.56381177203091798057628621354486227',
					'-141421356237309504880168872420.96980785696718753769480731766797379',
				],
				80,
			],
		]

		for (const [a, b, precision] of testPairs) {
			const axb = crossProductDecimalRecursive(a, b, precision)
			const bxa = crossProductDecimalRecursive(b, a, precision)

			// 1. Anticommutativity: a x b == -(b x a)
			assert.deepStrictEqual(axb, negateVec(bxa))

			// 2. Orthogonality: (a x b) . a == 0 and (a x b) . b == 0
			assert.strictEqual(dotExact(axb, a).unscaled, 0n)
			assert.strictEqual(dotExact(axb, b).unscaled, 0n)

			// 3. Lagrange's identity: |a x b|^2 == |a|^2 * |b|^2 - (a . b)^2
			const lhs = normSqExact(axb)
			const abDot = dotExact(a, b)
			const rhs = subExact(mulExact(normSqExact(a), normSqExact(b)), mulExact(abDot, abDot))
			assert.ok(equalsExact(lhs, rhs), "Lagrange's identity failed")
		}
	})

	test('invalid inputs throw descriptive TypeError or RangeError', () => {
		// Non-array vectors
		assert.throws(() => crossProductDecimalRecursive(null, ['1', '2', '3']), TypeError)
		assert.throws(() => crossProductDecimalRecursive(['1', '2', '3'], undefined), TypeError)
		assert.throws(() => crossProductDecimalRecursive('123', ['1', '2', '3']), TypeError)
		assert.throws(() => crossProductDecimalRecursive({ 0: '1', 1: '2', 2: '3' }, ['1', '2', '3']), TypeError)

		// Wrong vector length
		assert.throws(() => crossProductDecimalRecursive([], ['1', '2', '3']), RangeError)
		assert.throws(() => crossProductDecimalRecursive(['1', '2'], ['1', '2', '3']), RangeError)
		assert.throws(() => crossProductDecimalRecursive(['1', '2', '3'], ['1', '2', '3', '4']), RangeError)

		// Non-string elements (including sparse array holes)
		assert.throws(() => crossProductDecimalRecursive([1, '2', '3'], ['1', '2', '3']), TypeError)
		assert.throws(() => crossProductDecimalRecursive(['1', null, '3'], ['1', '2', '3']), TypeError)
		assert.throws(() => crossProductDecimalRecursive(['1', '2', 3n], ['1', '2', '3']), TypeError)
		// eslint-disable-next-line no-sparse-arrays
		assert.throws(() => crossProductDecimalRecursive(['1', , '3'], ['1', '2', '3']), TypeError)

		// Malformed decimal strings
		const badStrings = ['', ' ', 'abc', 'NaN', 'Infinity', '-Infinity', '1.2.3', '1.', '.', '+', '-', '1e5', ' 1', '1 ', '1_000']
		for (const bad of badStrings) {
			assert.throws(
				() => crossProductDecimalRecursive([bad, '0', '0'], ['0', '1', '0']),
				RangeError,
				`Expected RangeError for "${bad}"`,
			)
		}

		// Invalid precision values
		assert.throws(() => crossProductDecimalRecursive(['1', '0', '0'], ['0', '1', '0'], '20'), TypeError)
		assert.throws(() => crossProductDecimalRecursive(['1', '0', '0'], ['0', '1', '0'], null), TypeError)
		assert.throws(() => crossProductDecimalRecursive(['1', '0', '0'], ['0', '1', '0'], 20n), TypeError)
		assert.throws(() => crossProductDecimalRecursive(['1', '0', '0'], ['0', '1', '0'], -1), RangeError)
		assert.throws(() => crossProductDecimalRecursive(['1', '0', '0'], ['0', '1', '0'], 2.5), RangeError)
		assert.throws(() => crossProductDecimalRecursive(['1', '0', '0'], ['0', '1', '0'], NaN), RangeError)
		assert.throws(() => crossProductDecimalRecursive(['1', '0', '0'], ['0', '1', '0'], Infinity), RangeError)
	})
})
