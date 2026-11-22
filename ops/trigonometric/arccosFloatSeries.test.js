import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { arccosFloatSeries } from './arccosFloatSeries.js'

const TOLERANCE = 1e-15

function assertClose(actual, expected, tol = TOLERANCE, message) {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`${message ? `${message}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`
	)
}

describe('arccosFloatSeries', () => {
	test('exact boundary and notable special values', () => {
		assert.equal(arccosFloatSeries(1), 0)
		assert.equal(arccosFloatSeries(-1), Math.PI)
		assert.equal(arccosFloatSeries(0), Math.PI / 2)
		assert.equal(arccosFloatSeries(-0), Math.PI / 2)

		assertClose(arccosFloatSeries(0.5), Math.PI / 3, TOLERANCE, 'arccos(0.5)')
		assertClose(arccosFloatSeries(-0.5), (2 * Math.PI) / 3, TOLERANCE, 'arccos(-0.5)')
		assertClose(arccosFloatSeries(Math.SQRT1_2), Math.PI / 4, TOLERANCE, 'arccos(sqrt(2)/2)')
		assertClose(arccosFloatSeries(-Math.SQRT1_2), (3 * Math.PI) / 4, TOLERANCE, 'arccos(-sqrt(2)/2)')
		assertClose(arccosFloatSeries(Math.sqrt(3) / 2), Math.PI / 6, TOLERANCE, 'arccos(sqrt(3)/2)')
		assertClose(arccosFloatSeries(-Math.sqrt(3) / 2), (5 * Math.PI) / 6, TOLERANCE, 'arccos(-sqrt(3)/2)')
	})

	test('values near branch boundaries (+/-0.5) are continuous and accurate', () => {
		const boundaryInputs = [
			0.5 - Number.EPSILON,
			0.5,
			0.5 + Number.EPSILON,
			0.5 + 1e-12,
			0.5 - 1e-12,
			-0.5 + Number.EPSILON,
			-0.5,
			-0.5 - Number.EPSILON,
			-0.5 - 1e-12,
			-0.5 + 1e-12,
		]

		for (const x of boundaryInputs) {
			const actual = arccosFloatSeries(x)
			const expected = Math.acos(x)
			assertClose(actual, expected, 2 * Number.EPSILON, `boundary x=${x}`)
		}
	})

	test('values very close to 1 and -1 avoid catastrophic cancellation', () => {
		const nearOne = [
			1 - 1e-4,
			1 - 1e-8,
			1 - 1e-12,
			1 - 1e-15,
			1 - Number.EPSILON,
			1 - Number.EPSILON / 2,
		]

		for (const x of nearOne) {
			const actual = arccosFloatSeries(x)
			const expected = Math.acos(x)
			const relErr = Math.abs(actual - expected) / expected
			assert.ok(
				relErr <= 2 * Number.EPSILON,
				`near 1 x=${x}: actual=${actual}, expected=${expected}, relErr=${relErr}`
			)
			assertClose(Math.cos(actual), x, 2 * Number.EPSILON, `cos(arccos(${x}))`)
		}

		const nearNegOne = [
			-1 + 1e-4,
			-1 + 1e-8,
			-1 + 1e-12,
			-1 + 1e-15,
			-1 + Number.EPSILON,
		]

		for (const x of nearNegOne) {
			const actual = arccosFloatSeries(x)
			const expected = Math.acos(x)
			assertClose(actual, expected, 4 * Number.EPSILON, `near -1 x=${x}`)
			assertClose(Math.cos(actual), x, 2 * Number.EPSILON, `cos(arccos(${x}))`)
		}
	})

	test('tiny values near 0 and subnormals', () => {
		const nearZero = [
			1e-16,
			-1e-16,
			1e-100,
			-1e-100,
			Number.MIN_VALUE,
			-Number.MIN_VALUE,
		]

		for (const x of nearZero) {
			assertClose(arccosFloatSeries(x), Math.acos(x), 2 * Number.EPSILON, `near 0 x=${x}`)
		}
	})

	test('dense sweep across [-1, 1] matches Math.acos, cosine inverse, symmetry, and monotonicity', () => {
		const steps = 1000
		let prev = Infinity

		for (let i = 0; i <= steps; i++) {
			const x = -1 + (2 * i) / steps
			const actual = arccosFloatSeries(x)
			const expected = Math.acos(x)

			assertClose(actual, expected, 4 * Number.EPSILON, `sweep x=${x}`)
			assertClose(Math.cos(actual), x, 4 * Number.EPSILON, `cos(arccos(${x}))`)

			// arccos is strictly decreasing on [-1, 1]
			assert.ok(actual < prev, `monotonicity failed at x=${x}: ${actual} >= ${prev}`)
			prev = actual

			// Reflection identity: arccos(x) + arccos(-x) === pi
			const refl = arccosFloatSeries(-x)
			assertClose(actual + refl, Math.PI, 4 * Number.EPSILON, `symmetry x=${x}`)
		}
	})

	test('throws RangeError for out-of-domain inputs (|x| > 1)', () => {
		const outOfDomain = [
			1 + Number.EPSILON,
			-1 - Number.EPSILON,
			1.000001,
			-1.000001,
			2,
			-2,
			1e10,
			-1e10,
			Number.MAX_VALUE,
			-Number.MAX_VALUE,
		]

		for (const x of outOfDomain) {
			assert.throws(
				() => arccosFloatSeries(x),
				{ name: 'RangeError' },
				`expected RangeError for x=${x}`
			)
		}
	})

	test('throws RangeError for non-finite numbers', () => {
		for (const x of [NaN, Infinity, -Infinity]) {
			assert.throws(
				() => arccosFloatSeries(x),
				{ name: 'RangeError' },
				`expected RangeError for ${x}`
			)
		}
	})

	test('throws TypeError for non-number inputs', () => {
		const invalidInputs = [
			undefined,
			null,
			'0.5',
			'',
			true,
			false,
			{},
			[0.5],
			0n,
			Symbol('x'),
			() => 0,
		]

		for (const bad of invalidInputs) {
			assert.throws(
				() => arccosFloatSeries(bad),
				{ name: 'TypeError' },
				`expected TypeError for ${String(bad)}`
			)
		}
	})
})
