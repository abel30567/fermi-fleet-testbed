import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sinFloatRecursive } from './sinFloatRecursive.js'

function assertClose(actual, expected, tol = 1e-14, msg = '') {
	assert.equal(typeof actual, 'number')
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${msg}: expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`
	)
}

test('input validation rejects non-number arguments', () => {
	const invalidInputs = [undefined, null, '0', '3.14', true, false, {}, [], 0n, Symbol('x')]
	for (const input of invalidInputs) {
		assert.throws(() => sinFloatRecursive(input), TypeError)
	}
})

test('special IEEE-754 values: NaN, +-Infinity, +-0', () => {
	assert.ok(Number.isNaN(sinFloatRecursive(Number.NaN)))
	assert.ok(Number.isNaN(sinFloatRecursive(Number.POSITIVE_INFINITY)))
	assert.ok(Number.isNaN(sinFloatRecursive(Number.NEGATIVE_INFINITY)))

	assert.ok(Object.is(sinFloatRecursive(0), 0))
	assert.ok(Object.is(sinFloatRecursive(-0), -0))
})

test('standard exact/known angles', () => {
	assertClose(sinFloatRecursive(Math.PI / 6), 0.5, 1e-15, 'sin(pi/6)')
	assertClose(sinFloatRecursive(Math.PI / 4), Math.SQRT1_2, 1e-15, 'sin(pi/4)')
	assertClose(sinFloatRecursive(Math.PI / 3), Math.sqrt(3) / 2, 1e-15, 'sin(pi/3)')
	assertClose(sinFloatRecursive(Math.PI / 2), 1, 1e-15, 'sin(pi/2)')
	assertClose(sinFloatRecursive(Math.PI), 0, 1e-15, 'sin(pi)')
	assertClose(sinFloatRecursive((3 * Math.PI) / 2), -1, 1e-15, 'sin(3pi/2)')
	assertClose(sinFloatRecursive(2 * Math.PI), 0, 1e-15, 'sin(2pi)')

	assertClose(sinFloatRecursive(-Math.PI / 6), -0.5, 1e-15, 'sin(-pi/6)')
	assertClose(sinFloatRecursive(-Math.PI / 2), -1, 1e-15, 'sin(-pi/2)')
	assertClose(sinFloatRecursive(-Math.PI), 0, 1e-15, 'sin(-pi)')
})

test('subnormal and tiny angles preserve sin(x) ~ x', () => {
	const tinyValues = [
		Number.MIN_VALUE,
		-Number.MIN_VALUE,
		1e-300,
		-1e-300,
		1e-100,
		1e-16,
		-1e-16,
		1e-8,
		1e-5,
		2 ** -14,
		2 ** -14 + 1e-12
	]
	for (const x of tinyValues) {
		assertClose(sinFloatRecursive(x), Math.sin(x), Math.max(Math.abs(x) * 1e-14, Number.MIN_VALUE), `x=${x}`)
	}
})

test('cross-check against Math.sin across dense sweep in [-10*pi, 10*pi]', () => {
	const steps = 1000
	for (let i = -steps; i <= steps; i++) {
		const x = (i / steps) * 10 * Math.PI
		const actual = sinFloatRecursive(x)
		const expected = Math.sin(x)
		assertClose(actual, expected, 1e-14, `x=${x}`)
		assert.ok(actual >= -1 && actual <= 1, `out of range [-1, 1] for x=${x}: ${actual}`)
	}
})

test('cross-check against Math.sin for large and extreme float64 angles', () => {
	const largeAngles = [
		100,
		-100,
		1e4,
		-1e4,
		2 ** 19 - 1,
		2 ** 19,
		2 ** 19 + 1,
		1e6,
		-1e6,
		1e9,
		-1e9,
		1e15,
		-1e15,
		1e22,
		1e50,
		1e100,
		-1e200,
		Number.MAX_VALUE,
		-Number.MAX_VALUE
	]
	for (const x of largeAngles) {
		assertClose(sinFloatRecursive(x), Math.sin(x), 1e-14, `large x=${x}`)
	}
})

test('trigonometric identities: odd symmetry, periodicity, Pythagorean, double-angle, triple-angle', () => {
	const samples = [0.1, 0.37, 0.7853981633974483, 1.23456789, 2.5, 4.2, 10.7, -3.14159]
	for (const x of samples) {
		const sx = sinFloatRecursive(x)
		const sNegX = sinFloatRecursive(-x)
		const cx = sinFloatRecursive(x + Math.PI / 2)

		// Odd function: sin(-x) === -sin(x)
		assert.equal(sNegX, -sx, `odd symmetry failed for x=${x}`)

		// 2*pi periodicity: sin(x + 2*pi) ~= sin(x)
		assertClose(sinFloatRecursive(x + 2 * Math.PI), sx, 1e-14, `periodicity x=${x}`)

		// Pythagorean identity: sin^2(x) + cos^2(x) === 1
		assertClose(sx * sx + cx * cx, 1, 1e-14, `Pythagorean x=${x}`)

		// Double-angle identity: sin(2x) === 2 * sin(x) * cos(x)
		assertClose(sinFloatRecursive(2 * x), 2 * sx * cx, 1e-14, `double-angle x=${x}`)

		// Triple-angle identity: sin(3x) === 3*sin(x) - 4*sin^3(x)
		assertClose(sinFloatRecursive(3 * x), 3 * sx - 4 * sx * sx * sx, 1e-14, `triple-angle x=${x}`)
	}
})
