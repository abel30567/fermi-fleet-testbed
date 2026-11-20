import { test } from 'node:test'
import assert from 'node:assert'
import { add, directionalDerivative } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('directionalDerivative matches analytical gradient dot product in 2D and 3D', () => {
	const f2 = ([x, y]) => x * x + 3 * x * y + y * y
	// grad f2(1, 2) = (8, 7), unit dir of (3, 4) is (0.6, 0.8) => 4.8 + 5.6 = 10.4
	const d2 = directionalDerivative(f2, [1, 2], [3, 4])
	assert.ok(Math.abs(d2 - 10.4) < 1e-7, `expected ~10.4, got ${d2}`)

	const f3 = ([x, y, z]) => Math.sin(x) * Math.exp(y) + z ** 3
	// grad f3(0, 0, 2) = (1, 0, 12), unit dir of (1, 1, 1) => 13 / sqrt(3)
	const expected3 = 13 / Math.sqrt(3)
	const d3 = directionalDerivative(f3, [0, 0, 2], [1, 1, 1])
	assert.ok(Math.abs(d3 - expected3) < 1e-7, `expected ~${expected3}, got ${d3}`)
})

test('directionalDerivative is invariant to positive direction scaling and negates on reversal', () => {
	const f = ([x, y]) => Math.exp(x) * Math.cos(y)
	const pt = [0.5, -0.3]
	const base = directionalDerivative(f, pt, [2, -5])
	const scaled = directionalDerivative(f, pt, [20, -50])
	const reversed = directionalDerivative(f, pt, [-2, 5])

	assert.ok(Math.abs(base - scaled) < 1e-9, `expected scale invariance: ${base} vs ${scaled}`)
	assert.ok(Math.abs(base + reversed) < 1e-9, `expected negation: ${base} vs ${reversed}`)
})

test('directionalDerivative along basis vectors equals partial derivatives and is exact on linear/constant functions', () => {
	const linear = ([x, y, z]) => 4 * x - 2.5 * y + 7 * z + 11
	assert.ok(Math.abs(directionalDerivative(linear, [10, -3, 2], [1, 0, 0]) - 4) < 1e-7)
	assert.ok(Math.abs(directionalDerivative(linear, [10, -3, 2], [0, 1, 0]) - -2.5) < 1e-7)
	assert.ok(Math.abs(directionalDerivative(linear, [10, -3, 2], [0, 0, 1]) - 7) < 1e-7)

	const constant = () => 42
	assert.equal(directionalDerivative(constant, [1, 2, 3], [1, -1, 2]), 0)
})

test('directionalDerivative supports 1D inputs, custom step size h, and does not mutate inputs', () => {
	const cubic = ([x]) => x ** 3
	const point = [2]
	const dir = [-5]
	const d = directionalDerivative(cubic, point, dir, 1e-5)
	assert.ok(Math.abs(d - -12) < 1e-6, `expected ~-12, got ${d}`)
	assert.deepEqual(point, [2])
	assert.deepEqual(dir, [-5])
})

test('directionalDerivative throws on zero direction vector and invalid arguments', () => {
	const f = ([x, y]) => x + y
	assert.throws(() => directionalDerivative(f, [1, 2], [0, 0]), /non-zero/i)
	assert.throws(() => directionalDerivative(f, [1, 2, 3], [0, 0, 0]), /non-zero/i)
	assert.throws(() => directionalDerivative(() => 0, [], []), /non-zero/i)
	assert.throws(() => directionalDerivative(f, [1, 2], [1, 0, 0]), /same length/i)
	assert.throws(() => directionalDerivative(f, [1, 2], [1, 0], 0), /positive/i)
	assert.throws(() => directionalDerivative(f, [1, 2], [1, 0], -1e-6), /positive/i)
})
