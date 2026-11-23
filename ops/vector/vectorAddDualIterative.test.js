import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { vectorAddDualIterative } from './vectorAddDualIterative.js'

describe('vectorAddDualIterative', () => {
	describe('normal cases', () => {
		it('adds multi-element dual vectors component-wise', () => {
			const a = [
				{ v: 1, d: 2 },
				{ v: -3.5, d: 0.25 },
				{ v: 10, d: -4 },
			]
			const b = [
				{ v: 4, d: -1 },
				{ v: 1.5, d: 0.75 },
				{ v: -10, d: 4 },
			]

			const result = vectorAddDualIterative(a, b)
			assert.deepEqual(result, [
				{ v: 5, d: 1 },
				{ v: -2, d: 1 },
				{ v: 0, d: 0 },
			])
		})

		it('adds single-element dual vectors', () => {
			const result = vectorAddDualIterative([{ v: 7.25, d: -2.5 }], [{ v: -1.25, d: 6.5 }])
			assert.deepEqual(result, [{ v: 6, d: 4 }])
		})

		it('handles large vectors iteratively without stack issues', () => {
			const n = 5000
			const a = new Array(n)
			const b = new Array(n)
			for (let i = 0; i < n; i++) {
				a[i] = { v: i, d: i * 0.5 }
				b[i] = { v: n - i, d: -i * 0.5 + 1 }
			}

			const result = vectorAddDualIterative(a, b)
			assert.equal(result.length, n)
			for (let i = 0; i < n; i++) {
				assert.equal(result[i].v, n)
				assert.equal(result[i].d, 1)
			}
		})

		it('does not mutate inputs and returns fresh dual objects', () => {
			const a = [{ v: 2, d: 3 }, { v: 4, d: 5 }]
			const b = [{ v: 6, d: 7 }, { v: 8, d: 9 }]
			const aSnap = structuredClone(a)
			const bSnap = structuredClone(b)

			const result = vectorAddDualIterative(a, b)
			assert.deepEqual(a, aSnap)
			assert.deepEqual(b, bSnap)
			assert.notEqual(result, a)
			assert.notEqual(result, b)
			assert.notEqual(result[0], a[0])
			assert.notEqual(result[0], b[0])
		})
	})

	describe('edge cases', () => {
		it('returns an empty array for two empty vectors', () => {
			assert.deepEqual(vectorAddDualIterative([], []), [])
		})

		it('preserves vector when adding the zero dual vector', () => {
			const a = [
				{ v: 3.14, d: -2.71 },
				{ v: 0, d: 1 },
				{ v: -42, d: 0 },
			]
			const zero = [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			]
			assert.deepEqual(vectorAddDualIterative(a, zero), a)
			assert.deepEqual(vectorAddDualIterative(zero, a), a)
		})

		it('handles aliased input arrays (a + a === 2a)', () => {
			const a = [
				{ v: 1.5, d: -3 },
				{ v: -2.5, d: 4.5 },
			]
			assert.deepEqual(vectorAddDualIterative(a, a), [
				{ v: 3, d: -6 },
				{ v: -5, d: 9 },
			])
		})

		it('accepts null-prototype dual objects and objects with extra fields', () => {
			const d1 = Object.assign(Object.create(null), { v: 1, d: 2 })
			const d2 = { v: 3, d: 4, extra: 'ignored' }
			assert.deepEqual(vectorAddDualIterative([d1], [d2]), [{ v: 4, d: 6 }])
		})

		it('handles very small subnormal and large finite numbers', () => {
			const a = [
				{ v: Number.MIN_VALUE, d: -Number.MIN_VALUE },
				{ v: 1e300, d: -1e300 },
			]
			const b = [
				{ v: Number.MIN_VALUE, d: Number.MIN_VALUE },
				{ v: 2e300, d: 1e300 },
			]
			const result = vectorAddDualIterative(a, b)
			assert.equal(result[0].v, 2 * Number.MIN_VALUE)
			assert.equal(result[0].d, 0)
			assert.equal(result[1].v, 3e300)
			assert.equal(result[1].d, 0)
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when a or b is not an Array', () => {
			const valid = [{ v: 1, d: 0 }]
			for (const bad of [null, undefined, 42, 'vec', { v: 1, d: 0 }, new Float64Array([1])]) {
				assert.throws(() => vectorAddDualIterative(bad, valid), TypeError)
				assert.throws(() => vectorAddDualIterative(valid, bad), TypeError)
			}
		})

		it('throws RangeError when vector lengths do not match', () => {
			assert.throws(
				() => vectorAddDualIterative([{ v: 1, d: 1 }], [{ v: 1, d: 1 }, { v: 2, d: 2 }]),
				RangeError,
			)
			assert.throws(() => vectorAddDualIterative([], [{ v: 0, d: 0 }]), RangeError)
			assert.throws(() => vectorAddDualIterative([{ v: 0, d: 0 }], []), RangeError)
		})

		it('throws TypeError when elements are not valid dual objects or are sparse', () => {
			const valid = [{ v: 1, d: 1 }]
			for (const badElem of [null, undefined, 5, '1', [1, 2], { v: 1 }, { d: 1 }, { v: '1', d: 0 }, { v: 0, d: null }]) {
				assert.throws(() => vectorAddDualIterative([badElem], valid), TypeError)
				assert.throws(() => vectorAddDualIterative(valid, [badElem]), TypeError)
			}

			// eslint-disable-next-line no-sparse-arrays
			const sparse = new Array(1)
			assert.throws(() => vectorAddDualIterative(sparse, valid), TypeError)
			assert.throws(() => vectorAddDualIterative(valid, sparse), TypeError)
		})

		it('throws RangeError when any v or d component is non-finite', () => {
			const valid = [{ v: 1, d: 1 }]
			for (const badNum of [NaN, Infinity, -Infinity]) {
				assert.throws(() => vectorAddDualIterative([{ v: badNum, d: 0 }], valid), RangeError)
				assert.throws(() => vectorAddDualIterative([{ v: 0, d: badNum }], valid), RangeError)
				assert.throws(() => vectorAddDualIterative(valid, [{ v: badNum, d: 0 }]), RangeError)
				assert.throws(() => vectorAddDualIterative(valid, [{ v: 0, d: badNum }]), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivatives for smooth parametric vector functions', () => {
			const aFn = (t) => [
				{ v: Math.sin(t), d: Math.cos(t) },
				{ v: t ** 3, d: 3 * t ** 2 },
				{ v: Math.exp(0.5 * t), d: 0.5 * Math.exp(0.5 * t) },
				{ v: 1 / (t + 3), d: -1 / (t + 3) ** 2 },
			]
			const bFn = (t) => [
				{ v: Math.cos(2 * t), d: -2 * Math.sin(2 * t) },
				{ v: Math.log(t + 2), d: 1 / (t + 2) },
				{ v: -(t ** 2), d: -2 * t },
				{ v: Math.sqrt(t + 5), d: 0.5 / Math.sqrt(t + 5) },
			]

			const sumPrimal = (t) => {
				const av = aFn(t)
				const bv = bFn(t)
				return av.map((el, i) => el.v + bv[i].v)
			}

			const h = 1e-6
			for (const t of [-1.2, 0, 0.75, 2.5]) {
				const dualSum = vectorAddDualIterative(aFn(t), bFn(t))
				const fAtT = sumPrimal(t)
				const fPlus = sumPrimal(t + h)
				const fMinus = sumPrimal(t - h)

				for (let i = 0; i < dualSum.length; i++) {
					assert.ok(
						Math.abs(dualSum[i].v - fAtT[i]) <= 1e-12,
						`Primal mismatch at t=${t}, i=${i}: got ${dualSum[i].v}, expected ${fAtT[i]}`,
					)
					const fd = (fPlus[i] - fMinus[i]) / (2 * h)
					assert.ok(
						Math.abs(dualSum[i].d - fd) <= 1e-7,
						`Derivative mismatch at t=${t}, i=${i}: got ${dualSum[i].d}, fd=${fd}`,
					)
				}
			}
		})

		it('satisfies vector space addition axioms (commutativity, associativity, additive inverse)', () => {
			const a = [
				{ v: 1.25, d: -0.5 },
				{ v: -4, d: 3.75 },
				{ v: 0.5, d: 2 },
			]
			const b = [
				{ v: -2.5, d: 1.5 },
				{ v: 7.25, d: -1.25 },
				{ v: 3, d: -0.75 },
			]
			const c = [
				{ v: 0.75, d: 4 },
				{ v: -1.25, d: 0.5 },
				{ v: -2.5, d: 1.25 },
			]
			const negA = a.map(({ v, d }) => ({ v: -v, d: -d }))

			// Commutativity: a + b === b + a
			assert.deepEqual(vectorAddDualIterative(a, b), vectorAddDualIterative(b, a))

			// Associativity: (a + b) + c === a + (b + c)
			const left = vectorAddDualIterative(vectorAddDualIterative(a, b), c)
			const right = vectorAddDualIterative(a, vectorAddDualIterative(b, c))
			assert.deepEqual(left, right)

			// Additive inverse: a + (-a) === 0
			assert.deepEqual(
				vectorAddDualIterative(a, negA),
				a.map(() => ({ v: 0, d: 0 })),
			)
		})
	})
})
