import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { combinationsTypedMemo } from './combinationsTypedMemo.js'

/**
 * Independent reference implementation using BigInt factorials: n! / (k! * (n - k)!).
 * @param {number} n
 * @param {number} k
 * @returns {number}
 */
function factorialBigInt(m) {
	let f = 1n
	for (let i = 2n; i <= BigInt(m); i++) {
		f *= i
	}
	return f
}

function combReference(n, k) {
	if (k > n) return 0
	return Number(
		factorialBigInt(n) / (factorialBigInt(k) * factorialBigInt(n - k)),
	)
}

describe('combinationsTypedMemo', () => {
	test('computes standard small and medium combinations element-wise', () => {
		const ns = new Float64Array([0, 1, 1, 5, 6, 10, 20, 52])
		const ks = new Float64Array([0, 0, 1, 2, 3, 4, 10, 5])
		const result = combinationsTypedMemo(ns, ks)

		assert.ok(result instanceof Float64Array)
		assert.deepEqual(
			result,
			new Float64Array([1, 1, 1, 10, 20, 210, 184756, 2598960]),
		)
	})

	test('handles precomputed table boundary and memoized large-n path', () => {
		const ns = new Float64Array([65, 66, 67, 68, 100, 100, 200, 500])
		const ks = new Float64Array([3, 3, 3, 4, 5, 95, 4, 3])
		const expected = new Float64Array([
			43680,
			45760,
			47905,
			814385,
			75287520,
			75287520,
			64684950,
			20708500,
		])

		const first = combinationsTypedMemo(ns, ks)
		const second = combinationsTypedMemo(ns, ks)
		assert.deepEqual(first, expected)
		assert.deepEqual(second, expected)
	})

	test('handles edge cases: empty arrays, k=0, k=n, k>n, -0, and large r=1', () => {
		assert.deepEqual(
			combinationsTypedMemo(new Float64Array(0), new Float64Array(0)),
			new Float64Array(0),
		)

		const ns = new Float64Array([0, 5, 70, 100, -0, 1e15, 1e15, 1e15])
		const ks = new Float64Array([1, 6, 71, 150, -0, 0, 1, 1e15])
		const result = combinationsTypedMemo(ns, ks)

		assert.deepEqual(
			result,
			new Float64Array([0, 0, 0, 0, 1, 1, 1e15, 1]),
		)
	})

	test('handles Float64 overflow boundary cleanly without hanging', () => {
		const ns = new Float64Array([1029, 1030, 1e15, 1e308])
		const ks = new Float64Array([514, 515, 5e14, 2])
		const result = combinationsTypedMemo(ns, ks)

		assert.ok(Number.isFinite(result[0]))
		assert.equal(result[0], combReference(1029, 514))
		assert.equal(result[1], Infinity)
		assert.equal(result[2], Infinity)
		assert.equal(result[3], Infinity)
	})

	test('does not mutate input arrays and returns a fresh Float64Array', () => {
		const ns = new Float64Array([5, 10, 70])
		const ks = new Float64Array([2, 3, 4])
		const nsCopy = new Float64Array(ns)
		const ksCopy = new Float64Array(ks)

		const out = combinationsTypedMemo(ns, ks)
		assert.notEqual(out, ns)
		assert.notEqual(out, ks)
		assert.deepEqual(ns, nsCopy)
		assert.deepEqual(ks, ksCopy)
	})

	test('validates input types, lengths, and element domains', () => {
		assert.throws(
			() => combinationsTypedMemo([5], new Float64Array([2])),
			TypeError,
		)
		assert.throws(
			() => combinationsTypedMemo(new Float64Array([5]), [2]),
			TypeError,
		)
		assert.throws(
			() => combinationsTypedMemo(new Int32Array([5]), new Float64Array([2])),
			TypeError,
		)
		assert.throws(
			() => combinationsTypedMemo(null, new Float64Array([2])),
			TypeError,
		)

		assert.throws(
			() =>
				combinationsTypedMemo(
					new Float64Array([5, 6]),
					new Float64Array([2]),
				),
			RangeError,
		)

		const invalidPairs = [
			[-1, 0],
			[5, -1],
			[5.5, 2],
			[5, 2.5],
			[NaN, 2],
			[5, NaN],
			[Infinity, 2],
			[5, Infinity],
			[-Infinity, 0],
		]

		for (const [n, k] of invalidPairs) {
			assert.throws(
				() =>
					combinationsTypedMemo(new Float64Array([n]), new Float64Array([k])),
				RangeError,
				`Expected RangeError for (${n}, ${k})`,
			)
		}
	})

	test('independent cross-check against BigInt factorial definition for n = 0..80', () => {
		const nList = []
		const kList = []
		for (let n = 0; n <= 80; n++) {
			for (let k = 0; k <= n; k++) {
				nList.push(n)
				kList.push(k)
			}
		}

		const ns = Float64Array.from(nList)
		const ks = Float64Array.from(kList)
		const actual = combinationsTypedMemo(ns, ks)

		for (let i = 0; i < actual.length; i++) {
			const expected = combReference(nList[i], kList[i])
			assert.equal(
				actual[i],
				expected,
				`Mismatch at C(${nList[i]}, ${kList[i]})`,
			)
		}
	})

	test('satisfies Pascal identity, binomial row-sum identity, and Vandermonde identity', () => {
		// Row sums: sum_{k=0..n} C(n, k) === 2^n for n = 0..52 (exact in Float64)
		for (let n = 0; n <= 52; n++) {
			const ns = new Float64Array(n + 1).fill(n)
			const ks = Float64Array.from({ length: n + 1 }, (_, k) => k)
			const row = combinationsTypedMemo(ns, ks)
			let sum = 0
			for (let k = 0; k <= n; k++) sum += row[k]
			assert.equal(sum, 2 ** n, `Row sum failed for n=${n}`)
		}

		// Pascal's identity: C(n, k) === C(n - 1, k - 1) + C(n - 1, k)
		for (let n = 1; n <= 50; n++) {
			const len = n - 1
			const ns = new Float64Array(len).fill(n)
			const ks = Float64Array.from({ length: len }, (_, idx) => idx + 1)
			const lhs = combinationsTypedMemo(ns, ks)
			const prevA = combinationsTypedMemo(
				new Float64Array(len).fill(n - 1),
				Float64Array.from({ length: len }, (_, idx) => idx),
			)
			const prevB = combinationsTypedMemo(
				new Float64Array(len).fill(n - 1),
				ks,
			)
			for (let i = 0; i < len; i++) {
				assert.equal(lhs[i], prevA[i] + prevB[i])
			}
		}

		// Vandermonde's identity: sum_{j=0..r} C(m, j) * C(n, r - j) === C(m + n, r)
		const m = 35
		const n = 40
		const r = 12
		const ms = new Float64Array(r + 1).fill(m)
		const js = Float64Array.from({ length: r + 1 }, (_, j) => j)
		const ns = new Float64Array(r + 1).fill(n)
		const rMinusJs = Float64Array.from({ length: r + 1 }, (_, j) => r - j)
		const left = combinationsTypedMemo(ms, js)
		const right = combinationsTypedMemo(ns, rMinusJs)
		let vandermondeSum = 0
		for (let j = 0; j <= r; j++) {
			vandermondeSum += left[j] * right[j]
		}
		const target = combinationsTypedMemo(
			new Float64Array([m + n]),
			new Float64Array([r]),
		)[0]
		assert.equal(vandermondeSum, target)
	})
})
