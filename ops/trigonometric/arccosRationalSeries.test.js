import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { arccosRationalSeries } from './arccosRationalSeries.js'

function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

function addExact(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

function assertCanonicalRational(r) {
	assert.equal(typeof r, 'object')
	assert.notEqual(r, null)
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `Expected den > 0n, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n, `Zero must be canonicalized with den = 1n, got ${r.den}`)
	} else {
		assert.equal(
			gcd(r.num, r.den),
			1n,
			`Rational ${r.num}/${r.den} is not in lowest terms`,
		)
	}
}

/**
 * Overflow-safe conversion of an exact rational to a JS Number using BigInt scaling.
 */
function rationalToNumber(r) {
	const scale = 10n ** 18n
	const scaled = (r.num * scale) / r.den
	return Number(scaled) / 1e18
}

describe('arccosRationalSeries', () => {
	describe('exact boundaries and closed-form checks', () => {
		test('arccos(1) is exact { num: 0n, den: 1n } for any terms', () => {
			for (const terms of [1, 2, 12, 25]) {
				const res = arccosRationalSeries({ num: 1n, den: 1n }, terms)
				assertCanonicalRational(res)
				assert.deepEqual(res, { num: 0n, den: 1n })
			}
			// Unreduced and negative-denominator representations of 1
			assert.deepEqual(arccosRationalSeries({ num: 7n, den: 7n }), {
				num: 0n,
				den: 1n,
			})
			assert.deepEqual(arccosRationalSeries({ num: -5n, den: -5n }), {
				num: 0n,
				den: 1n,
			})
		})

		test('arccos(-1) equals Machin pi', () => {
			const res = arccosRationalSeries({ num: -1n, den: 1n })
			assertCanonicalRational(res)
			assert.ok(Math.abs(rationalToNumber(res) - Math.PI) < 1e-15)

			// Equivalent unreduced representations of -1
			assert.deepEqual(arccosRationalSeries({ num: 4n, den: -4n }), res)
			assert.deepEqual(arccosRationalSeries({ num: -9n, den: 9n }), res)
		})

		test('arccos(0) equals Machin pi / 2', () => {
			const res = arccosRationalSeries({ num: 0n, den: 1n })
			assertCanonicalRational(res)
			assert.ok(Math.abs(rationalToNumber(res) - Math.PI / 2) < 1e-15)

			// Zero with non-unit or negative denominator
			assert.deepEqual(arccosRationalSeries({ num: 0n, den: -9n }), res)
			assert.deepEqual(arccosRationalSeries({ num: 0n, den: 42n }), res)
		})

		test('terms = 1 matches exact hand-derived rational values', () => {
			// Machin pi/2 with 1 term: 8*(1/5) - 2*(1/239) = 1902 / 1195
			const piHalf1 = { num: 1902n, den: 1195n }
			assert.deepEqual(arccosRationalSeries({ num: 0n, den: 1n }, 1), piHalf1)

			// arccos(-1, 1) = 2 * piHalf(1) = 3804 / 1195
			assert.deepEqual(arccosRationalSeries({ num: -1n, den: 1n }, 1), {
				num: 3804n,
				den: 1195n,
			})

			// arccos(1/2, 1) = 1902/1195 - 1/2 = (3804 - 1195) / 2390 = 2609 / 2390
			const halfRes = arccosRationalSeries({ num: 1n, den: 2n }, 1)
			assertCanonicalRational(halfRes)
			assert.deepEqual(halfRes, { num: 2609n, den: 2390n })

			// arccos(-1/2, 1) = 1902/1195 + 1/2 = 4999 / 2390
			const negHalfRes = arccosRationalSeries({ num: -1n, den: 2n }, 1)
			assertCanonicalRational(negHalfRes)
			assert.deepEqual(negHalfRes, { num: 4999n, den: 2390n })
		})
	})

	describe('normal rational inputs and canonical lowest terms', () => {
		test('computes accurate lowest-terms rationals across [-1, 1]', () => {
			const samples = [
				{ x: { num: -4n, den: 5n }, tol: 1e-4 },
				{ x: { num: -3n, den: 5n }, tol: 1e-7 },
				{ x: { num: -1n, den: 2n }, tol: 1e-9 },
				{ x: { num: -1n, den: 4n }, tol: 1e-15 },
				{ x: { num: -1n, den: 10n }, tol: 1e-15 },
				{ x: { num: 0n, den: 1n }, tol: 1e-15 },
				{ x: { num: 1n, den: 10n }, tol: 1e-15 },
				{ x: { num: 1n, den: 4n }, tol: 1e-15 },
				{ x: { num: 1n, den: 2n }, tol: 1e-9 },
				{ x: { num: 3n, den: 5n }, tol: 1e-7 },
				{ x: { num: 4n, den: 5n }, tol: 1e-4 },
			]

			for (const { x, tol } of samples) {
				const res = arccosRationalSeries(x)
				assertCanonicalRational(res)
				const expected = Math.acos(Number(x.num) / Number(x.den))
				const actual = rationalToNumber(res)
				assert.ok(
					Math.abs(actual - expected) < tol,
					`For x=${x.num}/${x.den}: expected ~${expected}, got ${actual}`,
				)
			}
		})

		test('normalizes unreduced and negative-denominator inputs identically', () => {
			const a = arccosRationalSeries({ num: 1n, den: 2n })
			const b = arccosRationalSeries({ num: 6n, den: 12n })
			const c = arccosRationalSeries({ num: -3n, den: -6n })
			assert.deepEqual(b, a)
			assert.deepEqual(c, a)

			const d = arccosRationalSeries({ num: -1n, den: 3n })
			const e = arccosRationalSeries({ num: 4n, den: -12n })
			assert.deepEqual(e, d)
		})

		test('increasing terms monotonically improves convergence toward Math.acos', () => {
			const x = { num: 4n, den: 5n }
			const expected = Math.acos(0.8)
			const err5 = Math.abs(
				rationalToNumber(arccosRationalSeries(x, 5)) - expected,
			)
			const err12 = Math.abs(
				rationalToNumber(arccosRationalSeries(x, 12)) - expected,
			)
			const err30 = Math.abs(
				rationalToNumber(arccosRationalSeries(x, 30)) - expected,
			)
			assert.ok(err12 < err5, `Expected err12 (${err12}) < err5 (${err5})`)
			assert.ok(err30 < err12, `Expected err30 (${err30}) < err12 (${err12})`)
			assert.ok(err30 < 1e-7, `Expected err30 (${err30}) < 1e-7`)
		})

		test('is strictly decreasing over [-1, 1]', () => {
			const xs = [
				{ num: -1n, den: 1n },
				{ num: -4n, den: 5n },
				{ num: -1n, den: 2n },
				{ num: -1n, den: 4n },
				{ num: 0n, den: 1n },
				{ num: 1n, den: 4n },
				{ num: 1n, den: 2n },
				{ num: 4n, den: 5n },
				{ num: 1n, den: 1n },
			]
			const vals = xs.map((x) => arccosRationalSeries(x, 12))
			for (let i = 0; i < vals.length - 1; i++) {
				// vals[i] > vals[i+1]  <=>  vals[i].num * vals[i+1].den > vals[i+1].num * vals[i].den
				assert.ok(
					vals[i].num * vals[i + 1].den > vals[i + 1].num * vals[i].den,
					`Expected arccos(${xs[i].num}/${xs[i].den}) > arccos(${xs[i + 1].num}/${xs[i + 1].den})`,
				)
			}
		})
	})

	describe('algebraic and independent mathematical cross-checks', () => {
		test('exact reflection identity: arccos(x) + arccos(-x) === pi', () => {
			const testPoints = [
				{ num: 0n, den: 1n },
				{ num: 1n, den: 7n },
				{ num: 1n, den: 3n },
				{ num: 1n, den: 2n },
				{ num: 3n, den: 5n },
				{ num: 4n, den: 5n },
				{ num: 9n, den: 10n },
				{ num: 1n, den: 1n },
			]

			for (const terms of [1, 5, 12, 20]) {
				const pi = arccosRationalSeries({ num: -1n, den: 1n }, terms)
				const twoPiHalf = addExact(
					arccosRationalSeries({ num: 0n, den: 1n }, terms),
					arccosRationalSeries({ num: 0n, den: 1n }, terms),
				)
				assert.deepEqual(pi, twoPiHalf)

				for (const x of testPoints) {
					const pos = arccosRationalSeries(x, terms)
					const neg = arccosRationalSeries({ num: -x.num, den: x.den }, terms)
					assertCanonicalRational(pos)
					assertCanonicalRational(neg)
					const sum = addExact(pos, neg)
					assert.deepEqual(
						sum,
						pi,
						`Reflection identity failed for x=${x.num}/${x.den}, terms=${terms}`,
					)
				}
			}
		})

		test('cross-check special angle: arccos(1/2) = pi / 3 and arccos(-1/2) = 2 * pi / 3', () => {
			const terms = 25
			const acosHalf = arccosRationalSeries({ num: 1n, den: 2n }, terms)
			const acosNegHalf = arccosRationalSeries({ num: -1n, den: 2n }, terms)
			assertCanonicalRational(acosHalf)
			assertCanonicalRational(acosNegHalf)

			assert.ok(Math.abs(rationalToNumber(acosHalf) - Math.PI / 3) < 1e-15)
			assert.ok(
				Math.abs(rationalToNumber(acosNegHalf) - (2 * Math.PI) / 3) < 1e-15,
			)
		})

		test('independent Pythagorean arctan cross-check: arccos(5/13) = pi/2 - arctan(5/12)', () => {
			// For the 5-12-13 right triangle, cos(theta) = 5/13 and sin(theta) = 12/13,
			// so arccos(5/13) = pi/2 - arcsin(5/13) = pi/2 - arctan(5/12).
			// Compute arctan(5/12) independently via its alternating Taylor series.
			const u = 5 / 12
			let atan5over12 = 0
			for (let k = 0; k < 30; k++) {
				atan5over12 += ((-1) ** k * u ** (2 * k + 1)) / (2 * k + 1)
			}
			const independent = Math.PI / 2 - atan5over12

			const res = arccosRationalSeries({ num: 5n, den: 13n }, 20)
			assertCanonicalRational(res)
			assert.ok(Math.abs(rationalToNumber(res) - independent) < 1e-14)
		})
	})

	describe('input validation', () => {
		test('throws RangeError when |x| > 1', () => {
			const outOfDomain = [
				{ num: 2n, den: 1n },
				{ num: -2n, den: 1n },
				{ num: 1000001n, den: 1000000n },
				{ num: -101n, den: 100n },
				{ num: 3n, den: -2n },
				{ num: -5n, den: -4n },
			]
			for (const x of outOfDomain) {
				assert.throws(() => arccosRationalSeries(x), RangeError)
			}
		})

		test('throws RangeError when denominator is zero', () => {
			assert.throws(
				() => arccosRationalSeries({ num: 0n, den: 0n }),
				RangeError,
			)
			assert.throws(
				() => arccosRationalSeries({ num: 1n, den: 0n }),
				RangeError,
			)
		})

		test('throws TypeError for invalid rational objects', () => {
			const invalidInputs = [
				null,
				undefined,
				0.5,
				'1/2',
				1n,
				{},
				{ num: 1, den: 2 },
				{ num: 1n, den: 2 },
				{ num: 1, den: 2n },
				{ num: 1n },
				{ den: 2n },
			]
			for (const input of invalidInputs) {
				assert.throws(() => arccosRationalSeries(input), TypeError)
			}
		})

		test('throws TypeError or RangeError for invalid terms', () => {
			const validX = { num: 1n, den: 2n }
			for (const badType of ['12', 12n, null, {}, true]) {
				assert.throws(() => arccosRationalSeries(validX, badType), TypeError)
			}
			for (const badRange of [0, -1, -10, 1.5, NaN, Infinity, -Infinity]) {
				assert.throws(() => arccosRationalSeries(validX, badRange), RangeError)
			}
		})
	})
})
