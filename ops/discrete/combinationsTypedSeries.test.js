import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { combinationsTypedSeries } from './combinationsTypedSeries.js'

/**
 * Independent BigInt factorial implementation of C(n, k) = n! / (k! * (n - k)!).
 * Used as an independent mathematical oracle for cross-checking.
 */
function factorialBigInt(m) {
	let acc = 1n
	for (let i = 2n; i <= BigInt(m); i++) {
		acc *= i
	}
	return acc
}

function combinationsViaFactorial(n, k) {
	if (k > n) return 0
	return Number(
		factorialBigInt(n) / (factorialBigInt(k) * factorialBigInt(n - k))
	)
}

/**
 * Independent Pascal's triangle DP table up to maxN using BigInt.
 */
function buildPascalTable(maxN) {
	const table = []
	for (let n = 0; n <= maxN; n++) {
		const row = new Array(n + 1)
		row[0] = 1n
		row[n] = 1n
		for (let k = 1; k < n; k++) {
			row[k] = table[n - 1][k - 1] + table[n - 1][k]
		}
		table.push(row)
	}
	return table
}

describe('combinationsTypedSeries', () => {
	describe('normal cases', () => {
		it('computes standard binomial coefficients element-wise', () => {
			const n = new Float64Array([0, 1, 5, 6, 10, 20, 52, 49, 50])
			const k = new Float64Array([0, 1, 2, 3, 3, 10, 5, 6, 25])
			const result = combinationsTypedSeries(n, k)

			assert.ok(result instanceof Float64Array)
			assert.equal(result.length, n.length)
			assert.deepEqual(
				Array.from(result),
				[1, 1, 10, 20, 120, 184756, 2598960, 13983816, 126410606437752]
			)
		})

		it('satisfies symmetry C(n, k) === C(n, n - k)', () => {
			const n = new Float64Array([10, 25, 40, 60, 100, 1000])
			const k = new Float64Array([3, 7, 15, 22, 37, 250])
			const kComp = Float64Array.from(n, (nv, i) => nv - k[i])

			const direct = combinationsTypedSeries(n, k)
			const symmetric = combinationsTypedSeries(n, kComp)

			assert.deepEqual(direct, symmetric)
		})

		it('does not mutate input Float64Arrays', () => {
			const n = new Float64Array([5, 10, 15])
			const k = new Float64Array([2, 4, 6])
			const nCopy = new Float64Array(n)
			const kCopy = new Float64Array(k)

			const out = combinationsTypedSeries(n, k)
			assert.notEqual(out, n)
			assert.notEqual(out, k)
			assert.deepEqual(n, nCopy)
			assert.deepEqual(k, kCopy)
		})
	})

	describe('edge cases', () => {
		it('handles empty Float64Array inputs', () => {
			const out = combinationsTypedSeries(new Float64Array(0), new Float64Array(0))
			assert.ok(out instanceof Float64Array)
			assert.equal(out.length, 0)
		})

		it('handles boundary cases k = 0, k = 1, k = n, and k > n', () => {
			const n = new Float64Array([0, 0, 5, 5, 5, 5, 5, 1000])
			const k = new Float64Array([0, 1, 0, 1, 4, 5, 6, 1001])
			const out = combinationsTypedSeries(n, k)

			assert.deepEqual(Array.from(out), [1, 0, 1, 5, 5, 1, 0, 0])
		})

		it('handles negative zero (-0) cleanly without returning -0', () => {
			const n = new Float64Array([-0, -0, 5])
			const k = new Float64Array([-0, 1, -0])
			const out = combinationsTypedSeries(n, k)

			assert.deepEqual(Array.from(out), [1, 0, 1])
			assert.ok(!Object.is(out[1], -0))
		})

		it('handles large finite values and Float64 overflow boundary accurately', () => {
			const n = new Float64Array([
				100,
				1000,
				1028,
				1029,
				1030,
				1030,
				2000,
				Number.MAX_SAFE_INTEGER,
				Number.MAX_SAFE_INTEGER,
				Number.MAX_SAFE_INTEGER,
				Number.MAX_SAFE_INTEGER,
				Number.MAX_SAFE_INTEGER,
			])
			const k = new Float64Array([
				50,
				500,
				514,
				514,
				514,
				515,
				1000,
				0,
				1,
				Number.MAX_SAFE_INTEGER,
				2,
				50,
			])
			const out = combinationsTypedSeries(n, k)

			assert.ok(Number.isFinite(out[0]))
			assert.ok(Number.isFinite(out[1]))
			assert.ok(Number.isFinite(out[2]))
			assert.ok(Number.isFinite(out[3]))
			assert.equal(out[4], Infinity)
			assert.equal(out[5], Infinity)
			assert.equal(out[6], Infinity)
			assert.equal(out[7], 1)
			assert.equal(out[8], Number.MAX_SAFE_INTEGER)
			assert.equal(out[9], 1)

			// Independent check for C(MAX_SAFE_INTEGER, 2) = n * (n - 1) / 2
			const maxBig = BigInt(Number.MAX_SAFE_INTEGER)
			const expectedPair = Number((maxBig * (maxBig - 1n)) / 2n)
			assert.equal(out[10], expectedPair)
			assert.equal(out[11], Infinity)
		})

		it('avoids false overflow on large n with small k (no log-gamma cancellation)', () => {
			// C(1e15, 20) ~ 4.11e281 is finite in Float64 despite huge ln(Gamma(1e15 + 1))
			const n = new Float64Array([1e15])
			const k = new Float64Array([20])
			const out = combinationsTypedSeries(n, k)

			assert.ok(Number.isFinite(out[0]))
			// Cross-check exact value via BigInt product
			let expected = 1n
			const N = 1000000000000000n
			for (let j = 1n; j <= 20n; j++) {
				expected = (expected * (N - 20n + j)) / j
			}
			assert.equal(out[0], Number(expected))
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when inputs are not Float64Array', () => {
			const valid = new Float64Array([5])
			const invalidInputs = [
				null,
				undefined,
				[5],
				new Int32Array([5]),
				new Float32Array([5]),
				5,
				'5',
				{},
			]

			for (const bad of invalidInputs) {
				assert.throws(() => combinationsTypedSeries(bad, valid), TypeError)
				assert.throws(() => combinationsTypedSeries(valid, bad), TypeError)
			}
		})

		it('throws RangeError on mismatched lengths', () => {
			assert.throws(
				() =>
					combinationsTypedSeries(
						new Float64Array([5, 6]),
						new Float64Array([2])
					),
				RangeError
			)
		})

		it('throws RangeError on negative, non-integer, non-finite, or unsafe values', () => {
			const badValues = [
				-1,
				-100,
				0.5,
				2.7,
				NaN,
				Infinity,
				-Infinity,
				Number.MAX_SAFE_INTEGER + 1,
				1e20,
			]

			for (const bad of badValues) {
				assert.throws(
					() =>
						combinationsTypedSeries(
							new Float64Array([5, bad]),
							new Float64Array([2, 1])
						),
					RangeError
				)
				assert.throws(
					() =>
						combinationsTypedSeries(
							new Float64Array([5, 10]),
							new Float64Array([2, bad])
						),
					RangeError
				)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches Pascal triangle DP table across all 0 <= n <= 40, 0 <= k <= n', () => {
			const maxN = 40
			const pascal = buildPascalTable(maxN)
			const nArr = []
			const kArr = []
			const expected = []

			for (let n = 0; n <= maxN; n++) {
				for (let k = 0; k <= n; k++) {
					nArr.push(n)
					kArr.push(k)
					expected.push(Number(pascal[n][k]))
				}
			}

			const actual = combinationsTypedSeries(
				Float64Array.from(nArr),
				Float64Array.from(kArr)
			)
			assert.deepEqual(Array.from(actual), expected)
		})

		it('matches independent BigInt factorial definition for large binomials', () => {
			const pairs = [
				[60, 30],
				[100, 50],
				[200, 75],
				[500, 200],
				[1000, 500],
				[1028, 514],
				[1029, 514],
				[1030, 514],
			]

			const n = Float64Array.from(pairs, ([nv]) => nv)
			const k = Float64Array.from(pairs, ([, kv]) => kv)
			const actual = combinationsTypedSeries(n, k)

			for (let i = 0; i < pairs.length; i++) {
				const [nv, kv] = pairs[i]
				const expected = combinationsViaFactorial(nv, kv)
				assert.equal(actual[i], expected, `mismatch at C(${nv}, ${kv})`)
			}
		})

		it('satisfies row-sum identity sum_{k=0..n} C(n, k) = 2^n and Vandermonde identity', () => {
			// Row-sum identity for n = 24
			const nRow = 24
			const nVec = new Float64Array(nRow + 1).fill(nRow)
			const kVec = Float64Array.from({ length: nRow + 1 }, (_, i) => i)
			const row = combinationsTypedSeries(nVec, kVec)
			const rowSum = row.reduce((a, b) => a + b, 0)
			assert.equal(rowSum, 2 ** nRow)

			// Vandermonde identity: sum_{j=0..r} C(m, j) * C(n, r - j) = C(m + n, r)
			const m = 18
			const n = 22
			const r = 15
			const jVec = Float64Array.from({ length: r + 1 }, (_, j) => j)
			const rMinusJ = Float64Array.from({ length: r + 1 }, (_, j) => r - j)
			const left = combinationsTypedSeries(
				new Float64Array(r + 1).fill(m),
				jVec
			)
			const right = combinationsTypedSeries(
				new Float64Array(r + 1).fill(n),
				rMinusJ
			)
			let vandermondeSum = 0
			for (let j = 0; j <= r; j++) {
				vandermondeSum += left[j] * right[j]
			}
			const combined = combinationsTypedSeries(
				new Float64Array([m + n]),
				new Float64Array([r])
			)[0]
			assert.equal(vandermondeSum, combined)
		})
	})
})
