import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { combinationsFloatRecursive } from './combinationsFloatRecursive.js'

/**
 * Independent BigInt reference implementation using factorials:
 * C(n, k) = n! / (k! * (n - k)!).
 */
function factorialBigInt(m) {
	let result = 1n
	for (let i = 2n; i <= m; i++) {
		result *= i
	}
	return result
}

function combinationsBigIntRef(n, k) {
	if (k > n) return 0n
	const bn = BigInt(n)
	const bk = BigInt(k)
	return factorialBigInt(bn) / (factorialBigInt(bk) * factorialBigInt(bn - bk))
}

describe('combinationsFloatRecursive', () => {
	test('computes standard binomial coefficients accurately', () => {
		assert.equal(combinationsFloatRecursive(5, 2), 10)
		assert.equal(combinationsFloatRecursive(6, 3), 20)
		assert.equal(combinationsFloatRecursive(10, 3), 120)
		assert.equal(combinationsFloatRecursive(20, 10), 184756)
		assert.equal(combinationsFloatRecursive(52, 5), 2598960)
		assert.equal(combinationsFloatRecursive(60, 20), 4191844505805495)
	})

	test('handles edge cases: k=0, k=1, k=n, k>n, and -0', () => {
		// k = 0
		assert.equal(combinationsFloatRecursive(0, 0), 1)
		assert.equal(combinationsFloatRecursive(1, 0), 1)
		assert.equal(combinationsFloatRecursive(100, 0), 1)
		assert.equal(combinationsFloatRecursive(Number.MAX_SAFE_INTEGER, 0), 1)

		// k = n
		assert.equal(combinationsFloatRecursive(1, 1), 1)
		assert.equal(combinationsFloatRecursive(7, 7), 1)
		assert.equal(combinationsFloatRecursive(1000, 1000), 1)
		assert.equal(
			combinationsFloatRecursive(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
			1,
		)

		// k = 1 and k = n - 1
		assert.equal(combinationsFloatRecursive(42, 1), 42)
		assert.equal(combinationsFloatRecursive(42, 41), 42)
		assert.equal(
			combinationsFloatRecursive(Number.MAX_SAFE_INTEGER, 1),
			Number.MAX_SAFE_INTEGER,
		)
		assert.equal(
			combinationsFloatRecursive(
				Number.MAX_SAFE_INTEGER,
				Number.MAX_SAFE_INTEGER - 1,
			),
			Number.MAX_SAFE_INTEGER,
		)

		// k > n -> 0
		assert.equal(combinationsFloatRecursive(0, 1), 0)
		assert.equal(combinationsFloatRecursive(5, 6), 0)
		assert.equal(combinationsFloatRecursive(10, 100), 0)
		assert.equal(combinationsFloatRecursive(5, Number.MAX_SAFE_INTEGER), 0)

		// negative zero treated as 0
		assert.equal(combinationsFloatRecursive(-0, -0), 1)
		assert.equal(combinationsFloatRecursive(5, -0), 1)
	})

	test('satisfies symmetry C(n, k) === C(n, n - k)', () => {
		for (let n = 0; n <= 25; n++) {
			for (let k = 0; k <= n; k++) {
				assert.equal(
					combinationsFloatRecursive(n, k),
					combinationsFloatRecursive(n, n - k),
					`symmetry failed for n=${n}, k=${k}`,
				)
			}
		}

		assert.equal(
			combinationsFloatRecursive(100, 37),
			combinationsFloatRecursive(100, 63),
		)
		assert.equal(
			combinationsFloatRecursive(1029, 514),
			combinationsFloatRecursive(1029, 515),
		)
	})

	test('satisfies Pascal identity C(n, k) === C(n - 1, k - 1) + C(n - 1, k)', () => {
		for (let n = 1; n <= 25; n++) {
			for (let k = 1; k < n; k++) {
				assert.equal(
					combinationsFloatRecursive(n, k),
					combinationsFloatRecursive(n - 1, k - 1) +
						combinationsFloatRecursive(n - 1, k),
					`Pascal identity failed for n=${n}, k=${k}`,
				)
			}
		}

		assert.equal(
			combinationsFloatRecursive(50, 15),
			combinationsFloatRecursive(49, 14) + combinationsFloatRecursive(49, 15),
		)
	})

	test('satisfies row sum identity sum_{k=0..n} C(n, k) === 2^n', () => {
		for (let n = 0; n <= 20; n++) {
			let sum = 0
			for (let k = 0; k <= n; k++) {
				sum += combinationsFloatRecursive(n, k)
			}
			assert.equal(sum, 2 ** n)
		}
	})

	test('cross-checks exact and large values against independent BigInt computation', () => {
		// Exhaustive exact match for all 0 <= k <= n <= 50 (all fit in safe integers except n=50 near middle? C(50,25)=1.26e14 < 9e15)
		for (let n = 0; n <= 50; n++) {
			for (let k = 0; k <= n; k++) {
				const expected = Number(combinationsBigIntRef(n, k))
				assert.equal(
					combinationsFloatRecursive(n, k),
					expected,
					`exact BigInt mismatch at C(${n}, ${k})`,
				)
			}
		}

		// Large values exceeding Number.MAX_SAFE_INTEGER but finite in float64
		const largeCases = [
			[60, 30],
			[100, 50],
			[200, 100],
			[500, 250],
			[1000, 500],
			[1029, 514],
		]

		for (const [n, k] of largeCases) {
			const expected = Number(combinationsBigIntRef(n, k))
			const actual = combinationsFloatRecursive(n, k)
			assert.ok(Number.isFinite(actual), `expected finite result for C(${n}, ${k})`)
			const relErr = Math.abs(actual - expected) / expected
			assert.ok(
				relErr < 1e-13,
				`relative error too large for C(${n}, ${k}): actual=${actual}, expected=${expected}, relErr=${relErr}`,
			)
		}
	})

	test('returns Infinity on float64 overflow without overflowing the call stack', () => {
		assert.equal(combinationsFloatRecursive(1030, 514), Infinity)
		assert.equal(combinationsFloatRecursive(1030, 515), Infinity)
		assert.equal(combinationsFloatRecursive(1_000_000, 500_000), Infinity)
		assert.equal(combinationsFloatRecursive(Number.MAX_SAFE_INTEGER, 25), Infinity)
	})

	test('throws TypeError on non-number inputs', () => {
		const invalidTypes = ['5', null, undefined, 5n, true, {}, []]
		for (const bad of invalidTypes) {
			assert.throws(() => combinationsFloatRecursive(bad, 2), TypeError)
			assert.throws(() => combinationsFloatRecursive(5, bad), TypeError)
		}
	})

	test('throws RangeError on negative, non-integer, non-finite, or unsafe-integer inputs', () => {
		const invalidNumbers = [
			-1,
			-100,
			1.5,
			-0.5,
			NaN,
			Infinity,
			-Infinity,
			Number.MAX_SAFE_INTEGER + 1,
			1e20,
		]
		for (const bad of invalidNumbers) {
			assert.throws(() => combinationsFloatRecursive(bad, 2), RangeError)
			assert.throws(() => combinationsFloatRecursive(5, bad), RangeError)
		}
	})
})
