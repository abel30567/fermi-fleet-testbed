import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { crossProductBigIntMemo } from './crossProductBigIntMemo.js'

/**
 * Independent reference cross product computed via explicit 3D Levi-Civita tensor summation.
 *
 * @param {readonly [bigint, bigint, bigint]} a
 * @param {readonly [bigint, bigint, bigint]} b
 * @returns {[bigint, bigint, bigint]}
 */
function referenceLeviCivitaCross(a, b) {
	const epsilon = (i, j, k) => {
		if (i === j || j === k || i === k) return 0n
		const inversions = (i > j ? 1 : 0) + (i > k ? 1 : 0) + (j > k ? 1 : 0)
		return inversions % 2 === 0 ? 1n : -1n
	}
	/** @type {[bigint, bigint, bigint]} */
	const out = [0n, 0n, 0n]
	for (let k = 0; k < 3; k++) {
		let sum = 0n
		for (let i = 0; i < 3; i++) {
			for (let j = 0; j < 3; j++) {
				const sign = epsilon(i, j, k)
				if (sign !== 0n) {
					sum += sign * a[i] * b[j]
				}
			}
		}
		out[k] = sum
	}
	return out
}

/**
 * Exact BigInt dot product helper for algebraic identity cross-checks.
 *
 * @param {readonly [bigint, bigint, bigint]} a
 * @param {readonly [bigint, bigint, bigint]} b
 * @returns {bigint}
 */
