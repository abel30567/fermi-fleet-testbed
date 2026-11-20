import { test } from 'node:test'
import assert from 'node:assert'
import { add, newton1D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('newton1D finds sqrt(2) from polynomial root', () => {
	const root = newton1D(
		(x) => x * x - 2,
		(x) => 2 * x,
		1.0,
	)
	assert.ok(Math.abs(root - Math.SQRT2) < 1e-10)
	assert.ok(Math.abs(root * root - 2) < 1e-10)
})

test('newton1D finds transcendental roots (cos(x) - x = 0 and ln(x) - 1 = 0)', () => {
	const dottie = newton1D(
		(x) => Math.cos(x) - x,
		(x) => -Math.sin(x) - 1,
		0.5,
	)
	assert.ok(Math.abs(Math.cos(dottie) - dottie) < 1e-10)

	const eApprox = newton1D(
		(x) => Math.log(x) - 1,
		(x) => 1 / x,
		2.0,
	)
	assert.ok(Math.abs(eApprox - Math.E) < 1e-10)
})

test('newton1D satisfies mathematical identities for cube root and linear root', () => {
	const target = 27
	const cbrt = newton1D(
		(x) => x ** 3 - target,
		(x) => 3 * x * x,
		2.0,
	)
	assert.ok(Math.abs(cbrt - 3) < 1e-10)

	// Linear function should converge in a single step
	const linearRoot = newton1D(
		(x) => 4 * x - 10,
		() => 4,
		-100,
		1e-12,
		2,
	)
	assert.ok(Math.abs(linearRoot - 2.5) < 1e-12)
})

test('newton1D returns immediately when initial guess is an exact root', () => {
	const root = newton1D(
		(x) => x * x,
		(x) => 2 * x,
		0,
		1e-10,
		0,
	)
	assert.equal(root, 0)
})

test('newton1D throws when derivative is zero or near zero', () => {
	assert.throws(
		() =>
			newton1D(
				(x) => x * x - 1,
				(x) => 2 * x,
				0,
			),
		/derivative/i,
	)

	assert.throws(
		() =>
			newton1D(
				(x) => Math.sin(x) - 2,
				(x) => Math.cos(x),
				Math.PI / 2,
			),
		/derivative/i,
	)
})

test('newton1D throws when it fails to converge within maxIter', () => {
	// Classic 2-cycle: x^3 - 2x + 2 oscillates 0 -> 1 -> 0 -> 1 ...
	assert.throws(
		() =>
			newton1D(
				(x) => x ** 3 - 2 * x + 2,
				(x) => 3 * x * x - 2,
				0,
				1e-10,
				20,
			),
		/converge/i,
	)

	// Insufficient iterations for distant starting point
	assert.throws(
		() =>
			newton1D(
				(x) => x * x - 2,
				(x) => 2 * x,
				100,
				1e-12,
				2,
			),
		/converge/i,
	)
})

test('newton1D validates input arguments', () => {
	assert.throws(() => newton1D(null, (x) => x, 1), TypeError)
	assert.throws(() => newton1D((x) => x, (x) => 1, Number.NaN), RangeError)
	assert.throws(() => newton1D((x) => x, (x) => 1, 1, 0), RangeError)
	assert.throws(() => newton1D((x) => x, (x) => 1, 1, 1e-10, -1), RangeError)
})
