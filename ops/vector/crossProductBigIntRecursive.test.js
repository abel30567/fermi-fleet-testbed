import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { crossProductBigIntRecursive } from './crossProductBigIntRecursive.js'

/** Independent direct reference implementation for cross-checking. */
function naiveCross(a, b) {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	]
}

function dot(a, b) {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function vecAdd(a, b) {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function vecSub(a, b) {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function vecScale(s, v) {
	return [s * v[0], s * v[1], s * v[2]]
}

describe('crossProductBigIntRecursive', () => {
	it('computes standard right-handed basis cross products', () => {
		const i = [1n, 0n, 0n]
		const j = [0n, 1n, 0n]
		const k = [0n, 0n, 1n]

		assert.deepEqual(crossProductBigIntRecursive(i, j), k)
		assert.deepEqual(crossProductBigIntRecursive(j, k), i)
		assert.deepEqual(crossProductBigIntRecursive(k, i), j)

		assert.deepEqual(crossProductBigIntRecursive(j, i), [0n, 0n, -1n])
		assert.deepEqual(crossProductBigIntRecursive(k, j), [-1n, 0n, 0n])
		assert.deepEqual(crossProductBigIntRecursive(i, k), [0n, -1n, 0n])
	})

	it('computes normal positive, negative, and mixed vectors accurately', () => {
		assert.deepEqual(
			crossProductBigIntRecursive([2n, 3n, 4n], [5n, 6n, 7n]),
			[-3n, 6n, -3n],
		)
		assert.deepEqual(
			crossProductBigIntRecursive([-3n, 5n, -7n], [11n, -13n, 17n]),
			[-6n, -26n, -16n],
		)
		assert.deepEqual(
			crossProductBigIntRecursive([-1n, -2n, -3n], [-4n, -5n, -6n]),
			[-3n, 6n, -3n],
		)
	})

	it('handles edge cases: zero vectors, self cross product, and collinear vectors', () => {
		const zero = [0n, 0n, 0n]
		const v = [42n, -99n, 12345678901234567890n]

		assert.deepEqual(crossProductBigIntRecursive(zero, zero), zero)
		assert.deepEqual(crossProductBigIntRecursive(v, zero), zero)
		assert.deepEqual(crossProductBigIntRecursive(zero, v), zero)
		assert.deepEqual(crossProductBigIntRecursive(v, v), zero)
		assert.deepEqual(
			crossProductBigIntRecursive(v, vecScale(-17n, v)),
			zero,
		)
		assert.deepEqual(
			crossProductBigIntRecursive([1n, 1n, 1n], [1n, 1n, 1n]),
			zero,
		)
	})

	it('matches direct reference on large BigInts exercising recursive Karatsuba', () => {
		// >300-bit and >2048-bit operands trigger multiple Karatsuba recursion levels
		const hugeA = [
			(1n << 320n) + 98765432101234567890123456789n,
			-((1n << 512n) - 1234567890987654321n),
			(1n << 1024n) + (1n << 513n) + 77777777777777777n,
		]
		const hugeB = [
			-((1n << 600n) + 3141592653589793238462643383279n),
			(1n << 1025n) - 2718281828459045235360287471352n,
			-((1n << 400n) + 1618033988749894848204586834365n),
		]

		const result = crossProductBigIntRecursive(hugeA, hugeB)
		const expected = naiveCross(hugeA, hugeB)
		assert.deepEqual(result, expected)

		// Even larger 2500-bit operands including zero coordinate
		const giantA = [
			(1n << 2500n) - 1n,
			0n,
			-((1n << 2100n) + (1n << 1050n) + 13n),
		]
		const giantB = [
			(1n << 2200n) + 42n,
			-((1n << 2400n) - 99n),
			(1n << 2048n) + 1n,
		]
		assert.deepEqual(
			crossProductBigIntRecursive(giantA, giantB),
			naiveCross(giantA, giantB),
		)
	})

	it('satisfies algebraic vector identities across small and large BigInts', () => {
		const triples = [
			[
				[3n, -5n, 7n],
				[-2n, 11n, 13n],
				[17n, -19n, 23n],
			],
			[
				[10n ** 18n + 3n, -(10n ** 18n) + 7n, 2n * 10n ** 18n - 11n],
				[-(5n * 10n ** 18n) + 1n, 3n * 10n ** 18n + 9n, -(10n ** 18n)],
				[7n * 10n ** 17n, -4n * 10n ** 18n + 5n, 6n * 10n ** 18n + 2n],
			],
			[
				[(1n << 400n) + 5n, -(1n << 350n) + 3n, (1n << 300n) - 7n],
				[-(1n << 380n) + 11n, (1n << 420n) + 13n, -(1n << 310n) + 17n],
				[(1n << 330n) - 19n, -(1n << 360n) + 23n, (1n << 390n) + 29n],
			],
		]

		for (const [a, b, c] of triples) {
			const axb = crossProductBigIntRecursive(a, b)
			const bxa = crossProductBigIntRecursive(b, a)

			// Cross-check against naive reference
			assert.deepEqual(axb, naiveCross(a, b))

			// Orthogonality: (a x b) . a == 0 and (a x b) . b == 0
			assert.equal(dot(axb, a), 0n)
			assert.equal(dot(axb, b), 0n)

			// Anticommutativity: a x b == -(b x a)
			assert.deepEqual(axb, vecScale(-1n, bxa))

			// Bilinearity: (s*a + b) x c == s*(a x c) + (b x c)
			const s = -13n
			assert.deepEqual(
				crossProductBigIntRecursive(vecAdd(vecScale(s, a), b), c),
				vecAdd(
					vecScale(s, crossProductBigIntRecursive(a, c)),
					crossProductBigIntRecursive(b, c),
				),
			)

			// Lagrange's identity: ||a x b||^2 == ||a||^2 * ||b||^2 - (a . b)^2
			const normSqCross = dot(axb, axb)
			const lagrangeRhs = dot(a, a) * dot(b, b) - dot(a, b) ** 2n
			assert.equal(normSqCross, lagrangeRhs)

			// Jacobi identity: a x (b x c) + b x (c x a) + c x (a x b) == 0
			const t1 = crossProductBigIntRecursive(
				a,
				crossProductBigIntRecursive(b, c),
			)
			const t2 = crossProductBigIntRecursive(
				b,
				crossProductBigIntRecursive(c, a),
			)
			const t3 = crossProductBigIntRecursive(
				c,
				crossProductBigIntRecursive(a, b),
			)
			assert.deepEqual(vecAdd(vecAdd(t1, t2), t3), [0n, 0n, 0n])

			// BAC-CAB vector triple product: a x (b x c) == b*(a.c) - c*(a.b)
			assert.deepEqual(
				t1,
				vecSub(vecScale(dot(a, c), b), vecScale(dot(a, b), c)),
			)

			// Scalar triple product cyclic invariance: a.(bxc) == b.(cxa) == c.(axb)
			const stp1 = dot(a, crossProductBigIntRecursive(b, c))
			const stp2 = dot(b, crossProductBigIntRecursive(c, a))
			const stp3 = dot(c, axb)
			assert.equal(stp1, stp2)
			assert.equal(stp2, stp3)
		}
	})

	it('does not mutate input vectors', () => {
		const a = [1n, 2n, 3n]
		const b = [4n, 5n, 6n]
		const result = crossProductBigIntRecursive(a, b)
		assert.deepEqual(a, [1n, 2n, 3n])
		assert.deepEqual(b, [4n, 5n, 6n])
		assert.notEqual(result, a)
		assert.notEqual(result, b)
	})

	it('throws TypeError for non-array inputs or non-BigInt coordinates', () => {
		const valid = [1n, 2n, 3n]

		// Non-arrays
		assert.throws(() => crossProductBigIntRecursive(null, valid), TypeError)
		assert.throws(() => crossProductBigIntRecursive(valid, undefined), TypeError)
		assert.throws(() => crossProductBigIntRecursive(), TypeError)
		assert.throws(() => crossProductBigIntRecursive('123', valid), TypeError)
		assert.throws(
			() => crossProductBigIntRecursive({ 0: 1n, 1: 2n, 2: 3n, length: 3 }, valid),
			TypeError,
		)
		assert.throws(
			() => crossProductBigIntRecursive(new BigInt64Array([1n, 2n, 3n]), valid),
			TypeError,
		)

		// Non-BigInt coordinates
		assert.throws(() => crossProductBigIntRecursive([1, 2, 3], valid), TypeError)
		assert.throws(() => crossProductBigIntRecursive(valid, [1n, 2, 3n]), TypeError)
		assert.throws(
			() => crossProductBigIntRecursive([1n, '2', 3n], valid),
			TypeError,
		)
		assert.throws(
			() => crossProductBigIntRecursive(valid, [1n, null, 3n]),
			TypeError,
		)
		// Sparse array
		// eslint-disable-next-line no-sparse-arrays
		assert.throws(() => crossProductBigIntRecursive([1n, , 3n], valid), TypeError)
	})

	it('throws RangeError for invalid vector dimensions', () => {
		const valid = [1n, 2n, 3n]

		assert.throws(() => crossProductBigIntRecursive([], valid), RangeError)
		assert.throws(() => crossProductBigIntRecursive([1n], valid), RangeError)
		assert.throws(() => crossProductBigIntRecursive([1n, 2n], valid), RangeError)
		assert.throws(
			() => crossProductBigIntRecursive([1n, 2n, 3n, 4n], valid),
			RangeError,
		)
		assert.throws(() => crossProductBigIntRecursive(valid, []), RangeError)
		assert.throws(
			() => crossProductBigIntRecursive(valid, [1n, 2n]),
			RangeError,
		)
		assert.throws(
			() => crossProductBigIntRecursive(valid, [1n, 2n, 3n, 4n]),
			RangeError,
		)
	})
})
