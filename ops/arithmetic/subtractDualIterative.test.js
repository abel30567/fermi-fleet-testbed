import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { subtractDualIterative } from './subtractDualIterative.js'

function negateDual(a) {
	return { v: -a.v, d: -a.d }
}

function addDual(a, b) {
	const v = a.v + b.v
	const d = a.d + b.d
	return { v: v === 0 ? 0 : v, d: d === 0 ? 0 : d }
}

function centralDifference(fn, x, h = 1e-6) {
	return (fn(x + h) - fn(x - h)) / (2 * h)
}

describe('subtractDualIterative', () => {
	describe('normal cases', () => {
		it('subtracts two dual numbers component-wise', () => {
			assert.deepEqual(
				subtractDualIterative({ v: 10, d: 3 }, { v: 4, d: 1 }),
				{ v: 6, d: 2 },
			)
			assert.deepEqual(
				subtractDualIterative({ v: -2.5, d: 0.75 }, { v: 1.5, d: -0.25 }),
				{ v: -4, d: 1 },
			)
		})

		it('performs left-associative subtraction for 3 or more dual numbers', () => {
			const a = { v: 20, d: 10 }
			const b = { v: 7, d: 3 }
			const c = { v: 5, d: 4 }
			const d = { v: 2, d: -1 }

			const res3 = subtractDualIterative(a, b, c)
			assert.deepEqual(res3, { v: 8, d: 3 })
			// Left-associative ((a - b) - c) === (a - b - c) !== a - (b - c)
			assert.deepEqual(res3, subtractDualIterative(subtractDualIterative(a, b), c))
			const rightAssoc = subtractDualIterative(a, subtractDualIterative(b, c))
			assert.notDeepEqual(res3, rightAssoc)

			assert.deepEqual(subtractDualIterative(a, b, c, d), { v: 6, d: 4 })
		})

		it('handles long variadic chains iteratively', () => {
			const duals = [{ v: 1000, d: 500 }]
			for (let i = 1; i <= 100; i += 1) {
				duals.push({ v: i, d: 0.5 })
			}
			// 1000 - (100 * 101 / 2) = 1000 - 5050 = -4050; 500 - 100 * 0.5 = 450
			assert.deepEqual(subtractDualIterative(...duals), { v: -4050, d: 450 })
		})

		it('does not mutate inputs and returns a fresh canonical { v, d } object', () => {
			const a = Object.freeze({ v: 5, d: 2, extra: 'ignored' })
			const b = Object.freeze({ v: 3, d: 1 })
			const result = subtractDualIterative(a, b)

			assert.deepEqual(result, { v: 2, d: 1 })
			assert.deepEqual(Object.keys(result).sort(), ['d', 'v'])
			assert.notEqual(result, a)
			assert.notEqual(result, b)
		})
	})

	describe('edge cases', () => {
		it('preserves value when subtracting the zero dual', () => {
			assert.deepEqual(
				subtractDualIterative({ v: 3.5, d: -7.25 }, { v: 0, d: 0 }),
				{ v: 3.5, d: -7.25 },
			)
		})

		it('returns zero dual when subtracting a dual from itself', () => {
			const x = { v: 42.125, d: -9.5 }
			assert.deepEqual(subtractDualIterative(x, x), { v: 0, d: 0 })
		})

		it('normalizes negative zero to +0', () => {
			const res = subtractDualIterative({ v: -0, d: -0 }, { v: 0, d: 0 })
			assert.equal(Object.is(res.v, 0), true)
			assert.equal(Object.is(res.d, 0), true)
		})

		it('handles constants (d = 0), pure infinitesimals (v = 0), and subnormals', () => {
			assert.deepEqual(
				subtractDualIterative({ v: 5, d: 0 }, { v: 2, d: 0 }),
				{ v: 3, d: 0 },
			)
			assert.deepEqual(
				subtractDualIterative({ v: 0, d: 5 }, { v: 0, d: 2 }),
				{ v: 0, d: 3 },
			)
			assert.deepEqual(
				subtractDualIterative(
					{ v: Number.MIN_VALUE, d: Number.MIN_VALUE },
					{ v: Number.MIN_VALUE, d: 0 },
				),
				{ v: 0, d: Number.MIN_VALUE },
			)
		})

		it('throws RangeError on IEEE-754 overflow in v or d', () => {
			assert.throws(
				() =>
					subtractDualIterative(
						{ v: Number.MAX_VALUE, d: 0 },
						{ v: -Number.MAX_VALUE, d: 0 },
					),
				RangeError,
			)
			assert.throws(
				() =>
					subtractDualIterative(
						{ v: 0, d: -Number.MAX_VALUE },
						{ v: 0, d: Number.MAX_VALUE },
					),
				RangeError,
			)
		})
	})

	describe('input validation', () => {
		it('throws RangeError when fewer than 2 arguments are provided', () => {
			assert.throws(() => subtractDualIterative(), RangeError)
			assert.throws(() => subtractDualIterative({ v: 1, d: 2 }), RangeError)
		})

		it('throws TypeError for non-object, null, or array arguments', () => {
			const invalidObjects = [null, undefined, 42, '1', true, [1, 2], () => {}]
			for (const bad of invalidObjects) {
				assert.throws(
					() => subtractDualIterative(bad, { v: 1, d: 1 }),
					TypeError,
				)
				assert.throws(
					() => subtractDualIterative({ v: 1, d: 1 }, bad),
					TypeError,
				)
			}
		})

		it('throws TypeError when v or d is missing or non-numeric', () => {
			const badDuals = [
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 0 },
				{ v: 0, d: '1' },
				{ v: null, d: 0 },
				{ v: 0, d: undefined },
				{ v: 1n, d: 0 },
			]
			for (const bad of badDuals) {
				assert.throws(
					() => subtractDualIterative(bad, { v: 1, d: 1 }),
					TypeError,
				)
				assert.throws(
					() => subtractDualIterative({ v: 1, d: 1 }, { v: 2, d: 2 }, bad),
					TypeError,
				)
			}
		})

		it('throws RangeError when v or d is NaN or infinite', () => {
			const nonFinite = [NaN, Infinity, -Infinity]
			for (const badNum of nonFinite) {
				assert.throws(
					() => subtractDualIterative({ v: badNum, d: 0 }, { v: 1, d: 1 }),
					RangeError,
				)
				assert.throws(
					() => subtractDualIterative({ v: 0, d: badNum }, { v: 1, d: 1 }),
					RangeError,
				)
				assert.throws(
					() =>
						subtractDualIterative(
							{ v: 1, d: 1 },
							{ v: 2, d: 2 },
							{ v: 3, d: badNum },
						),
					RangeError,
				)
			}
		})

		it('validates all arguments before reporting arithmetic overflow', () => {
			assert.throws(
				() =>
					subtractDualIterative(
						{ v: Number.MAX_VALUE, d: 0 },
						{ v: -Number.MAX_VALUE, d: 0 },
						null,
					),
				TypeError,
			)
		})
	})

	describe('cross-checks', () => {
		it('matches central finite differences on f(x) - g(x) across smooth functions', () => {
			const testCases = [
				{
					name: 'x³ - sin(x)',
					f: (x) => x ** 3,
					df: (x) => 3 * x ** 2,
					g: (x) => Math.sin(x),
					dg: (x) => Math.cos(x),
					xs: [-2.3, -0.5, 0, 1.25, 3.1],
				},
				{
					name: 'exp(0.5x) - ln(x + 5)',
					f: (x) => Math.exp(0.5 * x),
					df: (x) => 0.5 * Math.exp(0.5 * x),
					g: (x) => Math.log(x + 5),
					dg: (x) => 1 / (x + 5),
					xs: [-3.5, -1, 0.5, 2.75],
				},
				{
					name: 'cos(2x) - sqrt(x² + 4)',
					f: (x) => Math.cos(2 * x),
					df: (x) => -2 * Math.sin(2 * x),
					g: (x) => Math.sqrt(x * x + 4),
					dg: (x) => x / Math.sqrt(x * x + 4),
					xs: [-4, -1.2, 0.3, 2.5],
				},
			]

			for (const { f, df, g, dg, xs } of testCases) {
				for (const x of xs) {
					const dualDiff = subtractDualIterative(
						{ v: f(x), d: df(x) },
						{ v: g(x), d: dg(x) },
					)
					const expectedVal = f(x) - g(x)
					const numericDeriv = centralDifference((t) => f(t) - g(t), x)

					assert.equal(dualDiff.v, expectedVal)
					assert.ok(
						Math.abs(dualDiff.d - numericDeriv) < 1e-8,
						`Derivative mismatch at x=${x}: dual=${dualDiff.d}, numeric=${numericDeriv}`,
					)
				}
			}
		})

		it('matches central finite differences on 3-term f(x) - g(x) - h(x)', () => {
			const f = (x) => Math.exp(x)
			const df = (x) => Math.exp(x)
			const g = (x) => x * x + 3 * x
			const dg = (x) => 2 * x + 3
			const h = (x) => Math.atan(x)
			const dh = (x) => 1 / (1 + x * x)

			for (const x of [-1.5, 0, 0.75, 2.1]) {
				const res = subtractDualIterative(
					{ v: f(x), d: df(x) },
					{ v: g(x), d: dg(x) },
					{ v: h(x), d: dh(x) },
				)
				const expectedVal = f(x) - g(x) - h(x)
				const numericDeriv = centralDifference((t) => f(t) - g(t) - h(t), x)

				assert.equal(res.v, expectedVal)
				assert.ok(
					Math.abs(res.d - numericDeriv) < 1e-8,
					`3-term derivative mismatch at x=${x}: dual=${res.d}, numeric=${numericDeriv}`,
				)
			}
		})

		it('matches a + (-b) and variadic addition of negated operands, plus anti-commutativity', () => {
			const samples = [
				{ v: 0, d: 0 },
				{ v: 1.5, d: -2.25 },
				{ v: -7.125, d: 4.5 },
				{ v: 123.456, d: -78.9 },
				{ v: -0.001, d: 0.002 },
			]

			for (const a of samples) {
				for (const b of samples) {
					const sub = subtractDualIterative(a, b)
					const addNeg = addDual(a, negateDual(b))
					assert.deepEqual(sub, addNeg)

					// Anti-commutativity: (a - b) === -(b - a)
					const rev = subtractDualIterative(b, a)
					const negRev = negateDual(rev)
					assert.deepEqual(sub, {
						v: negRev.v === 0 ? 0 : negRev.v,
						d: negRev.d === 0 ? 0 : negRev.d,
					})
				}
			}

			// Multi-operand check: a - b - c - d === ((a + (-b)) + (-c)) + (-d)
			const [a, b, c, d] = samples.slice(1)
			const variadicSub = subtractDualIterative(a, b, c, d)
			const variadicAddNeg = addDual(
				addDual(addDual(a, negateDual(b)), negateDual(c)),
				negateDual(d),
			)
			assert.deepEqual(variadicSub, variadicAddNeg)
		})
	})
})
