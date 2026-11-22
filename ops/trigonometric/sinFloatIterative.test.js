import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sinFloatIterative } from './sinFloatIterative.js'

const EPSILON = 1e-14

function assertClose(actual, expected, tolerance = EPSILON, label = '') {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tolerance,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tolerance} of ${expected} (diff=${diff})`,
	)
}

describe('sinFloatIterative', () => {
	test('special and canonical angles', () => {
		assert.ok(Object.is(sinFloatIterative(0), 0))
		assertClose(sinFloatIterative(Math.PI / 6), 0.5, 1e-15, 'sin(π/6)')
		assertClose(sinFloatIterative(Math.PI / 4), Math.SQRT2 / 2, 1e-15, 'sin(π/4)')
		assertClose(sinFloatIterative(Math.PI / 3), Math.sqrt(3) / 2, 1e-15, 'sin(π/3)')
		assertClose(sinFloatIterative(Math.PI / 2), 1, 1e-15, 'sin(π/2)')
		assertClose(sinFloatIterative(Math.PI), Math.sin(Math.PI), 1e-15, 'sin(π)')
		assertClose(sinFloatIterative((3 * Math.PI) / 2), -1, 1e-15, 'sin(3π/2)')
		assertClose(sinFloatIterative(2 * Math.PI), Math.sin(2 * Math.PI), 1e-15, 'sin(2π)')
	})

	test('negative angles', () => {
		assertClose(sinFloatIterative(-Math.PI / 6), -0.5, 1e-15, 'sin(-π/6)')
		assertClose(sinFloatIterative(-Math.PI / 4), -Math.SQRT2 / 2, 1e-15, 'sin(-π/4)')
		assertClose(sinFloatIterative(-Math.PI / 3), -Math.sqrt(3) / 2, 1e-15, 'sin(-π/3)')
		assertClose(sinFloatIterative(-Math.PI / 2), -1, 1e-15, 'sin(-π/2)')
		assertClose(sinFloatIterative(-Math.PI), Math.sin(-Math.PI), 1e-15, 'sin(-π)')
		assertClose(sinFloatIterative((-3 * Math.PI) / 2), 1, 1e-15, 'sin(-3π/2)')
		assertClose(sinFloatIterative(-2 * Math.PI), Math.sin(-2 * Math.PI), 1e-15, 'sin(-2π)')
	})

	test('large and very small angles', () => {
		const largeAngles = [
			10 * Math.PI + Math.PI / 6,
			-10 * Math.PI - Math.PI / 6,
			100,
			-100,
			1000,
			-1000,
			1e6,
			-1e6,
			1e7,
			-1e7,
		]
		for (const x of largeAngles) {
			assertClose(sinFloatIterative(x), Math.sin(x), 1e-12, `sin(${x})`)
		}

		// Extremely large values beyond Cody-Waite limit still return finite values in [-1, 1]
		for (const x of [1e9, -1e9, 1e15, Number.MAX_VALUE, -Number.MAX_VALUE]) {
			const res = sinFloatIterative(x)
			assert.ok(Number.isFinite(res), `sin(${x}) should be finite, got ${res}`)
			assert.ok(res >= -1 && res <= 1, `sin(${x}) should be in [-1, 1], got ${res}`)
		}

		// Very small values and subnormals: sin(x) ≈ x
		for (const x of [1e-10, -1e-10, 1e-100, -1e-100, Number.MIN_VALUE, -Number.MIN_VALUE]) {
			assert.equal(sinFloatIterative(x), x, `sin(${x}) should equal ${x}`)
		}
	})

	test('edge cases: +0, -0, NaN, Infinity, -Infinity', () => {
		assert.ok(Object.is(sinFloatIterative(0), 0), 'sin(+0) should be +0')
		assert.ok(Object.is(sinFloatIterative(-0), -0), 'sin(-0) should be -0')
		assert.ok(Number.isNaN(sinFloatIterative(Number.NaN)), 'sin(NaN) should be NaN')
		assert.ok(Number.isNaN(sinFloatIterative(Number.POSITIVE_INFINITY)), 'sin(Infinity) should be NaN')
		assert.ok(Number.isNaN(sinFloatIterative(Number.NEGATIVE_INFINITY)), 'sin(-Infinity) should be NaN')
	})

	test('invalid input types throw TypeError', () => {
		const invalidInputs = [
			undefined,
			null,
			'0',
			'3.14',
			true,
			false,
			{},
			[],
			[1],
			1n,
			Symbol('angle'),
			() => 0,
			new Number(1),
		]

		for (const bad of invalidInputs) {
			assert.throws(() => sinFloatIterative(bad), TypeError)
		}
	})

	test('cross-check against Math.sin across a broad range', () => {
		for (let i = -200; i <= 200; i++) {
			const x = (i / 20) * Math.PI + 0.123456789
			assertClose(sinFloatIterative(x), Math.sin(x), 1e-14, `grid x=${x}`)
		}
	})

	test('mathematical identities: odd function, double-angle, periodicity, Pythagorean', () => {
		const angles = [0.1, 0.5, 0.7853981633974483, 1.2345, 2.5, 4.2, 10.7, -3.33, 50.25]

		for (const x of angles) {
			const sx = sinFloatIterative(x)
			const sNegX = sinFloatIterative(-x)
			const cx = sinFloatIterative(x + Math.PI / 2)

			// Odd-function identity: sin(-x) = -sin(x)
			assertClose(sNegX, -sx, 1e-15, `odd identity at x=${x}`)

			// Double-angle identity: sin(2x) = 2 * sin(x) * cos(x)
			assertClose(sinFloatIterative(2 * x), 2 * sx * cx, 1e-13, `double-angle at x=${x}`)

			// Periodicity: sin(x + 2π) = sin(x) and sin(x + π) = -sin(x)
			assertClose(sinFloatIterative(x + 2 * Math.PI), sx, 1e-13, `2π periodicity at x=${x}`)
			assertClose(sinFloatIterative(x + Math.PI), -sx, 1e-13, `π anti-periodicity at x=${x}`)

			// Pythagorean identity: sin²(x) + cos²(x) = 1
			assertClose(sx * sx + cx * cx, 1, 1e-13, `Pythagorean identity at x=${x}`)
		}
	})
})
