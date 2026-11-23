import { test } from 'node:test'
import assert from 'node:assert/strict'
import { permutationsRationalStable } from './permutationsRationalStable.js'

const R = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

function factorial(n) {
	let acc = 1n
	for (let i = 2n; i <= n; i++) {
		acc *= i
	}
	return acc
}

test('normal small cases', () => {
	assert.deepEqual(permutationsRationalStable(R(5), R(2)), R(20))
	assert.deepEqual(permutationsRationalStable(R(5), R(3)), R(60))
	assert.deepEqual(permutationsRationalStable(R(6), R(4)), R(360))
	assert.deepEqual(permutationsRationalStable(R(10), R(1)), R(10))
	assert.deepEqual(permutationsRationalStable(R(10), R(3)), R(720))
})

test('edge cases: k=0, k=n, k>n, n=0', () => {
	// P(n, 0) = 1 including P(0, 0) = 1
	assert.deepEqual(permutationsRationalStable(R(0), R(0)), R(1))
	assert.deepEqual(permutationsRationalStable(R(1), R(0)), R(1))
	assert.deepEqual(permutationsRationalStable(R(42), R(0)), R(1))

	// P(n, n) = n!
	assert.deepEqual(permutationsRationalStable(R(1), R(1)), R(1))
	assert.deepEqual(permutationsRationalStable(R(5), R(5)), R(120))
	assert.deepEqual(permutationsRationalStable(R(12), R(12)), R(479001600n))

	// P(n, k) = 0 when k > n
	assert.deepEqual(permutationsRationalStable(R(0), R(1)), R(0))
	assert.deepEqual(permutationsRationalStable(R(0), R(5)), R(0))
	assert.deepEqual(permutationsRationalStable(R(3), R(4)), R(0))
	assert.deepEqual(permutationsRationalStable(R(10), R(1000000000000n)), R(0))
})

test('unreduced rational integer inputs and negative denominators', () => {
	// 10/2 = 5, 6/3 = 2 => P(5, 2) = 20
	assert.deepEqual(permutationsRationalStable(R(10, 2), R(6, 3)), R(20))
	// (-10)/(-2) = 5, (-9)/(-3) = 3 => P(5, 3) = 60
	assert.deepEqual(permutationsRationalStable(R(-10, -2), R(-9, -3)), R(60))
	// 0/(-7) = 0 => P(5, 0) = 1
	assert.deepEqual(permutationsRationalStable(R(15, 3), R(0, -7)), R(1))
	// 0/5 = 0, 0/(-2) = 0 => P(0, 0) = 1
	assert.deepEqual(permutationsRationalStable(R(0, 5), R(0, -2)), R(1))
})

test('large n with small k avoids computing full factorials', () => {
	// P(1000, 3) = 1000 * 999 * 998 = 997002000
	assert.deepEqual(permutationsRationalStable(R(1000), R(3)), R(997002000n))

	// Extremely large n where n! would be completely intractable, but k = 3
	const hugeN = 10n ** 30n
	const expected = hugeN * (hugeN - 1n) * (hugeN - 2n)
	assert.deepEqual(permutationsRationalStable(R(hugeN), R(3)), R(expected))

	// Large k=1 fast path with massive n
	assert.deepEqual(permutationsRationalStable(R(hugeN), R(1)), R(hugeN))
})

test('moderately large binary-splitting product matches exact factorial ratio', () => {
	// P(200, 100) = 200! / 100!
	const expected = factorial(200n) / factorial(100n)
	const actual = permutationsRationalStable(R(200), R(100))
	assert.deepEqual(actual, R(expected))
	assert.equal(actual.den, 1n)
})

test('independent cross-check against factorial definition P(n, k) = n! / (n - k)!', () => {
	for (let n = 0n; n <= 14n; n++) {
		for (let k = 0n; k <= n; k++) {
			const expected = factorial(n) / factorial(n - k)
			const actual = permutationsRationalStable(R(n), R(k))
			assert.deepEqual(actual, { num: expected, den: 1n }, `Failed at P(${n}, ${k})`)
		}
	}
})

test('independent cross-check against recurrence P(n, k) = n * P(n - 1, k - 1)', () => {
	for (let n = 1n; n <= 20n; n++) {
		for (let k = 1n; k <= n + 2n; k++) {
			const lhs = permutationsRationalStable(R(n), R(k))
			const prev = permutationsRationalStable(R(n - 1n), R(k - 1n))
			const rhs = { num: n * prev.num, den: prev.den }
			assert.deepEqual(lhs, rhs, `Recurrence failed at n=${n}, k=${k}`)
		}
	}
})

test('rejects negative and non-integer rational inputs', () => {
	// Negative integers
	assert.throws(() => permutationsRationalStable(R(-1), R(0)), RangeError)
	assert.throws(() => permutationsRationalStable(R(5), R(-1)), RangeError)
	assert.throws(() => permutationsRationalStable(R(5, -1), R(2)), RangeError)
	assert.throws(() => permutationsRationalStable(R(5), R(2, -1)), RangeError)

	// Non-integer rationals
	assert.throws(() => permutationsRationalStable(R(5, 2), R(1)), RangeError)
	assert.throws(() => permutationsRationalStable(R(5), R(3, 2)), RangeError)
	assert.throws(() => permutationsRationalStable(R(1, 3), R(0)), RangeError)

	// Zero denominator
	assert.throws(() => permutationsRationalStable(R(5, 0), R(2)), RangeError)
	assert.throws(() => permutationsRationalStable(R(5), R(0, 0)), RangeError)
})

test('rejects invalid input types', () => {
	assert.throws(() => permutationsRationalStable(null, R(2)), TypeError)
	assert.throws(() => permutationsRationalStable(R(5), undefined), TypeError)
	assert.throws(() => permutationsRationalStable(5, 2), TypeError)
	assert.throws(() => permutationsRationalStable({ num: 5, den: 1n }, R(2)), TypeError)
	assert.throws(() => permutationsRationalStable(R(5), { num: 2n, den: 1 }), TypeError)
	assert.throws(() => permutationsRationalStable({}, R(2)), TypeError)
	assert.throws(() => permutationsRationalStable('5', '2'), TypeError)
})
