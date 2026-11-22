import { describe, test } from 'node:test'
import assert from 'node:assert'
import { magnitudeComplexLazy } from './magnitudeComplexLazy.js'

/**
 * Independent Hermitian inner product <u, v> = sum_k (u_k * conj(v_k)).
 * Used purely for independent mathematical cross-checking in tests.
 */
function hermitianInnerProduct(u, v) {
	let re = 0
	let im = 0
	for (let i = 0; i < u.length; i += 1) {
		// (a + bi)(c - di) = (ac + bd) + (bc - ad)i
		re += u[i].re * v[i].re + u[i].im * v[i].im
		im += u[i].im * v[i].re - u[i].re * v[i].im
	}
	return { re, im }
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re
	}
}

function assertClose(actual, expected, relTol = 1e-12, absTol = 0) {
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= limit,
		`Expected ${actual} to be within ${limit} of ${expected} (diff=${diff})`
	)
}

describe('magnitudeComplexLazy', () => {
	describe('normal cases', () => {
		test('computes magnitude of single complex numbers', () => {
			assert.strictEqual(magnitudeComplexLazy([{ re: 3, im: 4 }]), 5)
			assert.strictEqual(magnitudeComplexLazy([{ re: -3, im: -4 }]), 5)
			assert.strictEqual(magnitudeComplexLazy([{ re: 7, im: 0 }]), 7)
			assert.strictEqual(magnitudeComplexLazy([{ re: 0, im: -9 }]), 9)
		})

		test('computes Euclidean norm of multi-element complex vectors', () => {
			const v = [
				{ re: 1, im: 2 },
				{ re: 3, im: 4 }
			]
			// sqrt(1^2 + 2^2 + 3^2 + 4^2) = sqrt(30)
			assertClose(magnitudeComplexLazy(v), Math.sqrt(30), 1e-15)
		})

		test('computes norm of unit basis vectors', () => {
			assert.strictEqual(
				magnitudeComplexLazy([
					{ re: 0, im: 0 },
					{ re: 1, im: 0 },
					{ re: 0, im: 0 }
				]),
				1
			)
			assert.strictEqual(
				magnitudeComplexLazy([
					{ re: 0, im: 0 },
					{ re: 0, im: -1 },
					{ re: 0, im: 0 }
				]),
				1
			)
		})

		test('accepts arbitrary iterables (generator, Set, Map.values, custom iterable)', () => {
			function* gen() {
				yield { re: 1, im: 1 }
				yield { re: 1, im: 1 }
			}
			assert.strictEqual(magnitudeComplexLazy(gen()), 2)

			const set = new Set([
				{ re: 3, im: 0 },
				{ re: 0, im: 4 }
			])
			assert.strictEqual(magnitudeComplexLazy(set), 5)

			const map = new Map([
				['a', { re: 2, im: 0 }],
				['b', { re: 0, im: 2 }],
				['c', { re: 1, im: 0 }]
			])
			assert.strictEqual(magnitudeComplexLazy(map.values()), 3)

			const customIterable = {
				[Symbol.iterator]() {
					const items = [
						{ re: 6, im: 0 },
						{ re: 0, im: 8 }
					]
					let i = 0
					return {
						next() {
							return i < items.length
								? { value: items[i++], done: false }
								: { value: undefined, done: true }
						}
					}
				}
			}
			assert.strictEqual(magnitudeComplexLazy(customIterable), 10)
		})
	})

	describe('edge cases and numerical stability', () => {
		test('returns +0 for empty iterables', () => {
			assert.ok(Object.is(magnitudeComplexLazy([]), 0))
			function* emptyGen() {}
			assert.ok(Object.is(magnitudeComplexLazy(emptyGen()), 0))
		})

		test('returns +0 for zero vectors including signed negative zeros', () => {
			const res = magnitudeComplexLazy([
				{ re: 0, im: 0 },
				{ re: -0, im: 0 },
				{ re: 0, im: -0 },
				{ re: -0, im: -0 }
			])
			assert.ok(Object.is(res, 0))
		})

		test('avoids overflow for very large components', () => {
			// Naive squaring (3e300)^2 = 9e600 overflows to Infinity.
			assertClose(magnitudeComplexLazy([{ re: 3e300, im: 4e300 }]), 5e300, 1e-15)

			const fourLarge = [
				{ re: 1e307, im: 1e307 },
				{ re: 1e307, im: 1e307 }
			]
			assertClose(magnitudeComplexLazy(fourLarge), 2e307, 1e-15)

			assert.strictEqual(
				magnitudeComplexLazy([{ re: Number.MAX_VALUE, im: 0 }]),
				Number.MAX_VALUE
			)
		})

		test('avoids underflow for very small and subnormal components', () => {
			// Naive squaring (3e-300)^2 = 9e-600 underflows to 0.
			assertClose(magnitudeComplexLazy([{ re: 3e-300, im: 4e-300 }]), 5e-300, 1e-15)

			const fourSmall = [
				{ re: 1e-305, im: 1e-305 },
				{ re: 1e-305, im: 1e-305 }
			]
			assertClose(magnitudeComplexLazy(fourSmall), 2e-305, 1e-15)

			// Subnormal values (below ~2.225e-308)
			const sub = Number.MIN_VALUE * 4
			assertClose(magnitudeComplexLazy([{ re: sub, im: 0 }]), sub, 1e-12)
			assertClose(
				magnitudeComplexLazy([{ re: 3e-320, im: 4e-320 }]),
				5e-320,
				1e-4
			)
		})

		test('handles mixed extreme scales in either order', () => {
			const smallThenLarge = [
				{ re: 1e-300, im: 1e-300 },
				{ re: 3e300, im: 4e300 }
			]
			const largeThenSmall = [
				{ re: 3e300, im: 4e300 },
				{ re: 1e-300, im: 1e-300 }
			]
			assertClose(magnitudeComplexLazy(smallThenLarge), 5e300, 1e-15)
			assertClose(magnitudeComplexLazy(largeThenSmall), 5e300, 1e-15)
		})

		test('maintains high precision via compensated summation on many small terms', () => {
			// 1^2 + 100_000 * (1e-6)^2 = 1 + 1e-7
			function* stream() {
				yield { re: 1, im: 0 }
				for (let i = 0; i < 100_000; i += 1) {
					yield { re: 1e-6, im: 0 }
				}
			}
			const expected = Math.sqrt(1 + 1e-7)
			assertClose(magnitudeComplexLazy(stream()), expected, 1e-15)
		})
	})

	describe('input validation', () => {
		test('rejects non-iterable inputs and strings with TypeError', () => {
			for (const bad of [null, undefined, 0, 42, true, {}, () => {}, '', 'abc']) {
				assert.throws(() => magnitudeComplexLazy(bad), TypeError)
			}
		})

		test('rejects invalid elements or non-numeric properties with TypeError', () => {
			const badVectors = [
				[null],
				[undefined],
				[42],
				['1+2i'],
				[{}],
				[{ re: 1 }],
				[{ im: 2 }],
				[{ re: '1', im: 2 }],
				[{ re: 1, im: null }],
				[{ re: 1, im: 2 }, { re: 3, im: undefined }]
			]
			for (const vec of badVectors) {
				assert.throws(() => magnitudeComplexLazy(vec), TypeError)
			}
		})

		test('rejects NaN and non-finite components with RangeError', () => {
			const nonFiniteVectors = [
				[{ re: NaN, im: 0 }],
				[{ re: 0, im: NaN }],
				[{ re: Infinity, im: 0 }],
				[{ re: 0, im: -Infinity }],
				[{ re: 1, im: 2 }, { re: -Infinity, im: 3 }]
			]
			for (const vec of nonFiniteVectors) {
				assert.throws(() => magnitudeComplexLazy(vec), RangeError)
			}
		})
	})

	describe('lazy streaming proof', () => {
		test('consumes a large generator in a single lazy pass without re-iterating', () => {
			const N = 200_000
			let iteratorCalls = 0
			let yielded = 0

			const singlePassIterable = {
				[Symbol.iterator]() {
					iteratorCalls += 1
					if (iteratorCalls > 1) {
						throw new Error('Iterable must not be iterated more than once')
					}
					return (function* () {
						for (let i = 0; i < N; i += 1) {
							yielded += 1
							yield { re: 3, im: 4 }
						}
					})()
				}
			}

			const result = magnitudeComplexLazy(singlePassIterable)
			assert.strictEqual(iteratorCalls, 1)
			assert.strictEqual(yielded, N)
			assertClose(result, 5 * Math.sqrt(N), 1e-13)
		})

		test('aborts immediately on invalid element in an infinite generator and closes it', () => {
			let pulled = 0
			let closed = false

			function* infiniteWithBadElement() {
				try {
					while (true) {
						pulled += 1
						if (pulled === 5) {
							yield { re: NaN, im: 0 }
						} else {
							yield { re: 1, im: 1 }
						}
					}
				} finally {
					closed = true
				}
			}

			// If the implementation tried to materialize the iterable (e.g. Array.from),
			// this would hang / OOM instead of failing immediately at item 5.
			assert.throws(() => magnitudeComplexLazy(infiniteWithBadElement()), RangeError)
			assert.strictEqual(pulled, 5)
			assert.strictEqual(closed, true)
		})
	})

	describe('independent mathematical cross-checks', () => {
		const vectors = [
			[
				{ re: 1.5, im: -2.25 },
				{ re: -0.75, im: 4.125 },
				{ re: 3.3, im: -1.1 },
				{ re: 0.0, im: 2.5 }
			],
			[
				{ re: -12.4, im: 5.8 },
				{ re: 7.1, im: -9.3 },
				{ re: 0.4, im: 0.2 },
				{ re: -3.6, im: -8.9 }
			],
			[
				{ re: 0.123, im: 0.456 },
				{ re: -0.789, im: 0.321 },
				{ re: 0.654, im: -0.987 },
				{ re: 0.111, im: -0.222 }
			]
		]

		test('matches sqrt(Re(<v, v>)) and Math.hypot over flattened components', () => {
			for (const v of vectors) {
				const lazyNorm = magnitudeComplexLazy(v)

				const inner = hermitianInnerProduct(v, v)
				assertClose(inner.im, 0, 1e-14, 1e-14)
				const innerNorm = Math.sqrt(inner.re)
				assertClose(lazyNorm, innerNorm, 1e-14)

				const flat = v.flatMap(({ re, im }) => [re, im])
				const hypotNorm = Math.hypot(...flat)
				assertClose(lazyNorm, hypotNorm, 1e-14)
			}
		})

		test('satisfies absolute homogeneity ||c * v|| = |c| * ||v||', () => {
			const scalars = [
				{ re: 0, im: 0 },
				{ re: -3.5, im: 0 },
				{ re: 0, im: 2.75 },
				{ re: 1.5, im: -2.5 },
				{ re: Math.cos(1.1), im: Math.sin(1.1) }
			]

			for (const v of vectors) {
				const normV = magnitudeComplexLazy(v)
				for (const c of scalars) {
					const absC = Math.hypot(c.re, c.im)
					function* scaled() {
						for (const z of v) {
							yield complexMul(c, z)
						}
					}
					const normCV = magnitudeComplexLazy(scaled())
					assertClose(normCV, absC * normV, 1e-13, 1e-15)
				}
			}
		})

		test('satisfies triangle inequality ||u + v|| <= ||u|| + ||v||', () => {
			for (let i = 0; i < vectors.length; i += 1) {
				for (let j = 0; j < vectors.length; j += 1) {
					const u = vectors[i]
					const v = vectors[j]
					function* sum() {
						for (let k = 0; k < u.length; k += 1) {
							yield { re: u[k].re + v[k].re, im: u[k].im + v[k].im }
						}
					}
					const lhs = magnitudeComplexLazy(sum())
					const rhs = magnitudeComplexLazy(u) + magnitudeComplexLazy(v)
					assert.ok(
						lhs <= rhs + 1e-12 * rhs,
						`Triangle inequality violated: ||u+v||=${lhs} > ||u||+||v||=${rhs}`
					)
				}
			}
		})

		test('is invariant under per-coordinate unitary phase rotations', () => {
			const v = vectors[0]
			const baseNorm = magnitudeComplexLazy(v)
			function* rotated() {
				let k = 0
				for (const z of v) {
					const theta = 0.7 * (k + 1)
					const phase = { re: Math.cos(theta), im: Math.sin(theta) }
					yield complexMul(phase, z)
					k += 1
				}
			}
			assertClose(magnitudeComplexLazy(rotated()), baseNorm, 1e-14)
		})
	})
})
