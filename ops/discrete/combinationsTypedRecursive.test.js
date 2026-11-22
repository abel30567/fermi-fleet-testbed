import { describe, test } from 'node:test'
import assert from 'node:assert'
import { combinationsTypedRecursive } from './combinationsTypedRecursive.js'

/**
 * Independent reference: builds Pascal's triangle up to `maxN` using BigInt addition.
 *
 * @param {number} maxN
 * @returns {bigint[][]}
 */
function buildPascalsTriangle(maxN) {
	const triangle = []
	for (let n = 0; n <= maxN; n++) {
		const row = new Array(n + 1)
		row[0] = 1n
		row[n] = 1n
		for (let k = 1; k < n; k++) {
			row[k] = triangle[n - 1][k - 1] + triangle[n - 1][k]
		}
		triangle.push(row)
	}
	return triangle
}

/**
 * Independent reference: computes `n!` iteratively using BigInt.
 *
 * @param {number} n
 * @returns {bigint}
 */
function bigIntFactorial(n) {
	let acc = 1n
	for (let i = 2n; i <= BigInt(n); i++) {
		acc *= i
	}
	return acc
}

/**
 * Independent reference: computes `C(n, k)` via BigInt factorials.
 *
 * @param {number} n
 * @param {number} k
 * @returns {number}
 */
function combinationsViaFactorial(n, k) {
	if (k > n) return 0
	return Number(bigIntFactorial(n) / (bigIntFactorial(k) * bigIntFactorial(n - k)))
}

