import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { vectorAddRationalIterative } from './vectorAddRationalIterative.js'

/**
 * Independent binary GCD (Stein's algorithm) for cross-checking lowest-terms invariant.
 *
 * @param {bigint} u
 * @param {bigint} v
 * @returns {bigint}
 */
function binaryGcd(u, v) {
	let a = u < 0n ? -u : u
	let b = v < 0n ? -v : v
	if (a === 0n) return b
	if (b === 0n) return a

	let shift = 0n
	while (((a | b) & 1n) === 0n) {
		a >>= 1n
		b >>= 1n
		shift += 1n
	}
	while ((a & 1n) === 0n) {
		a >>= 1n
	}
	while (b !== 0n) {
		while ((b & 1n) === 0n) {
			b >>= 1n
		}
		if (a > b) {
			const tmp = a
			a = b
			b = tmp
		}
		b -= a
	}
	return a << shift
}

describe('vectorAddRationalIterative', () => {
	test('adds basic positive rational vectors and reduces to lowest terms', () => {
		const a = [
			{ num: 1n, den: 2n },
			{ num: 1n, den: 6n },
			{ num: 2n, den: 3n },
		]
		const b = [
			{ num: 1n, den: 3n },
			{ num: 1n, den: 3n },
			{ num: 4n, den: 3n },
		]
		assert.deepEqual(vectorAddRationalIterative(a, b), [
			{ num: 5n, den: 6n },
			{ num: 1n, den: 2n },
			{ num: 2n, den: 1n },
		])
	})

	test('handles negative numerators, negative denominators, and exact cancellation to zero', () => {
		const a = [
			{ num: -3n, den: 4n },
			{ num: 1n, den: -6n },
			{ num: 5n, den: 8n },
			{ num: -2n, den: -5n },
		]
		const b = [
			{ num: 1n, den: 4n },
			{ num: -1n, den: 3n },
			{ num: -5n, den: 8n },
			{ num: 3n, den: -5n },
		]
		assert.deepEqual(vectorAddRationalIterative(a, b), [
			{ num: -1n, den: 2n },
			{ num: -1n, den: 2n },
			{ num: 0n, den: 1n },
			{ num: -1n, den: 5n },
		])
	})

	test('handles empty vectors and single-element vectors', () => {
		assert.deepEqual(vectorAddRationalIterative([], []), [])
		assert.deepEqual(
			vectorAddRationalIterative([{ num: 7n, den: 10n }], [{ num: 3n, den: 10n }]),
			[{ num: 1n, den: 1n }]
		)
	})

	test('normalizes unreduced inputs and zero entries with arbitrary non-zero denominators', () => {
		const a = [
			{ num: 6n, den: 9n },
			{ num: 0n, den: -17n },
			{ num: 0n, den: 42n },
		]
		const b = [
			{ num: 10n, den: 15n },
			{ num: 0n, den: 99n },
			{ num: -14n, den: -21n },
		]
		assert.deepEqual(vectorAddRationalIterative(a, b), [
			{ num: 4n, den: 3n },
			{ num: 0n, den: 1n },
			{ num: 2n, den: 3n },
		])
	})

	test('handles very large BigInt numerators and denominators accurately', () => {
		const p = 10n ** 40n + 7n
		const q = 10n ** 40n + 9n
		// 1/p + 1/q = (p + q) / (p * q); gcd(p, q) divides 2, both odd so coprime
		const res = vectorAddRationalIterative(
			[
				{ num: 1n, den: p },
				{ num: 3n * p, den: 6n * p },
			],
			[
				{ num: 1n, den: q },
				{ num: 2n * q, den: 4n * q },
			]
		)
		assert.deepEqual(res, [
			{ num: p + q, den: p * q },
			{ num: 1n, den: 1n },
		])
	})

	test('does not mutate input vectors or rational element objects', () => {
		const a = [
			{ num: 2n, den: -4n },
			{ num: 3n, den: 6n },
		]
		const b = [
			{ num: 4n, den: 8n },
			{ num: 1n, den: 2n },
		]
		const aCopy = a.map((r) => ({ ...r }))
		const bCopy = b.map((r) => ({ ...r }))

		const res = vectorAddRationalIterative(a, b)
		assert.deepEqual(a, aCopy)
		assert.deepEqual(b, bCopy)
		assert.deepEqual(res, [
			{ num: 0n, den: 1n },
			{ num: 1n, den: 1n },
		])
	})

	test('throws TypeError for non-array vector arguments', () => {
		const valid = [{ num: 1n, den: 1n }]
		for (const bad of [null, undefined, 42, 'abc', {}, new Int32Array([1])]) {
			assert.throws(() => vectorAddRationalIterative(bad, valid), TypeError)
			assert.throws(() => vectorAddRationalIterative(valid, bad), TypeError)
		}
	})

	test('throws RangeError for mismatched vector lengths', () => {
		assert.throws(
			() =>
				vectorAddRationalIterative(
					[{ num: 1n, den: 2n }],
					[
						{ num: 1n, den: 2n },
						{ num: 1n, den: 3n },
					]
				),
			RangeError
		)
		assert.throws(
			() => vectorAddRationalIterative([], [{ num: 0n, den: 1n }]),
			RangeError
		)
	})

	test('throws TypeError for invalid elements, non-BigInt fields, or sparse arrays', () => {
		const valid = [{ num: 1n, den: 2n }]
		const badElements = [
			null,
			undefined,
			5,
			'1/2',
			[1n, 2n],
			{},
			{ num: 1, den: 2n },
			{ num: 1n, den: 2 },
			{ num: '1', den: '2' },
			{ num: 1n },
			{ den: 2n },
		]
		for (const el of badElements) {
			assert.throws(() => vectorAddRationalIterative([el], valid), TypeError)
			assert.throws(() => vectorAddRationalIterative(valid, [el]), TypeError)
		}

		// Sparse array with a hole
		const sparse = new Array(1)
		assert.throws(() => vectorAddRationalIterative(sparse, valid), TypeError)
		assert.throws(() => vectorAddRationalIterative(valid, sparse), TypeError)
	})

	test('throws RangeError for zero denominator', () => {
		const valid = [{ num: 1n, den: 2n }]
		assert.throws(
			() => vectorAddRationalIterative([{ num: 1n, den: 0n }], valid),
			RangeError
		)
		assert.throws(
			() => vectorAddRationalIterative(valid, [{ num: 0n, den: 0n }]),
			RangeError
		)
	})

	test('independent cross-check: cross-multiplication, binary GCD lowest-terms, float agreement, and vector-space laws', () => {
		// Deterministic pseudo-random generator (LCG) for reproducible coverage
		let seed = 123456789n
		const nextInt = (min, max) => {
			seed = (1103515245n * seed + 12345n) & 0x7fffffffn
			return min + (seed % (max - min + 1n))
		}
		const makeVec = (len) => {
			const v = []
			for (let i = 0; i < len; i += 1) {
				const num = nextInt(-500n, 500n)
				let den = nextInt(-500n, 500n)
				if (den === 0n) den = 1n
				v.push({ num, den })
			}
			return v
		}

		const a = makeVec(40)
		const b = makeVec(40)
		const c = makeVec(40)

		const ab = vectorAddRationalIterative(a, b)
		const ba = vectorAddRationalIterative(b, a)

		// 1. Exact cross-multiplication & independent binary GCD lowest-terms & float agreement
		for (let i = 0; i < ab.length; i += 1) {
			const res = ab[i]
			assert.ok(res.den > 0n, `den must be positive at index ${i}`)
			if (res.num === 0n) {
				assert.equal(res.den, 1n)
			} else {
				assert.equal(
					binaryGcd(res.num, res.den),
					1n,
					`result must be in lowest terms at index ${i}`
				)
			}

			// Exact cross-product equality: res.num / res.den === (a.num * b.den + b.num * a.den) / (a.den * b.den)
			const lhs = res.num * a[i].den * b[i].den
			const rhs = (a[i].num * b[i].den + b[i].num * a[i].den) * res.den
			assert.equal(lhs, rhs)

			// Floating-point cross-check
			const expectedFloat =
				Number(a[i].num) / Number(a[i].den) + Number(b[i].num) / Number(b[i].den)
			const actualFloat = Number(res.num) / Number(res.den)
			assert.ok(
				Math.abs(actualFloat - expectedFloat) < 1e-11,
				`float mismatch at ${i}: ${actualFloat} vs ${expectedFloat}`
			)
		}

		// 2. Commutativity: a + b === b + a
		assert.deepEqual(ab, ba)

		// 3. Associativity: (a + b) + c === a + (b + c)
		const ab_c = vectorAddRationalIterative(ab, c)
		const a_bc = vectorAddRationalIterative(a, vectorAddRationalIterative(b, c))
		assert.deepEqual(ab_c, a_bc)

		// 4. Additive inverse: a + (-a) === 0
		const negA = a.map(({ num, den }) => ({ num: -num, den }))
		const zeroVec = a.map(() => ({ num: 0n, den: 1n }))
		assert.deepEqual(vectorAddRationalIterative(a, negA), zeroVec)
	})
})
