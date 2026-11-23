import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { subtractDualLazy } from './subtractDualLazy.js'

describe('subtractDualLazy', () => {
	describe('normal cases', () => {
		test('subtracts two sequences of dual numbers elementwise', () => {
			const a = [
				{ v: 10, d: 3 },
				{ v: -2.5, d: 0.5 },
				{ v: 0, d: -4 }
			]
			const b = [
				{ v: 4, d: 1 },
				{ v: 1.5, d: -2.5 },
				{ v: 3, d: -4 }
			]
			const result = Array.from(subtractDualLazy(a, b))
			assert.deepStrictEqual(result, [
				{ v: 6, d: 2 },
				{ v: -4, d: 3 },
				{ v: -3, d: 0 }
			])
		})

		test('subtracts two single dual numbers as a 1-element generator', () => {
			const gen = subtractDualLazy({ v: 7.5, d: -1.25 }, { v: 2.5, d: 3.75 })
			assert.deepStrictEqual(gen.next(), { value: { v: 5, d: -5 }, done: false })
			assert.deepStrictEqual(gen.next(), { value: undefined, done: true })
		})

		test('broadcasts a single dual subtrahend over a sequence', () => {
			const seq = [
				{ v: 1, d: 2 },
				{ v: 3, d: 4 },
				{ v: 5, d: 6 }
			]
			const offset = { v: 1, d: 1 }
			assert.deepStrictEqual(Array.from(subtractDualLazy(seq, offset)), [
				{ v: 0, d: 1 },
				{ v: 2, d: 3 },
				{ v: 4, d: 5 }
			])
		})

		test('broadcasts a single dual minuend over a sequence', () => {
			const base = { v: 10, d: 0 }
			const seq = [
				{ v: 2, d: 1 },
				{ v: 10, d: -3 }
			]
			assert.deepStrictEqual(Array.from(subtractDualLazy(base, seq)), [
				{ v: 8, d: -1 },
				{ v: 0, d: 3 }
			])
		})

		test('accepts arbitrary iterables such as Sets and custom iterables', () => {
			const setA = new Set([
				{ v: 5, d: 1 },
				{ v: 8, d: 2 }
			])
			const customB = {
				*[Symbol.iterator]() {
					yield { v: 2, d: 0.5 }
					yield { v: 3, d: 1.5 }
				}
			}
			assert.deepStrictEqual(Array.from(subtractDualLazy(setA, customB)), [
				{ v: 3, d: 0.5 },
				{ v: 5, d: 0.5 }
			])
		})
	})

	describe('edge cases and algebraic properties', () => {
		test('handles empty sequences', () => {
			assert.deepStrictEqual(Array.from(subtractDualLazy([], [])), [])
			assert.deepStrictEqual(Array.from(subtractDualLazy([], { v: 1, d: 2 })), [])
			assert.deepStrictEqual(Array.from(subtractDualLazy({ v: 1, d: 2 }, [])), [])
		})

		test('normalizes negative zero results to +0', () => {
			const [res] = subtractDualLazy({ v: -0, d: -0 }, { v: 0, d: 0 })
			assert.ok(Object.is(res.v, 0))
			assert.ok(Object.is(res.d, 0))
		})

		test('satisfies identity, self-subtraction, and anti-commutativity', () => {
			const a = [
				{ v: 3.25, d: -1.5 },
				{ v: -8, d: 4.75 }
			]
			const b = [
				{ v: -2.5, d: 6.25 },
				{ v: 1.5, d: -0.25 }
			]
			const zero = { v: 0, d: 0 }

			assert.deepStrictEqual(Array.from(subtractDualLazy(a, zero)), a)
			assert.deepStrictEqual(Array.from(subtractDualLazy(a, a)), [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 }
			])

			const ab = Array.from(subtractDualLazy(a, b))
			const ba = Array.from(subtractDualLazy(b, a))
			for (let i = 0; i < ab.length; i++) {
				assert.equal(ab[i].v, -ba[i].v)
				assert.equal(ab[i].d, -ba[i].d)
			}
		})

		test('snapshots scalar operands so later external mutation does not affect lazy output', () => {
			const scalar = { v: 10, d: 2 }
			const gen = subtractDualLazy(scalar, [
				{ v: 1, d: 1 },
				{ v: 2, d: 1 }
			])
			assert.deepStrictEqual(gen.next().value, { v: 9, d: 1 })
			scalar.v = 999
			scalar.d = 999
			assert.deepStrictEqual(gen.next().value, { v: 8, d: 1 })
		})

		test('stops lazily at the shorter sequence when strictLength is false', () => {
			let pulledFromB = 0
			let closedB = false
			function* genB() {
				try {
					for (let i = 1; i <= 10; i++) {
						pulledFromB += 1
						yield { v: i, d: 1 }
					}
				} finally {
					closedB = true
				}
			}

			const a = [
				{ v: 10, d: 5 },
				{ v: 20, d: 5 }
			]
			const out = Array.from(subtractDualLazy(a, genB(), { strictLength: false }))
			assert.deepStrictEqual(out, [
				{ v: 9, d: 4 },
				{ v: 18, d: 4 }
			])
			assert.equal(pulledFromB, 2)
			assert.equal(closedB, true)
		})

		test('throws RangeError on floating-point overflow', () => {
			const gen = subtractDualLazy(
				{ v: Number.MAX_VALUE, d: 0 },
				{ v: -Number.MAX_VALUE, d: 0 }
			)
			assert.throws(() => gen.next(), RangeError)

			const genD = subtractDualLazy(
				{ v: 0, d: -Number.MAX_VALUE },
				{ v: 0, d: Number.MAX_VALUE }
			)
			assert.throws(() => genD.next(), RangeError)
		})
	})

	describe('lazy streaming and generator consumption', () => {
		test('consumes infinite generators strictly on demand and cleans up on early break', () => {
			let pullsA = 0
			let pullsB = 0
			let closedA = false
			let closedB = false

			function* infA() {
				try {
					for (let i = 0; ; i++) {
						pullsA += 1
						yield { v: i * 3, d: 3 }
					}
				} finally {
					closedA = true
				}
			}

			function* infB() {
				try {
					for (let i = 0; ; i++) {
						pullsB += 1
						yield { v: i, d: 1 }
					}
				} finally {
					closedB = true
				}
			}

			const stream = subtractDualLazy(infA(), infB())
			assert.equal(pullsA, 0, 'must not pull before iteration starts')
			assert.equal(pullsB, 0, 'must not pull before iteration starts')

			const taken = []
			for (const item of stream) {
				taken.push(item)
				assert.equal(pullsA, taken.length)
				assert.equal(pullsB, taken.length)
				if (taken.length === 4) {
					break
				}
			}

			assert.deepStrictEqual(taken, [
				{ v: 0, d: 2 },
				{ v: 2, d: 2 },
				{ v: 4, d: 2 },
				{ v: 6, d: 2 }
			])
			assert.equal(pullsA, 4)
			assert.equal(pullsB, 4)
			assert.equal(closedA, true, 'upstream minuend iterator should be closed on break')
			assert.equal(closedB, true, 'upstream subtrahend iterator should be closed on break')
		})

		test('broadcasting over an infinite generator pulls lazily and closes on break', () => {
			let pulls = 0
			let closed = false

			function* inf() {
				try {
					for (let i = 1; ; i++) {
						pulls += 1
						yield { v: i * i, d: 2 * i }
					}
				} finally {
					closed = true
				}
			}

			const taken = []
			for (const item of subtractDualLazy(inf(), { v: 1, d: 0 })) {
				taken.push(item)
				if (taken.length === 3) {
					break
				}
			}

			assert.deepStrictEqual(taken, [
				{ v: 0, d: 2 },
				{ v: 3, d: 4 },
				{ v: 8, d: 6 }
			])
			assert.equal(pulls, 3)
			assert.equal(closed, true)
		})

		test('validates lazy stream elements on demand and closes upstream iterators on error', () => {
			let closedA = false
			let closedB = false

			function* genA() {
				try {
					yield { v: 5, d: 1 }
					yield { v: 'not-a-number', d: 1 }
					yield { v: 99, d: 1 }
				} finally {
					closedA = true
				}
			}

			function* genB() {
				try {
					yield { v: 2, d: 0.5 }
					yield { v: 1, d: 0.5 }
					yield { v: 1, d: 0.5 }
				} finally {
					closedB = true
				}
			}

			const gen = subtractDualLazy(genA(), genB())
			assert.deepStrictEqual(gen.next().value, { v: 3, d: 0.5 })
			assert.throws(() => gen.next(), TypeError)
			assert.equal(closedA, true)
			assert.equal(closedB, true)
		})
	})

	describe('input validation errors', () => {
		test('rejects missing, null, primitive, and string operands eagerly', () => {
			assert.throws(() => subtractDualLazy(undefined, { v: 1, d: 0 }), TypeError)
			assert.throws(() => subtractDualLazy({ v: 1, d: 0 }, undefined), TypeError)
			assert.throws(() => subtractDualLazy(null, { v: 1, d: 0 }), TypeError)
			assert.throws(() => subtractDualLazy({ v: 1, d: 0 }, null), TypeError)
			assert.throws(() => subtractDualLazy(42, { v: 1, d: 0 }), TypeError)
			assert.throws(() => subtractDualLazy('abc', [{ v: 1, d: 0 }]), TypeError)
			assert.throws(() => subtractDualLazy([{ v: 1, d: 0 }], 'abc'), TypeError)
		})

		test('rejects invalid scalar dual objects eagerly', () => {
			assert.throws(() => subtractDualLazy({ v: 1 }, { v: 1, d: 0 }), TypeError)
			assert.throws(() => subtractDualLazy({ d: 1 }, { v: 1, d: 0 }), TypeError)
			assert.throws(() => subtractDualLazy({ v: '1', d: 0 }, { v: 1, d: 0 }), TypeError)
			assert.throws(() => subtractDualLazy({ v: NaN, d: 0 }, { v: 1, d: 0 }), RangeError)
			assert.throws(() => subtractDualLazy({ v: 1, d: Infinity }, { v: 1, d: 0 }), RangeError)
			assert.throws(() => subtractDualLazy({ v: 1, d: 0 }, { v: -Infinity, d: 0 }), RangeError)
		})

		test('rejects invalid options eagerly', () => {
			assert.throws(() => subtractDualLazy([], [], null), TypeError)
			assert.throws(() => subtractDualLazy([], [], []), TypeError)
			assert.throws(() => subtractDualLazy([], [], 'strict'), TypeError)
			assert.throws(() => subtractDualLazy([], [], { strictLength: 'yes' }), TypeError)
		})

		test('rejects invalid elements inside sequences when consumed', () => {
			assert.throws(() => Array.from(subtractDualLazy([null], [{ v: 1, d: 0 }])), TypeError)
			assert.throws(() => Array.from(subtractDualLazy([[1, 2]], [{ v: 1, d: 0 }])), TypeError)
			assert.throws(
				() => Array.from(subtractDualLazy([{ v: 1, d: 0 }], [{ v: 1, d: NaN }])),
				RangeError
			)
			assert.throws(
				() => Array.from(subtractDualLazy([{ v: Infinity, d: 0 }], { v: 1, d: 0 })),
				RangeError
			)
		})

		test('throws RangeError on unequal sequence lengths by default', () => {
			assert.throws(
				() =>
					Array.from(
						subtractDualLazy([{ v: 1, d: 0 }], [
							{ v: 1, d: 0 },
							{ v: 2, d: 0 }
						])
					),
				RangeError
			)
			assert.throws(
				() =>
					Array.from(
						subtractDualLazy(
							[
								{ v: 1, d: 0 },
								{ v: 2, d: 0 }
							],
							[{ v: 1, d: 0 }]
						)
					),
				RangeError
			)
		})
	})

	describe('independent cross-check via central finite differences', () => {
		test('matches primal values and central finite-difference derivatives for h(x) = f(x) - g(x)', () => {
			// f(x) = sin(x) + x^3, f'(x) = cos(x) + 3x^2
			const fVal = (x) => Math.sin(x) + x ** 3
			const fDual = (x) => ({ v: fVal(x), d: Math.cos(x) + 3 * x ** 2 })

			// g(x) = exp(0.5x) - 2x^2, g'(x) = 0.5*exp(0.5x) - 4x
			const gVal = (x) => Math.exp(0.5 * x) - 2 * x ** 2
			const gDual = (x) => ({ v: gVal(x), d: 0.5 * Math.exp(0.5 * x) - 4 * x })

			const hVal = (x) => fVal(x) - gVal(x)
			const eps = 1e-6
			const xs = [-2.0, -0.75, 0.0, 0.5, 1.25, 2.5]

			function* streamF() {
				for (const x of xs) {
					yield fDual(x)
				}
			}

			function* streamG() {
				for (const x of xs) {
					yield gDual(x)
				}
			}

			const results = Array.from(subtractDualLazy(streamF(), streamG()))
			assert.equal(results.length, xs.length)

			for (let i = 0; i < xs.length; i++) {
				const x = xs[i]
				const expectedV = hVal(x)
				const finiteDiffD = (hVal(x + eps) - hVal(x - eps)) / (2 * eps)

				assert.ok(
					Math.abs(results[i].v - expectedV) < 1e-12,
					`value mismatch at x=${x}: got ${results[i].v}, expected ${expectedV}`
				)
				assert.ok(
					Math.abs(results[i].d - finiteDiffD) < 1e-7,
					`derivative mismatch at x=${x}: got ${results[i].d}, finite-diff ${finiteDiffD}`
				)
			}
		})
	})
})
