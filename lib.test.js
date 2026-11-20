import { test } from 'node:test'
import assert from 'node:assert'
import { add, betaFunction } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-12) {
	const diff = Math.abs(actual - expected)
	const tol = Math.max(absTol, relTol * Math.abs(expected))
	assert.ok(
		diff <= tol,
		`Expected ${actual} to be close to ${expected} (diff=${diff}, tol=${tol})`,
	)
}

test('betaFunction: exact integer values B(m, n) = (m-1)!(n-1)!/(m+n-1)!', () => {
	assertClose(betaFunction(1, 1), 1)
	assertClose(betaFunction(1, 5), 1 / 5)
	assertClose(betaFunction(2, 3), 1 / 12)
	assertClose(betaFunction(3, 4), 1 / 60)
	assertClose(betaFunction(5, 6), 1 / 1260)
})

test('betaFunction: half-integer and non-integer known values', () => {
	assertClose(betaFunction(0.5, 0.5), Math.PI)
	assertClose(betaFunction(0.5, 1), 2)
	assertClose(betaFunction(1.5, 1.5), Math.PI / 8)
	assertClose(betaFunction(0.25, 0.75), Math.PI / Math.sin(Math.PI / 4))
})

test('betaFunction: symmetry B(x, y) === B(y, x)', () => {
	const pairs = [
		[0.3, 4.7],
		[2.5, 7.1],
		[10, 0.1],
		[15.4, 23.8],
	]
	for (const [x, y] of pairs) {
		assertClose(betaFunction(x, y), betaFunction(y, x))
	}
})

test('betaFunction: recurrence and additive identities', () => {
	const pairs = [
		[0.4, 1.8],
		[2.3, 3.7],
		[5, 8],
	]
	for (const [x, y] of pairs) {
		assertClose(betaFunction(x + 1, y), (x / (x + y)) * betaFunction(x, y))
		assertClose(betaFunction(x, y), betaFunction(x + 1, y) + betaFunction(x, y + 1))
	}
})

test('betaFunction: large and small positive arguments without overflow', () => {
	let logRef = 0
	for (let k = 1; k <= 99; k++) {
		logRef += 2 * Math.log(k)
	}
	for (let k = 1; k <= 199; k++) {
		logRef -= Math.log(k)
	}
	assertClose(betaFunction(100, 100), Math.exp(logRef), 1e-11)

	assertClose(betaFunction(1e-6, 1), 1e6, 1e-10)
	assertClose(betaFunction(1, 1e-4), 1e4, 1e-10)
})

test('betaFunction: rejects non-positive, non-finite, and non-numeric inputs', () => {
	assert.throws(() => betaFunction(0, 1), RangeError)
	assert.throws(() => betaFunction(1, 0), RangeError)
	assert.throws(() => betaFunction(-1, 2), RangeError)
	assert.throws(() => betaFunction(2, -0.5), RangeError)
	assert.throws(() => betaFunction(NaN, 1), RangeError)
	assert.throws(() => betaFunction(1, Infinity), RangeError)
	assert.throws(() => betaFunction('1', 2), RangeError)
})
