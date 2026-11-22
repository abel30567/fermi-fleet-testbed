import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { addComplexRecursive } from './addComplexRecursive.js'

/**
 * Independent sequential reference summation for cross-checking.
 * @param {Array<{re: number, im: number}>} items
 */
function sequentialComplexSum(items) {
	let re = 0
	let im = 0
	for (const z of items) {
		re += z.re
		im += z.im
	}
	return { re, im }
}

/**
 * Complex multiplication helper for closed-form geometric series cross-checks.
 */
function mulComplex(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Complex division helper for closed-form geometric series cross-checks.
 */
function divComplex(a, b) {
	const denom = b.re * b.re + b.im * b.im
	return {
		re: (a.re * b.re + a.im * b.im) / denom,
		im: (a.im * b.re - a.re * b.im) / denom,
	}
}

describe('addComplexRecursive', () => {
	describe('normal cases', () => {
		test('adds two complex numbers via variadic arguments', () => {
			assert.deepStrictEqual(
				addComplexRecursive({ re: 3, im: 4 }, { re: 1, im: -2 }),
				{ re: 4, im: 2 },
			)
		})

		test('adds two complex numbers via an array', () => {
			assert.deepStrictEqual(
				addComplexRecursive([{ re: 3, im: 4 }, { re: 1, im: -2 }]),
				{ re: 4, im: 2 },
			)
		})

		test('adds multiple complex numbers via variadic arguments', () => {
			assert.deepStrictEqual(
				addComplexRecursive(
					{ re: 1, im: 2 },
					{ re: 3, im: -5 },
					{ re: -4, im: 7 },
					{ re: 10, im: -1 },
					{ re: -2, im: 3 },
				),
				{ re: 8, im: 6 },
			)
		})

		test('adds arrays of odd and even lengths', () => {
			for (const len of [3, 4, 5, 7, 8, 15, 16, 31]) {
				const items = Array.from({ length: len }, (_, k) => ({
					re: k + 1,
					im: -(2 * k + 1),
				}))
				const expectedRe = (len * (len + 1)) / 2
				const expectedIm = -(len * len)
				assert.deepStrictEqual(addComplexRecursive(items), {
					re: expectedRe,
					im: expectedIm,
				})
			}
		})

		test('returns a new object and does not mutate inputs', () => {
			const z1 = { re: 5, im: -3 }
			const z2 = { re: 2, im: 7 }
			const arr = [z1, z2]
			const res = addComplexRecursive(arr)
			assert.deepStrictEqual(res, { re: 7, im: 4 })
			assert.notStrictEqual(res, z1)
			assert.notStrictEqual(res, z2)
			assert.deepStrictEqual(z1, { re: 5, im: -3 })
			assert.deepStrictEqual(z2, { re: 2, im: 7 })
			assert.strictEqual(arr.length, 2)
		})
	})

	describe('edge cases', () => {
		test('returns { re: 0, im: 0 } for empty array and zero arguments', () => {
			assert.deepStrictEqual(addComplexRecursive([]), { re: 0, im: 0 })
			assert.deepStrictEqual(addComplexRecursive(), { re: 0, im: 0 })
		})

		test('handles a single complex number (array and variadic) without aliasing', () => {
			const z = { re: -7.5, im: 12.25 }
			const fromVariadic = addComplexRecursive(z)
			const fromArray = addComplexRecursive([z])
			assert.deepStrictEqual(fromVariadic, { re: -7.5, im: 12.25 })
			assert.deepStrictEqual(fromArray, { re: -7.5, im: 12.25 })
			assert.notStrictEqual(fromVariadic, z)
			assert.notStrictEqual(fromArray, z)
		})

		test('handles negative and zero components', () => {
			assert.deepStrictEqual(
				addComplexRecursive([
					{ re: 0, im: 0 },
					{ re: -10, im: 0 },
					{ re: 0, im: -25 },
					{ re: -5, im: -15 },
				]),
				{ re: -15, im: -40 },
			)
		})

		test('handles cancelling sums cleanly', () => {
			const items = []
			for (let i = 1; i <= 50; i++) {
				items.push({ re: i * 1.5, im: -i * 2.25 })
				items.push({ re: -i * 1.5, im: i * 2.25 })
			}
			assert.deepStrictEqual(addComplexRecursive(items), { re: 0, im: 0 })
		})

		test('handles large arrays without stack overflow', () => {
			const n = 100_000
			const items = Array.from({ length: n }, (_, k) => ({
				re: k % 2 === 0 ? 1 : -1,
				im: 0.5,
			}))
			const result = addComplexRecursive(items)
			assert.strictEqual(result.re, 0)
			assert.strictEqual(result.im, n * 0.5)
		})

		test('reduces floating-point drift compared to naive sequential sum on many fractional terms', () => {
			const n = 65_536
			const items = Array.from({ length: n }, () => ({ re: 0.1, im: 0.3 }))
			const expectedRe = n * 0.1
			const expectedIm = n * 0.3

			const pairwise = addComplexRecursive(items)
			const sequential = sequentialComplexSum(items)

			const pairwiseErrRe = Math.abs(pairwise.re - expectedRe)
			const sequentialErrRe = Math.abs(sequential.re - expectedRe)
			const pairwiseErrIm = Math.abs(pairwise.im - expectedIm)
			const sequentialErrIm = Math.abs(sequential.im - expectedIm)

			assert.ok(pairwiseErrRe <= sequentialErrRe, `expected pairwise re error (${pairwiseErrRe}) <= sequential (${sequentialErrRe})`)
			assert.ok(pairwiseErrIm <= sequentialErrIm, `expected pairwise im error (${pairwiseErrIm}) <= sequential (${sequentialErrIm})`)
			assert.ok(pairwiseErrRe < 1e-10)
			assert.ok(pairwiseErrIm < 1e-10)
		})
	})

	describe('input validation', () => {
		test('rejects non-object inputs', () => {
			const invalid = [null, undefined, 42, '1+2i', true, () => ({ re: 0, im: 0 })]
			for (const bad of invalid) {
				assert.throws(() => addComplexRecursive(bad), TypeError)
				assert.throws(() => addComplexRecursive([bad]), TypeError)
				assert.throws(() => addComplexRecursive([{ re: 1, im: 2 }, bad]), TypeError)
			}
		})

		test('rejects objects with missing or non-numeric re/im', () => {
			const invalid = [
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 2 },
				{ re: 1, im: '2' },
				{ re: null, im: 0 },
				{ re: 0, im: undefined },
				{ re: true, im: false },
			]
			for (const bad of invalid) {
				assert.throws(() => addComplexRecursive(bad), TypeError)
				assert.throws(() => addComplexRecursive([bad]), TypeError)
			}
		})

		test('rejects NaN and Infinity components', () => {
			const nonFinite = [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 1 },
				{ re: 1, im: -Infinity },
				{ re: -Infinity, im: Infinity },
			]
			for (const bad of nonFinite) {
				assert.throws(() => addComplexRecursive(bad), RangeError)
				assert.throws(() => addComplexRecursive([{ re: 1, im: 1 }, bad]), RangeError)
			}
		})

		test('rejects nested arrays, mixed array + variadic arguments, and sparse arrays', () => {
			assert.throws(() => addComplexRecursive([[{ re: 1, im: 2 }]]), TypeError)
			assert.throws(() => addComplexRecursive([{ re: 1, im: 2 }], { re: 3, im: 4 }), TypeError)
			assert.throws(() => addComplexRecursive({ re: 3, im: 4 }, [{ re: 1, im: 2 }]), TypeError)

			const sparse = new Array(3)
			sparse[0] = { re: 1, im: 2 }
			sparse[2] = { re: 3, im: 4 }
			assert.throws(() => addComplexRecursive(sparse), TypeError)
		})
	})

	describe('independent cross-checks', () => {
		test('matches closed-form Gauss formula and sequential sum for complex arithmetic series', () => {
			const n = 1000
			const a0 = -17.5
			const b0 = 42.25
			const dr = 3.5
			const di = -1.25

			const series = Array.from({ length: n }, (_, k) => ({
				re: a0 + k * dr,
				im: b0 + k * di,
			}))

			const closedForm = {
				re: n * a0 + (dr * n * (n - 1)) / 2,
				im: n * b0 + (di * n * (n - 1)) / 2,
			}
			const seq = sequentialComplexSum(series)
			const rec = addComplexRecursive(series)

			assert.strictEqual(rec.re, closedForm.re)
			assert.strictEqual(rec.im, closedForm.im)
			assert.strictEqual(rec.re, seq.re)
			assert.strictEqual(rec.im, seq.im)
		})

		test('sums N-th roots of unity to 0 + 0i', () => {
			for (const n of [3, 7, 12, 64, 1000]) {
				const roots = Array.from({ length: n }, (_, k) => {
					const angle = (2 * Math.PI * k) / n
					return { re: Math.cos(angle), im: Math.sin(angle) }
				})
				const sum = addComplexRecursive(roots)
				assert.ok(Math.abs(sum.re) < 1e-12, `N=${n}: expected re ~ 0, got ${sum.re}`)
				assert.ok(Math.abs(sum.im) < 1e-12, `N=${n}: expected im ~ 0, got ${sum.im}`)
			}
		})

		test('matches closed-form complex geometric series (1 - r^n) / (1 - r)', () => {
			const r = { re: 0.5, im: 0.5 }
			const n = 40
			const terms = []
			let pow = { re: 1, im: 0 }
			for (let k = 0; k < n; k++) {
				terms.push(pow)
				pow = mulComplex(pow, r)
			}

			const closedForm = divComplex(
				{ re: 1 - pow.re, im: -pow.im },
				{ re: 1 - r.re, im: -r.im },
			)
			const seq = sequentialComplexSum(terms)
			const rec = addComplexRecursive(terms)

			assert.ok(Math.abs(rec.re - closedForm.re) < 1e-14)
			assert.ok(Math.abs(rec.im - closedForm.im) < 1e-14)
			assert.ok(Math.abs(rec.re - seq.re) < 1e-14)
			assert.ok(Math.abs(rec.im - seq.im) < 1e-14)
		})
	})
})
