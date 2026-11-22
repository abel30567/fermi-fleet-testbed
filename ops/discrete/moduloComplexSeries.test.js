import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { moduloComplexSeries } from './moduloComplexSeries.js'

const EPS = 1e-12

function complexNormSq(z) {
	return z.re * z.re + z.im * z.im
}

function complexMul(x, y) {
	return {
		re: x.re * y.re - x.im * y.im,
		im: x.re * y.im + x.im * y.re,
	}
}

function complexSub(x, y) {
	return { re: x.re - y.re, im: x.im - y.im }
}

function complexDiv(x, y) {
	const d = y.re * y.re + y.im * y.im
	return {
		re: (x.re * y.re + x.im * y.im) / d,
		im: (x.im * y.re - x.re * y.im) / d,
	}
}

function assertComplexClose(actual, expected, tol = EPS) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`re mismatch: expected ${expected.re}, got ${actual.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`im mismatch: expected ${expected.im}, got ${actual.im}`
	)
}

describe('moduloComplexSeries', () => {
	test('Gaussian integers: exact multiples yield 0 + 0i', () => {
		// (2 - i)(2 + 3i) = 7 + 4i
		assert.deepStrictEqual(
			moduloComplexSeries({ re: 7, im: 4 }, { re: 2, im: 3 }),
			{ re: 0, im: 0 }
		)
		// (-3 + 5i)(4 - 2i) = -2 + 26i
		assert.deepStrictEqual(
			moduloComplexSeries({ re: -2, im: 26 }, { re: 4, im: -2 }),
			{ re: 0, im: 0 }
		)
		// Real multiple: 15 % 5 = 0
		assert.deepStrictEqual(
			moduloComplexSeries({ re: 15, im: 0 }, { re: 5, im: 0 }),
			{ re: 0, im: 0 }
		)
	})

	test('Gaussian integers: non-zero Euclidean remainders', () => {
		// (5 + 3i) / (2 + i) = 2.6 + 0.2i -> q = 3, r = (5+3i) - 3(2+i) = -1 + 0i
		assert.deepStrictEqual(
			moduloComplexSeries({ re: 5, im: 3 }, { re: 2, im: 1 }),
			{ re: -1, im: 0 }
		)
		// (11 + 3i) / (1 + 8i) = (35 - 85i)/65 -> q = 1 - i, qb = 9 + 7i, r = 2 - 4i
		assert.deepStrictEqual(
			moduloComplexSeries({ re: 11, im: 3 }, { re: 1, im: 8 }),
			{ re: 2, im: -4 }
		)
		// Negative real/imag components
		// (-7 - 5i) / (3 - 2i) = (-11 - 29i)/13 -> q = -1 - 2i, qb = -7 - 4i, r = 0 - i
		assert.deepStrictEqual(
			moduloComplexSeries({ re: -7, im: -5 }, { re: 3, im: -2 }),
			{ re: 0, im: -1 }
		)
	})

	test('arbitrary non-integer complex numbers', () => {
		// a = 3.7 - 2.4i, b = 1.5 + 0.8i
		const a = { re: 3.7, im: -2.4 }
		const b = { re: 1.5, im: 0.8 }
		const r = moduloComplexSeries(a, b)
		// a/b = (3.7*1.5 - 2.4*0.8 + i(-2.4*1.5 - 3.7*0.8)) / (2.25 + 0.64)
		//     = (3.63 - 6.56i) / 2.89 ≈ 1.256055... - 2.269896...i -> q = 1 - 2i
		// q*b = (1 - 2i)(1.5 + 0.8i) = 3.1 - 2.2i
		// r = (3.7 - 2.4i) - (3.1 - 2.2i) = 0.6 - 0.2i
		assertComplexClose(r, { re: 0.6, im: -0.2 })
		assert.ok(complexNormSq(r) <= complexNormSq(b) / 2 + EPS)
	})

	test('edge cases: zero dividend returns { re: 0, im: 0 } without -0', () => {
		for (const b of [
			{ re: 1, im: 0 },
			{ re: -1, im: 0 },
			{ re: 0, im: 1 },
			{ re: 0, im: -1 },
			{ re: -3.5, im: 2.25 },
		]) {
			const r = moduloComplexSeries({ re: 0, im: 0 }, b)
			assert.deepStrictEqual(r, { re: 0, im: 0 })
			assert.ok(!Object.is(r.re, -0))
			assert.ok(!Object.is(r.im, -0))
		}
	})

	test('edge cases: unit divisors (+1, -1, +i, -i)', () => {
		const units = [
			{ re: 1, im: 0 },
			{ re: -1, im: 0 },
			{ re: 0, im: 1 },
			{ re: 0, im: -1 },
		]
		// Every Gaussian integer is divisible by every unit
		const gaussian = { re: -13, im: 27 }
		for (const u of units) {
			assert.deepStrictEqual(moduloComplexSeries(gaussian, u), { re: 0, im: 0 })
		}

		// Non-integer dividend with unit divisor i:
		// (2.3 - 1.7i) / i = -1.7 - 2.3i -> q = -2 - 2i, qb = 2 - 2i, r = 0.3 + 0.3i
		assertComplexClose(
			moduloComplexSeries({ re: 2.3, im: -1.7 }, { re: 0, im: 1 }),
			{ re: 0.3, im: 0.3 }
		)
	})

	test('edge cases: large and small magnitudes via scaled division', () => {
		// Would overflow naive b.re^2 + b.im^2 (> 1e308)
		const bigA = { re: 5e200, im: 3e200 }
		const bigB = { re: 2e200, im: 1e200 }
		const bigR = moduloComplexSeries(bigA, bigB)
		assertComplexClose(bigR, { re: -1e200, im: 0 }, 1e186)

		// Would underflow naive b.re^2 + b.im^2 (< 1e-324)
		const tinyA = { re: 5e-200, im: 3e-200 }
		const tinyB = { re: 2e-200, im: 1e-200 }
		const tinyR = moduloComplexSeries(tinyA, tinyB)
		assertComplexClose(tinyR, { re: -1e-200, im: 0 }, 1e-212)
	})

	test('edge cases: zero divisor throws RangeError', () => {
		assert.throws(
			() => moduloComplexSeries({ re: 1, im: 2 }, { re: 0, im: 0 }),
			RangeError
		)
		assert.throws(
			() => moduloComplexSeries({ re: 0, im: 0 }, { re: -0, im: 0 }),
			RangeError
		)
	})

	test('edge cases: invalid inputs throw TypeError or RangeError', () => {
		const valid = { re: 1, im: 1 }

		for (const bad of [null, undefined, 42, '1+i', [1, 2], {}, { re: 1 }, { im: 1 }, { re: '1', im: 0 }]) {
			assert.throws(() => moduloComplexSeries(bad, valid), TypeError)
			assert.throws(() => moduloComplexSeries(valid, bad), TypeError)
		}

		for (const nonFinite of [
			{ re: NaN, im: 0 },
			{ re: 0, im: NaN },
			{ re: Infinity, im: 1 },
			{ re: 1, im: -Infinity },
		]) {
			assert.throws(() => moduloComplexSeries(nonFinite, valid), RangeError)
			assert.throws(() => moduloComplexSeries(valid, nonFinite), RangeError)
		}
	})

	test('cross-check: Euclidean division invariant and lattice-minimum optimality', () => {
		const pairs = [
			[{ re: 17, im: -9 }, { re: 4, im: 3 }],
			[{ re: -23, im: 41 }, { re: -5, im: 2 }],
			[{ re: 12.34, im: -56.78 }, { re: 3.21, im: 4.56 }],
			[{ re: -0.75, im: 0.25 }, { re: 0.3, im: -0.4 }],
			[{ re: 100.1, im: 200.9 }, { re: -7.5, im: -11.25 }],
		]

		for (const [a, b] of pairs) {
			const r = moduloComplexSeries(a, b)

			// 1. Recover q independently via complex division: q = (a - r) / b
			const q = complexDiv(complexSub(a, r), b)
			const qInt = { re: Math.round(q.re), im: Math.round(q.im) }

			// q must be a Gaussian integer (q in Z[i])
			assert.ok(
				Math.abs(q.re - qInt.re) <= 1e-10 && Math.abs(q.im - qInt.im) <= 1e-10,
				`Recovered quotient ${JSON.stringify(q)} is not a Gaussian integer`
			)

			// 2. Reconstruct a = q * b + r
			const qb = complexMul(qInt, b)
			assertComplexClose({ re: qb.re + r.re, im: qb.im + r.im }, a, 1e-10)

			// 3. Euclidean norm bound: |r|^2 <= |b|^2 / 2
			const rNormSq = complexNormSq(r)
			const bNormSq = complexNormSq(b)
			assert.ok(
				rNormSq <= bNormSq / 2 + 1e-10,
				`|r|^2 = ${rNormSq} exceeded |b|^2 / 2 = ${bNormSq / 2}`
			)

			// 4. Independent optimality check: no neighboring Gaussian integer yields a strictly smaller remainder
			for (let dr = -2; dr <= 2; dr++) {
				for (let di = -2; di <= 2; di++) {
					const altQ = { re: qInt.re + dr, im: qInt.im + di }
					const altR = complexSub(a, complexMul(altQ, b))
					assert.ok(
						rNormSq <= complexNormSq(altR) + 1e-10,
						`Found smaller remainder at offset (${dr}, ${di})`
					)
				}
			}
		}
	})
})
