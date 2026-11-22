import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { tanFloatRecursive } from './tanFloatRecursive.js'

/**
 * Asserts that `actual` is close to `expected` within combined relative and
 * absolute tolerances.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} relTol
 * @param {number} [absTol=1e-15]
 * @param {string} [label='']
 */
function assertClose(actual, expected, relTol = 1e-13, absTol = 1e-15, label = '') {
	assert.equal(typeof actual, 'number', `${label}: result must be a number`)
	assert.ok(Number.isFinite(actual), `${label}: expected finite result, got ${actual}`)
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.abs(expected))
	assert.ok(
		diff <= limit,
		`${label}: expected ${actual} to be within ${limit} of ${expected} (diff=${diff})`
	)
}

describe('tanFloatRecursive', () => {
	test('input validation rejects non-number inputs with TypeError', () => {
		const invalidInputs = [
			undefined,
			null,
			'0',
			'1.5',
			'',
			true,
			false,
			{},
			[],
			[0],
			1n,
			Symbol('angle'),
			() => 0
		]
		for (const bad of invalidInputs) {
			assert.throws(
				() => tanFloatRecursive(bad),
				{ name: 'TypeError' },
				`Expected TypeError for input ${String(bad)}`
			)
		}
	})

	test('handles special IEEE-754 float64 values: NaN, ±Infinity, +0, -0', () => {
		assert.ok(Number.isNaN(tanFloatRecursive(Number.NaN)))
		assert.ok(Number.isNaN(tanFloatRecursive(Number.POSITIVE_INFINITY)))
		assert.ok(Number.isNaN(tanFloatRecursive(Number.NEGATIVE_INFINITY)))

		assert.ok(Object.is(tanFloatRecursive(0), 0), 'tan(+0) must preserve +0')
		assert.ok(Object.is(tanFloatRecursive(-0), -0), 'tan(-0) must preserve -0')
	})

	test('exact / canonical reference angles', () => {
		assertClose(tanFloatRecursive(Math.PI / 6), 1 / Math.sqrt(3), 1e-14, 1e-15, 'pi/6')
		assertClose(tanFloatRecursive(Math.PI / 4), 1, 1e-14, 1e-15, 'pi/4')
		assertClose(tanFloatRecursive(-Math.PI / 4), -1, 1e-14, 1e-15, '-pi/4')
		assertClose(tanFloatRecursive(Math.PI / 3), Math.sqrt(3), 1e-14, 1e-15, 'pi/3')
		assertClose(tanFloatRecursive(-Math.PI / 3), -Math.sqrt(3), 1e-14, 1e-15, '-pi/3')
		assertClose(tanFloatRecursive((3 * Math.PI) / 4), -1, 1e-14, 1e-15, '3*pi/4')
		assertClose(tanFloatRecursive(Math.PI), Math.tan(Math.PI), 1e-13, 1e-15, 'pi')
		assertClose(tanFloatRecursive(2 * Math.PI), Math.tan(2 * Math.PI), 1e-13, 1e-15, '2*pi')
	})

	test('small and subnormal angles exercise base case accurately', () => {
		const smallAngles = [
			Number.MIN_VALUE,
			-Number.MIN_VALUE,
			1e-300,
			-1e-300,
			1e-15,
			-1e-15,
			1e-8,
			1e-5,
			0.001,
			-0.001,
			0.0078125, // exact base threshold 2^-7
			0.0078126 // just above base threshold (triggers recursion)
		]
		for (const x of smallAngles) {
			assertClose(tanFloatRecursive(x), Math.tan(x), 1e-14, 0, `small x=${x}`)
		}
	})

	test('angles near poles (±pi/2, ±3*pi/2)', () => {
		const nearPoleAngles = [
			Math.PI / 2 - 1e-3,
			Math.PI / 2 + 1e-3,
			Math.PI / 2 - 1e-6,
			Math.PI / 2 + 1e-6,
			Math.PI / 2 - 1e-12,
			Math.PI / 2 + 1e-12,
			Math.PI / 2,
			-Math.PI / 2,
			(3 * Math.PI) / 2,
			-(3 * Math.PI) / 2,
			(5 * Math.PI) / 2
		]
		for (const x of nearPoleAngles) {
			const actual = tanFloatRecursive(x)
			const expected = Math.tan(x)
			assert.equal(Math.sign(actual), Math.sign(expected), `sign mismatch at x=${x}`)
			assertClose(actual, expected, 1e-13, 1e-15, `near pole x=${x}`)
		}
	})

	test('negative angles satisfy odd symmetry tan(-x) === -tan(x)', () => {
		const angles = [0.1, 0.5, 0.785, 1.2, 2.5, 10, 123.456, 1e7, 1e15]
		for (const x of angles) {
			const pos = tanFloatRecursive(x)
			const neg = tanFloatRecursive(-x)
			assert.equal(neg, -pos, `odd symmetry failed at x=${x}`)
		}
	})

	test('large and extreme finite angles match Math.tan via exact range reduction', () => {
		const largeAngles = [
			100,
			-100,
			1e4,
			-1e4,
			1e6,
			-1e6,
			1048576, // 2^20 boundary
			1048577, // just above 2^20
			1e9,
			-1e9,
			1e12,
			1e15,
			-1e15,
			1e20,
			1e50,
			1e100,
			-1e200,
			1e300,
			Number.MAX_VALUE,
			-Number.MAX_VALUE
		]
		for (const x of largeAngles) {
			assertClose(tanFloatRecursive(x), Math.tan(x), 1e-13, 1e-15, `large x=${x}`)
		}
	})

	test('cross-check against Math.tan and Math.sin(x) / Math.cos(x) across a dense sweep', () => {
		// Sweep across [-10, 10] with non-dyadic step to hit all quadrants and recursion depths
		for (let i = -200; i <= 200; i++) {
			const x = i * 0.05 + 0.0137
			const actual = tanFloatRecursive(x)
			const refMathTan = Math.tan(x)
			const refSinCos = Math.sin(x) / Math.cos(x)

			assertClose(actual, refMathTan, 1e-13, 1e-15, `Math.tan sweep x=${x}`)
			assertClose(actual, refSinCos, 1e-12, 1e-14, `sin/cos sweep x=${x}`)
		}
	})

	test('cross-check trigonometric identities: periodicity, sec^2, and double-angle', () => {
		const angles = [-2.1, -0.7, -0.2, 0.15, 0.6, 1.1, 2.3]
		for (const x of angles) {
			const t = tanFloatRecursive(x)

			// 1 + tan(x)^2 == 1 / cos(x)^2
			const cosX = Math.cos(x)
			assertClose(1 + t * t, 1 / (cosX * cosX), 1e-13, 1e-15, `sec^2 identity x=${x}`)

			// tan(2x) == 2*tan(x) / (1 - tan(x)^2)
			const t2 = tanFloatRecursive(2 * x)
			const doubleFormula = (2 * t) / (1 - t * t)
			assertClose(t2, doubleFormula, 1e-12, 1e-14, `double-angle identity x=${x}`)

			// Periodicity: tan(x + k*pi) == tan(x)
			for (const k of [-3, -1, 1, 4]) {
				assertClose(tanFloatRecursive(x + k * Math.PI), t, 1e-12, 1e-14, `periodicity x=${x}, k=${k}`)
			}
		}
	})
})
