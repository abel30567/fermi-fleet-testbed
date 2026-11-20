import { test } from 'node:test'
import assert from 'node:assert'
import { add, classifyCritical2D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('classifyCritical2D identifies local minima including shifted and coupled quadratics', () => {
	assert.equal(
		classifyCritical2D((x, y) => x * x + y * y, 0, 0),
		'local-min'
	)
	assert.equal(
		classifyCritical2D(
			(x, y) => 2 * (x - 3) ** 2 + (x - 3) * (y + 1) + 2 * (y + 1) ** 2 + 5,
			3,
			-1
		),
		'local-min'
	)
	assert.equal(
		classifyCritical2D((x, y) => 10000 * x * x + 0.001 * y * y, 0, 0),
		'local-min'
	)
})

test('classifyCritical2D identifies local maxima including trigonometric and coupled quadratics', () => {
	assert.equal(
		classifyCritical2D((x, y) => -(x * x + y * y), 0, 0),
		'local-max'
	)
	assert.equal(
		classifyCritical2D((x, y) => Math.cos(x) * Math.cos(y), 0, 0),
		'local-max'
	)
	assert.equal(
		classifyCritical2D((x, y) => -(3 * x * x + 2 * x * y + 2 * y * y), 0, 0),
		'local-max'
	)
})

test('classifyCritical2D identifies saddle points (hyperbolic paraboloid, xy, trigonometric)', () => {
	assert.equal(
		classifyCritical2D((x, y) => x * x - y * y, 0, 0),
		'saddle'
	)
	assert.equal(
		classifyCritical2D((x, y) => x * y, 0, 0),
		'saddle'
	)
	assert.equal(
		classifyCritical2D(
			(x, y) => Math.cos(x) * Math.cos(y),
			Math.PI / 2,
			Math.PI / 2
		),
		'saddle'
	)
})

test('classifyCritical2D returns inconclusive for degenerate Hessians (det = 0)', () => {
	assert.equal(
		classifyCritical2D((x, y) => x ** 4 + y ** 4, 0, 0),
		'inconclusive'
	)
	assert.equal(
		classifyCritical2D((x, y) => x ** 3 - 3 * x * y * y, 0, 0),
		'inconclusive'
	)
	assert.equal(
		classifyCritical2D(() => 42, 1, 2),
		'inconclusive'
	)
	assert.equal(
		classifyCritical2D((x, y) => 10 + (x + y) ** 2, 1, -1),
		'inconclusive'
	)
})

test('classifyCritical2D respects mathematical invariance under negation and coordinate rotation', () => {
	const theta = Math.PI / 6
	const cos = Math.cos(theta)
	const sin = Math.sin(theta)
	const f = (x, y) => {
		const u = cos * x - sin * y
		const v = sin * x + cos * y
		return 4 * u * u + 9 * v * v
	}
	assert.equal(classifyCritical2D(f, 0, 0), 'local-min')
	assert.equal(classifyCritical2D((x, y) => -f(x, y), 0, 0), 'local-max')
})

test('classifyCritical2D supports custom h and handles invalid inputs and non-finite outputs', () => {
	assert.equal(
		classifyCritical2D((x, y) => Math.exp(x * x + y * y), 0, 0, 1e-3),
		'local-min'
	)
	assert.equal(
		classifyCritical2D(() => Number.NaN, 0, 0),
		'inconclusive'
	)
	assert.throws(() => classifyCritical2D(null, 0, 0), TypeError)
	assert.throws(() => classifyCritical2D((x, y) => x + y, Number.NaN, 0), RangeError)
	assert.throws(() => classifyCritical2D((x, y) => x + y, 0, 0, 0), RangeError)
	assert.throws(() => classifyCritical2D((x, y) => x + y, 0, 0, -1e-4), RangeError)
})
