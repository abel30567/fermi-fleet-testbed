import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { vectorAddComplexRecursive } from './vectorAddComplexRecursive.js'

/**
 * Independent iterative reference implementation of complex vector addition.
 *
 * @param {readonly { re: number, im: number }[]} u
 * @param {readonly { re: number, im: number }[]} v
 * @returns {{ re: number, im: number }[]}
 */
function referenceVectorAdd(u, v) {
	const result = []
	for (let i = 0; i < u.length; i++) {
		const re = u[i].re + v[i].re
		const im = u[i].im + v[i].im
		result.push({ re: re === 0 ? 0 : re, im: im === 0 ? 0 : im })
	}
	return result
}

/**
 * Deterministic LCG PRNG for reproducible cross-check vectors.
 */
function createPrng(seed = 0x12345678) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return (state / 0x100000000) * 200 - 100
	}
}

function assertComplexVectorClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < actual.length; i++) {
		assert.ok(
			Math.abs(actual[i].re - expected[i].re) <= tol,
			`re mismatch at index ${i}: got ${actual[i].re}, expected ${expected[i].re}`,
		)
		assert.ok(
			Math.abs(actual[i].im - expected[i].im) <= tol,
			`im mismatch at index ${i}: got ${actual[i].im}, expected ${expected[i].im}`,
		)
	}
}

