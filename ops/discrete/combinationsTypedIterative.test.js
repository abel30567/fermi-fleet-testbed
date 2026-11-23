import { test } from 'node:test'
import assert from 'node:assert/strict'
import { combinationsTypedIterative } from './combinationsTypedIterative.js'

/**
 * Independent BigInt factorial implementation of C(n, k) for cross-checking.
 *
 * @param {number} n
 * @param {number} k
 * @returns {bigint}
 */
function exactCombinationsBigInt(n, k) {
	if (k > n) return 0n
	let num = 1n
	let den = 1n
	for (let i = 1n; i <= BigInt(n); i++) {
		num *= i
	}
	for (let i = 1n; i <= BigInt(k); i++) {
		den *= i
	}
	for (let i = 1n; i <= BigInt(n - k); i++) {
		den *= i
	}
	return num / den
}

test('normal cases: known values and non-mutation', () => {
	const n = new Float64Array([5, 10, 6, 20, 30])
	const k = new Float64Array([2, 3, 3, 10, 15])
	const nCopy = new Float64Array(n)
	const kCopy = new Float64Array(k)

	const result = combinationsTypedIterative(n, k)

	assert.ok(result instanceof Float64Array)
	assert.deepEqual(result, new Float64Array([10, 120, 20, 184756, 155117520]))
	assert.deepEqual(n, nCopy)
	assert.deepEqual(k, kCopy)
})

test('normal cases: symmetry C(n, k) === C(n, n - k)', () => {
	const n = new Float64Array([7, 12, 19, 35, 50])
	const k = new Float64Array([2, 4, 6, 11, 17])
	const complement = new Float64Array(n.length)
	for (let i = 0; i < n.length; i++) {
		complement[i] = n[i] - k[i]
	}

	assert.deepEqual(
		combinationsTypedIterative(n, k),
		combinationsTypedIterative(n, complement),
	)
})

test('edge cases: empty arrays, boundaries, k > n, and -0', () => {
	const emptyResult = combinationsTypedIterative(
		new Float64Array(0),
		new Float64Array(0),
	)
	assert.ok(emptyResult instanceof Float64Array)
	assert.equal(emptyResult.length, 0)

	const n = new Float64Array([0, 0, 5, 5, 5, 5, 5, 3, -0, 5])
	const k = new Float64Array([0, 1, 0, 1, 4, 5, 6, 100, -0, -0])
	const expected = new Float64Array([1, 0, 1, 5, 5, 1, 0, 0, 1, 1])

	assert.deepEqual(combinationsTypedIterative(n, k), expected)
})

test('edge cases: subarray views with non-zero byteOffset', () => {
	const nBuf = new Float64Array([99, 8, 9, 10, 99])
	const kBuf = new Float64Array([99, 3, 4, 5, 99])
	const nView = nBuf.subarray(1, 4)
	const kView = kBuf.subarray(1, 4)

	assert.deepEqual(
		combinationsTypedIterative(nView, kView),
		new Float64Array([56, 126, 252]),
	)
})

test('edge cases: large safe integers, float regime, and overflow to Infinity', () => {
	const n = new Float64Array([50, 54, 100, 1030])
	const k = new Float64Array([25, 27, 50, 515])

	const result = combinationsTypedIterative(n, k)

	assert.equal(result[0], 126410606437752)
	assert.equal(result[1], 1946939425648112)

	const expected100 = Number(exactCombinationsBigInt(100, 50))
	const relErr = Math.abs(result[2] - expected100) / expected100
	assert.ok(relErr < 1e-13, `expected relative error < 1e-13, got ${relErr}`)

	assert.equal(result[3], Infinity)
})

test('input validation: rejects non-Float64Array inputs with TypeError', () => {
	const valid = new Float64Array([5])
	for (const bad of [[5], new Int32Array([5]), null, undefined, 5, '5']) {
		assert.throws(() => combinationsTypedIterative(bad, valid), TypeError)
		assert.throws(() => combinationsTypedIterative(valid, bad), TypeError)
	}
})

test('input validation: rejects mismatched lengths with RangeError', () => {
	assert.throws(
		() => combinationsTypedIterative(new Float64Array([5, 6]), new Float64Array([2])),
		RangeError,
	)
})

test('input validation: rejects negative, fractional, non-finite, and unsafe integer elements', () => {
	const badValues = [
		-1,
		-100,
		1.5,
		0.1,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		Number.MAX_SAFE_INTEGER + 1,
	]
	for (const bad of badValues) {
		assert.throws(
			() => combinationsTypedIterative(new Float64Array([bad]), new Float64Array([0])),
			RangeError,
		)
		assert.throws(
			() => combinationsTypedIterative(new Float64Array([5]), new Float64Array([bad])),
			RangeError,
		)
	}
})

test('cross-check: matches Pascal triangle recurrence for all 0 <= n <= 25', () => {
	const maxN = 25
	const triangle = Array.from({ length: maxN + 1 }, (_, n) => new Float64Array(n + 1))
	for (let n = 0; n <= maxN; n++) {
		triangle[n][0] = 1
		triangle[n][n] = 1
		for (let k = 1; k < n; k++) {
			triangle[n][k] = triangle[n - 1][k - 1] + triangle[n - 1][k]
		}
	}

	const nList = []
	const kList = []
	const expectedList = []
	for (let n = 0; n <= maxN; n++) {
		for (let k = 0; k <= n; k++) {
			nList.push(n)
			kList.push(k)
			expectedList.push(triangle[n][k])
		}
	}

	const actual = combinationsTypedIterative(
		new Float64Array(nList),
		new Float64Array(kList),
	)
	assert.deepEqual(actual, new Float64Array(expectedList))
})

test('cross-check: matches BigInt factorial definition and binomial sum identity', () => {
	const pairs = [
		[15, 7],
		[28, 13],
		[40, 19],
		[52, 26],
		[55, 27],
		[60, 20],
		[80, 40],
	]
	const nArr = new Float64Array(pairs.map(([n]) => n))
	const kArr = new Float64Array(pairs.map(([, k]) => k))
	const actual = combinationsTypedIterative(nArr, kArr)

	for (let i = 0; i < pairs.length; i++) {
		const [n, k] = pairs[i]
		const exact = exactCombinationsBigInt(n, k)
		if (exact <= BigInt(Number.MAX_SAFE_INTEGER)) {
			assert.equal(actual[i], Number(exact))
		} else {
			const expected = Number(exact)
			const relErr = Math.abs(actual[i] - expected) / expected
			assert.ok(relErr < 1e-13, `C(${n}, ${k}) relErr=${relErr}`)
		}
	}

	for (let n = 0; n <= 30; n++) {
		const nRow = new Float64Array(n + 1).fill(n)
		const kRow = Float64Array.from({ length: n + 1 }, (_, k) => k)
		const row = combinationsTypedIterative(nRow, kRow)
		let sum = 0
		for (let i = 0; i < row.length; i++) {
			sum += row[i]
		}
		assert.equal(sum, 2 ** n)
	}
})
