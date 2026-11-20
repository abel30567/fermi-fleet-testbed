import { test } from 'node:test'
import assert from 'node:assert'
import { add, gammaLanczos } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function assertClose(actual, expected, relTol = 1e-12) {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		diff <= relTol * scale,
		`expected ${actual} to be within relative tolerance ${relTol} of ${expected} (diff=${diff})`,
	)
}

test('gammaLanczos matches exact factorials for positive integers', () => {
	let factorial = 1
	for (let n = 1; n <= 12; n++) {
		if (n > 1) factorial *= n - 1
		assertClose(gammaLanczos(n), factorial, 1e-12)
	}
})

test('gammaLanczos matches known half-integer values', () => {
	const sqrtPi = Math.sqrt(Math.PI)
	assertClose(gammaLanczos(0.5), sqrtPi)
	assertClose(gammaLanczos(1.5), 0.5 * sqrtPi)
	assertClose(gammaLanczos(2.5), 0.75 * sqrtPi)
	assertClose(gammaLanczos(3.5), 1.875 * sqrtPi)
})

test('gammaLanczos satisfies recurrence relation Γ(z + 1) = z * Γ(z)', () => {
	for (const z of [0.1, 0.3, 0.75, 1.25, 2.7, 5.4, 10.8]) {
		assertClose(gammaLanczos(z + 1), z * gammaLanczos(z), 1e-12)
	}
})

test('gammaLanczos satisfies Euler reflection formula Γ(z)Γ(1 - z) = π / sin(πz)', () => {
	for (const z of [0.05, 0.2, 0.25, 1 / 3, 0.49]) {
		assertClose(gammaLanczos(z) * gammaLanczos(1 - z), Math.PI / Math.sin(Math.PI * z), 1e-12)
	}
})

test('gammaLanczos satisfies Legendre duplication formula', () => {
	for (const z of [0.25, 0.5, 1.3, 3.2, 6.5]) {
		const lhs = gammaLanczos(z) * gammaLanczos(z + 0.5)
		const rhs = Math.pow(2, 1 - 2 * z) * Math.sqrt(Math.PI) * gammaLanczos(2 * z)
		assertClose(lhs, rhs, 1e-12)
	}
})

test('gammaLanczos handles boundary values (very small, large, and Infinity)', () => {
	assertClose(gammaLanczos(1e-6), 1e6, 1e-5)
	assertClose(gammaLanczos(171), 7.257415615307999e306, 1e-11)
	assert.equal(gammaLanczos(172), Infinity)
	assert.equal(gammaLanczos(Infinity), Infinity)
})

test('gammaLanczos rejects non-positive and non-numeric inputs', () => {
	for (const invalid of [0, -0, -1, -0.5, -Infinity, NaN, '2', null, undefined]) {
		assert.throws(() => gammaLanczos(invalid), RangeError)
	}
})