describe('vectorAddComplexRecursive', () => {
	describe('normal cases', () => {
		it('adds complex vectors with nonzero real and imaginary parts', () => {
			const u = [
				{ re: 1, im: 2 },
				{ re: -3.5, im: 4.25 },
				{ re: 7, im: -8 },
			]
			const v = [
				{ re: 5, im: -1 },
				{ re: 1.5, im: 0.75 },
				{ re: -2, im: 3 },
			]
			const result = vectorAddComplexRecursive(u, v)
			assert.deepEqual(result, [
				{ re: 6, im: 1 },
				{ re: -2, im: 5 },
				{ re: 5, im: -5 },
			])
		})

		it('handles singleton, even, and odd vector lengths', () => {
			const single = vectorAddComplexRecursive([{ re: 2.5, im: -1.5 }], [{ re: -0.5, im: 3.5 }])
			assert.deepEqual(single, [{ re: 2, im: 2 }])

			const even = vectorAddComplexRecursive(
				[
					{ re: 1, im: 1 },
					{ re: 2, im: 2 },
					{ re: 3, im: 3 },
					{ re: 4, im: 4 },
				],
				[
					{ re: 10, im: -1 },
					{ re: 20, im: -2 },
					{ re: 30, im: -3 },
					{ re: 40, im: -4 },
				],
			)
			assert.deepEqual(even, [
				{ re: 11, im: 0 },
				{ re: 22, im: 0 },
				{ re: 33, im: 0 },
				{ re: 44, im: 0 },
			])

			const odd = vectorAddComplexRecursive(
				[
					{ re: 1, im: -2 },
					{ re: 3, im: -4 },
					{ re: 5, im: -6 },
					{ re: 7, im: -8 },
					{ re: 9, im: -10 },
				],
				[
					{ re: -1, im: 1 },
					{ re: -2, im: 2 },
					{ re: -3, im: 3 },
					{ re: -4, im: 4 },
					{ re: -5, im: 5 },
				],
			)
			assert.deepEqual(odd, [
				{ re: 0, im: -1 },
				{ re: 1, im: -2 },
				{ re: 2, im: -3 },
				{ re: 3, im: -4 },
				{ re: 4, im: -5 },
			])
		})

		it('does not mutate input vectors and returns fresh complex objects', () => {
			const u = [{ re: 3, im: 4 }, { re: -1, im: 2 }]
			const v = [{ re: 5, im: -6 }, { re: 7, im: -8 }]
			const uSnap = structuredClone(u)
			const vSnap = structuredClone(v)

			const result = vectorAddComplexRecursive(u, v)
			assert.deepEqual(u, uSnap)
			assert.deepEqual(v, vSnap)
			assert.notEqual(result, u)
			assert.notEqual(result, v)
			assert.notEqual(result[0], u[0])
			assert.notEqual(result[0], v[0])
		})
	})

	describe('edge cases', () => {
		it('handles empty vectors', () => {
			const result = vectorAddComplexRecursive([], [])
			assert.deepEqual(result, [])
		})

		it('handles zero vectors, pure real, pure imaginary, and negatives', () => {
			const zero = [
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
			]
			const pureReal = [
				{ re: 4.5, im: 0 },
				{ re: -9.25, im: 0 },
			]
			const pureImag = [
				{ re: 0, im: -3.5 },
				{ re: 0, im: 7.75 },
			]

			assert.deepEqual(vectorAddComplexRecursive(pureReal, zero), pureReal)
			assert.deepEqual(vectorAddComplexRecursive(zero, pureImag), pureImag)
			assert.deepEqual(vectorAddComplexRecursive(pureReal, pureImag), [
				{ re: 4.5, im: -3.5 },
				{ re: -9.25, im: 7.75 },
			])

			const negated = [
				{ re: -4.5, im: 3.5 },
				{ re: 9.25, im: -7.75 },
			]
			const combined = vectorAddComplexRecursive(pureReal, pureImag)
			assert.deepEqual(vectorAddComplexRecursive(combined, negated), zero)
		})

		it('normalizes -0 components to +0', () => {
			const u = [{ re: -0, im: -0 }, { re: -5, im: 0 }]
			const v = [{ re: -0, im: -0 }, { re: 5, im: -0 }]
			const res = vectorAddComplexRecursive(u, v)

			assert.ok(Object.is(res[0].re, 0))
			assert.ok(Object.is(res[0].im, 0))
			assert.ok(Object.is(res[1].re, 0))
			assert.ok(Object.is(res[1].im, 0))
		})

		it('handles very small subnormal and large finite numbers without overflow', () => {
			const u = [
				{ re: Number.MIN_VALUE, im: -Number.MIN_VALUE },
				{ re: 1e307, im: -1e307 },
			]
			const v = [
				{ re: Number.MIN_VALUE, im: Number.MIN_VALUE },
				{ re: 2e307, im: 1e307 },
			]
			const res = vectorAddComplexRecursive(u, v)
			assert.equal(res[0].re, 2 * Number.MIN_VALUE)
			assert.ok(Object.is(res[0].im, 0))
			assert.equal(res[1].re, 3e307)
			assert.ok(Object.is(res[1].im, 0))
		})

		it('handles large vectors without call stack overflow due to O(log n) recursion depth', () => {
			const n = 50000
			const u = new Array(n)
			const v = new Array(n)
			for (let i = 0; i < n; i++) {
				u[i] = { re: i * 0.5, im: -i * 0.25 }
				v[i] = { re: -i * 0.5 + 1, im: i * 0.25 - 2 }
			}
			const res = vectorAddComplexRecursive(u, v)
			assert.equal(res.length, n)
			assert.deepEqual(res[0], { re: 1, im: -2 })
			assert.deepEqual(res[n - 1], { re: 1, im: -2 })
		})
	})

	describe('input validation and domain errors', () => {
		it('throws TypeError when arguments are not arrays', () => {
			assert.throws(() => vectorAddComplexRecursive(null, []), TypeError)
			assert.throws(() => vectorAddComplexRecursive([], undefined), TypeError)
			assert.throws(() => vectorAddComplexRecursive('abc', []), TypeError)
			assert.throws(() => vectorAddComplexRecursive({}, []), TypeError)
			assert.throws(() => vectorAddComplexRecursive(new Float64Array(2), []), TypeError)
			assert.throws(() => vectorAddComplexRecursive([], 42), TypeError)
		})

		it('throws RangeError on dimension mismatch', () => {
			assert.throws(
				() => vectorAddComplexRecursive([{ re: 1, im: 0 }], []),
				RangeError,
			)
			assert.throws(
				() =>
					vectorAddComplexRecursive(
						[{ re: 1, im: 2 }],
						[{ re: 1, im: 2 }, { re: 3, im: 4 }],
					),
				RangeError,
			)
		})

		it('throws TypeError on malformed complex elements or sparse arrays', () => {
			assert.throws(() => vectorAddComplexRecursive([null], [{ re: 0, im: 0 }]), TypeError)
			assert.throws(() => vectorAddComplexRecursive([{ re: 0, im: 0 }], [undefined]), TypeError)
			assert.throws(() => vectorAddComplexRecursive([[1, 2]], [{ re: 0, im: 0 }]), TypeError)
			assert.throws(() => vectorAddComplexRecursive([{ re: 1 }], [{ re: 0, im: 0 }]), TypeError)
			assert.throws(() => vectorAddComplexRecursive([{ re: '1', im: 0 }], [{ re: 0, im: 0 }]), TypeError)
			assert.throws(() => vectorAddComplexRecursive([{ re: 0, im: 0 }], [5]), TypeError)

			const sparse = new Array(2)
			sparse[0] = { re: 1, im: 1 }
			assert.throws(
				() => vectorAddComplexRecursive(sparse, [{ re: 0, im: 0 }, { re: 0, im: 0 }]),
				TypeError,
			)
		})

		it('throws RangeError on non-finite components or finite overflow', () => {
			assert.throws(
				() => vectorAddComplexRecursive([{ re: NaN, im: 0 }], [{ re: 0, im: 0 }]),
				RangeError,
			)
			assert.throws(
				() => vectorAddComplexRecursive([{ re: 0, im: Infinity }], [{ re: 0, im: 0 }]),
				RangeError,
			)
			assert.throws(
				() => vectorAddComplexRecursive([{ re: 0, im: 0 }], [{ re: -Infinity, im: 0 }]),
				RangeError,
			)
			assert.throws(
				() =>
					vectorAddComplexRecursive(
						[{ re: Number.MAX_VALUE, im: 0 }],
						[{ re: Number.MAX_VALUE, im: 0 }],
					),
				RangeError,
			)
			assert.throws(
				() =>
					vectorAddComplexRecursive(
						[{ re: 0, im: -Number.MAX_VALUE }],
						[{ re: 0, im: -Number.MAX_VALUE }],
					),
				RangeError,
			)
		})
	})

	describe('cross-checks and algebraic identities', () => {
		it('matches independent iterative reference across lengths 0..65', () => {
			const rand = createPrng(20261122)
			for (let n = 0; n <= 65; n++) {
				const u = Array.from({ length: n }, () => ({ re: rand(), im: rand() }))
				const v = Array.from({ length: n }, () => ({ re: rand(), im: rand() }))
				const actual = vectorAddComplexRecursive(u, v)
				const expected = referenceVectorAdd(u, v)
				assert.deepEqual(actual, expected)
			}
		})

		it('satisfies vector-space axioms (commutativity, associativity, conjugation, scalar distributivity)', () => {
			const rand = createPrng(987654321)
			const n = 17
			const u = Array.from({ length: n }, () => ({ re: rand(), im: rand() }))
			const v = Array.from({ length: n }, () => ({ re: rand(), im: rand() }))
			const w = Array.from({ length: n }, () => ({ re: rand(), im: rand() }))

			// Commutativity: u + v === v + u
			assert.deepEqual(vectorAddComplexRecursive(u, v), vectorAddComplexRecursive(v, u))

			// Associativity: (u + v) + w ≈ u + (v + w)
			const lhsAssoc = vectorAddComplexRecursive(vectorAddComplexRecursive(u, v), w)
			const rhsAssoc = vectorAddComplexRecursive(u, vectorAddComplexRecursive(v, w))
			assertComplexVectorClose(lhsAssoc, rhsAssoc, 1e-11)

			// Additive inverse recovery: (u + v) + (-v) ≈ u
			const negV = v.map(({ re, im }) => ({ re: -re, im: -im }))
			const recovered = vectorAddComplexRecursive(vectorAddComplexRecursive(u, v), negV)
			assertComplexVectorClose(recovered, u, 1e-11)

			// Conjugation linearity: conj(u + v) === conj(u) + conj(v)
			const conj = (vec) => vec.map(({ re, im }) => ({ re, im: im === 0 ? 0 : -im }))
			assert.deepEqual(
				conj(vectorAddComplexRecursive(u, v)),
				vectorAddComplexRecursive(conj(u), conj(v)),
			)

			// Complex scalar distributivity: c*(u + v) ≈ c*u + c*v
			const c = { re: -2.75, im: 3.125 }
			const scale = (vec, s) =>
				vec.map(({ re, im }) => ({
					re: s.re * re - s.im * im,
					im: s.re * im + s.im * re,
				}))
			assertComplexVectorClose(
				scale(vectorAddComplexRecursive(u, v), c),
				vectorAddComplexRecursive(scale(u, c), scale(v, c)),
				1e-10,
			)
		})
	})
})
