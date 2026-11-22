import { describe, test } from 'node:test'
import assert from 'node:assert'
import { permutationsFloatRecursive } from './permutationsFloatRecursive.js'

/**
 * Independent BigInt reference implementation of P(n, k) = n! / (n - k)!
 * using BigInt factorials.
 */
function factorialBigInt(m) {
	let result = 1n
	for (let i = 2n; i <= BigInt(m); i++) {
		result *= i
	}
	return result
}

function permutationsBigIntByFactorial(n, k) {
	if (k > n) return 0n
	return factorialBigInt(n) / factorialBigInt(n - k)
}

/**
 * Independent iterative BigInt range product for large n, small k
 * where computing n! directly would be slow.
 */
function permutationsBigIntIterative(n, k) {
	if (k > n) return 0n
	let result = 1n
	const start = BigInt(n - k + 1)
	const end = BigInt(n)
	for (let i = start; i <= end; i++) {
		result *= i
	}
	return result
}

describe('permutationsFloatRecursive', () => {
	test('computes normal cases accurately', () => {
		assert.strictEqual(permutationsFloatRecursive(5, 1), 5)
		assert.strictEqual(permutationsFloatRecursive(5, 2), 20)
		assert.strictEqual(permutationsFloatRecursive(5, 3), 60)
		assert.strictEqual(permutationsFloatRecursive(5, 4), 120)
		assert.strictEqual(permutationsFloatRecursive(10, 4), 5040)
		assert.strictEqual(permutationsFloatRecursive(20, 5), 1860480)
		assert.strictEqual(permutationsFloatRecursive(12, 6), 665280)
	})

	test('handles k = 0 (returns 1, including n = 0)', () => {
		assert.strictEqual(permutationsFloatRecursive(0, 0), 1)
		assert.strictEqual(permutationsFloatRecursive(1, 0), 1)
		assert.strictEqual(permutationsFloatRecursive(42, 0), 1)
		assert.strictEqual(permutationsFloatRecursive(Number.MAX_SAFE_INTEGER, 0), 1)
		assert.strictEqual(permutationsFloatRecursive(-0, -0), 1)
		assert.strictEqual(permutationsFloatRecursive(7, -0), 1)
	})

	test('handles k = n (returns n!)', () => {
		assert.strictEqual(permutationsFloatRecursive(0, 0), 1)
		assert.strictEqual(permutationsFloatRecursive(1, 1), 1)
		assert.strictEqual(permutationsFloatRecursive(2, 2), 2)
		assert.strictEqual(permutationsFloatRecursive(5, 5), 120)
		assert.strictEqual(permutationsFloatRecursive(10, 10), 3628800)
		assert.strictEqual(permutationsFloatRecursive(18, 18), 6402373705728000)
		assert.ok(Number.isFinite(permutationsFloatRecursive(170, 170)))
		assert.strictEqual(permutationsFloatRecursive(171, 171), Infinity)
	})

	test('handles k > n (returns 0)', () => {
		assert.strictEqual(permutationsFloatRecursive(0, 1), 0)
		assert.strictEqual(permutationsFloatRecursive(0, 100), 0)
		assert.strictEqual(permutationsFloatRecursive(3, 4), 0)
		assert.strictEqual(permutationsFloatRecursive(10, 25), 0)
		assert.strictEqual(permutationsFloatRecursive(170, 171), 0)
		assert.strictEqual(permutationsFloatRecursive(500, 1000), 0)
	})

	test('handles large n with small k without intermediate n! overflow', () => {
		// 171! overflows float64, so naive n!/(n-k)! would produce NaN (Infinity / Infinity)
		assert.strictEqual(permutationsFloatRecursive(200, 1), 200)
		assert.strictEqual(permutationsFloatRecursive(200, 2), 39800)
		assert.strictEqual(permutationsFloatRecursive(1000, 3), 997002000)
		assert.strictEqual(permutationsFloatRecursive(1000, 5), 990034950024000)
		assert.strictEqual(permutationsFloatRecursive(1_000_000, 2), 999999000000)
		assert.strictEqual(permutationsFloatRecursive(Number.MAX_SAFE_INTEGER, 1), Number.MAX_SAFE_INTEGER)
	})

	test('overflows cleanly to Infinity when true value exceeds Number.MAX_VALUE', () => {
		assert.strictEqual(permutationsFloatRecursive(171, 171), Infinity)
		assert.strictEqual(permutationsFloatRecursive(200, 171), Infinity)
		assert.strictEqual(permutationsFloatRecursive(1000, 110), Infinity)
		assert.strictEqual(permutationsFloatRecursive(1_000_000_000, 1_000_000_000), Infinity)
	})

	test('rejects invalid inputs with strict validation', () => {
		const nonNumbers = ['5', null, undefined, 5n, true, false, {}, []]
		for (const bad of nonNumbers) {
			assert.throws(() => permutationsFloatRecursive(bad, 1), TypeError)
			assert.throws(() => permutationsFloatRecursive(5, bad), TypeError)
		}

		const outOfRange = [
			-1,
			-100,
			1.5,
			0.1,
			-0.5,
			NaN,
			Infinity,
			-Infinity,
			Number.MAX_SAFE_INTEGER + 1,
			1e20
		]
		for (const bad of outOfRange) {
			assert.throws(() => permutationsFloatRecursive(bad, 1), RangeError)
			assert.throws(() => permutationsFloatRecursive(5, bad), RangeError)
		}
	})

	test('cross-checks exhaustively against independent BigInt factorial computation for n <= 18', () => {
		for (let n = 0; n <= 18; n++) {
			for (let k = 0; k <= n + 2; k++) {
				const actual = permutationsFloatRecursive(n, k)
				const expected = Number(permutationsBigIntByFactorial(n, k))
				assert.strictEqual(actual, expected, `mismatch for P(${n}, ${k})`)
			}
		}
	})

	test('cross-checks large float64 values against independent BigInt computation', () => {
		const cases = [
			[25, 10],
			[25, 25],
			[50, 20],
			[100, 50],
			[170, 170],
			[500, 12],
			[10_000, 15],
			[1_000_000, 10],
			[100_000_000, 5]
		]

		for (const [n, k] of cases) {
			const actual = permutationsFloatRecursive(n, k)
			const expectedBigInt = permutationsBigIntIterative(n, k)
			const expected = Number(expectedBigInt)
			assert.ok(Number.isFinite(actual), `expected finite result for P(${n}, ${k})`)
			const relErr = Math.abs(actual - expected) / expected
			assert.ok(
				relErr <= 1e-14,
				`relative error too high for P(${n}, ${k}): actual=${actual}, expected=${expected}, relErr=${relErr}`
			)
		}
	})
})
