import { test } from 'node:test'
import assert from 'node:assert'
import { add, secondDerivativeTest } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('secondDerivativeTest: x^2 + y^2 has a local min at origin', () => {
	const f = (x, y) => x * x + y * y
	assert.equal(secondDerivativeTest(f, 0, 0), 'min')
})

test('secondDerivativeTest: -(x^2 + y^2) has a local max at origin', () => {
	const f = (x, y) => -(x * x + y * y)
	assert.equal(secondDerivativeTest(f, 0, 0), 'max')
})

test('secondDerivativeTest: x^2 - y^2 has a saddle at origin', () => {
	const f = (x, y) => x * x - y * y
	assert.equal(secondDerivativeTest(f, 0, 0), 'saddle')
})

test('secondDerivativeTest: constant function is inconclusive (D = 0)', () => {
	const f = () => 42
	assert.equal(secondDerivativeTest(f, 0, 0), 'inconclusive')
})

test('secondDerivativeTest: min detected away from origin', () => {
	const f = (x, y) => (x - 3) * (x - 3) + (y + 2) * (y + 2)
	assert.equal(secondDerivativeTest(f, 3, -2), 'min')
})

test('secondDerivativeTest: max detected away from origin', () => {
	const f = (x, y) => -((x + 1) * (x + 1)) - (y - 5) * (y - 5)
	assert.equal(secondDerivativeTest(f, -1, 5), 'max')
})

test('secondDerivativeTest: saddle detected for xy at origin', () => {
	const f = (x, y) => x * y
	assert.equal(secondDerivativeTest(f, 0, 0), 'saddle')
})

test('secondDerivativeTest: respects custom step size h', () => {
	const f = (x, y) => x * x + y * y
	assert.equal(secondDerivativeTest(f, 0, 0, 1e-3), 'min')
})
