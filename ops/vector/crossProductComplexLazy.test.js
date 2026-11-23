import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { crossProductComplexLazy } from './crossProductComplexLazy.js'

const c = (re, im = 0) => ({ re, im })

function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.equal(typeof actual?.re, 'number')
	assert.equal(typeof actual?.im, 'number')
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`real mismatch: got ${actual.re}, expected ${expected.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`imag mismatch: got ${actual.im}, expected ${expected.im}`
	)
}

function assertVecClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assertComplexClose(actual[i], expected[i], eps)
	}
}

/**
 * Independent reference implementation via Levi-Civita tensor summation:
 * (a × b)_i = sum_{j=0..2} sum_{k=0..2} eps_{ijk} * a_j * b_k
 */
function crossProductLeviCivita(a, b) {
	const eps = (i, j, k) => {
		if (i === j || j === k || i === k) return 0
		if ((i === 0 && j === 1 && k === 2) || (i === 1 && j === 2 && k === 0) || (i === 2 && j === 0 && k === 1)) {
			return 1
		}
		return -1
	}
	const out = []
	for (let i = 0; i < 3; i++) {
		let re = 0
		let im = 0
		for (let j = 0; j < 3; j++) {
			for (let k = 0; k < 3; k++) {
				const s = eps(i, j, k)
				if (s === 0) continue
				re += s * (a[j].re * b[k].re - a[j].im * b[k].im)
				im += s * (a[j].re * b[k].im + a[j].im * b[k].re)
			}
		}
		out.push({ re: re === 0 ? 0 : re, im: im === 0 ? 0 : im })
	}
	return out
}

function dotComplexBilinear(a, b) {
	let re = 0
	let im = 0
	for (let i = 0; i < 3; i++) {
		re += a[i].re * b[i].re - a[i].im * b[i].im
		im += a[i].re * b[i].im + a[i].im * b[i].re
	}
	return { re, im }
}

function scaleVec(scalar, vec) {
	return vec.map((v) => ({
		re: scalar.re * v.re - scalar.im * v.im,
		im: scalar.re * v.im + scalar.im * v.re,
	}))
}

function addVec(u, v) {
	return u.map((el, i) => ({ re: el.re + v[i].re, im: el.im + v[i].im }))
}

function subVec(u, v) {
	return u.map((el, i) => ({ re: el.re - v[i].re, im: el.im - v[i].im }))
}

describe('crossProductComplexLazy', () => {
	describe('normal cases', () => {
		test('standard basis vectors e1 × e2 = e3, e2 × e3 = e1, e3 × e1 = e2', () => {
			const e1 = [c(1), c(0), c(0)]
			const e2 = [c(0), c(1), c(0)]
			const e3 = [c(0), c(0), c(1)]

			assert.deepStrictEqual([...crossProductComplexLazy(e1, e2)], e3)
			assert.deepStrictEqual([...crossProductComplexLazy(e2, e3)], e1)
			assert.deepStrictEqual([...crossProductComplexLazy(e3, e1)], e2)
		})

		test('purely real vectors match real 3D cross product', () => {
			const a = [c(2), c(3), c(4)]
			const b = [c(5), c(6), c(7)]
			// (3*7 - 4*6, 4*5 - 2*7, 2*6 - 3*5) = (-3, 6, -3)
			assert.deepStrictEqual([...crossProductComplexLazy(a, b)], [c(-3), c(6), c(-3)])
		})

		test('purely imaginary basis vectors: (i e1) × (i e2) = -e3', () => {
			const ie1 = [c(0, 1), c(0, 0), c(0, 0)]
			const ie2 = [c(0, 0), c(0, 1), c(0, 0)]
			assert.deepStrictEqual([...crossProductComplexLazy(ie1, ie2)], [c(0, 0), c(0, 0), c(-1, 0)])
		})

		test('general complex vectors match hand-computed values', () => {
			const a = [c(1, 2), c(3, -1), c(0, 4)]
			const b = [c(2, 1), c(-1, 3), c(5, -2)]
			// c0 = (3 - i)(5 - 2i) - (4i)(-1 + 3i) = (13 - 11i) - (-12 - 4i) = 25 - 7i
			// c1 = (4i)(2 + i) - (1 + 2i)(5 - 2i) = (-4 + 8i) - (9 + 8i) = -13 + 0i
			// c2 = (1 + 2i)(-1 + 3i) - (3 - i)(2 + i) = (-7 + i) - (7 + i) = -14 + 0i
			assert.deepStrictEqual(
				[...crossProductComplexLazy(a, b)],
				[c(25, -7), c(-13, 0), c(-14, 0)]
			)
		})

		test('accepts diverse iterable types: generators, Sets, custom iterables', () => {
			function* genA() {
				yield c(1, 1)
				yield c(2, -1)
				yield c(0, 3)
			}
			const setB = new Set([c(4, 0), c(-1, 2), c(1, -1)])
			const customA = {
				[Symbol.iterator]() {
					const items = [c(1, 1), c(2, -1), c(0, 3)]
					let idx = 0
					return {
						next() {
							return idx < items.length
								? { value: items[idx++], done: false }
								: { value: undefined, done: true }
						},
					}
				},
			}

			const fromGenAndSet = [...crossProductComplexLazy(genA(), setB)]
			const fromCustomAndArray = [...crossProductComplexLazy(customA, [...setB])]
			assert.deepStrictEqual(fromGenAndSet, fromCustomAndArray)
		})
	})

	describe('edge cases and validation', () => {
		test('zero vector and self cross product yield zero vector without -0', () => {
			const zero = [c(0, 0), c(0, 0), c(0, 0)]
			const v = [c(-1, 2), c(3, -4), c(-5, 6)]

			const r1 = [...crossProductComplexLazy(zero, v)]
			const r2 = [...crossProductComplexLazy(v, zero)]
			const r3 = [...crossProductComplexLazy(v, v)]

			for (const res of [r1, r2, r3]) {
				assert.deepStrictEqual(res, zero)
				for (const item of res) {
					assert.ok(!Object.is(item.re, -0), 're must not be -0')
					assert.ok(!Object.is(item.im, -0), 'im must not be -0')
				}
			}
		})

		test('parallel vectors with complex scalar multiple yield zero vector', () => {
			const v = [c(1, -2), c(3, 4), c(-5, 1)]
			const scaled = scaleVec(c(2, -3), v)
			assertVecClose([...crossProductComplexLazy(v, scaled)], [c(0), c(0), c(0)])
		})

		test('rejects non-iterable inputs immediately with TypeError', () => {
			const valid = [c(1), c(0), c(0)]
			for (const bad of [null, undefined, 42, true, {}, 'abc']) {
				assert.throws(() => crossProductComplexLazy(bad, valid), TypeError)
				assert.throws(() => crossProductComplexLazy(valid, bad), TypeError)
			}
		})

		test('rejects vectors with fewer or more than 3 elements with RangeError', () => {
			const valid = [c(1), c(0), c(0)]
			for (const bad of [[], [c(1)], [c(1), c(2)], [c(1), c(2), c(3), c(4)]]) {
				assert.throws(() => [...crossProductComplexLazy(bad, valid)], RangeError)
				assert.throws(() => [...crossProductComplexLazy(valid, bad)], RangeError)
			}
		})

		test('rejects invalid complex element structures with TypeError', () => {
			const valid = [c(1), c(0), c(0)]
			const invalidItems = [null, undefined, 5, '1+i', {}, { re: 1 }, { im: 1 }, { re: '1', im: 0 }]
			for (const badEl of invalidItems) {
				assert.throws(() => [...crossProductComplexLazy([badEl, c(0), c(0)], valid)], TypeError)
				assert.throws(() => [...crossProductComplexLazy(valid, [c(0), badEl, c(0)])], TypeError)
			}
		})

		test('rejects non-finite complex components with RangeError', () => {
			const valid = [c(1), c(0), c(0)]
			const nonFinite = [c(NaN, 0), c(0, NaN), c(Infinity, 0), c(0, -Infinity)]
			for (const badEl of nonFinite) {
				assert.throws(() => [...crossProductComplexLazy([badEl, c(0), c(0)], valid)], RangeError)
				assert.throws(() => [...crossProductComplexLazy(valid, [c(0), c(0), badEl])], RangeError)
			}
		})
	})

	describe('lazy consumption and generator semantics', () => {
		test('consumes zero elements before iteration starts and yields one component per next()', () => {
			let pulledA = 0
			let pulledB = 0
			let startedA = false
			let startedB = false

			function* genA() {
				startedA = true
				for (const item of [c(1, 0), c(0, 1), c(2, -1)]) {
					pulledA++
					yield item
				}
			}
			function* genB() {
				startedB = true
				for (const item of [c(3, 1), c(-1, 0), c(0, 2)]) {
					pulledB++
					yield item
				}
			}

			const gen = crossProductComplexLazy(genA(), genB())
			assert.equal(typeof gen.next, 'function')
			assert.equal(gen[Symbol.iterator](), gen)
			assert.equal(startedA, false)
			assert.equal(startedB, false)
			assert.equal(pulledA, 0)
			assert.equal(pulledB, 0)

			const s0 = gen.next()
			assert.equal(s0.done, false)
			assert.equal(pulledA, 3)
			assert.equal(pulledB, 3)

			const s1 = gen.next()
			assert.equal(s1.done, false)

			const s2 = gen.next()
			assert.equal(s2.done, false)

			const s3 = gen.next()
			assert.deepStrictEqual(s3, { value: undefined, done: true })

			const expected = crossProductLeviCivita(
				[c(1, 0), c(0, 1), c(2, -1)],
				[c(3, 1), c(-1, 0), c(0, 2)]
			)
			assert.deepStrictEqual([s0.value, s1.value, s2.value], expected)
		})

		test('fails fast on invalid first element without pulling remaining items and closes source iterators', () => {
			let pulledA = 0
			let pulledB = 0
			let closedA = false
			let closedB = false

			function* genA() {
				try {
					pulledA++
					yield { re: NaN, im: 0 }
					pulledA++
					yield c(1, 0)
					pulledA++
					yield c(2, 0)
				} finally {
					closedA = true
				}
			}
			function* genB() {
				try {
					pulledB++
					yield c(1, 0)
					pulledB++
					yield c(2, 0)
					pulledB++
					yield c(3, 0)
				} finally {
					closedB = true
				}
			}

			const gen = crossProductComplexLazy(genA(), genB())
			assert.throws(() => gen.next(), RangeError)
			assert.equal(pulledA, 1)
			assert.equal(pulledB, 0)
			assert.equal(closedA, true)
			// genB was never stepped, so finally in genB does not run (standard JS generator semantics)
			assert.equal(closedB, false)
		})

		test('fails fast on infinite generator after 4th element and runs cleanup', () => {
			let pulledA = 0
			let closedA = false
			let closedB = false

			function* infiniteA() {
				try {
					while (true) {
						pulledA++
						yield c(pulledA, -pulledA)
					}
				} finally {
					closedA = true
				}
			}
			function* finiteB() {
				try {
					yield c(1, 0)
					yield c(0, 1)
					yield c(1, 1)
				} finally {
					closedB = true
				}
			}

			const gen = crossProductComplexLazy(infiniteA(), finiteB())
			assert.throws(() => gen.next(), RangeError)
			assert.equal(pulledA, 4)
			assert.equal(closedA, true)
			assert.equal(closedB, true)
		})

		test('supports early consumer termination via gen.return()', () => {
			const gen = crossProductComplexLazy(
				[c(1, 2), c(3, 4), c(5, 6)],
				[c(7, 8), c(9, 10), c(11, 12)]
			)
			const first = gen.next()
			assert.equal(first.done, false)
			const ended = gen.return()
			assert.deepStrictEqual(ended, { value: undefined, done: true })
			assert.deepStrictEqual(gen.next(), { value: undefined, done: true })
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		const vectors = [
			[c(1.5, -2.25), c(-0.75, 3.5), c(4.125, 0.5)],
			[c(-2.5, 1.25), c(0.5, -1.75), c(3.25, 2.5)],
			[c(0.25, 4.5), c(-3.125, -0.5), c(1.75, -2.25)],
		]

		test('matches independent Levi-Civita tensor reference implementation', () => {
			const [a, b, d] = vectors
			assertVecClose([...crossProductComplexLazy(a, b)], crossProductLeviCivita(a, b))
			assertVecClose([...crossProductComplexLazy(b, d)], crossProductLeviCivita(b, d))
			assertVecClose([...crossProductComplexLazy(d, a)], crossProductLeviCivita(d, a))
		})

		test('satisfies anti-symmetry: a × b = -(b × a)', () => {
			const [a, b] = vectors
			const ab = [...crossProductComplexLazy(a, b)]
			const ba = [...crossProductComplexLazy(b, a)]
			const negBa = scaleVec(c(-1, 0), ba)
			assertVecClose(ab, negBa)
		})

		test('satisfies complex bilinearity: (αa + βd) × b = α(a × b) + β(d × b)', () => {
			const [a, b, d] = vectors
			const alpha = c(2.5, -1.5)
			const beta = c(-0.75, 3.25)

			const lhs = [...crossProductComplexLazy(addVec(scaleVec(alpha, a), scaleVec(beta, d)), b)]
			const rhs = addVec(
				scaleVec(alpha, [...crossProductComplexLazy(a, b)]),
				scaleVec(beta, [...crossProductComplexLazy(d, b)])
			)
			assertVecClose(lhs, rhs)
		})

		test('satisfies bilinear orthogonality: a · (a × b) = 0 and b · (a × b) = 0', () => {
			const [a, b] = vectors
			const ab = [...crossProductComplexLazy(a, b)]
			assertComplexClose(dotComplexBilinear(a, ab), c(0, 0))
			assertComplexClose(dotComplexBilinear(b, ab), c(0, 0))
		})

		test('satisfies Jacobi identity and Lagrange BAC-CAB identity over C', () => {
			const [a, b, d] = vectors
			const a_bd = [...crossProductComplexLazy(a, crossProductComplexLazy(b, d))]
			const b_da = [...crossProductComplexLazy(b, crossProductComplexLazy(d, a))]
			const d_ab = [...crossProductComplexLazy(d, crossProductComplexLazy(a, b))]

			// Jacobi: a × (b × d) + b × (d × a) + d × (a × b) = 0
			const jacobi = addVec(addVec(a_bd, b_da), d_ab)
			assertVecClose(jacobi, [c(0, 0), c(0, 0), c(0, 0)])

			// BAC-CAB: a × (b × d) = b(a · d) - d(a · b)
			const bacCab = subVec(
				scaleVec(dotComplexBilinear(a, d), b),
				scaleVec(dotComplexBilinear(a, b), d)
			)
			assertVecClose(a_bd, bacCab)
		})
	})
})