function dotBigInt(a, b) {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/**
 * Exact BigInt vector addition helper.
 *
 * @param {readonly [bigint, bigint, bigint]} a
 * @param {readonly [bigint, bigint, bigint]} b
 * @returns {[bigint, bigint, bigint]}
 */
function addVec(a, b) {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

/**
 * Exact BigInt scalar multiplication helper.
 *
 * @param {bigint} s
 * @param {readonly [bigint, bigint, bigint]} v
 * @returns {[bigint, bigint, bigint]}
 */
function scaleVec(s, v) {
	return [s * v[0], s * v[1], s * v[2]]
}

describe('crossProductBigIntMemo', () => {
	it('computes standard orthonormal basis cross products', () => {
		const i = [1n, 0n, 0n]
		const j = [0n, 1n, 0n]
		const k = [0n, 0n, 1n]

		assert.deepEqual(crossProductBigIntMemo(i, j), [0n, 0n, 1n])
		assert.deepEqual(crossProductBigIntMemo(j, k), [1n, 0n, 0n])
		assert.deepEqual(crossProductBigIntMemo(k, i), [0n, 1n, 0n])

		assert.deepEqual(crossProductBigIntMemo(j, i), [0n, 0n, -1n])
		assert.deepEqual(crossProductBigIntMemo(k, j), [-1n, 0n, 0n])
		assert.deepEqual(crossProductBigIntMemo(i, k), [0n, -1n, 0n])
	})

	it('computes general positive and negative integer vectors accurately', () => {
		assert.deepEqual(
			crossProductBigIntMemo([2n, 3n, 4n], [5n, 6n, 7n]),
			[-3n, 6n, -3n],
		)
		assert.deepEqual(
			crossProductBigIntMemo([-3n, 7n, -2n], [4n, -5n, 9n]),
			[53n, 19n, -13n],
		)
	})

	it('handles zero vectors and collinear / parallel vectors', () => {
		const zero = [0n, 0n, 0n]
		const v = [12n, -34n, 56n]

		assert.deepEqual(crossProductBigIntMemo(zero, zero), [0n, 0n, 0n])
		assert.deepEqual(crossProductBigIntMemo(v, zero), [0n, 0n, 0n])
		assert.deepEqual(crossProductBigIntMemo(zero, v), [0n, 0n, 0n])
		assert.deepEqual(crossProductBigIntMemo(v, v), [0n, 0n, 0n])
		assert.deepEqual(crossProductBigIntMemo(v, scaleVec(-17n, v)), [0n, 0n, 0n])
	})

	it('preserves exact precision for very large BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
		const big = 10n ** 40n
		const a = [big + 1n, big + 2n, big + 3n]
		const b = [big + 4n, big + 5n, big + 7n]

		// Exact hand-verified result:
		// cx = (big+2)(big+7) - (big+3)(big+5) = (big^2 + 9big + 14) - (big^2 + 8big + 15) = big - 1
		// cy = (big+3)(big+4) - (big+1)(big+7) = (big^2 + 7big + 12) - (big^2 + 8big + 7) = -big + 5
		// cz = (big+1)(big+5) - (big+2)(big+4) = (big^2 + 6big + 5) - (big^2 + 6big + 8) = -3
		assert.deepEqual(crossProductBigIntMemo(a, b), [big - 1n, -big + 5n, -3n])
	})

	it('memoizes results safely without exposing mutable cached state', () => {
		const a = [11n, 22n, 33n]
		const b = [7n, -5n, 13n]

		const first = crossProductBigIntMemo(a, b)
		assert.deepEqual(first, [451n, 88n, -209n])

		// Mutate returned array to confirm cache isolation
		first[0] = 999999n
		first[1] = 888888n
		first[2] = 777777n

		const second = crossProductBigIntMemo(a, b)
		assert.deepEqual(second, [451n, 88n, -209n])
		assert.notEqual(first, second)

		// Anti-symmetric reverse-pair lookup
		const reversed = crossProductBigIntMemo(b, a)
		assert.deepEqual(reversed, [-451n, -88n, 209n])
	})

	it('remains exact under cache eviction pressure (> 4096 distinct pairs)', () => {
		for (let n = 1n; n <= 4200n; n++) {
			const res = crossProductBigIntMemo([n, 0n, 0n], [0n, n + 1n, 0n])
			assert.deepEqual(res, [0n, 0n, n * (n + 1n)])
		}
		// Re-query evicted entry
		assert.deepEqual(crossProductBigIntMemo([1n, 0n, 0n], [0n, 2n, 0n]), [0n, 0n, 2n])
	})

	it('validates input types, lengths, and element types', () => {
		assert.throws(() => crossProductBigIntMemo(null, [1n, 2n, 3n]), TypeError)
		assert.throws(() => crossProductBigIntMemo([1n, 2n, 3n], undefined), TypeError)
		assert.throws(() => crossProductBigIntMemo('123', [1n, 2n, 3n]), TypeError)
		assert.throws(() => crossProductBigIntMemo({ 0: 1n, 1: 2n, 2: 3n, length: 3 }, [1n, 2n, 3n]), TypeError)

		assert.throws(() => crossProductBigIntMemo([], [1n, 2n, 3n]), RangeError)
		assert.throws(() => crossProductBigIntMemo([1n, 2n], [1n, 2n, 3n]), RangeError)
		assert.throws(() => crossProductBigIntMemo([1n, 2n, 3n], [1n, 2n, 3n, 4n]), RangeError)

		assert.throws(() => crossProductBigIntMemo([1, 2n, 3n], [1n, 2n, 3n]), TypeError)
		assert.throws(() => crossProductBigIntMemo([1n, 2n, 3n], [1n, '2', 3n]), TypeError)
		assert.throws(() => crossProductBigIntMemo(new Array(3), [1n, 2n, 3n]), TypeError)
	})

	it('cross-checks against independent Levi-Civita summation and vector algebra identities', () => {
		// Deterministic pseudo-random BigInt generator (LCG)
		let seed = 0x123456789abcdef1n
		const mod = 1n << 64n
		const nextBig = () => {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) % mod
			return seed - (1n << 63n)
		}

		for (let t = 0; t < 50; t++) {
			const a = [nextBig(), nextBig(), nextBig()]
			const b = [nextBig(), nextBig(), nextBig()]
			const c = [nextBig(), nextBig(), nextBig()]
			const s = nextBig()

			const ab = crossProductBigIntMemo(a, b)

			// 1. Independent Levi-Civita tensor reference check
			assert.deepEqual(ab, referenceLeviCivitaCross(a, b))

			// 2. Orthogonality: (a × b) · a = 0 and (a × b) · b = 0
			assert.equal(dotBigInt(ab, a), 0n)
			assert.equal(dotBigInt(ab, b), 0n)

			// 3. Anti-commutativity: b × a = -(a × b)
			assert.deepEqual(crossProductBigIntMemo(b, a), scaleVec(-1n, ab))

			// 4. Lagrange's identity: |a × b|^2 = |a|^2 |b|^2 - (a · b)^2
			const normSqAB = dotBigInt(ab, ab)
			const lagrangeRhs = dotBigInt(a, a) * dotBigInt(b, b) - dotBigInt(a, b) ** 2n
			assert.equal(normSqAB, lagrangeRhs)

			// 5. Bilinearity: (a + b) × c = (a × c) + (b × c) and (s * a) × b = s * (a × b)
			assert.deepEqual(
				crossProductBigIntMemo(addVec(a, b), c),
				addVec(crossProductBigIntMemo(a, c), crossProductBigIntMemo(b, c)),
			)
			assert.deepEqual(
				crossProductBigIntMemo(scaleVec(s, a), b),
				scaleVec(s, ab),
			)

			// 6. Jacobi identity: a × (b × c) + b × (c × a) + c × (a × b) = 0
			const term1 = crossProductBigIntMemo(a, crossProductBigIntMemo(b, c))
			const term2 = crossProductBigIntMemo(b, crossProductBigIntMemo(c, a))
			const term3 = crossProductBigIntMemo(c, ab)
			assert.deepEqual(addVec(addVec(term1, term2), term3), [0n, 0n, 0n])

			// 7. BAC-CAB triple product: a × (b × c) = b(a · c) - c(a · b)
			const bac = scaleVec(dotBigInt(a, c), b)
			const cab = scaleVec(dotBigInt(a, b), c)
			assert.deepEqual(term1, addVec(bac, scaleVec(-1n, cab)))
		}
	})
})
