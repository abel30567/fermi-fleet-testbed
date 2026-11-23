import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { permutationsTypedSeries } from './permutationsTypedSeries.js'

/**
 * Independent BigInt falling-factorial reference: P(n, k) = prod_{j=0..k-1} (n - j).
 * @param {number} n
 * @param {number} k
 * @returns {bigint}
 */
function exactPermutationsBigInt(n, k) {
	if (k > n) return 0n
	let acc = 1n
	for (let j = 0; j < k; j++) {
		acc *= BigInt(n - j)
	}
	return acc
}

/**
 * Independent Pascal's triangle binomial coefficient table for cross-checking
 * the identity P(n, k) = C(n, k) * k!.
 * @param {number} maxN
 * @returns {bigint[][]}
 */
function buildPascalTable(maxN) {
	const tri = []
	for (let n = 0; n <= maxN; n++) {
		const row = new Array(n + 1).fill(1n)
		for (let k = 1; k < n; k++) {
			row[k] = tri[n - 1][k - 1] + tri[n - 1][k]
		}
		tri.push(row)
	}
	return tri
}

describe('permutationsTypedSeries', () => {
	it('computes exact values for standard small and medium cases', () => {
		const ns = new Float64Array([0, 1, 5, 5, 5, 5, 5, 10, 12, 18])
		const ks = new Float64Array([0, 1, 0, 1, 2, 3, 5, 4, 6, 18])
		const result = permutationsTypedSeries(ns, ks)

		assert.ok(result instanceof Float64Array)
		assert.deepEqual(
			Array.from(result),
			[1, 1, 1, 5, 20, 60, 120, 5040, 665280, 6402373705728000]
		)
	})

	it('handles edge cases: empty arrays, k = 0, k > n, -0, and Float64 overflow', () => {
		// Empty inputs
		const empty = permutationsTypedSeries(new Float64Array(0), new Float64Array(0))
		assert.ok(empty instanceof Float64Array)
		assert.equal(empty.length, 0)

		// Boundary values including k > n and -0
		const ns = new Float64Array([0, -0, 0, 5, 50, 170, 171, 1000])
		const ks = new Float64Array([0, 0, 1, 6, 51, 170, 171, 105])
		const result = permutationsTypedSeries(ns, ks)

		assert.equal(result[0], 1)
		assert.equal(result[1], 1)
		assert.equal(result[2], 0)
		assert.equal(Object.is(result[2], -0), false)
		assert.equal(result[3], 0)
		assert.equal(result[4], 0)
		assert.ok(Number.isFinite(result[5]) && result[5] > 7.25e306)
		assert.equal(result[6], Infinity)
		assert.equal(result[7], Infinity)
	})

	it('does not mutate inputs and supports Float64Array subarrays', () => {
		const baseN = new Float64Array([99, 6, 7, 8, 99])
		const baseK = new Float64Array([99, 2, 3, 4, 99])
		const viewN = baseN.subarray(1, 4)
		const viewK = baseK.subarray(1, 4)

		const out = permutationsTypedSeries(viewN, viewK)
		assert.deepEqual(Array.from(out), [30, 210, 1680])
		assert.deepEqual(Array.from(baseN), [99, 6, 7, 8, 99])
		assert.deepEqual(Array.from(baseK), [99, 2, 3, 4, 99])
		assert.notEqual(out, viewN)
		assert.notEqual(out, viewK)
	})

	it('cross-checks all pairs 0 <= n <= 18, 0 <= k <= n + 2 against BigInt falling factorials', () => {
		const ns = []
		const ks = []
		const expected = []
		for (let n = 0; n <= 18; n++) {
			for (let k = 0; k <= n + 2; k++) {
				ns.push(n)
				ks.push(k)
				expected.push(Number(exactPermutationsBigInt(n, k)))
			}
		}

		const actual = permutationsTypedSeries(new Float64Array(ns), new Float64Array(ks))
		for (let i = 0; i < expected.length; i++) {
			assert.equal(actual[i], expected[i], `Mismatch at n=${ns[i]}, k=${ks[i]}`)
		}
	})

	it('cross-checks Stirling-series regime (n > 18 and n > 170 where n! overflows) against BigInt', () => {
		const pairs = [
			[19, 4],
			[19, 10],
			[20, 5],
			[20, 20],
			[25, 10],
			[30, 15],
			[50, 20],
			[100, 7],
			[100, 30],
			[170, 170],
			[200, 50],
			[500, 100],
			[1000, 2],
			[1000, 3],
			[1000, 5],
			[1000, 100],
			[1000000, 2],
			[1000000, 3],
			[1000000, 4],
		]

		const ns = new Float64Array(pairs.map(([n]) => n))
		const ks = new Float64Array(pairs.map(([, k]) => k))
		const actual = permutationsTypedSeries(ns, ks)

		for (let i = 0; i < pairs.length; i++) {
			const [n, k] = pairs[i]
			const exact = Number(exactPermutationsBigInt(n, k))
			assert.ok(Number.isFinite(actual[i]), `Expected finite result for P(${n}, ${k})`)
			const relErr = Math.abs(actual[i] - exact) / exact
			assert.ok(
				relErr < 1e-12,
				`Relative error too high for P(${n}, ${k}): got ${actual[i]}, expected ${exact}, relErr=${relErr}`
			)
		}
	})

	it('satisfies independent combinatorial identities (Pascal C(n,k)*k!, recurrence, chain rule)', () => {
		const maxN = 16
		const pascal = buildPascalTable(maxN)
		const fact = [1n]
		for (let i = 1; i <= maxN; i++) fact.push(fact[i - 1] * BigInt(i))

		// Identity 1: P(n, k) = C(n, k) * k!
		const ns = []
		const ks = []
		const expectedFromPascal = []
		for (let n = 0; n <= maxN; n++) {
			for (let k = 0; k <= n; k++) {
				ns.push(n)
				ks.push(k)
				expectedFromPascal.push(Number(pascal[n][k] * fact[k]))
			}
		}
		const pVals = permutationsTypedSeries(new Float64Array(ns), new Float64Array(ks))
		for (let i = 0; i < ns.length; i++) {
			assert.equal(pVals[i], expectedFromPascal[i], `P(${ns[i]}, ${ks[i]}) != C*k!`)
		}

		// Identity 2: P(n, k) = P(n - 1, k) + k * P(n - 1, k - 1) for 1 <= k <= n
		const recN = new Float64Array([10, 15, 22, 35, 60])
		const recK = new Float64Array([4, 7, 6, 8, 5])
		const lhs = permutationsTypedSeries(recN, recK)
		const term1 = permutationsTypedSeries(
			recN.map((n) => n - 1),
			recK
		)
		const term2 = permutationsTypedSeries(
			recN.map((n) => n - 1),
			recK.map((k) => k - 1)
		)
		for (let i = 0; i < recN.length; i++) {
			const rhs = term1[i] + recK[i] * term2[i]
			const relErr = Math.abs(lhs[i] - rhs) / rhs
			assert.ok(relErr < 1e-13, `Recurrence failed at index ${i}: ${lhs[i]} vs ${rhs}`)
		}

		// Identity 3: Chain rule P(n, a + b) = P(n, a) * P(n - a, b)
		const chainN = new Float64Array([12, 20, 40, 120])
		const chainA = new Float64Array([4, 6, 10, 15])
		const chainB = new Float64Array([5, 7, 12, 20])
		const chainLHS = permutationsTypedSeries(
			chainN,
			chainA.map((a, i) => a + chainB[i])
		)
		const chainPart1 = permutationsTypedSeries(chainN, chainA)
		const chainPart2 = permutationsTypedSeries(
			chainN.map((n, i) => n - chainA[i]),
			chainB
		)
		for (let i = 0; i < chainN.length; i++) {
			const rhs = chainPart1[i] * chainPart2[i]
			const relErr = Math.abs(chainLHS[i] - rhs) / rhs
			assert.ok(relErr < 1e-13, `Chain rule failed at index ${i}: ${chainLHS[i]} vs ${rhs}`)
		}
	})

	it('validates input types, lengths, and element domains', () => {
		const valid = new Float64Array([5])

		// Type errors
		assert.throws(() => permutationsTypedSeries([5], valid), TypeError)
		assert.throws(() => permutationsTypedSeries(valid, [2]), TypeError)
		assert.throws(() => permutationsTypedSeries(new Int32Array([5]), valid), TypeError)
		assert.throws(() => permutationsTypedSeries(valid, new Float32Array([2])), TypeError)
		assert.throws(() => permutationsTypedSeries(null, valid), TypeError)
		assert.throws(() => permutationsTypedSeries(valid, undefined), TypeError)

		// Length mismatch
		assert.throws(
			() => permutationsTypedSeries(new Float64Array([5, 6]), new Float64Array([2])),
			RangeError
		)

		// Invalid element values in nArray
		for (const bad of [-1, 2.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(
				() => permutationsTypedSeries(new Float64Array([bad]), new Float64Array([1])),
				RangeError,
				`Expected RangeError for n=${bad}`
			)
		}

		// Invalid element values in kArray
		for (const bad of [-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(
				() => permutationsTypedSeries(new Float64Array([5]), new Float64Array([bad])),
				RangeError,
				`Expected RangeError for k=${bad}`
			)
		}
	})
})
