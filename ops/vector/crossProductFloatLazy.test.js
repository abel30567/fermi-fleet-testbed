import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { crossProductFloatLazy } from './crossProductFloatLazy.js'

function dot(u, v) {
	return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
}

function normSq(u) {
	return dot(u, u)
}

function det3x3(a, b, c) {
	return (
		a[0] * (b[1] * c[2] - b[2] * c[1]) -
		a[1] * (b[0] * c[2] - b[2] * c[0]) +
		a[2] * (b[0] * c[1] - b[1] * c[0])
	)
}

function assertClose(actual, expected, tol = 1e-12, message) {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(1, Math.abs(actual), Math.abs(expected))
	assert.ok(
		diff <= tol * scale,
		message ?? `Expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`
	)
}

function assertVecClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assertClose(actual[i], expected[i], tol, `component[${i}]: ${actual[i]} vs ${expected[i]}`)
	}
}

describe('crossProductFloatLazy', () => {
	describe('normal cases', () => {
		test('standard right-handed basis vectors', () => {
			assert.deepEqual([...crossProductFloatLazy([1, 0, 0], [0, 1, 0])], [0, 0, 1])
			assert.deepEqual([...crossProductFloatLazy([0, 1, 0], [0, 0, 1])], [1, 0, 0])
			assert.deepEqual([...crossProductFloatLazy([0, 0, 1], [1, 0, 0])], [0, 1, 0])
			assert.deepEqual([...crossProductFloatLazy([0, 1, 0], [1, 0, 0])], [0, 0, -1])
		})

		test('general integer and floating-point vectors', () => {
			assert.deepEqual([...crossProductFloatLazy([2, 3, 4], [5, 6, 7])], [-3, 6, -3])
			assertVecClose(
				[...crossProductFloatLazy([1.5, -2.25, 0.5], [-4.0, 3.5, 2.0])],
				[-6.25, -5.0, -3.75]
			)
		})

		test('accepts diverse iterable types (TypedArrays, Set, custom iterables, generators)', () => {
			const f64 = new Float64Array([2, 3, 4])
			const i32 = new Int32Array([5, 6, 7])
			assert.deepEqual([...crossProductFloatLazy(f64, i32)], [-3, 6, -3])

			const setA = new Set([1, 2, 3])
			const customB = {
				*[Symbol.iterator]() {
					yield 4
					yield 5
					yield 6
				},
			}
			assert.deepEqual([...crossProductFloatLazy(setA, customB)], [-3, 6, -3])
		})
	})

	describe('edge cases', () => {
		test('zero vectors, parallel vectors, and self cross product', () => {
			const zeroLeft = [...crossProductFloatLazy([0, 0, 0], [7, -8, 9])]
			assert.deepEqual(zeroLeft, [0, 0, 0])
			assert.ok(zeroLeft.every((v) => Object.is(v, 0)))

			assert.deepEqual([...crossProductFloatLazy([7, -8, 9], [0, 0, 0])], [0, 0, 0])
			assert.deepEqual([...crossProductFloatLazy([3, -4, 5], [3, -4, 5])], [0, 0, 0])
			assert.deepEqual([...crossProductFloatLazy([1, -2, 3], [-2.5, 5, -7.5])], [0, 0, 0])
		})

		test('IEEE-754 special float64 values (NaN, Infinity, subnormals, large values)', () => {
			const withNaN = [...crossProductFloatLazy([NaN, 1, 2], [3, 4, 5])]
			assert.equal(withNaN[0], -3)
			assert.ok(Number.isNaN(withNaN[1]))
			assert.ok(Number.isNaN(withNaN[2]))

			const withInf = [...crossProductFloatLazy([Infinity, 0, 0], [0, 1, 0])]
			assert.equal(withInf[0], 0)
			assert.ok(Number.isNaN(withInf[1]))
			assert.equal(withInf[2], Infinity)

			const subnormal = [...crossProductFloatLazy([Number.MIN_VALUE, 0, 0], [0, 1, 0])]
			assert.equal(subnormal[0], 0)
			assert.equal(subnormal[1], 0)
			assert.equal(subnormal[2], Number.MIN_VALUE)

			const overflow = [...crossProductFloatLazy([1e200, 0, 0], [0, 1e200, 0])]
			assert.equal(overflow[2], Infinity)
		})
	})

	describe('input validation', () => {
		test('rejects non-iterable inputs and strings immediately', () => {
			const invalidInputs = [null, undefined, 42, true, {}, '123', Symbol('x')]
			for (const bad of invalidInputs) {
				assert.throws(() => crossProductFloatLazy(bad, [1, 2, 3]), TypeError)
				assert.throws(() => crossProductFloatLazy([1, 2, 3], bad), TypeError)
			}
		})

		test('rejects vectors with fewer or more than 3 elements', () => {
			for (const badLen of [[], [1], [1, 2], [1, 2, 3, 4]]) {
				assert.throws(() => [...crossProductFloatLazy(badLen, [1, 2, 3])], RangeError)
				assert.throws(() => [...crossProductFloatLazy([1, 2, 3], badLen)], RangeError)
			}
		})

		test('rejects non-number elements', () => {
			for (const badElem of ['1', null, undefined, 1n, true, {}, []]) {
				assert.throws(() => [...crossProductFloatLazy([badElem, 2, 3], [1, 2, 3])], TypeError)
				assert.throws(() => [...crossProductFloatLazy([1, 2, 3], [1, badElem, 3])], TypeError)
			}
		})
	})

	describe('lazy streaming behavior', () => {
		test('does not consume input iterables until the output generator is iterated', () => {
			let aPulled = 0
			let bPulled = 0

			function* tracked(values, onPull) {
				for (const v of values) {
					onPull()
					yield v
				}
			}

			const gen = crossProductFloatLazy(
				tracked([2, 3, 4], () => aPulled++),
				tracked([5, 6, 7], () => bPulled++)
			)

			assert.equal(aPulled, 0)
			assert.equal(bPulled, 0)

			const s0 = gen.next()
			assert.deepEqual(s0, { value: -3, done: false })
			assert.equal(aPulled, 3)
			assert.equal(bPulled, 3)

			const s1 = gen.next()
			assert.deepEqual(s1, { value: 6, done: false })

			const s2 = gen.next()
			assert.deepEqual(s2, { value: -3, done: false })

			const s3 = gen.next()
			assert.deepEqual(s3, { value: undefined, done: true })
		})

		test('supports early termination on output generator', () => {
			const gen = crossProductFloatLazy([2, 3, 4], [5, 6, 7])
			const firstOnly = []
			for (const component of gen) {
				firstOnly.push(component)
				break
			}
			assert.deepEqual(firstOnly, [-3])
			assert.deepEqual(gen.next(), { value: undefined, done: true })
		})

		test('fails fast on infinite input generator and closes both iterators cleanly', () => {
			let aPulled = 0
			let aClosed = false
			let bClosed = false

			function* infiniteA() {
				try {
					while (true) {
						aPulled++
						yield aPulled
					}
				} finally {
					aClosed = true
				}
			}

			function* finiteB() {
				try {
					yield 1
					yield 2
					yield 3
					yield 4
				} finally {
					bClosed = true
				}
			}

			const gen = crossProductFloatLazy(infiniteA(), finiteB())
			assert.equal(aPulled, 0)
			assert.throws(() => gen.next(), RangeError)
			assert.equal(aPulled, 4)
			assert.equal(aClosed, true)
			assert.equal(bClosed, true)
		})

		test('closes unfinished peer iterator when validation fails mid-stream', () => {
			let aClosed = false

			function* trackedA() {
				try {
					yield 1
					yield 2
					yield 3
				} finally {
					aClosed = true
				}
			}

			const gen = crossProductFloatLazy(trackedA(), [1, 'not-a-number', 3])
			assert.throws(() => gen.next(), TypeError)
			assert.equal(aClosed, true)
		})
	})

	describe('independent mathematical cross-checks', () => {
		const vectors = [
			[1.25, -3.5, 2.75],
			[-0.5, 4.125, -1.875],
			[7.3, 0.2, -5.9],
			[-2.1, -6.4, 3.8],
			[0.123, 9.876, -4.321],
		]

		test('orthogonality, anti-commutativity, and Lagrange identity', () => {
			for (let i = 0; i < vectors.length; i++) {
				for (let j = 0; j < vectors.length; j++) {
					const a = vectors[i]
					const b = vectors[j]
					const axb = [...crossProductFloatLazy(a, b)]
					const bxa = [...crossProductFloatLazy(b, a)]

					// Orthogonality: (a × b) · a = 0 and (a × b) · b = 0
					assertClose(dot(axb, a), 0, 1e-12)
					assertClose(dot(axb, b), 0, 1e-12)

					// Anti-commutativity: a × b = -(b × a)
					assertVecClose(axb, [-bxa[0], -bxa[1], -bxa[2]], 1e-14)

					// Lagrange identity: ||a × b||² = ||a||²||b||² - (a · b)²
					const lhs = normSq(axb)
					const rhs = normSq(a) * normSq(b) - dot(a, b) ** 2
					assertClose(lhs, rhs, 1e-12)
				}
			}
		})

		test('scalar triple product matches independent 3x3 determinant, Jacobi and BAC-CAB identities', () => {
			for (let i = 0; i < vectors.length - 2; i++) {
				const a = vectors[i]
				const b = vectors[i + 1]
				const c = vectors[i + 2]

				// Scalar triple product: (a × b) · c = det([a, b, c])
				const axb = [...crossProductFloatLazy(a, b)]
				assertClose(dot(axb, c), det3x3(a, b, c), 1e-12)

				// BAC-CAB identity: a × (b × c) = b(a · c) - c(a · b)
				const bxc = [...crossProductFloatLazy(b, c)]
				const aCrossBC = [...crossProductFloatLazy(a, bxc)]
				const ac = dot(a, c)
				const ab = dot(a, b)
				const bacCab = [
					b[0] * ac - c[0] * ab,
					b[1] * ac - c[1] * ab,
					b[2] * ac - c[2] * ab,
				]
				assertVecClose(aCrossBC, bacCab, 1e-12)

				// Jacobi identity: a×(b×c) + b×(c×a) + c×(a×b) = 0
				const cxa = [...crossProductFloatLazy(c, a)]
				const bCrossCA = [...crossProductFloatLazy(b, cxa)]
				const cCrossAB = [...crossProductFloatLazy(c, axb)]
				const jacobi = [
					aCrossBC[0] + bCrossCA[0] + cCrossAB[0],
					aCrossBC[1] + bCrossCA[1] + cCrossAB[1],
					aCrossBC[2] + bCrossCA[2] + cCrossAB[2],
				]
				assertVecClose(jacobi, [0, 0, 0], 1e-12)
			}
		})
	})
})
