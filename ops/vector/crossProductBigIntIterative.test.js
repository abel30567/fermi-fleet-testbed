import { describe, test } from 'node:test'
import assert from 'node:assert'
import { crossProductBigIntIterative } from './crossProductBigIntIterative.js'

function dotBigInt(u, v) {
	return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
}

function normSqBigInt(u) {
	return dotBigInt(u, u)
}

function addVecBigInt(u, v) {
	return [u[0] + v[0], u[1] + v[1], u[2] + v[2]]
}

function negateVecBigInt(u) {
	return [-u[0], -u[1], -u[2]]
}

describe('crossProductBigIntIterative', () => {
	test('standard basis vectors obey right-hand rule', () => {
		const i = [1n, 0n, 0n]
		const j = [0n, 1n, 0n]
		const k = [0n, 0n, 1n]

		assert.deepStrictEqual(crossProductBigIntIterative(i, j), k)
		assert.deepStrictEqual(crossProductBigIntIterative(j, k), i)
		assert.deepStrictEqual(crossProductBigIntIterative(k, i), j)

		assert.deepStrictEqual(crossProductBigIntIterative(j, i), [0n, 0n, -1n])
		assert.deepStrictEqual(crossProductBigIntIterative(k, j), [-1n, 0n, 0n])
		assert.deepStrictEqual(crossProductBigIntIterative(i, k), [0n, -1n, 0n])
	})

	test('general 3D vectors produce exact results and do not mutate inputs', () => {
		const a = [1n, 2n, 3n]
		const b = [4n, 5n, 6n]
		assert.deepStrictEqual(crossProductBigIntIterative(a, b), [-3n, 6n, -3n])
		assert.deepStrictEqual(a, [1n, 2n, 3n])
		assert.deepStrictEqual(b, [4n, 5n, 6n])

		assert.deepStrictEqual(
			crossProductBigIntIterative([-2n, 5n, -7n], [3n, -4n, 11n]),
			[27n, 1n, -7n],
		)
		assert.deepStrictEqual(
			crossProductBigIntIterative([10n, -3n, 8n], [-6n, 2n, -5n]),
			[-1n, 2n, 2n],
		)
	})

	test('parallel and collinear vectors produce the zero vector', () => {
		const zero = [0n, 0n, 0n]
		assert.deepStrictEqual(
			crossProductBigIntIterative([3n, -7n, 11n], [3n, -7n, 11n]),
			zero,
		)
		assert.deepStrictEqual(
			crossProductBigIntIterative([3n, -7n, 11n], [15n, -35n, 55n]),
			zero,
		)
		assert.deepStrictEqual(
			crossProductBigIntIterative([3n, -7n, 11n], [-9n, 21n, -33n]),
			zero,
		)
	})

	test('zero vectors produce the zero vector', () => {
		const zero = [0n, 0n, 0n]
		const v = [42n, -17n, 99n]

		assert.deepStrictEqual(crossProductBigIntIterative(zero, v), zero)
		assert.deepStrictEqual(crossProductBigIntIterative(v, zero), zero)
		assert.deepStrictEqual(crossProductBigIntIterative(zero, zero), zero)
	})

	test('handles very large BigInt values (> 2^128) with exact precision', () => {
		const big = 1n << 130n
		const huge = 1n << 200n

		const a = [big + 3n, -big + 7n, huge + 11n]
		const b = [huge - 5n, big + 13n, -big - 17n]

		const expected = [
			a[1] * b[2] - a[2] * b[1],
			a[2] * b[0] - a[0] * b[2],
			a[0] * b[1] - a[1] * b[0],
		]

		const actual = crossProductBigIntIterative(a, b)
		assert.deepStrictEqual(actual, expected)
		assert.strictEqual(dotBigInt(actual, a), 0n)
		assert.strictEqual(dotBigInt(actual, b), 0n)
	})

	test('validates wrong-length arrays', () => {
		assert.throws(
			() => crossProductBigIntIterative([], [1n, 2n, 3n]),
			RangeError,
		)
		assert.throws(
			() => crossProductBigIntIterative([1n, 2n], [1n, 2n, 3n]),
			RangeError,
		)
		assert.throws(
			() => crossProductBigIntIterative([1n, 2n, 3n], [1n, 2n, 3n, 4n]),
			RangeError,
		)
	})

	test('validates non-array and non-BigInt inputs', () => {
		assert.throws(
			() => crossProductBigIntIterative(null, [1n, 2n, 3n]),
			TypeError,
		)
		assert.throws(
			() => crossProductBigIntIterative([1n, 2n, 3n], undefined),
			TypeError,
		)
		assert.throws(
			() =>
				crossProductBigIntIterative(
					{ 0: 1n, 1: 2n, 2: 3n, length: 3 },
					[1n, 2n, 3n],
				),
			TypeError,
		)
		assert.throws(
			() =>
				crossProductBigIntIterative(
					new BigInt64Array([1n, 2n, 3n]),
					[1n, 2n, 3n],
				),
			TypeError,
		)
		assert.throws(
			() => crossProductBigIntIterative([1, 2n, 3n], [4n, 5n, 6n]),
			TypeError,
		)
		assert.throws(
			() => crossProductBigIntIterative([1n, 2n, 3n], [4n, '5', 6n]),
			TypeError,
		)
		assert.throws(
			() => crossProductBigIntIterative([1n, null, 3n], [4n, 5n, 6n]),
			TypeError,
		)

		const sparse = new Array(3)
		sparse[0] = 1n
		sparse[2] = 3n
		assert.throws(
			() => crossProductBigIntIterative(sparse, [4n, 5n, 6n]),
			TypeError,
		)
	})

	test('cross-checks algebraic identities (orthogonality, anti-commutativity, Lagrange, distributivity, Jacobi)', () => {
		const big = (1n << 140n) + 12345678901234567890123456789n
		const triples = [
			[
				[1n, 2n, 3n],
				[4n, -5n, 6n],
				[-7n, 8n, -9n],
			],
			[
				[13n, -29n, 47n],
				[-53n, 61n, -71n],
				[83n, 97n, -101n],
			],
			[
				[big, -big * 3n + 7n, big * 5n - 11n],
				[-big * 2n + 13n, big * 7n - 19n, big * 11n + 23n],
				[big * 17n - 29n, -big * 19n + 31n, -big * 23n + 37n],
			],
		]

		for (const [a, b, c] of triples) {
			const ab = crossProductBigIntIterative(a, b)
			const ba = crossProductBigIntIterative(b, a)

			// Orthogonality: (a × b) · a === 0n and (a × b) · b === 0n
			assert.strictEqual(dotBigInt(ab, a), 0n)
			assert.strictEqual(dotBigInt(ab, b), 0n)

			// Anti-commutativity: a × b === -(b × a)
			assert.deepStrictEqual(ab, negateVecBigInt(ba))

			// Lagrange's identity: ||a × b||^2 + (a · b)^2 === ||a||^2 * ||b||^2
			const dotAB = dotBigInt(a, b)
			assert.strictEqual(
				normSqBigInt(ab) + dotAB * dotAB,
				normSqBigInt(a) * normSqBigInt(b),
			)

			// Distributivity: a × (b + c) === (a × b) + (a × c)
			const ac = crossProductBigIntIterative(a, c)
			assert.deepStrictEqual(
				crossProductBigIntIterative(a, addVecBigInt(b, c)),
				addVecBigInt(ab, ac),
			)

			// Jacobi identity: a × (b × c) + b × (c × a) + c × (a × b) === [0n, 0n, 0n]
			const bc = crossProductBigIntIterative(b, c)
			const ca = crossProductBigIntIterative(c, a)
			const term1 = crossProductBigIntIterative(a, bc)
			const term2 = crossProductBigIntIterative(b, ca)
			const term3 = crossProductBigIntIterative(c, ab)
			assert.deepStrictEqual(
				addVecBigInt(addVecBigInt(term1, term2), term3),
				[0n, 0n, 0n],
			)
		}
	})
})
