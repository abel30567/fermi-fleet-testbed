import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cosFloatRecursive } from './cosFloatRecursive.js'

const EPS = 1e-14

function assertClose(actual, expected, tol = EPS, label = '') {
	assert.ok(
		Number.isFinite(actual) && Math.abs(actual - expected) <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`,
	)
}

test('standard special angles', () => {
	assert.equal(cosFloatRecursive(0), 1)
	assert.equal(cosFloatRecursive(-0), 1)
	assertClose(cosFloatRecursive(Math.PI / 6), Math.sqrt(3) / 2, EPS, 'pi/6')
	assertClose(cosFloatRecursive(Math.PI / 4), Math.SQRT1_2, EPS, 'pi/4')
	assertClose(cosFloatRecursive(Math.PI / 3), 0.5, EPS, 'pi/3')
	assertClose(cosFloatRecursive(Math.PI / 2), 0, EPS, 'pi/2')
	assertClose(cosFloatRecursive((2 * Math.PI) / 3), -0.5, EPS, '2pi/3')
	assertClose(cosFloatRecursive(Math.PI), -1, EPS, 'pi')
	assertClose(cosFloatRecursive((3 * Math.PI) / 2), 0, EPS, '3pi/2')
	assertClose(cosFloatRecursive(2 * Math.PI), 1, EPS, '2pi')
})

test('negative angles and arbitrary quadrants', () => {
	const samples = [-5.5, -Math.PI, -Math.PI / 2, -1.2345, -0.5, 0.5, 1.2345, 5.5]
	for (const x of samples) {
		assertClose(cosFloatRecursive(x), Math.cos(x), EPS, `x=${x}`)
	}
})

test('small, subnormal, and large finite float64 values', () => {
	assert.equal(cosFloatRecursive(Number.MIN_VALUE), 1)
	assert.equal(cosFloatRecursive(-Number.MIN_VALUE), 1)
	assert.equal(cosFloatRecursive(1e-300), 1)
	assertClose(cosFloatRecursive(1e-8), Math.cos(1e-8), 1e-15, '1e-8')
	assertClose(cosFloatRecursive(1e-4), Math.cos(1e-4), 1e-15, '1e-4')

	for (const x of [10, 100, 1000, 1e6, -1e6, 1e9, 1e12, -1e12]) {
		assertClose(cosFloatRecursive(x), Math.cos(x), 1e-14, `large x=${x}`)
	}

	// Extremely large finite values remain finite and bounded within [-1, 1]
	for (const x of [1e16, -1e16, 1e100, Number.MAX_VALUE, -Number.MAX_VALUE]) {
		const res = cosFloatRecursive(x)
		assert.ok(Number.isFinite(res), `expected finite result for x=${x}`)
		assert.ok(res >= -1 && res <= 1, `expected result in [-1, 1] for x=${x}, got ${res}`)
	}
})

test('non-finite IEEE-754 float64 inputs return NaN', () => {
	assert.ok(Number.isNaN(cosFloatRecursive(Number.NaN)))
	assert.ok(Number.isNaN(cosFloatRecursive(Number.POSITIVE_INFINITY)))
	assert.ok(Number.isNaN(cosFloatRecursive(Number.NEGATIVE_INFINITY)))
})

test('input validation throws TypeError for non-number arguments', () => {
	const invalidInputs = [undefined, null, '0', '3.14', true, false, 0n, {}, [], Symbol('x')]
	for (const bad of invalidInputs) {
		assert.throws(
			() => cosFloatRecursive(bad),
			TypeError,
			`expected TypeError for ${String(bad)}`,
		)
	}
})

test('cross-check against Math.cos across a dense range', () => {
	for (let i = -200; i <= 200; i++) {
		const x = i * 0.137
		const actual = cosFloatRecursive(x)
		const expected = Math.cos(x)
		assertClose(actual, expected, 1e-14, `dense x=${x}`)
		assert.ok(actual >= -1 && actual <= 1, `bounds at x=${x}`)
	}
})

test('trigonometric identities cross-check', () => {
	const angles = [-7.3, -2.1, -0.4, 0.001, 0.37, 1.11, 2.5, 4.9, 12.345]
	for (const x of angles) {
		const cx = cosFloatRecursive(x)

		// Even symmetry: cos(-x) === cos(x)
		assert.equal(cosFloatRecursive(-x), cx, `even symmetry at x=${x}`)

		// Periodicity: cos(x + 2pi) === cos(x) and cos(x + pi) === -cos(x)
		assertClose(cosFloatRecursive(x + 2 * Math.PI), cx, 1e-13, `2pi period at x=${x}`)
		assertClose(cosFloatRecursive(x + Math.PI), -cx, 1e-13, `pi half-period at x=${x}`)

		// Double-angle identity: cos(2x) === 2*cos(x)^2 - 1
		assertClose(cosFloatRecursive(2 * x), 2 * cx * cx - 1, 1e-13, `double-angle at x=${x}`)

		// Triple-angle identity: cos(3x) === 4*cos(x)^3 - 3*cos(x)
		assertClose(
			cosFloatRecursive(3 * x),
			4 * cx * cx * cx - 3 * cx,
			1e-13,
			`triple-angle at x=${x}`,
		)

		// Pythagorean identity via quarter-turn phase shift: cos(x)^2 + cos(x - pi/2)^2 === 1
		const sx = cosFloatRecursive(x - Math.PI / 2)
		assertClose(cx * cx + sx * sx, 1, 1e-13, `Pythagorean identity at x=${x}`)
	}
})
