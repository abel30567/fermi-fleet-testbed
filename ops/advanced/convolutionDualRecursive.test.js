import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { convolutionDualRecursive } from './convolutionDualRecursive.js'

/**
 * Independent O(n * m) reference discrete linear convolution over dual numbers.
 */
function directConvolutionDual(a, b) {
	if (a.length === 0 || b.length === 0) {
		return []
	}
	const out = Array.from({ length: a.length + b.length - 1 }, () => ({ v: 0, d: 0 }))
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < b.length; j++) {
			out[i + j].v += a[i].v * b[j].v
			out[i + j].d += a[i].v * b[j].d + a[i].d * b[j].v
		}
	}
	return out
}

/**
 * Deterministic LCG PRNG for reproducible cross-check test cases.
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

function assertDualSeqClose(actual, expected, tol = 1e-9, label = '') {
	assert.equal(actual.length, expected.length, `${label} length mismatch`)
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i].v - expected[i].v) <= tol,
			`${label}[${i}].v: expected ${expected[i].v}, got ${actual[i].v}`,
		)
		assert.ok(
			Math.abs(actual[i].d - expected[i].d) <= tol,
			`${label}[${i}].d: expected ${expected[i].d}, got ${actual[i].d}`,
		)
	}
}

describe('convolutionDualRecursive', () => {
	describe('normal cases', () => {
		test('hand-computed 2x2 dual convolution', () => {
			// a = [(1, 2), (3, 4)], b = [(5, 6), (7, 8)]
			// c[0] = (1,2)*(5,6) = (5, 1*6 + 2*5) = (5, 16)
			// c[1] = (1,2)*(7,8) + (3,4)*(5,6) = (7, 22) + (15, 38) = (22, 60)
			// c[2] = (3,4)*(7,8) = (21, 52)
			const a = [
				{ v: 1, d: 2 },
				{ v: 3, d: 4 },
			]
			const b = [
				{ v: 5, d: 6 },
				{ v: 7, d: 8 },
			]
			assert.deepEqual(convolutionDualRecursive(a, b), [
				{ v: 5, d: 16 },
				{ v: 22, d: 60 },
				{ v: 21, d: 52 },
			])
		})

		test('hand-computed 3x3 dual convolution', () => {
			// A(X) = (1 + t) + 2X + (3 - t)X^2 at t=0 => [(1,1), (2,0), (3,-1)]
			// B(X) = 2 + (1 + 2t)X + t*X^2     at t=0 => [(2,0), (1,2), (0,1)]
			// Product at t:
			// k=0: 2(1+t)                  => v=2,  d=2
			// k=1: (1+t)(1+2t) + 4         => v=5,  d=3
			// k=2: (1+t)t + 2(1+2t) + 2(3-t) => v=8, d=1+4-2=3
			// k=3: 2t + (3-t)(1+2t)        => v=3,  d=2+6-1=7
			// k=4: (3-t)t                  => v=0,  d=3
			const a = [
				{ v: 1, d: 1 },
				{ v: 2, d: 0 },
				{ v: 3, d: -1 },
			]
			const b = [
				{ v: 2, d: 0 },
				{ v: 1, d: 2 },
				{ v: 0, d: 1 },
			]
			assert.deepEqual(convolutionDualRecursive(a, b), [
				{ v: 2, d: 2 },
				{ v: 5, d: 3 },
				{ v: 8, d: 3 },
				{ v: 3, d: 7 },
				{ v: 0, d: 3 },
			])
		})

		test('zero derivatives reduce to standard discrete convolution', () => {
			const a = [1, 2, 3, 4].map((v) => ({ v, d: 0 }))
			const b = [2, -1, 3].map((v) => ({ v, d: 0 }))
			assert.deepEqual(convolutionDualRecursive(a, b), [
				{ v: 2, d: 0 },
				{ v: 3, d: 0 },
				{ v: 7, d: 0 },
				{ v: 11, d: 0 },
				{ v: 5, d: 0 },
				{ v: 12, d: 0 },
			])
		})

		test('commutativity and identity element', () => {
			const a = [
				{ v: 2, d: -1 },
				{ v: -3, d: 4 },
				{ v: 5, d: 0.5 },
				{ v: 1, d: -2 },
			]
			const b = [
				{ v: -1, d: 3 },
				{ v: 4, d: 2 },
				{ v: -2, d: -1 },
			]
			assertDualSeqClose(convolutionDualRecursive(a, b), convolutionDualRecursive(b, a), 1e-12)

			const unit = [{ v: 1, d: 0 }]
			assert.deepEqual(convolutionDualRecursive(a, unit), a)
			assert.deepEqual(convolutionDualRecursive(unit, a), a)
		})

		test('does not mutate input arrays or elements', () => {
			const a = [
				{ v: 1, d: 2 },
				{ v: 3, d: 4 },
				{ v: 5, d: 6 },
			]
			const b = [
				{ v: 7, d: 8 },
				{ v: 9, d: 10 },
			]
			const aSnap = structuredClone(a)
			const bSnap = structuredClone(b)

			const res = convolutionDualRecursive(a, b)
			res[0].v = 999
			assert.deepEqual(a, aSnap)
			assert.deepEqual(b, bSnap)
		})
	})

	describe('edge cases', () => {
		test('empty arrays return empty array', () => {
			const sample = [{ v: 1, d: 2 }]
			assert.deepEqual(convolutionDualRecursive([], []), [])
			assert.deepEqual(convolutionDualRecursive([], sample), [])
			assert.deepEqual(convolutionDualRecursive(sample, []), [])
		})

		test('length 1 sequences', () => {
			assert.deepEqual(convolutionDualRecursive([{ v: 3, d: 2 }], [{ v: 5, d: 7 }]), [
				{ v: 15, d: 31 },
			])
			const longer = [
				{ v: 2, d: -1 },
				{ v: 0, d: 4 },
				{ v: -3, d: 2 },
			]
			const single = [{ v: -2, d: 5 }]
			assert.deepEqual(
				convolutionDualRecursive(single, longer),
				directConvolutionDual(single, longer),
			)
			assert.deepEqual(
				convolutionDualRecursive(longer, single),
				directConvolutionDual(longer, single),
			)
		})

		test('highly asymmetric lengths exercise unbalanced divide-and-conquer branches', () => {
			const shapes = [
				[2, 11],
				[11, 2],
				[3, 17],
				[17, 3],
				[5, 19],
				[19, 5],
				[4, 33],
				[33, 4],
			]
			const rng = createRng(42)
			for (const [n, m] of shapes) {
				const a = Array.from({ length: n }, () => ({
					v: Math.round((rng() - 0.5) * 20),
					d: Math.round((rng() - 0.5) * 20),
				}))
				const b = Array.from({ length: m }, () => ({
					v: Math.round((rng() - 0.5) * 20),
					d: Math.round((rng() - 0.5) * 20),
				}))
				assert.deepEqual(
					convolutionDualRecursive(a, b),
					directConvolutionDual(a, b),
					`asymmetric ${n}x${m}`,
				)
			}
		})

		test('zeros and negative values produce no -0', () => {
			const zeros = [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			]
			const negs = [
				{ v: -5, d: -2 },
				{ v: -1, d: -3 },
				{ v: -4, d: -6 },
			]
			const zRes = convolutionDualRecursive(zeros, negs)
			assert.equal(zRes.length, 5)
			for (const item of zRes) {
				assert.ok(Object.is(item.v, 0), `expected +0, got ${item.v}`)
				assert.ok(Object.is(item.d, 0), `expected +0, got ${item.d}`)
			}

			const negRes = convolutionDualRecursive(negs, negs)
			assert.deepEqual(negRes, directConvolutionDual(negs, negs))
		})

		test('purely dual inputs (v=0) multiply to zero since ε² = 0', () => {
			const a = [
				{ v: 0, d: 3 },
				{ v: 0, d: -7 },
				{ v: 0, d: 11 },
			]
			const b = [
				{ v: 0, d: 5 },
				{ v: 0, d: -2 },
			]
			const res = convolutionDualRecursive(a, b)
			assert.deepEqual(res, [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			])
		})
	})

	describe('invalid inputs', () => {
		test('throws TypeError when a or b is not an array', () => {
			const valid = [{ v: 1, d: 0 }]
			for (const bad of [null, undefined, 42, 'abc', {}, new Set()]) {
				assert.throws(() => convolutionDualRecursive(bad, valid), TypeError)
				assert.throws(() => convolutionDualRecursive(valid, bad), TypeError)
			}
		})

		test('throws TypeError for invalid dual elements', () => {
			const valid = [{ v: 1, d: 0 }]
			const badElements = [
				null,
				undefined,
				5,
				'1',
				[1, 2],
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 0 },
				{ v: 1, d: null },
			]
			for (const el of badElements) {
				assert.throws(() => convolutionDualRecursive([el], valid), TypeError)
				assert.throws(() => convolutionDualRecursive(valid, [el]), TypeError)
				// Must still validate even when the other array is empty
				assert.throws(() => convolutionDualRecursive([], [el]), TypeError)
				assert.throws(() => convolutionDualRecursive([el], []), TypeError)
			}
		})

		test('throws RangeError for non-finite v or d', () => {
			const valid = [{ v: 1, d: 0 }]
			const nonFinite = [
				{ v: NaN, d: 0 },
				{ v: 0, d: NaN },
				{ v: Infinity, d: 1 },
				{ v: 1, d: -Infinity },
			]
			for (const el of nonFinite) {
				assert.throws(() => convolutionDualRecursive([el], valid), RangeError)
				assert.throws(() => convolutionDualRecursive(valid, [el]), RangeError)
			}
		})
	})

	describe('cross-checks', () => {
		test('matches independent O(n*m) direct convolution across sizes up to 100x73', () => {
			const rng = createRng(1337)
			const randDual = () => ({
				v: (rng() - 0.5) * 10,
				d: (rng() - 0.5) * 10,
			})

			// Exhaustive small grid 1..12 x 1..12
			for (let n = 1; n <= 12; n++) {
				for (let m = 1; m <= 12; m++) {
					const a = Array.from({ length: n }, randDual)
					const b = Array.from({ length: m }, randDual)
					const actual = convolutionDualRecursive(a, b)
					const expected = directConvolutionDual(a, b)
					assertDualSeqClose(actual, expected, 1e-10, `${n}x${m}`)
				}
			}

			// Larger multi-level recursive cases (powers of 2, primes, asymmetric)
			for (const [n, m] of [
				[16, 16],
				[31, 37],
				[64, 64],
				[65, 49],
				[100, 73],
			]) {
				const a = Array.from({ length: n }, randDual)
				const b = Array.from({ length: m }, randDual)
				const actual = convolutionDualRecursive(a, b)
				const expected = directConvolutionDual(a, b)
				assertDualSeqClose(actual, expected, 1e-8, `${n}x${m}`)
			}
		})

		test('forward-mode derivatives match central finite differences', () => {
			// Parameterized sequences a(t), b(t) with exact analytic derivatives
			const makeA = (t) =>
				Array.from({ length: 13 }, (_, i) => {
					const k = i + 1
					return {
						v: Math.sin(k * t) + 0.25 * (i - 4) * t * t,
						d: k * Math.cos(k * t) + 0.5 * (i - 4) * t,
					}
				})

			const makeB = (t) =>
				Array.from({ length: 9 }, (_, j) => {
					const k = j + 1
					return {
						v: Math.cos(0.7 * k * t) - 0.15 * t * t * t + 0.2 * j,
						d: -0.7 * k * Math.sin(0.7 * k * t) - 0.45 * t * t,
					}
				})

			const t0 = 0.85
			const h = 1e-6

			const atT0 = convolutionDualRecursive(makeA(t0), makeB(t0))
			const atPlus = convolutionDualRecursive(makeA(t0 + h), makeB(t0 + h))
			const atMinus = convolutionDualRecursive(makeA(t0 - h), makeB(t0 - h))

			assert.equal(atT0.length, 13 + 9 - 1)
			for (let k = 0; k < atT0.length; k++) {
				const fd = (atPlus[k].v - atMinus[k].v) / (2 * h)
				assert.ok(
					Math.abs(atT0[k].d - fd) <= 1e-7,
					`index ${k}: dual derivative ${atT0[k].d} differs from finite difference ${fd}`,
				)
			}
		})

		test('directional derivative (JVP) matches finite difference perturbation', () => {
			const rng = createRng(2026)
			const a = Array.from({ length: 15 }, () => ({ v: rng() * 4 - 2, d: rng() * 2 - 1 }))
			const b = Array.from({ length: 11 }, () => ({ v: rng() * 4 - 2, d: rng() * 2 - 1 }))

			const h = 1e-6
			const dualOut = convolutionDualRecursive(a, b)
			const plusOut = convolutionDualRecursive(
				a.map((x) => ({ v: x.v + h * x.d, d: 0 })),
				b.map((y) => ({ v: y.v + h * y.d, d: 0 })),
			)
			const minusOut = convolutionDualRecursive(
				a.map((x) => ({ v: x.v - h * x.d, d: 0 })),
				b.map((y) => ({ v: y.v - h * y.d, d: 0 })),
			)

			for (let k = 0; k < dualOut.length; k++) {
				const fd = (plusOut[k].v - minusOut[k].v) / (2 * h)
				assert.ok(
					Math.abs(dualOut[k].d - fd) <= 1e-7,
					`JVP index ${k}: dual ${dualOut[k].d} vs FD ${fd}`,
				)
			}
		})
	})
})
