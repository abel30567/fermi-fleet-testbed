import { test } from 'node:test'
import assert from 'node:assert'
import { add, divergence2D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('divergence2D of constant field is zero', () => {
	const div = divergence2D(() => 42, () => -17, 3.5, -2.1)
	assert.ok(Math.abs(div) < 1e-9)
})

test('divergence2D of linear radial field (x, y) equals 2', () => {
	const fx = (x) => x
	const fy = (_x, y) => y
	assert.ok(Math.abs(divergence2D(fx, fy, 0, 0) - 2) < 1e-8)
	assert.ok(Math.abs(divergence2D(fx, fy, -12.3, 45.6) - 2) < 1e-8)
})

test('divergence2D of rotational field (-y, x) is divergence-free', () => {
	const fx = (_x, y) => -y
	const fy = (x) => x
	assert.ok(Math.abs(divergence2D(fx, fy, 4.2, -7.8)) < 1e-9)
})

test('divergence2D of polynomial and transcendental fields matches analytical values', () => {
	const fxPoly = (x, y) => x * x * y
	const fyPoly = (x, y) => x * y * y
	assert.ok(Math.abs(divergence2D(fxPoly, fyPoly, 3, -2) - -24) < 1e-6)

	const fxTrig = (x, y) => Math.sin(x) * Math.cos(y)
	const fyTrig = (x, y) => x * Math.exp(y)
	const x = 0.5
	const y = 0.7
	const expected = Math.cos(x) * Math.cos(y) + x * Math.exp(y)
	assert.ok(Math.abs(divergence2D(fxTrig, fyTrig, x, y) - expected) < 1e-7)
})

test('divergence2D satisfies linearity and harmonic gradient identity', () => {
	const a = 2.5
	const b = -1.75
	const fx1 = (x, y) => x * x + y
	const fy1 = (x, y) => Math.sin(y)
	const fx2 = (x, y) => Math.exp(x)
	const fy2 = (x, y) => x * y * y

	const x = 1.1
	const y = -0.6
	const divCombined = divergence2D(
		(u, v) => a * fx1(u, v) + b * fx2(u, v),
		(u, v) => a * fy1(u, v) + b * fy2(u, v),
		x,
		y
	)
	const linearCombo =
		a * divergence2D(fx1, fy1, x, y) + b * divergence2D(fx2, fy2, x, y)
	assert.ok(Math.abs(divCombined - linearCombo) < 1e-7)

	assert.ok(Math.abs(divergence2D((u) => 2 * u, (_u, v) => -2 * v, 7, -3)) < 1e-9)
})

test('divergence2D supports custom step size h and validates invalid arguments', () => {
	const fx = (x) => x ** 3
	const fy = (_x, y) => y ** 3
	assert.ok(Math.abs(divergence2D(fx, fy, 2, -1, 1e-5) - 15) < 1e-7)

	assert.throws(() => divergence2D(null, () => 0, 0, 0), TypeError)
	assert.throws(() => divergence2D(() => 0, 'bad', 0, 0), TypeError)
	assert.throws(() => divergence2D(() => 0, () => 0, NaN, 0), RangeError)
	assert.throws(() => divergence2D(() => 0, () => 0, 0, Infinity), RangeError)
	assert.throws(() => divergence2D(() => 0, () => 0, 0, 0, 0), RangeError)
	assert.throws(() => divergence2D(() => 0, () => 0, 0, 0, -1e-6), RangeError)
	assert.throws(() => divergence2D(() => 0, () => 0, 0, 0, NaN), RangeError)
})
