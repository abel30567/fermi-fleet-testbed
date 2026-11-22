import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { arctanFloatRecursive } from './arctanFloatRecursive.js'

const EPSILON = 1e-14

function assertClose(actual, expected, tolerance = EPSILON, label = '') {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		diff <= tolerance * scale,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tolerance * scale} of ${expected} (diff=${diff})`,
	)
}

describe('arctanFloatRecursive', () => {
	test('handles exact / symbolic trigonometric reference values', () => {
		const cases = [
			[1, Math.PI / 4],
			[-1, -Math.PI / 4],
			[1 / Math.sqrt(3), Math.PI / 6],
			[-1 / Math.sqrt(3), -Math.PI / 6],
			[Math.sqrt(3), Math.PI / 3],
			[-Math.sqrt(3), -Math.PI / 3],
			[Math.SQRT2 - 1, Math.PI / 8],
			[Math.SQRT2 + 1, (3 * Math.PI) / 8],
			[2 - Math.sqrt(3), Math.PI / 12],
			[2 + Math.sqrt(3), (5 * Math.PI) / 12],
		]

		for (const [input, expected] of cases) {
			assertClose(arctanFloatRecursive(input), expected, EPSILON, `arctan(${input})`)
		}
	})

	test('preserves signed zero (+0 and -0)', () => {
		const posZero = arctanFloatRecursive(0)
		const negZero = arctanFloatRecursive(-0)
		assert.equal(Object.is(posZero, 0), true)
		assert.equal(Object.is(negZero, -0), true)
	})

	test('handles +/-Infinity and NaN per IEEE-754 semantics', () => {
		assert.equal(arctanFloatRecursive(Infinity), Math.PI / 2)
		assert.equal(arctanFloatRecursive(-Infinity), -Math.PI / 2)
		assert.equal(Number.isNaN(arctanFloatRecursive(NaN)), true)
	})

	test('handles very small, subnormal, and threshold-boundary values', () => {
		const smallValues = [
			Number.MIN_VALUE,
			-Number.MIN_VALUE,
			1e-300,
			-1e-300,
			1e-100,
			1e-16,
			1e-10,
			1e-5,
			1 / 256 - 1e-12,
			1 / 256,
			1 / 256 + 1e-12,
			1 - 1e-15,
			1 + 1e-15,
		]

		for (const x of smallValues) {
			const actual = arctanFloatRecursive(x)
			const expected = Math.atan(x)
			assertClose(actual, expected, EPSILON, `arctan(${x})`)
		}

		// For subnormal x, arctan(x) === x exactly in float64
		assert.equal(arctanFloatRecursive(Number.MIN_VALUE), Number.MIN_VALUE)
		assert.equal(arctanFloatRecursive(-Number.MIN_VALUE), -Number.MIN_VALUE)
	})

	test('handles very large finite values without overflow', () => {
		const largeValues = [1e6, 1e12, 1e16, 1e100, 1e300, Number.MAX_VALUE]

		for (const x of largeValues) {
			assertClose(arctanFloatRecursive(x), Math.atan(x), EPSILON, `arctan(${x})`)
			assertClose(arctanFloatRecursive(-x), Math.atan(-x), EPSILON, `arctan(${-x})`)
			assert.ok(Number.isFinite(arctanFloatRecursive(x)))
		}
	})

	test('satisfies odd symmetry, reciprocal identity, monotonicity, and range bounds', () => {
		const positives = [1e-6, 0.01, 0.25, 0.5, 0.99, 1, 1.01, 2.5, 10, 1000, 1e8]

		for (const x of positives) {
			// Odd symmetry: arctan(-x) === -arctan(x)
			assert.equal(arctanFloatRecursive(-x), -arctanFloatRecursive(x))

			// Reciprocal identity: arctan(x) + arctan(1/x) === pi/2
			assertClose(
				arctanFloatRecursive(x) + arctanFloatRecursive(1 / x),
				Math.PI / 2,
				EPSILON,
				`reciprocal(${x})`,
			)
		}

		// Monotonicity and range bounds across [-1e6, 1e6]
		const grid = [-1e6, -100, -5, -1, -0.5, -1e-4, 0, 1e-4, 0.5, 1, 5, 100, 1e6]
		let prev = -Infinity
		for (const x of grid) {
			const y = arctanFloatRecursive(x)
			assert.ok(y > prev, `expected arctan(${x})=${y} > ${prev}`)
			assert.ok(y > -Math.PI / 2 && y < Math.PI / 2, `expected ${y} in (-pi/2, pi/2)`)
			prev = y
		}
	})

	test('cross-checks against Math.atan across a broad sweep of inputs', () => {
		const inputs = []
		for (let exp = -15; exp <= 15; exp++) {
			const mag = 10 ** exp
			inputs.push(mag, -mag, 2.718281828 * mag, -3.141592653 * mag)
		}
		for (let i = -50; i <= 50; i++) {
			inputs.push(i / 10)
		}

		for (const x of inputs) {
			assertClose(arctanFloatRecursive(x), Math.atan(x), EPSILON, `Math.atan(${x})`)
		}
	})

	test('cross-checks round-trip Math.tan(arctanFloatRecursive(x)) == x', () => {
		const inputs = [-1000, -42.5, -3.7, -1, -0.5, -0.001, 0, 0.001, 0.25, 0.5, 1, 3.7, 42.5, 1000]

		for (const x of inputs) {
			const reconstructed = Math.tan(arctanFloatRecursive(x))
			assertClose(reconstructed, x, 1e-12, `tan(arctan(${x}))`)
		}
	})

	test('cross-checks Machin formula identity 4 * (4*arctan(1/5) - arctan(1/239)) == pi', () => {
		const piApprox = 4 * (4 * arctanFloatRecursive(1 / 5) - arctanFloatRecursive(1 / 239))
		assertClose(piApprox, Math.PI, EPSILON, 'Machin formula')
	})

	test('throws TypeError on invalid non-number inputs', () => {
		const invalidInputs = [
			undefined,
			null,
			'0',
			'1',
			'',
			true,
			false,
			0n,
			1n,
			{},
			[],
			[1],
			new Number(1),
			Symbol('x'),
			() => 1,
		]

		assert.throws(() => arctanFloatRecursive(), TypeError)
		for (const bad of invalidInputs) {
			assert.throws(() => arctanFloatRecursive(bad), TypeError, `should throw for ${String(bad)}`)
		}
	})
})
