import { describe, it } from 'node:test'
import assert from 'node:assert'
import { dotProductDualRecursive } from './dotProductDualRecursive.js'

/**
 * Independent iterative reference implementation of dual-number dot product.
 */
function iterativeDotDual(a, b) {
	let v = 0
	let d = 0
	for (let i = 0; i < a.length; i++) {
		v += a[i].v * b[i].v
		d += a[i].v * b[i].d + a[i].d * b[i].v
	}
	return { v, d }
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible vector tests.
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function assertClose(actual, expected, tol = 1e-12, label = '') {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`
	)
}

describe('dotProductDualRecursive', () => {
	describe('normal cases', () => {
		it('computes exact value and derivative for even-length vectors', () => {
			const a = [
				{ v: 1, d: 2 },
				{ v: 3, d: 4 },
				{ v: 5, d: -1 },
				{ v: -2, d: 6 },
			]
			const b = [
				{ v: 7, d: -3 },
				{ v: -1, d: 5 },
				{ v: 2, d: 0 },
				{ v: 4, d: 1 },
			]
			// v = 1*7 + 3*(-1) + 5*2 + (-2)*4 = 7 - 3 + 10 - 8 = 6
			// d = (1*(-3)+2*7) + (3*5+4*(-1)) + (5*0+(-1)*2) + ((-2)*1+6*4)
			//   = 11 + 11 - 2 + 22 = 42
			assert.deepStrictEqual(dotProductDualRecursive(a, b), { v: 6, d: 42 })
		})

		it('computes exact value and derivative for odd-length vectors', () => {
			const a = [
				{ v: 2, d: 1 },
				{ v: -3, d: 4 },
				{ v: 5, d: -2 },
			]
			const b = [
				{ v: 4, d: -1 },
				{ v: 6, d: 2 },
				{ v: -1, d: 3 },
			]
			// v = 8 - 18 - 5 = -15
			// d = (-2 + 4) + (-6 + 24) + (15 + 2) = 2 + 18 + 17 = 37
			assert.deepStrictEqual(dotProductDualRecursive(a, b), { v: -15, d: 37 })
		})

		it('handles constant vectors with zero derivatives', () => {
			const a = [
				{ v: 1.5, d: 0 },
				{ v: -2.5, d: 0 },
				{ v: 4, d: 0 },
			]
			const b = [
				{ v: 2, d: 0 },
				{ v: 4, d: 0 },
				{ v: 0.5, d: 0 },
			]
			assert.deepStrictEqual(dotProductDualRecursive(a, b), { v: -5, d: 0 })
		})

		it('satisfies commutativity: dot(a, b) === dot(b, a)', () => {
			const a = [
				{ v: 1.25, d: -0.5 },
				{ v: -3.5, d: 2.25 },
				{ v: 7, d: 1.5 },
				{ v: 0.5, d: -4 },
				{ v: -2, d: 3 },
			]
			const b = [
				{ v: -0.75, d: 4.5 },
				{ v: 2.5, d: -1.25 },
				{ v: -3, d: 0.5 },
				{ v: 6, d: 2 },
				{ v: 1.5, d: -0.25 },
			]
			assert.deepStrictEqual(dotProductDualRecursive(a, b), dotProductDualRecursive(b, a))
		})

		it('satisfies squared-norm derivative identity d/dt ||u(t)||^2 = 2 u(t)·u\'(t)', () => {
			const u = [
				{ v: 3, d: -1 },
				{ v: -4, d: 2 },
				{ v: 2, d: 5 },
				{ v: 1, d: -3 },
				{ v: -2, d: 4 },
			]
			const res = dotProductDualRecursive(u, u)
			const expectedV = u.reduce((acc, el) => acc + el.v * el.v, 0)
			const expectedD = 2 * u.reduce((acc, el) => acc + el.v * el.d, 0)
			assert.deepStrictEqual(res, { v: expectedV, d: expectedD })
		})

		it('handles large vectors without stack overflow (odd and even sizes)', () => {
			for (const n of [10000, 65537]) {
				const a = new Array(n)
				const b = new Array(n)
				for (let i = 0; i < n; i++) {
					// Alternating +1/-1 and constant terms with closed-form sum
					a[i] = { v: 1, d: 2 }
					b[i] = { v: 3, d: 4 }
				}
				const res = dotProductDualRecursive(a, b)
				// Each term contributes v = 3, d = 1*4 + 2*3 = 10
				assert.strictEqual(res.v, 3 * n)
				assert.strictEqual(res.d, 10 * n)
			}
		})

		it('does not mutate input arrays or elements', () => {
			const a = [
				{ v: 1, d: 2 },
				{ v: 3, d: 4 },
				{ v: 5, d: 6 },
			]
			const b = [
				{ v: 7, d: 8 },
				{ v: 9, d: 10 },
				{ v: 11, d: 12 },
			]
			const aSnap = structuredClone(a)
			const bSnap = structuredClone(b)
			dotProductDualRecursive(a, b)
			assert.deepStrictEqual(a, aSnap)
			assert.deepStrictEqual(b, bSnap)
		})
	})

	describe('edge cases', () => {
		it('returns { v: 0, d: 0 } for empty vectors', () => {
			assert.deepStrictEqual(dotProductDualRecursive([], []), { v: 0, d: 0 })
		})

		it('handles length-1 vectors', () => {
			assert.deepStrictEqual(
				dotProductDualRecursive([{ v: 3, d: 2 }], [{ v: 5, d: 7 }]),
				{ v: 15, d: 31 }
			)
		})

		it('handles orthogonal vectors with identically zero dot product and derivative', () => {
			const t = 0.7
			const u = [
				{ v: Math.cos(t), d: -Math.sin(t) },
				{ v: Math.sin(t), d: Math.cos(t) },
			]
			const w = [
				{ v: -Math.sin(t), d: -Math.cos(t) },
				{ v: Math.cos(t), d: -Math.sin(t) },
			]
			const res = dotProductDualRecursive(u, w)
			assertClose(res.v, 0, 1e-15, 'orthogonal v')
			assertClose(res.d, 0, 1e-15, 'orthogonal d')
		})

		it('handles instantaneously orthogonal vectors with non-zero derivative', () => {
			// u(t) = (1, t), w(t) = (0, 1) at t = 0 -> u·w = t, value = 0, derivative = 1
			const u = [
				{ v: 1, d: 0 },
				{ v: 0, d: 1 },
			]
			const w = [
				{ v: 0, d: 0 },
				{ v: 1, d: 0 },
			]
			assert.deepStrictEqual(dotProductDualRecursive(u, w), { v: 0, d: 1 })
		})

		it('throws RangeError on mismatched lengths', () => {
			assert.throws(
				() => dotProductDualRecursive([{ v: 1, d: 0 }], []),
				RangeError
			)
			assert.throws(
				() =>
					dotProductDualRecursive(
						[{ v: 1, d: 2 }],
						[
							{ v: 1, d: 2 },
							{ v: 3, d: 4 },
						]
					),
				RangeError
			)
		})

		it('throws TypeError for non-array inputs', () => {
			for (const bad of [null, undefined, 42, 'abc', { v: 1, d: 2 }, new Float64Array([1, 2])]) {
				assert.throws(() => dotProductDualRecursive(bad, []), TypeError)
				assert.throws(() => dotProductDualRecursive([], bad), TypeError)
			}
		})

		it('throws TypeError for invalid dual elements or sparse holes', () => {
			const valid = [{ v: 1, d: 1 }]
			for (const badEl of [null, undefined, 1, 'x', {}, { v: 1 }, { d: 1 }, { v: '1', d: 0 }, { v: 0, d: '1' }]) {
				assert.throws(() => dotProductDualRecursive([badEl], valid), TypeError)
				assert.throws(() => dotProductDualRecursive(valid, [badEl]), TypeError)
			}

			// Sparse array with a hole
			const sparse = new Array(2)
			sparse[0] = { v: 1, d: 2 }
			const dense = [
				{ v: 1, d: 2 },
				{ v: 3, d: 4 },
			]
			assert.throws(() => dotProductDualRecursive(sparse, dense), TypeError)
			assert.throws(() => dotProductDualRecursive(dense, sparse), TypeError)
		})

		it('throws RangeError for non-finite dual components', () => {
			const valid = [{ v: 1, d: 1 }]
			for (const badNum of [NaN, Infinity, -Infinity]) {
				assert.throws(() => dotProductDualRecursive([{ v: badNum, d: 0 }], valid), RangeError)
				assert.throws(() => dotProductDualRecursive([{ v: 0, d: badNum }], valid), RangeError)
				assert.throws(() => dotProductDualRecursive(valid, [{ v: badNum, d: 0 }]), RangeError)
				assert.throws(() => dotProductDualRecursive(valid, [{ v: 0, d: badNum }]), RangeError)
			}
		})
	})

	describe('cross-checks', () => {
		it('matches independent iterative dot product across varied lengths', () => {
			const rng = makeRng(20261122)
			const lengths = [0, 1, 2, 3, 4, 5, 7, 8, 15, 16, 31, 64, 127, 500, 1025]

			for (const n of lengths) {
				const a = Array.from({ length: n }, () => ({
					v: (rng() - 0.5) * 20,
					d: (rng() - 0.5) * 20,
				}))
				const b = Array.from({ length: n }, () => ({
					v: (rng() - 0.5) * 20,
					d: (rng() - 0.5) * 20,
				}))

				const recursiveRes = dotProductDualRecursive(a, b)
				const iterativeRes = iterativeDotDual(a, b)

				assertClose(recursiveRes.v, iterativeRes.v, 1e-10, `len=${n} v`)
				assertClose(recursiveRes.d, iterativeRes.d, 1e-10, `len=${n} d`)
			}
		})

		it('matches central finite differences of f(t) = u(t) · w(t)', () => {
			// Nonlinear smooth parametric vector functions u(t), w(t) in R^7
			const uVal = (t) => [
				Math.sin(2 * t),
				Math.exp(0.3 * t),
				t * t * t - 2 * t + 1,
				Math.cos(t * t),
				Math.log(t + 5),
				1 / (t + 4),
				Math.atan(t),
			]
			const uDer = (t) => [
				2 * Math.cos(2 * t),
				0.3 * Math.exp(0.3 * t),
				3 * t * t - 2,
				-2 * t * Math.sin(t * t),
				1 / (t + 5),
				-1 / ((t + 4) * (t + 4)),
				1 / (1 + t * t),
			]

			const wVal = (t) => [
				Math.cos(3 * t),
				t * t + 1,
				Math.exp(-0.5 * t),
				Math.sin(t + 0.4),
				Math.sqrt(t + 6),
				2 * t - 3,
				Math.cosh(0.2 * t),
			]
			const wDer = (t) => [
				-3 * Math.sin(3 * t),
				2 * t,
				-0.5 * Math.exp(-0.5 * t),
				Math.cos(t + 0.4),
				0.5 / Math.sqrt(t + 6),
				2,
				0.2 * Math.sinh(0.2 * t),
			]

			const f = (t) => {
				const u = uVal(t)
				const w = wVal(t)
				let sum = 0
				for (let i = 0; i < u.length; i++) {
					sum += u[i] * w[i]
				}
				return sum
			}

			const h = 1e-6
			for (const t of [-1.5, -0.25, 0, 0.75, 2.1]) {
				const uv = uVal(t)
				const ud = uDer(t)
				const wv = wVal(t)
				const wd = wDer(t)

				const uDual = uv.map((v, i) => ({ v, d: ud[i] }))
				const wDual = wv.map((v, i) => ({ v, d: wd[i] }))

				const { v, d } = dotProductDualRecursive(uDual, wDual)
				const fd = (f(t + h) - f(t - h)) / (2 * h)

				assertClose(v, f(t), 1e-12, `f(${t})`)
				assertClose(d, fd, 1e-7, `f'(${t}) vs central FD`)
			}
		})
	})
})
