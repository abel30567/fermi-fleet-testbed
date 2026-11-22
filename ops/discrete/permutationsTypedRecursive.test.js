import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { permutationsTypedRecursive } from './permutationsTypedRecursive.js'

/**
 * Independent BigInt factorial-based reference implementation of P(n, k) = n! / (n - k)!.
 *
 * @param {number} n
 * @param {number} k
 * @returns {number}
 */
function referencePermutationsBigInt(n, k) {
	if (k === 0) return 1
	if (k > n) return 0
	const factorial = (m) => {
		let acc = 1n
		for (let i = 2n; i <= BigInt(m); i++) {
			acc *= i
		}
		return acc
	}
	return Number(factorial(n) / factorial(n - k))
}

/**
 * Independent iterative falling-factorial implementation of P(n, k).
 *
 * @param {number} n
 * @param {number} k
 * @returns {number}
 */
function referencePermutationsIterative(n, k) {
	if (k === 0) return 1
	if (k > n) return 0
	let result = 1
	for (let i = 0; i < k; i++) {
		result *= n - i
	}
	return result
}

describe('permutationsTypedRecursive', () => {
	test('computes standard element-wise permutations on Float64Array inputs', () => {
		const ns = new Float64Array([5, 6, 10, 4, 8])
		const ks = new Float64Array([3, 2, 4, 1, 5])
		const result = permutationsTypedRecursive(ns, ks)

		assert.ok(result instanceof Float64Array)
		assert.deepEqual(result, new Float64Array([60, 30, 5040, 4, 6720]))
	})

	test('does not mutate input Float64Arrays', () => {
		const ns = new Float64Array([5, 7, 3])
		const ks = new Float64Array([2, 3, 3])
		const nsCopy = new Float64Array(ns)
		const ksCopy = new Float64Array(ks)

		permutationsTypedRecursive(ns, ks)

		assert.deepEqual(ns, nsCopy)
		assert.deepEqual(ks, ksCopy)
	})

	test('handles edge cases: k = 0, k = n, k > n, and n = 0', () => {
		const ns = new Float64Array([0, 5, 0, 5, 3, 1, 7])
		const ks = new Float64Array([0, 0, 1, 5, 5, 1, 10])
		const result = permutationsTypedRecursive(ns, ks)

		assert.deepEqual(result, new Float64Array([1, 1, 0, 120, 0, 1, 0]))
	})

	test('handles negative zero (-0) cleanly as 0', () => {
		const ns = new Float64Array([-0, 5, -0])
		const ks = new Float64Array([-0, -0, 2])
		const result = permutationsTypedRecursive(ns, ks)

		assert.deepEqual(result, new Float64Array([1, 1, 0]))
		assert.ok(Object.is(result[2], 0))
	})

	test('handles empty Float64Array inputs', () => {
		const result = permutationsTypedRecursive(
			new Float64Array(0),
			new Float64Array(0),
		)

		assert.ok(result instanceof Float64Array)
		assert.equal(result.length, 0)
	})

	test('handles single-element Float64Array inputs', () => {
		const result = permutationsTypedRecursive(
			new Float64Array([9]),
			new Float64Array([4]),
		)
		assert.deepEqual(result, new Float64Array([3024]))
	})

	test('handles large values and float64 overflow to Infinity gracefully', () => {
		const ns = new Float64Array([170, 171, 1000, 1e12, 1e12])
		const ks = new Float64Array([170, 171, 500, 1, 200])
		const result = permutationsTypedRecursive(ns, ks)

		assert.ok(Number.isFinite(result[0]))
		assert.equal(result[1], Infinity)
		assert.equal(result[2], Infinity)
		assert.equal(result[3], 1e12)
		assert.equal(result[4], Infinity)
	})

	test('cross-checks all pairs 0 <= n <= 18, 0 <= k <= n + 2 against BigInt factorial and iterative reference', () => {
		const nList = []
		const kList = []
		for (let n = 0; n <= 18; n++) {
			for (let k = 0; k <= n + 2; k++) {
				nList.push(n)
				kList.push(k)
			}
		}

		const ns = new Float64Array(nList)
		const ks = new Float64Array(kList)
		const actual = permutationsTypedRecursive(ns, ks)

		for (let i = 0; i < ns.length; i++) {
			const expectedBigInt = referencePermutationsBigInt(ns[i], ks[i])
			const expectedIter = referencePermutationsIterative(ns[i], ks[i])
			assert.equal(
				actual[i],
				expectedBigInt,
				`Mismatch vs BigInt reference for P(${ns[i]}, ${ks[i]})`,
			)
			assert.equal(
				actual[i],
				expectedIter,
				`Mismatch vs iterative reference for P(${ns[i]}, ${ks[i]})`,
			)
		}
	})

	test('cross-checks large finite permutations up to 170! within float64 tolerance', () => {
		const pairs = [
			[25, 10],
			[50, 20],
			[100, 50],
			[170, 170],
			[170, 85],
		]
		const ns = new Float64Array(pairs.map(([n]) => n))
		const ks = new Float64Array(pairs.map(([, k]) => k))
		const actual = permutationsTypedRecursive(ns, ks)

		for (let i = 0; i < pairs.length; i++) {
			const [n, k] = pairs[i]
			const expected = referencePermutationsBigInt(n, k)
			const relErr = Math.abs(actual[i] - expected) / expected
			assert.ok(
				relErr <= 1e-13,
				`Relative error ${relErr} too large for P(${n}, ${k}): got ${actual[i]}, expected ${expected}`,
			)
		}
	})

	test('handles large array lengths without stack overflow', () => {
		const len = 10_000
		const ns = new Float64Array(len)
		const ks = new Float64Array(len)
		for (let i = 0; i < len; i++) {
			ns[i] = (i % 12) + 1
			ks[i] = i % 5
		}

		const result = permutationsTypedRecursive(ns, ks)
		assert.equal(result.length, len)
		for (let i = 0; i < len; i++) {
			assert.equal(result[i], referencePermutationsIterative(ns[i], ks[i]))
		}
	})

	test('throws TypeError when inputs are not Float64Array instances', () => {
		const valid = new Float64Array([5])

		assert.throws(() => permutationsTypedRecursive([5], valid), TypeError)
		assert.throws(() => permutationsTypedRecursive(valid, [2]), TypeError)
		assert.throws(
			() => permutationsTypedRecursive(new Float32Array([5]), valid),
			TypeError,
		)
		assert.throws(
			() => permutationsTypedRecursive(valid, new Int32Array([2])),
			TypeError,
		)
		assert.throws(() => permutationsTypedRecursive(null, valid), TypeError)
		assert.throws(() => permutationsTypedRecursive(valid, undefined), TypeError)
		assert.throws(() => permutationsTypedRecursive(5, 2), TypeError)
	})

	test('throws RangeError when input arrays have mismatched lengths', () => {
		assert.throws(
			() =>
				permutationsTypedRecursive(
					new Float64Array([5, 6]),
					new Float64Array([2]),
				),
			RangeError,
		)
		assert.throws(
			() =>
				permutationsTypedRecursive(
					new Float64Array(0),
					new Float64Array([1]),
				),
			RangeError,
		)
	})

	test('throws RangeError on negative, non-integer, non-finite, or unsafe-integer elements', () => {
		const invalidCases = [
			[[5, -1], [2, 1]],
			[[5, 4], [2, -1]],
			[[3.5], [2]],
			[[5], [1.2]],
			[[NaN], [1]],
			[[5], [NaN]],
			[[Infinity], [1]],
			[[5], [Infinity]],
			[[-Infinity], [1]],
			[[Number.MAX_SAFE_INTEGER + 1], [1]],
			[[5], [Number.MAX_SAFE_INTEGER + 1]],
		]

		for (const [nArr, kArr] of invalidCases) {
			assert.throws(
				() =>
					permutationsTypedRecursive(
						new Float64Array(nArr),
						new Float64Array(kArr),
					),
				RangeError,
				`Expected RangeError for ns=${JSON.stringify(nArr)}, ks=${JSON.stringify(kArr)}`,
			)
		}
	})
})
