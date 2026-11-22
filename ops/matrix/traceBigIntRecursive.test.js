import { test } from 'node:test'
import assert from 'node:assert/strict'
import { traceBigIntRecursive } from './traceBigIntRecursive.js'

/**
 * Naive iterative reference implementation for cross-checking.
 *
 * @param {readonly (readonly bigint[])[]} matrix
 * @returns {bigint}
 */
function naiveTrace(matrix) {
	let sum = 0n
	for (let i = 0; i < matrix.length; i++) {
		sum += matrix[i][i]
	}
	return sum
}

/**
 * Naive exact BigInt matrix multiplication A (m x k) * B (k x p) -> C (m x p).
 *
 * @param {readonly (readonly bigint[])[]} a
 * @param {readonly (readonly bigint[])[]} b
 * @returns {bigint[][]}
 */
function matMul(a, b) {
	const m = a.length
	const k = b.length
	const p = b[0].length
	const out = Array.from({ length: m }, () => new Array(p).fill(0n))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < p; j++) {
			let acc = 0n
			for (let t = 0; t < k; t++) {
				acc += a[i][t] * b[t][j]
			}
			out[i][j] = acc
		}
	}
	return out
}

/**
 * Transpose of a BigInt matrix.
 *
 * @param {readonly (readonly bigint[])[]} a
 * @returns {bigint[][]}
 */
function transpose(a) {
	const m = a.length
	const n = m === 0 ? 0 : a[0].length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: m }, (_, j) => a[j][i])
	)
}

/**
 * Deterministic PRNG (LCG) for reproducible BigInt test matrices.
 *
 * @param {bigint} seed
 * @returns {() => bigint}
 */
function makeRng(seed) {
	let state = seed
	const mod = 2n ** 64n
	return () => {
		state = (state * 6364136223846793005n + 1442695040888963407n) % mod
		return state - 2n ** 63n
	}
}

test('traceBigIntRecursive: normal small matrices (even and odd sizes)', () => {
	assert.equal(traceBigIntRecursive([[7n]]), 7n)
	assert.equal(traceBigIntRecursive([[-42n]]), -42n)
	assert.equal(traceBigIntRecursive([[0n]]), 0n)

	assert.equal(
		traceBigIntRecursive([
			[1n, 2n],
			[3n, 4n],
		]),
		5n
	)

	assert.equal(
		traceBigIntRecursive([
			[10n, -5n, 3n],
			[8n, -4n, 2n],
			[1n, 9n, 6n],
		]),
		12n
	)

	assert.equal(
		traceBigIntRecursive([
			[1n, 2n, 3n, 4n],
			[5n, 6n, 7n, 8n],
			[9n, 10n, 11n, 12n],
			[13n, 14n, 15n, 16n],
		]),
		34n
	)

	assert.equal(
		traceBigIntRecursive([
			[-10n, 1n, 2n, 3n, 4n],
			[5n, 20n, 6n, 7n, 8n],
			[9n, 10n, -30n, 11n, 12n],
			[13n, 14n, 15n, 40n, 16n],
			[17n, 18n, 19n, 20n, -20n],
		]),
		0n
	)
})

test('traceBigIntRecursive: edge cases (empty 0x0, zero, identity, off-diagonal independence, immutability)', () => {
	// Empty 0x0 matrix has trace 0n
	assert.equal(traceBigIntRecursive([]), 0n)

	// Zero matrix
	const zero3 = Array.from({ length: 3 }, () => [0n, 0n, 0n])
	assert.equal(traceBigIntRecursive(zero3), 0n)

	// Identity matrices of various sizes
	for (const n of [1, 2, 3, 7, 16, 31]) {
		const id = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => (i === j ? 1n : 0n))
		)
		assert.equal(traceBigIntRecursive(id), BigInt(n))
	}

	// Off-diagonal entries (even huge ones) do not affect the trace
	const upperTri = [
		[3n, 10n ** 80n, -(10n ** 90n)],
		[0n, -5n, 10n ** 100n],
		[0n, 0n, 9n],
	]
	assert.equal(traceBigIntRecursive(upperTri), 7n)

	// Input matrix is not mutated
	const original = [
		[1n, 2n],
		[3n, 4n],
	]
	const snapshot = original.map((r) => [...r])
	assert.equal(traceBigIntRecursive(original), 5n)
	assert.deepEqual(original, snapshot)
})

test('traceBigIntRecursive: large BigInts and fixed-point 10^18 scaled matrices', () => {
	const big1 = 10n ** 100n + 123456789012345678901234567890n
	const big2 = -(10n ** 100n) + 987654321098765432109876543210n
	const big3 = 2n ** 256n - 1n

	const mat = [
		[big1, 99n, -99n],
		[42n, big2, 17n],
		[-88n, 55n, big3],
	]
	assert.equal(traceBigIntRecursive(mat), big1 + big2 + big3)

	// Fixed-point 10^18 scaled entries preserve exact scaling under trace
	const SCALE = 10n ** 18n
	const scaledMat = [
		[1n * SCALE + 500_000_000_000_000_000n, 2n * SCALE],
		[-3n * SCALE, 2n * SCALE + 250_000_000_000_000_000n],
	]
	// 1.5 + 2.25 = 3.75
	assert.equal(
		traceBigIntRecursive(scaledMat),
		3n * SCALE + 750_000_000_000_000_000n
	)
})

test('traceBigIntRecursive: larger dimension (256x256) avoids stack overflow and matches closed form', () => {
	const n = 256
	const matrix = Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => BigInt(i === j ? i + 1 : i - j))
	)
	const expected = (BigInt(n) * BigInt(n + 1)) / 2n
	assert.equal(traceBigIntRecursive(matrix), expected)
})

