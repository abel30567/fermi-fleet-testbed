import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { arctanFloatRecursive } from './arctanFloatRecursive.js'

const TOL = 1e-14

function assertClose(actual, expected, tol = TOL, label = '') {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`
	)
}

describe('arctanFloatRecursive', () => {
	test('exact and special trigonometric angles', () => {
		assertClose(arctanFloatRecursive(1), Math.PI / 4, TOL, 'atan(1)')
		assertClose(arctanFloatRecursive(-1), -Math.PI / 4, TOL, 'atan(-1)')
		assertClose(arctanFloatRecursive(Math.sqrt(3)), Math.PI / 3, TOL, 'atan(sqrt(3))')
		assertClose(arctanFloatRecursive(-Math.sqrt(3)), -Math.PI / 3, TOL, 'atan(-sqrt(3))')
		assertClose(arctanFloatRecursive(1 / Math.sqrt(3)), Math.PI / 6, TOL, 'atan(1/sqrt(3))')
		assertClose(arctanFloatRecursive(Math.SQRT2 - 1), Math.PI / 8, TOL, 'atan(sqrt(2)-1)')
		assertClose(arctanFloatRecursive(Math.SQRT2 + 1), (3 * Math.PI) / 8, TOL, 'atan(sqrt(2)+1)')
	})

	test('signed zeros, infinities, and NaN', () => {
		assert.ok(Object.is(arctanFloatRecursive(0), 0), 'atan(+0) should be +0')
		assert.ok(Object.is(arctanFloatRecursive(-0), -0), 'atan(-0) should be -0')
		assert.equal(arctanFloatRecursive(Infinity), Math.PI / 2)
		assert.equal(arctanFloatRecursive(-Infinity), -Math.PI / 2)
		assert.ok(Number.isNaN(arctanFloatRecursive(NaN)), 'atan(NaN) should be NaN')
	})

	test('very small, subnormal, and very large finite float64 values', () => {
		assert.equal(arctanFloatRecursive(Number.MIN_VALUE), Number.MIN_VALUE)
		assert.equal(arctanFloatRecursive(-Number.MIN_VALUE), -Number.MIN_VALUE)
		assertClose(arctanFloatRecursive(1e-12), 1e-12, 1e-26, 'atan(1e-12)')
		assertClose(arctanFloatRecursive(-1e-9), -1e-9, 1e-23, 'atan(-1e-9)')
		assertClose(arctanFloatRecursive(1e-5), Math.atan(1e-5), TOL, 'atan(1e-5)')
		assertClose(arctanFloatRecursive(1e8), Math.atan(1e8), TOL, 'atan(1e8)')
		assertClose(arctanFloatRecursive(-1e8), Math.atan(-1e8), TOL, 'atan(-1e8)')
		assert.equal(arctanFloatRecursive(Number.MAX_VALUE), Math.PI / 2)
		assert.equal(arctanFloatRecursive(-Number.MAX_VALUE), -Math.PI / 2)
	})

	test('odd symmetry, monotonicity, and range bounds [-pi/2, pi/2]', () => {
		const samples = [0.001, 0.05, 0.125, 0.25, 0.5, 0.999, 1, 1.001, 2, 10, 1000]
		let prev = -Math.PI / 2
		for (const x of [...samples.slice().reverse().map((v) => -v), 0, ...samples]) {
			const y = arctanFloatRecursive(x)
			assert.ok(y >= -Math.PI / 2 && y <= Math.PI / 2, `range bound failed at x=${x}`)
			assert.ok(y >= prev, `monotonicity failed at x=${x}: ${y} < ${prev}`)
			prev = y
		}
		for (const x of samples) {
			assert.equal(arctanFloatRecursive(-x), -arctanFloatRecursive(x), `odd symmetry failed at x=${x}`)
		}
	})

	test('cross-check against Math.atan across wide logarithmic and linear sweep', () => {
		const values = [
			-1e12, -1e6, -100, -10, -2.5, -1.5, -1.000001, -0.999999, -0.5, -0.125, -0.1249,
			-0.01, -1e-4, -1e-7, 1e-7, 1e-4, 0.01, 0.1249, 0.125, 0.1251, 0.3, 0.7,
			0.999999, 1.000001, 1.5, 2.5, 10, 100, 1e6, 1e12
		]
		for (const x of values) {
			const actual = arctanFloatRecursive(x)
			const expected = Math.atan(x)
			assertClose(actual, expected, 1e-15, `Math.atan cross-check at x=${x}`)
		}
	})

	test('independent inverse cross-check: Math.tan(arctanFloatRecursive(x)) ≈ x', () => {
		const values = [-50, -10, -3.14, -1, -0.75, -0.2, -0.01, 0.01, 0.2, 0.75, 1, 3.14, 10, 50]
		for (const x of values) {
			const y = arctanFloatRecursive(x)
			const roundTrip = Math.tan(y)
			const relTol = Math.max(1e-12, Math.abs(x) * 1e-12)
			assertClose(roundTrip, x, relTol, `tan(atan(${x}))`)
		}
	})

	test('independent algebraic identity: atan(x) + atan(1/x) = pi/2 for x > 0', () => {
		for (const x of [0.05, 0.25, 0.6, 1, 2.5, 7, 42]) {
			const sum = arctanFloatRecursive(x) + arctanFloatRecursive(1 / x)
			assertClose(sum, Math.PI / 2, 1e-15, `reciprocal identity at x=${x}`)
		}
	})

	test('input validation rejects non-number arguments with TypeError', () => {
		const invalid = [undefined, null, '1', '0', true, false, {}, [], () => 1, 1n, Symbol('x')]
		for (const bad of invalid) {
			assert.throws(
				() => arctanFloatRecursive(bad),
				{ name: 'TypeError' },
				`Expected TypeError for input ${String(bad)}`
			)
		}
	})
})
