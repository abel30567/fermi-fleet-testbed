import { test } from 'node:test'
import assert from 'node:assert'
import { add, implicitPartialZX } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('implicitPartialZX: plane F = x + y + z gives -1 everywhere', () => {
	const F = (x, y, z) => x + y + z
	assert.ok(Math.abs(implicitPartialZX(F, 0, 0, 0) - -1) < 1e-4)
	assert.ok(Math.abs(implicitPartialZX(F, 5, -2, 3) - -1) < 1e-4)
})

test('implicitPartialZX: sphere F = x^2 + y^2 + z^2 - 14 at (1,2,3) ~ -1/3', () => {
	const F = (x, y, z) => x * x + y * y + z * z - 14
	const result = implicitPartialZX(F, 1, 2, 3)
	assert.ok(Math.abs(result - -1 / 3) < 1e-3)
})

test('implicitPartialZX: throws RangeError when Fz ~ 0', () => {
	const F = (x, y, z) => x * x + y * y + z * z
	assert.throws(() => implicitPartialZX(F, 0, 0, 0), RangeError)
})
