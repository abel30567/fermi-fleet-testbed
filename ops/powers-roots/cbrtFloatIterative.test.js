import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { cbrtFloatIterative } from './cbrtFloatIterative.js'

/**
 * Helper to assert two finite float64 numbers agree within a tight relative tolerance.
 */
function assertClose(actual, expected, relTol = 1e-15, label = '') {
	assert.equal(typeof actual, 'number', `${label}: expected number`)
	assert.equal(Number.isFinite(actual), true, `${label}: expected finite number, got ${actual}`)
	const scale = Math.max(Math.abs(expected), Number.MIN_VALUE)
	const relErr = Math.abs(actual - expected) / scale
	assert.ok(
		relErr <= relTol,
		`${label}: actual=${actual}, expected=${expected}, relErr=${relErr} > ${relTol}`,
	)
}

describe('cbrtFloatIterative', () => {
	test('exact and normal positive values', () => {
		assert.equal(cbrtFloatIterative(1), 1)
		assert.equal(cbrtFloatIterative(8), 2)
		assert.equal(cbrtFloatIterative(27), 3)
		assert.equal(cbrtFloatIterative(64), 4)
		assert.equal(cbrtFloatIterative(125), 5)
		assert.equal(cbrtFloatIterative(1000), 10)
		assert.equal(cbrtFloatIterative(0.125), 0.5)
		assertClose(cbrtFloatIterative(2), Math.cbrt(2), 1e-15, 'cbrt(2)')
		assertClose(cbrtFloatIterative(3), Math.cbrt(3), 1e-15, 'cbrt(3)')
		assertClose(cbrtFloatIterative(Math.PI), Math.cbrt(Math.PI), 1e-15, 'cbrt(pi)')
	})

	test('exact and normal negative values preserve sign', () => {
		assert.equal(cbrtFloatIterative(-1), -1)
		assert.equal(cbrtFloatIterative(-8), -2)
		assert.equal(cbrtFloatIterative(-27), -3)
		assert.equal(cbrtFloatIterative(-64), -4)
		assert.equal(cbrtFloatIterative(-125), -5)
		assert.equal(cbrtFloatIterative(-1000), -10)
		assert.equal(cbrtFloatIterative(-0.125), -0.5)
		assertClose(cbrtFloatIterative(-2), Math.cbrt(-2), 1e-15, 'cbrt(-2)')
		assertClose(cbrtFloatIterative(-12345.6789), Math.cbrt(-12345.6789), 1e-15, 'cbrt(-12345.6789)')
	})

	test('special IEEE-754 values: +0, -0, Infinity, -Infinity, NaN', () => {
		assert.ok(Object.is(cbrtFloatIterative(0), 0), 'cbrt(+0) should be +0')
		assert.ok(Object.is(cbrtFloatIterative(-0), -0), 'cbrt(-0) should be -0')
		assert.equal(cbrtFloatIterative(Infinity), Infinity)
		assert.equal(cbrtFloatIterative(-Infinity), -Infinity)
		assert.ok(Number.isNaN(cbrtFloatIterative(NaN)))
	})

	test('extreme magnitudes: very large, very small, and subnormal numbers', () => {
		const extremes = [
			Number.MAX_VALUE,
			-Number.MAX_VALUE,
			1e300,
			-1e300,
			1e150,
			-1e150,
			1e-150,
			-1e-150,
			1e-300,
			-1e-300,
			2 ** -1022,
			-(2 ** -1022),
			Number.MIN_VALUE,
			-Number.MIN_VALUE,
			Number.MIN_VALUE * 7,
			-Number.MIN_VALUE * 7,
		]

		for (const x of extremes) {
			const r = cbrtFloatIterative(x)
			const expected = Math.cbrt(x)
			assertClose(r, expected, 1e-15, `cbrt(${x})`)
			assert.equal(Math.sign(r), Math.sign(x), `sign mismatch for ${x}`)
		}
	})

	test('cross-check against Math.cbrt and r ** 3 ≈ x across wide range', () => {
		const samples = [
			-1e200,
			-1e50,
			-999999.5,
			-100,
			-7,
			-0.999999,
			-0.001,
			-1e-50,
			-1e-200,
			1e-200,
			1e-50,
			0.001,
			0.5,
			0.999999,
			1.000001,
			7,
			42,
			999999.5,
			1e50,
			1e200,
		]

		for (const x of samples) {
			const r = cbrtFloatIterative(x)
			assertClose(r, Math.cbrt(x), 1e-15, `Math.cbrt cross-check for ${x}`)
			// Check r ** 3 ≈ x (safe from overflow/underflow for |x| in [1e-200, 1e200])
			assertClose(r ** 3, x, 1e-14, `r**3 cross-check for ${x}`)
		}
	})

	test('throws TypeError on non-number inputs', () => {
		const invalidInputs = [
			undefined,
			null,
			'8',
			'',
			true,
			false,
			8n,
			{},
			[8],
			Symbol('x'),
			() => 8,
		]

		for (const bad of invalidInputs) {
			assert.throws(
				() => cbrtFloatIterative(bad),
				{ name: 'TypeError' },
				`Expected TypeError for input: ${String(bad)}`,
			)
		}
	})
})
