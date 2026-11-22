import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { vectorAddRationalIterative } from './vectorAddRationalIterative.js'

/**
 * Helper to construct a rational { num, den }.
 * @param {bigint} num
 * @param {bigint} den
 */
const r = (num, den) => ({ num, den })

/**
 * Independent Stein's binary GCD for cross-checking lowest-terms invariants.
 * @param {bigint} u
 * @param {bigint} v
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

/**
 * Asserts every entry in a rational vector is normalized to lowest terms with den > 0n.
 * @param {Array<{ num: bigint, den: bigint }>} vec
 */
function assertCanonicalVector(vec) {
	for (const entry of vec) {
		assert.equal(typeof entry.num, 'bigint')
		assert.equal(typeof entry.den, 'bigint')
		assert.ok(entry.den > 0n, `expected den > 0n, got ${entry.den}`)
		if (entry.num === 0n) {
			assert.equal(entry.den, 1n)
		} else {
			assert.equal(binaryGcd(entry.num, entry.den), 1n)
		}
	}
}

describe('vectorAddRationalIterative', () => {
	test('adds positive and negative rationals and reduces to lowest terms', () => {
		const a = [r(1n, 2n), r(1n, 6n), r(-3n, 4n), r(2n, 3n)]
		const b = [r(1n, 3n), r(1n, 3n), r(1n, 2n), r(4n, 3n)]
		const sum = vectorAddRationalIterative(a, b)

		assert.deepEqual(sum, [r(5n, 6n), r(1n, 2n), r(-1n, 4n), r(2n, 1n)])
		assertCanonicalVector(sum)
	})

	test('normalizes negative denominators and unreduced inputs', () => {
		const a = [r(1n, -2n), r(6n, 12n), r(-4n, -8n)]
		const b = [r(1n, -3n), r(10n, 15n), r(3n, -6n)]
		const sum = vectorAddRationalIterative(a, b)

		assert.deepEqual(sum, [r(-5n, 6n), r(7n, 6n), r(0n, 1n)])
		assertCanonicalVector(sum)
	})

	test('does not mutate input vectors or their elements', () => {
		const a = [r(2n, 4n), r(1n, -3n)]
		const b = [r(3n, 6n), r(2n, 3n)]
		const aCopy = a.map((x) => ({ ...x }))
		const bCopy = b.map((x) => ({ ...x }))

		const sum = vectorAddRationalIterative(a, b)
		assert.deepEqual(sum, [r(1n, 1n), r(1n, 3n)])
		assert.deepEqual(a, aCopy)
		assert.deepEqual(b, bCopy)
	})

	test('handles empty vectors', () => {
		const sum = vectorAddRationalIterative([], [])
		assert.deepEqual(sum, [])
	})

	test('handles zeros and additive inverses', () => {
		const zeroA = [r(0n, 1n), r(0n, -7n), r(0n, 100n)]
		const zeroB = [r(0n, 5n), r(3n, 4n), r(-2n, -8n)]
		assert.deepEqual(vectorAddRationalIterative(zeroA, zeroB), [
			r(0n, 1n),
			r(3n, 4n),
			r(1n, 4n),
		])

		const v = [r(7n, 13n), r(-19n, 24n), r(0n, 9n), r(123456789012345678901n, 987654321098765432109n)]
		const negV = v.map(({ num, den }) => r(-num, den))
		const cancelled = vectorAddRationalIterative(v, negV)
		assert.deepEqual(cancelled, [r(0n, 1n), r(0n, 1n), r(0n, 1n), r(0n, 1n)])
		assertCanonicalVector(cancelled)
	})

	test('handles large BigInts without precision loss', () => {
		const p = 10n ** 40n + 7n
		const q = 10n ** 40n + 9n
		const k = 10n ** 30n
		const a = [r(1n, p), r(3n * k, 4n * k), r(2n ** 128n, 3n ** 80n)]
		const b = [r(1n, q), r(5n * k, 4n * k), r(-(2n ** 128n) + 1n, 3n ** 80n)]

		const sum = vectorAddRationalIterative(a, b)
		assert.deepEqual(sum, [
			r(p + q, p * q),
			r(2n, 1n),
			r(1n, 3n ** 80n),
		])
		assertCanonicalVector(sum)
	})

	test('throws RangeError on mismatched vector lengths', () => {
		assert.throws(
			() => vectorAddRationalIterative([r(1n, 2n)], [r(1n, 2n), r(1n, 3n)]),
			RangeError,
		)
		assert.throws(
			() => vectorAddRationalIterative([r(1n, 2n)], []),
			RangeError,
		)
	})

	test('validates input types and zero denominators', () => {
		assert.throws(() => vectorAddRationalIterative(null, []), TypeError)
		assert.throws(() => vectorAddRationalIterative([], undefined), TypeError)
		assert.throws(() => vectorAddRationalIterative('not-array', []), TypeError)
		assert.throws(() => vectorAddRationalIterative([], { length: 0 }), TypeError)

		assert.throws(() => vectorAddRationalIterative([null], [r(1n, 1n)]), TypeError)
		assert.throws(() => vectorAddRationalIterative([r(1n, 1n)], [undefined]), TypeError)
		assert.throws(() => vectorAddRationalIterative([{ num: 1, den: 2n }], [r(1n, 1n)]), TypeError)
		assert.throws(() => vectorAddRationalIterative([r(1n, 1n)], [{ num: 1n, den: 2 }]), TypeError)
		assert.throws(() => vectorAddRationalIterative([{ num: '1', den: '2' }], [r(1n, 1n)]), TypeError)

		// Sparse array hole
		const sparse = new Array(1)
		assert.throws(() => vectorAddRationalIterative(sparse, [r(1n, 1n)]), TypeError)

		// Zero denominators
		assert.throws(() => vectorAddRationalIterative([r(1n, 0n)], [r(1n, 2n)]), RangeError)
		assert.throws(() => vectorAddRationalIterative([r(1n, 2n)], [r(0n, 0n)]), RangeError)
	})

	test('cross-check: commutativity, associativity, and common-denominator integer addition', () => {
		const u = [r(3n, 7n), r(-11n, 12n), r(0n, 5n), r(25n, -35n), r(10n ** 25n + 3n, 10n ** 12n + 7n)]
		const v = [r(-5n, 14n), r(19n, 18n), r(4n, 9n), r(13n, 21n), r(-(10n ** 25n) + 11n, 10n ** 12n + 9n)]
		const w = [r(2n, 3n), r(-7n, 36n), r(-8n, 18n), r(-1n, 15n), r(5n, 17n)]

		// Commutativity: u + v === v + u
		const uv = vectorAddRationalIterative(u, v)
		const vu = vectorAddRationalIterative(v, u)
		assert.deepEqual(uv, vu)
		assertCanonicalVector(uv)

		// Associativity: (u + v) + w === u + (v + w)
		const leftAssoc = vectorAddRationalIterative(uv, w)
		const vw = vectorAddRationalIterative(v, w)
		const rightAssoc = vectorAddRationalIterative(u, vw)
		assert.deepEqual(leftAssoc, rightAssoc)
		assertCanonicalVector(leftAssoc)

		// Independent common-denominator integer addition cross-check:
		// Scale every component by M = product of |den| across all entries of u and v.
		let M = 1n
		for (const x of [...u, ...v]) {
			M *= x.den < 0n ? -x.den : x.den
		}
		for (let i = 0; i < u.length; i += 1) {
			const uScaled = (u[i].num * M) / u[i].den
			const vScaled = (v[i].num * M) / v[i].den
			const sumScaled = uScaled + vScaled
			assert.equal(uv[i].num * M, sumScaled * uv[i].den)
		}
	})
})