describe('combinationsTypedRecursive', () => {
	test('computes normal element-wise combinations and returns a new Float64Array', () => {
		const ns = new Float64Array([5, 6, 10, 12, 20, 30])
		const ks = new Float64Array([2, 3, 4, 5, 10, 15])
		const nsBefore = new Float64Array(ns)
		const ksBefore = new Float64Array(ks)

		const result = combinationsTypedRecursive(ns, ks)

		assert.ok(result instanceof Float64Array)
		assert.notStrictEqual(result, ns)
		assert.notStrictEqual(result, ks)
		assert.deepStrictEqual(result, new Float64Array([10, 20, 210, 792, 184756, 155117520]))
		assert.deepStrictEqual(ns, nsBefore)
		assert.deepStrictEqual(ks, ksBefore)
	})

	test('handles edge cases: k=0, k=n, k=1, k=n-1, k>n, and -0', () => {
		const ns = new Float64Array([0, 0, 1, 1, 1, 5, 5, 5, 5, 5, 10, -0, 7])
		const ks = new Float64Array([0, 1, 0, 1, 2, 0, 1, 4, 5, 6, 99, -0, -0])

		const result = combinationsTypedRecursive(ns, ks)

		assert.deepStrictEqual(
			result,
			new Float64Array([1, 0, 1, 1, 0, 1, 5, 5, 1, 0, 0, 1, 1])
		)
	})

	test('handles empty Float64Array inputs', () => {
		const result = combinationsTypedRecursive(new Float64Array(0), new Float64Array(0))

		assert.ok(result instanceof Float64Array)
		assert.strictEqual(result.length, 0)
	})

	test('handles single-element, odd/even lengths, aliased inputs, and subarray views', () => {
		assert.deepStrictEqual(
			combinationsTypedRecursive(new Float64Array([8]), new Float64Array([3])),
			new Float64Array([56])
		)

		const aliased = new Float64Array([0, 1, 4, 15, 50])
		assert.deepStrictEqual(
			combinationsTypedRecursive(aliased, aliased),
			new Float64Array([1, 1, 1, 1, 1])
		)

		const nBuf = new Float64Array([99, 7, 8, 9, 99])
		const kBuf = new Float64Array([99, 2, 4, 3, 99])
		assert.deepStrictEqual(
			combinationsTypedRecursive(nBuf.subarray(1, 4), kBuf.subarray(1, 4)),
			new Float64Array([21, 70, 84])
		)
	})

	test('satisfies symmetry C(n, k) === C(n, n - k)', () => {
		const nList = []
		const kList = []
		const symKList = []

		for (let n = 0; n <= 40; n++) {
			for (let k = 0; k <= n; k++) {
				nList.push(n)
				kList.push(k)
				symKList.push(n - k)
			}
		}

		const ns = new Float64Array(nList)
		const left = combinationsTypedRecursive(ns, new Float64Array(kList))
		const right = combinationsTypedRecursive(ns, new Float64Array(symKList))

		assert.deepStrictEqual(left, right)
	})

	test('handles large arrays without stack overflow', () => {
		const len = 2049
		const ns = new Float64Array(len)
		const ks = new Float64Array(len)
		const expected = new Float64Array(len)

		for (let i = 0; i < len; i++) {
			const n = i % 25
			const k = (i * 7) % 27
			ns[i] = n
			ks[i] = k
			expected[i] = combinationsViaFactorial(n, k)
		}

		assert.deepStrictEqual(combinationsTypedRecursive(ns, ks), expected)
	})

	test('handles large binomial coefficients and IEEE-754 overflow to Infinity', () => {
		// C(56, 28) = 7648690600760440 (exact safe integer)
		// C(1029, 514) is the largest central binomial fitting in float64 (~1.4e308)
		// C(1030, 515) overflows float64 to Infinity
		// C(100000, 50000) hits O(1) overflow short-circuit to Infinity
		// C(1000000, 2) = 499999500000 (exact safe integer)
		const ns = new Float64Array([56, 100, 1029, 1030, 100000, 1000000])
		const ks = new Float64Array([28, 50, 514, 515, 50000, 2])

		const result = combinationsTypedRecursive(ns, ks)

		assert.strictEqual(result[0], 7648690600760440)
		assert.strictEqual(result[1], combinationsViaFactorial(100, 50))
		assert.strictEqual(result[2], combinationsViaFactorial(1029, 514))
		assert.ok(Number.isFinite(result[2]))
		assert.strictEqual(result[3], Infinity)
		assert.strictEqual(result[4], Infinity)
		assert.strictEqual(result[5], 499999500000)
	})

	test('cross-checks all pairs up to n=35 against independent Pascal triangle', () => {
		const maxN = 35
		const triangle = buildPascalsTriangle(maxN)
		const nList = []
		const kList = []
		const expectedList = []

		for (let n = 0; n <= maxN; n++) {
			for (let k = 0; k <= n + 2; k++) {
				nList.push(n)
				kList.push(k)
				expectedList.push(k <= n ? Number(triangle[n][k]) : 0)
			}
		}

		const actual = combinationsTypedRecursive(new Float64Array(nList), new Float64Array(kList))
		assert.deepStrictEqual(actual, new Float64Array(expectedList))

		// Verify row sums equal 2^n for each row
		for (let n = 0; n <= maxN; n++) {
			const rowN = new Float64Array(n + 1).fill(n)
			const rowK = Float64Array.from({ length: n + 1 }, (_, k) => k)
			const rowVals = combinationsTypedRecursive(rowN, rowK)
			const sum = rowVals.reduce((a, b) => a + b, 0)
			assert.strictEqual(sum, 2 ** n)
		}
	})

	test('cross-checks medium and large pairs against independent BigInt factorial computation', () => {
		const pairs = [
			[0, 0],
			[1, 0],
			[1, 1],
			[10, 5],
			[25, 12],
			[40, 20],
			[52, 5],
			[56, 28],
			[60, 30],
			[100, 25],
			[200, 100],
			[500, 250],
			[1029, 514],
			[1030, 515],
		]

		const ns = Float64Array.from(pairs, ([n]) => n)
		const ks = Float64Array.from(pairs, ([, k]) => k)
		const expected = Float64Array.from(pairs, ([n, k]) => combinationsViaFactorial(n, k))

		assert.deepStrictEqual(combinationsTypedRecursive(ns, ks), expected)
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const valid = new Float64Array([5])
		const invalidInputs = [
			[5],
			new Float32Array([5]),
			new Int32Array([5]),
			null,
			undefined,
			5,
			'5',
			{ length: 1, 0: 5 },
		]

		for (const bad of invalidInputs) {
			assert.throws(() => combinationsTypedRecursive(bad, valid), TypeError)
			assert.throws(() => combinationsTypedRecursive(valid, bad), TypeError)
		}
	})

	test('throws RangeError for mismatched input lengths', () => {
		assert.throws(
			() => combinationsTypedRecursive(new Float64Array([5, 6]), new Float64Array([2])),
			RangeError
		)
		assert.throws(
			() => combinationsTypedRecursive(new Float64Array(0), new Float64Array([0])),
			RangeError
		)
	})

	test('throws RangeError for invalid element values (negative, fractional, non-finite, unsafe)', () => {
		const badValues = [-1, -100, 1.5, -0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]

		for (const bad of badValues) {
			assert.throws(
				() => combinationsTypedRecursive(new Float64Array([5, bad]), new Float64Array([2, 1])),
				RangeError
			)
			assert.throws(
				() => combinationsTypedRecursive(new Float64Array([5, 5]), new Float64Array([2, bad])),
				RangeError
			)
		}
	})
})
