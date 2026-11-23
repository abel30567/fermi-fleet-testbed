import { test } from 'node:test'
import assert from 'node:assert'
import { combinationsBigIntStable } from './combinationsBigIntStable.js'

function factorialBigInt(n) {
	let acc = 1n
	for (let i = 2n; i <= n; i += 1n) {
		acc *= i
	}
	return acc
}

test('normal cases match known exact binomial coefficients', () => {
	assert.strictEqual(combinationsBigIntStable(5n, 2n), 10n)
	assert.strictEqual(combinationsBigIntStable(6n, 3n), 20n)
	assert.strictEqual(combinationsBigIntStable(10n, 4n), 210n)
	assert.strictEqual(combinationsBigIntStable(20n, 10n), 184756n)
	assert.strictEqual(combinationsBigIntStable(52n, 5n), 2598960n)
	assert.strictEqual(
		combinationsBigIntStable(100n, 50n),
		100891344545564193334812497256n,
	)
})

test('edge cases: k = 0n, k = n, k = 1n, k = n - 1n, and k > n', () => {
	assert.strictEqual(combinationsBigIntStable(0n, 0n), 1n)
	assert.strictEqual(combinationsBigIntStable(1n, 0n), 1n)
	assert.strictEqual(combinationsBigIntStable(1n, 1n), 1n)
	assert.strictEqual(combinationsBigIntStable(42n, 0n), 1n)
	assert.strictEqual(combinationsBigIntStable(42n, 42n), 1n)
	assert.strictEqual(combinationsBigIntStable(42n, 1n), 42n)
	assert.strictEqual(combinationsBigIntStable(42n, 41n), 42n)

	// k > n returns 0n
	assert.strictEqual(combinationsBigIntStable(0n, 1n), 0n)
	assert.strictEqual(combinationsBigIntStable(5n, 6n), 0n)
	assert.strictEqual(combinationsBigIntStable(10n, 10n ** 30n), 0n)
})

test('symmetry C(n, k) === C(n, n - k)', () => {
	const pairs = [
		[15n, 4n],
		[37n, 12n],
		[100n, 27n],
		[250n, 83n],
		[10n ** 18n, 5n],
		[10n ** 30n, 3n],
	]
	for (const [n, k] of pairs) {
		assert.strictEqual(
			combinationsBigIntStable(n, k),
			combinationsBigIntStable(n, n - k),
			`symmetry failed for n=${n}, k=${k}`,
		)
	}
})

test('large n with small k and near-n k via symmetry', () => {
	const bigN = 10n ** 18n
	const expected3 = (bigN * (bigN - 1n) * (bigN - 2n)) / 6n
	assert.strictEqual(combinationsBigIntStable(bigN, 3n), expected3)
	assert.strictEqual(combinationsBigIntStable(bigN, bigN - 3n), expected3)

	const hugeN = 10n ** 30n + 7n
	const expected2 = (hugeN * (hugeN - 1n)) / 2n
	assert.strictEqual(combinationsBigIntStable(hugeN, 2n), expected2)
	assert.strictEqual(combinationsBigIntStable(hugeN, hugeN - 2n), expected2)
	assert.strictEqual(combinationsBigIntStable(hugeN, 0n), 1n)
	assert.strictEqual(combinationsBigIntStable(hugeN, hugeN), 1n)
	assert.strictEqual(combinationsBigIntStable(hugeN, 1n), hugeN)
	assert.strictEqual(combinationsBigIntStable(hugeN, hugeN - 1n), hugeN)
})

test('cross-check against direct factorial formula for large central binomials', () => {
	for (const [n, k] of [
		[50n, 25n],
		[200n, 73n],
		[500n, 250n],
		[1000n, 500n],
	]) {
		const expected =
			factorialBigInt(n) / (factorialBigInt(k) * factorialBigInt(n - k))
		assert.strictEqual(
			combinationsBigIntStable(n, k),
			expected,
			`factorial cross-check failed for C(${n}, ${k})`,
		)
	}
})

test("cross-check: Pascal's identity C(n, k) = C(n - 1, k - 1) + C(n - 1, k)", () => {
	for (let n = 1n; n <= 30n; n += 1n) {
		for (let k = 1n; k < n; k += 1n) {
			const lhs = combinationsBigIntStable(n, k)
			const rhs =
				combinationsBigIntStable(n - 1n, k - 1n) +
				combinationsBigIntStable(n - 1n, k)
			assert.strictEqual(lhs, rhs, `Pascal failed for n=${n}, k=${k}`)
		}
	}

	// Larger spot checks
	for (const [n, k] of [
		[200n, 97n],
		[500n, 250n],
		[10n ** 15n, 25n],
	]) {
		assert.strictEqual(
			combinationsBigIntStable(n, k),
			combinationsBigIntStable(n - 1n, k - 1n) +
				combinationsBigIntStable(n - 1n, k),
		)
	}
})

test('cross-check: row sum equals 2^n and alternating sum equals 0', () => {
	for (let n = 0n; n <= 35n; n += 1n) {
		let sum = 0n
		let altSum = 0n
		for (let k = 0n; k <= n; k += 1n) {
			const c = combinationsBigIntStable(n, k)
			sum += c
			altSum += k % 2n === 0n ? c : -c
		}
		assert.strictEqual(sum, 1n << n, `row sum failed for n=${n}`)
		assert.strictEqual(altSum, n === 0n ? 1n : 0n, `alt sum failed for n=${n}`)
	}

	// Larger row sum spot check at n = 100
	let sum100 = 0n
	for (let k = 0n; k <= 100n; k += 1n) {
		sum100 += combinationsBigIntStable(100n, k)
	}
	assert.strictEqual(sum100, 1n << 100n)
})

test("cross-check: Vandermonde's identity and absorption identity", () => {
	// Vandermonde: sum_{j=0..r} C(m, j) * C(n, r - j) === C(m + n, r)
	const m = 40n
	const n = 35n
	const r = 25n
	let vandermonde = 0n
	for (let j = 0n; j <= r; j += 1n) {
		vandermonde +=
			combinationsBigIntStable(m, j) * combinationsBigIntStable(n, r - j)
	}
	assert.strictEqual(vandermonde, combinationsBigIntStable(m + n, r))

	// Absorption: k * C(n, k) === n * C(n - 1, k - 1)
	for (const [nn, kk] of [
		[17n, 6n],
		[300n, 123n],
		[10n ** 20n, 19n],
	]) {
		assert.strictEqual(
			kk * combinationsBigIntStable(nn, kk),
			nn * combinationsBigIntStable(nn - 1n, kk - 1n),
		)
	}
})

test('input validation rejects non-BigInt arguments with TypeError', () => {
	const invalidValues = [5, 0, NaN, Infinity, '5', null, undefined, true, {}, []]
	for (const bad of invalidValues) {
		assert.throws(() => combinationsBigIntStable(bad, 2n), TypeError)
		assert.throws(() => combinationsBigIntStable(5n, bad), TypeError)
	}
	assert.throws(() => combinationsBigIntStable(5, 2), TypeError)
})

test('input validation rejects negative BigInt arguments with RangeError', () => {
	assert.throws(() => combinationsBigIntStable(-1n, 0n), RangeError)
	assert.throws(() => combinationsBigIntStable(-10n, 3n), RangeError)
	assert.throws(() => combinationsBigIntStable(5n, -1n), RangeError)
	assert.throws(() => combinationsBigIntStable(0n, -1n), RangeError)
	assert.throws(() => combinationsBigIntStable(-5n, -2n), RangeError)
})