test('traceBigIntRecursive: strict input validation (TypeError and RangeError)', () => {
	// Non-array top-level inputs -> TypeError
	for (const bad of [null, undefined, 0, 123n, 'matrix', {}, true]) {
		assert.throws(() => traceBigIntRecursive(bad), TypeError)
	}

	// Non-array rows -> TypeError
	assert.throws(() => traceBigIntRecursive([1n, 2n]), TypeError)
	assert.throws(() => traceBigIntRecursive([[1n, 2n], null]), TypeError)
	assert.throws(() => traceBigIntRecursive([[1n, 2n], 'row']), TypeError)
	assert.throws(() => traceBigIntRecursive(new Array(2)), TypeError)

	// Non-square / ragged dimensions -> RangeError
	assert.throws(() => traceBigIntRecursive([[]]), RangeError)
	assert.throws(() => traceBigIntRecursive([[1n, 2n]]), RangeError)
	assert.throws(() => traceBigIntRecursive([[1n], [2n]]), RangeError)
	assert.throws(
		() =>
			traceBigIntRecursive([
				[1n, 2n],
				[3n],
			]),
		RangeError
	)
	assert.throws(
		() =>
			traceBigIntRecursive([
				[1n, 2n, 3n],
				[4n, 5n, 6n],
			]),
		RangeError
	)

	// Non-BigInt entries (both on diagonal and off-diagonal) -> TypeError
	assert.throws(() => traceBigIntRecursive([[1]]), TypeError)
	assert.throws(
		() =>
			traceBigIntRecursive([
				[1n, 2],
				[3n, 4n],
			]),
		TypeError
	)
	assert.throws(
		() =>
			traceBigIntRecursive([
				[1n, 2n],
				['3', 4n],
			]),
		TypeError
	)
	assert.throws(
		() =>
			traceBigIntRecursive([
				[1n, undefined],
				[3n, 4n],
			]),
		TypeError
	)
	assert.throws(
		() =>
			traceBigIntRecursive([
				[1n, Number.NaN],
				[3n, 4n],
			]),
		TypeError
	)
	assert.throws(() => traceBigIntRecursive([new Array(1)]), TypeError)
})

test('traceBigIntRecursive: cross-check against naive iterative reference across sizes 0..25', () => {
	const next = makeRng(20261122n)
	for (let n = 0; n <= 25; n++) {
		const matrix = Array.from({ length: n }, () =>
			Array.from({ length: n }, () => next() * (10n ** 12n) + next())
		)
		assert.equal(traceBigIntRecursive(matrix), naiveTrace(matrix))
	}
})

test('traceBigIntRecursive: algebraic identities (linearity, transpose, cyclic product, similarity)', () => {
	const next = makeRng(987654321n)
	const n = 6
	const makeSquare = () =>
		Array.from({ length: n }, () =>
			Array.from({ length: n }, () => next() % 10000n)
		)

	const A = makeSquare()
	const B = makeSquare()
	const alpha = 17n
	const beta = -29n

	// Linearity: tr(alpha * A + beta * B) = alpha * tr(A) + beta * tr(B)
	const combo = A.map((row, i) =>
		row.map((val, j) => alpha * val + beta * B[i][j])
	)
	assert.equal(
		traceBigIntRecursive(combo),
		alpha * traceBigIntRecursive(A) + beta * traceBigIntRecursive(B)
	)

	// Transpose invariance: tr(A^T) = tr(A)
	assert.equal(traceBigIntRecursive(transpose(A)), traceBigIntRecursive(A))

	// Cyclic property for square matrices: tr(A * B) = tr(B * A)
	assert.equal(
		traceBigIntRecursive(matMul(A, B)),
		traceBigIntRecursive(matMul(B, A))
	)

	// Cyclic property for rectangular matrices: A (3x5), B (5x3) => tr(AB) = tr(BA)
	const rectA = Array.from({ length: 3 }, () =>
		Array.from({ length: 5 }, () => next() % 1000n)
	)
	const rectB = Array.from({ length: 5 }, () =>
		Array.from({ length: 3 }, () => next() % 1000n)
	)
	assert.equal(
		traceBigIntRecursive(matMul(rectA, rectB)),
		traceBigIntRecursive(matMul(rectB, rectA))
	)

	// Similarity invariance: tr(P * D * P^-1) = tr(D) for unimodular P in SL_3(Z)
	const P = [
		[1n, 2n, 3n],
		[0n, 1n, 4n],
		[0n, 0n, 1n],
	]
	const PInv = [
		[1n, -2n, 5n],
		[0n, 1n, -4n],
		[0n, 0n, 1n],
	]
	const D = [
		[111111111111111111111n, 0n, 0n],
		[0n, -222222222222222222222n, 0n],
		[0n, 0n, 333333333333333333333n],
	]
	const similar = matMul(matMul(P, D), PInv)
	assert.equal(traceBigIntRecursive(similar), traceBigIntRecursive(D))
})

test('traceBigIntRecursive: cross-check against JS Number arithmetic on safe-integer matrices', () => {
	const small = [
		[12, -7, 3, 9],
		[4, 15, -2, 8],
		[-6, 1, -11, 5],
		[2, 13, 0, 21],
	]
	const bigSmall = small.map((row) => row.map((x) => BigInt(x)))
	const numTrace = small.reduce((acc, row, i) => acc + row[i], 0)
	assert.equal(traceBigIntRecursive(bigSmall), BigInt(numTrace))
})
