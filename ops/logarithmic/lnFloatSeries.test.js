import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { lnFloatSeries } from './lnFloatSeries.js'

const f64Buf = new Float64Array(1)
const i64Buf = new BigInt64Array(f64Buf.buffer)

/**
 * Computes the ULP (units in the last place) distance between two finite float64 values.
 */
function ulpDistance(a, b) {
	if (Object.is(a, b) || (a === 0 && b === 0)) {
		return 0n
	}
	f64Buf[0] = a
	let ia = i64Buf[0]
	if (ia < 0n) ia = (1n << 63n) - ia - 1n

	f64Buf[0] = b
	let ib = i64Buf[0]
	if (ib < 0n) ib = (1n << 63n) - ib - 1n

	return ia >= ib ? ia - ib : ib - ia
}

function assertCloseToMathLog(x, maxUlp = 2n) {
	const actual = lnFloatSeries(x)
	const expected = Math.log(x)
	const ulps = ulpDistance(actual, expected)
	assert.ok(
		ulps <= maxUlp,
		`lnFloatSeries(${x}) = ${actual}, Math.log(${x}) = ${expected} (ULP diff = ${ulps} > ${maxUlp})`,
	)
}

describe('lnFloatSeries', () => {
	test('exact and fundamental mathematical values', () => {
		assert.equal(lnFloatSeries(1), 0)
		assert.ok(Object.is(lnFloatSeries(1), 0), 'ln(1) should be +0')

		assertCloseToMathLog(Math.E)
		assert.ok(Math.abs(lnFloatSeries(Math.E) - 1) <= Number.EPSILON)

		assertCloseToMathLog(Math.E ** 2)
		assert.ok(Math.abs(lnFloatSeries(Math.E ** 2) - 2) <= 2 * Number.EPSILON)

		assertCloseToMathLog(1 / Math.E)
		assert.ok(Math.abs(lnFloatSeries(1 / Math.E) + 1) <= Number.EPSILON)

		// Exact powers of 2
		for (const exp of [-1022, -500, -53, -10, -2, -1, 1, 2, 10, 53, 500, 1023]) {
			assertCloseToMathLog(2 ** exp)
		}
	})

	test('normal positive float64 values match Math.log within 2 ULP', () => {
		const values = [
			0.0001,
			0.01,
			0.1,
			0.25,
			0.5,
			Math.SQRT1_2,
			0.75,
			0.9,
			1.1,
			Math.SQRT2,
			1.5,
			2,
			Math.PI,
			3,
			5,
			10,
			42.123456789,
			100,
			1e6,
			1e12,
			1e100,
			1e-6,
			1e-12,
			1e-100,
		]
		for (const x of values) {
			assertCloseToMathLog(x)
		}
	})

	test('values very close to 1 maintain high relative accuracy', () => {
		const deltas = [
			1e-1,
			1e-3,
			1e-6,
			1e-9,
			1e-12,
			1e-15,
			Number.EPSILON,
			Number.EPSILON * 2,
			Number.EPSILON * 7,
			-Number.EPSILON / 2,
			-Number.EPSILON,
			-1e-15,
			-1e-12,
			-1e-9,
			-1e-6,
			-1e-3,
			-1e-1,
		]
		for (const d of deltas) {
			const x = 1 + d
			assertCloseToMathLog(x)
		}
	})

	test('values near range-reduction boundaries sqrt(1/2) and sqrt(2)', () => {
		const boundaries = [
			Math.SQRT1_2 * (1 - Number.EPSILON),
			Math.SQRT1_2,
			Math.SQRT1_2 * (1 + Number.EPSILON),
			Math.SQRT2 * (1 - Number.EPSILON),
			Math.SQRT2,
			Math.SQRT2 * (1 + Number.EPSILON),
			2 * (1 - Number.EPSILON),
			2,
			2 * (1 + Number.EPSILON),
		]
		for (const x of boundaries) {
			assertCloseToMathLog(x)
		}
	})

	test('very large, very small, and IEEE-754 subnormal positive floats', () => {
		const extremes = [
			Number.MAX_VALUE,
			Number.MAX_VALUE / 2,
			Number.MAX_VALUE * 0.75,
			1e308,
			2 ** -1022, // smallest normal float64
			2 ** -1022 * (1 - Number.EPSILON / 2), // largest subnormal float64
			2 ** -1023,
			2 ** -1050,
			2 ** -1073,
			Number.MIN_VALUE, // 2^-1074, smallest positive subnormal float64
			Number.MIN_VALUE * 2,
			Number.MIN_VALUE * 3,
			Number.MIN_VALUE * 17,
			Number.MIN_VALUE * 1024,
			1e-308,
			1e-315,
			1e-320,
			1e-323,
		]
		for (const x of extremes) {
			assertCloseToMathLog(x)
		}
	})

	test('inverse identity: Math.exp(lnFloatSeries(x)) ≈ x', () => {
		const samples = [
			1e-200,
			1e-50,
			1e-10,
			0.123456789,
			0.9999999,
			1,
			1.0000001,
			Math.E,
			Math.PI,
			12345.6789,
			1e50,
			1e200,
		]
		for (const x of samples) {
			const recovered = Math.exp(lnFloatSeries(x))
			const relErr = Math.abs(recovered - x) / x
			assert.ok(
				relErr <= 1e-12,
				`Math.exp(lnFloatSeries(${x})) = ${recovered}, relErr = ${relErr}`,
			)
		}
	})

	test('product identity: ln(a * b) ≈ ln(a) + ln(b)', () => {
		const pairs = [
			[2, 3],
			[0.5, 7.25],
			[Math.PI, Math.E],
			[1e-100, 1e150],
			[1e-200, 1e-100],
			[1e100, 1e200],
			[1 + 1e-8, 1 - 1e-8],
			[Number.MIN_VALUE * 1e10, 1e300],
		]
		for (const [a, b] of pairs) {
			const lhs = lnFloatSeries(a * b)
			const rhs = lnFloatSeries(a) + lnFloatSeries(b)
			const scale = Math.max(1, Math.abs(lhs), Math.abs(rhs))
			const err = Math.abs(lhs - rhs) / scale
			assert.ok(
				err <= 1e-14,
				`ln(${a} * ${b}) = ${lhs} vs ln(${a}) + ln(${b}) = ${rhs} (relErr = ${err})`,
			)
		}
	})

	test('monotonicity over dense logarithmic sweep', () => {
		let prev = -Infinity
		for (let exp = -320; exp <= 308; exp += 4) {
			for (const mant of [1.0, 1.37, 2.71, 5.5, 8.9]) {
				const x = mant * 10 ** exp
				if (x === 0 || !Number.isFinite(x)) continue
				const y = lnFloatSeries(x)
				assert.ok(y > prev, `Expected ln(${x}) = ${y} > ${prev}`)
				assertCloseToMathLog(x)
				prev = y
			}
		}
	})

	test('throws RangeError for x <= 0', () => {
		for (const bad of [0, -0, -Number.MIN_VALUE, -1e-15, -1, -Math.E, -Number.MAX_VALUE]) {
			assert.throws(() => lnFloatSeries(bad), RangeError)
		}
	})

	test('throws RangeError for non-finite numeric inputs', () => {
		for (const bad of [NaN, Infinity, -Infinity]) {
			assert.throws(() => lnFloatSeries(bad), RangeError)
		}
	})

	test('throws TypeError for non-number inputs', () => {
		const invalid = [
			undefined,
			null,
			'1',
			'2.718',
			'',
			true,
			false,
			1n,
			{},
			[],
			[1],
			Symbol('x'),
			() => 1,
		]
		for (const bad of invalid) {
			assert.throws(() => lnFloatSeries(bad), TypeError)
		}
	})
})
