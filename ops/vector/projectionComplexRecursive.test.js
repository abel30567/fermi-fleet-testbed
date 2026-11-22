import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { projectionComplexRecursive } from './projectionComplexRecursive.js'

function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	assert.equal(typeof actual, 'object', `${label}: expected object`)
	assert.notEqual(actual, null, `${label}: expected non-null`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${label}: re mismatch: got ${actual.re}, expected ${expected.re} (diff=${Math.abs(actual.re - expected.re)}, tol=${tol})`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${label}: im mismatch: got ${actual.im}, expected ${expected.im} (diff=${Math.abs(actual.im - expected.im)}, tol=${tol})`,
	)
}

function assertVectorClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, expected.length, `length mismatch: ${actual.length} !== ${expected.length}`)
	for (let i = 0; i < expected.length; i++) {
		assertComplexClose(actual[i], expected[i], tol, `index ${i}`)
	}
}

/** Independent direct iterative reference implementation for normal-scale vectors. */
function referenceProjectionIterative(u, v) {
	let dotRe = 0
	let dotIm = 0
	let normSq = 0
	for (let i = 0; i < u.length; i++) {
		dotRe += u[i].re * v[i].re + u[i].im * v[i].im
		dotIm += u[i].im * v[i].re - u[i].re * v[i].im
		normSq += v[i].re * v[i].re + v[i].im * v[i].im
	}
	const aRe = dotRe / normSq
	const aIm = dotIm / normSq
	const out = []
	for (let i = 0; i < v.length; i++) {
		out.push({
			re: aRe * v[i].re - aIm * v[i].im,
			im: aRe * v[i].im + aIm * v[i].re,
		})
	}
	return out
}

/** Independent Hermitian inner product <a, b> = sum(a_k * conj(b_k)). */
function hermitianInner(a, b) {
	let re = 0
	let im = 0
	for (let i = 0; i < a.length; i++) {
		re += a[i].re * b[i].re + a[i].im * b[i].im
		im += a[i].im * b[i].re - a[i].re * b[i].im
	}
	return { re, im }
}

function normSquared(a) {
	let s = 0
	for (let i = 0; i < a.length; i++) {
		s += a[i].re * a[i].re + a[i].im * a[i].im
	}
	return s
}

function vecSub(a, b) {
	return a.map((x, i) => ({ re: x.re - b[i].re, im: x.im - b[i].im }))
}

function vecScale(c, a) {
	return a.map((x) => ({
		re: c.re * x.re - c.im * x.im,
		im: c.re * x.im + c.im * x.re,
	}))
}

function vecAdd(a, b) {
	return a.map((x, i) => ({ re: x.re + b[i].re, im: x.im + b[i].im }))
}

/** Deterministic PRNG (Mulberry32) for reproducible cross-check vectors. */
function mulberry32(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

describe('projectionComplexRecursive', () => {
	describe('normal cases', () => {
		test('hand-worked 2D complex vector projection', () => {
			const u = [
				{ re: 1, im: 2 },
				{ re: 3, im: -1 },
			]
			const v = [
				{ re: 1, im: -1 },
				{ re: 2, im: 1 },
			]
			// <u, v> = (1+2i)(1+i) + (3-i)(2-i) = (-1+3i) + (5-5i) = 4 - 2i
			// <v, v> = 2 + 5 = 7
			// proj_v(u) = [(2 - 6i)/7, (10 + 0i)/7]
			const result = projectionComplexRecursive(u, v)
			assertVectorClose(result, [
				{ re: 2 / 7, im: -6 / 7 },
				{ re: 10 / 7, im: 0 },
			])
		})

		test('hand-worked 3D complex vector projection (odd length)', () => {
			const u = [
				{ re: 2, im: 1 },
				{ re: -1, im: 3 },
				{ re: 4, im: -2 },
			]
			const v = [
				{ re: 1, im: 1 },
				{ re: 0, im: 2 },
				{ re: -1, im: 1 },
			]
			// <u, v> = (2+i)(1-i) + (-1+3i)(-2i) + (4-2i)(-1-i)
			//        = (3-i) + (6+2i) + (-6-2i) = 3 - i
			// <v, v> = 2 + 4 + 2 = 8
			// alpha = (3 - i)/8
			const result = projectionComplexRecursive(u, v)
			assertVectorClose(result, [
				{ re: 4 / 8, im: 2 / 8 },
				{ re: 2 / 8, im: 6 / 8 },
				{ re: -2 / 8, im: 4 / 8 },
			])
		})

		test('1D complex vector projection always returns u', () => {
			const u = [{ re: -3.5, im: 7.25 }]
			const v = [{ re: 2.1, im: -4.3 }]
			const result = projectionComplexRecursive(u, v)
			assertVectorClose(result, u, 1e-12)
		})

		test('pure real vectors match real vector projection', () => {
			const u = [
				{ re: 3, im: 0 },
				{ re: 4, im: 0 },
				{ re: 5, im: 0 },
			]
			const v = [
				{ re: 1, im: 0 },
				{ re: 2, im: 0 },
				{ re: 2, im: 0 },
			]
			// <u, v> = 3 + 8 + 10 = 21, <v, v> = 1 + 4 + 4 = 9, alpha = 7/3
			const result = projectionComplexRecursive(u, v)
			assertVectorClose(result, [
				{ re: 7 / 3, im: 0 },
				{ re: 14 / 3, im: 0 },
				{ re: 14 / 3, im: 0 },
			])
		})

		test('pure imaginary vectors', () => {
			const u = [
				{ re: 0, im: 3 },
				{ re: 0, im: -4 },
			]
			const v = [
				{ re: 0, im: 1 },
				{ re: 0, im: 0 },
			]
			const result = projectionComplexRecursive(u, v)
			assertVectorClose(result, [
				{ re: 0, im: 3 },
				{ re: 0, im: 0 },
			])
		})

		test('does not mutate input vectors or return aliased element objects', () => {
			const u = [
				{ re: 1, im: 2 },
				{ re: 3, im: 4 },
			]
			const v = [
				{ re: 5, im: -6 },
				{ re: -7, im: 8 },
			]
			const uCopy = structuredClone(u)
			const vCopy = structuredClone(v)
			const result = projectionComplexRecursive(u, v)

			assert.deepEqual(u, uCopy)
			assert.deepEqual(v, vCopy)
			assert.notEqual(result, u)
			assert.notEqual(result, v)
			for (let i = 0; i < result.length; i++) {
				assert.notEqual(result[i], u[i])
				assert.notEqual(result[i], v[i])
			}
		})
	})

	describe('edge cases', () => {
		test('zero u vector projects to zero vector with positive zeros', () => {
			const u = [
				{ re: 0, im: -0 },
				{ re: -0, im: 0 },
				{ re: 0, im: 0 },
			]
			const v = [
				{ re: 1, im: -2 },
				{ re: 3, im: 4 },
				{ re: -5, im: 6 },
			]
			const result = projectionComplexRecursive(u, v)
			assert.equal(result.length, 3)
			for (const entry of result) {
				assert.ok(Object.is(entry.re, 0), `expected +0 for re, got ${entry.re}`)
				assert.ok(Object.is(entry.im, 0), `expected +0 for im, got ${entry.im}`)
			}
		})

		test('orthogonal complex vectors project to zero vector', () => {
			const u = [
				{ re: 1, im: 0 },
				{ re: 0, im: 1 },
			]
			const v = [
				{ re: 0, im: 1 },
				{ re: 1, im: 0 },
			]
			// <u, v> = 1*(-i) + i*(1) = 0
			const result = projectionComplexRecursive(u, v)
			assertVectorClose(result, [
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
			])
			for (const entry of result) {
				assert.ok(Object.is(entry.re, 0))
				assert.ok(Object.is(entry.im, 0))
			}
		})

		test('collinear complex vector u = c * v projects onto itself', () => {
			const v = [
				{ re: 2, im: -3 },
				{ re: -1, im: 4 },
				{ re: 5, im: 2 },
			]
			const c = { re: -1.5, im: 2.25 }
			const u = vecScale(c, v)
			const result = projectionComplexRecursive(u, v)
			assertVectorClose(result, u, 1e-12)
		})

		test('normalizes -0 to +0 in non-trivial projection results', () => {
			const u = [
				{ re: -1, im: 0 },
				{ re: 0, im: 0 },
			]
			const v = [
				{ re: 1, im: 0 },
				{ re: 0, im: 0 },
			]
			const result = projectionComplexRecursive(u, v)
			assert.equal(result[0].re, -1)
			assert.ok(Object.is(result[0].im, 0))
			assert.ok(Object.is(result[1].re, 0))
			assert.ok(Object.is(result[1].im, 0))
		})

		test('numerical stability for extreme large and small magnitudes (no overflow/underflow)', () => {
			// Huge v (1e200): direct |v|^2 would overflow to Infinity
			const u1 = [
				{ re: 1, im: 2 },
				{ re: 3, im: -1 },
			]
			const vHuge = [
				{ re: 1e200, im: -1e200 },
				{ re: 2e200, im: 1e200 },
			]
			assertVectorClose(projectionComplexRecursive(u1, vHuge), [
				{ re: 2 / 7, im: -6 / 7 },
				{ re: 10 / 7, im: 0 },
			])

			// Tiny v (1e-200): direct |v|^2 would underflow to 0
			const vTiny = [
				{ re: 1e-200, im: -1e-200 },
				{ re: 2e-200, im: 1e-200 },
			]
			assertVectorClose(projectionComplexRecursive(u1, vTiny), [
				{ re: 2 / 7, im: -6 / 7 },
				{ re: 10 / 7, im: 0 },
			])

			// Mismatched scales: tiny u (1e-200), huge v (1e200)
			const uTiny = [
				{ re: 1e-200, im: 2e-200 },
				{ re: 3e-200, im: -1e-200 },
			]
			assertVectorClose(
				projectionComplexRecursive(uTiny, vHuge),
				[
					{ re: (2 / 7) * 1e-200, im: (-6 / 7) * 1e-200 },
					{ re: (10 / 7) * 1e-200, im: 0 },
				],
				1e-212,
			)

			// Huge u (1e250), tiny v (1e-250)
			const uHuge = [
				{ re: 1e250, im: 2e250 },
				{ re: 3e250, im: -1e250 },
			]
			const vTiny2 = [
				{ re: 1e-250, im: -1e-250 },
				{ re: 2e-250, im: 1e-250 },
			]
			assertVectorClose(
				projectionComplexRecursive(uHuge, vTiny2),
				[
					{ re: (2 / 7) * 1e250, im: (-6 / 7) * 1e250 },
					{ re: (10 / 7) * 1e250, im: 0 },
				],
				1e238,
			)

			// Subnormal minimum positive value
			const uSub = [{ re: Number.MIN_VALUE, im: 0 }]
			const vSub = [{ re: Number.MIN_VALUE, im: 0 }]
			const resSub = projectionComplexRecursive(uSub, vSub)
			assert.equal(resSub[0].re, Number.MIN_VALUE)
			assert.equal(resSub[0].im, 0)
		})

		test('large non-power-of-two vector (n = 4097) runs cleanly with O(log n) recursion depth', () => {
			const n = 4097
			const u = new Array(n)
			const v = new Array(n)
			for (let i = 0; i < n; i++) {
				u[i] = { re: Math.sin(i * 0.1), im: Math.cos(i * 0.2) }
				v[i] = { re: 1, im: i % 2 === 0 ? 1 : -1 }
			}
			const result = projectionComplexRecursive(u, v)
			const ref = referenceProjectionIterative(u, v)
			assertVectorClose(result, ref, 1e-11)
		})
	})

	describe('input validation and domain errors', () => {
		test('throws TypeError when u or v is not an Array', () => {
			const valid = [{ re: 1, im: 0 }]
			for (const bad of [null, undefined, 42, 'vec', { re: 1, im: 0 }, true]) {
				assert.throws(() => projectionComplexRecursive(bad, valid), TypeError)
				assert.throws(() => projectionComplexRecursive(valid, bad), TypeError)
			}
		})

		test('throws RangeError for empty vectors or mismatched dimensions', () => {
			assert.throws(() => projectionComplexRecursive([], []), RangeError)
			assert.throws(
				() => projectionComplexRecursive([{ re: 1, im: 0 }], [{ re: 1, im: 0 }, { re: 2, im: 0 }]),
				RangeError,
			)
		})

		test('throws TypeError for invalid complex element shapes', () => {
			const valid = [
				{ re: 1, im: 0 },
				{ re: 0, im: 1 },
			]
			const badElements = [null, undefined, 5, '1+2i', [1, 2], { re: 1 }, { im: 2 }, { re: '1', im: 0 }]
			for (const bad of badElements) {
				assert.throws(() => projectionComplexRecursive([bad, { re: 1, im: 0 }], valid), TypeError)
				assert.throws(() => projectionComplexRecursive(valid, [{ re: 1, im: 0 }, bad]), TypeError)
			}
			// Sparse array hole
			const sparse = new Array(2)
			sparse[0] = { re: 1, im: 0 }
			assert.throws(() => projectionComplexRecursive(sparse, valid), TypeError)
		})

		test('throws RangeError for non-finite numbers (NaN, Infinity, -Infinity)', () => {
			const valid = [
				{ re: 1, im: 0 },
				{ re: 0, im: 1 },
			]
			for (const badNum of [NaN, Infinity, -Infinity]) {
				assert.throws(
					() => projectionComplexRecursive([{ re: badNum, im: 0 }, { re: 1, im: 0 }], valid),
					RangeError,
				)
				assert.throws(
					() => projectionComplexRecursive([{ re: 0, im: badNum }, { re: 1, im: 0 }], valid),
					RangeError,
				)
				assert.throws(
					() => projectionComplexRecursive(valid, [{ re: badNum, im: 0 }, { re: 1, im: 0 }]),
					RangeError,
				)
				assert.throws(
					() => projectionComplexRecursive(valid, [{ re: 0, im: badNum }, { re: 1, im: 0 }]),
					RangeError,
				)
			}
		})

		test('throws RangeError when projecting onto the zero vector', () => {
			assert.throws(() => projectionComplexRecursive([{ re: 1, im: 2 }], [{ re: 0, im: 0 }]), RangeError)
			assert.throws(
				() =>
					projectionComplexRecursive(
						[
							{ re: 0, im: 0 },
							{ re: 0, im: 0 },
						],
						[
							{ re: 0, im: -0 },
							{ re: -0, im: 0 },
						],
					),
				RangeError,
			)
		})

		test('throws RangeError when exact projection overflows IEEE-754 double', () => {
			// u = [MAX, MAX], v = [1, 1e-10]: proj_v(u) ~ [MAX * (1 + 1e-10), ...] -> overflows MAX_VALUE
			// Even simpler: u = [1e308 + 1e308i, 1e308 + 1e308i], v = [1, 0.5] => alpha = 1.5/1.25 = 1.2 => p0 = 1.2 * 1e308 (ok);
			// Use u = [1.5e308, 1.5e308], v = [1, 0.5]: <u,v>/<v,v> = 2.25e308 / 1.25 = 1.8e308 > Number.MAX_VALUE
			const u = [
				{ re: 1.5e308, im: 0 },
				{ re: 1.5e308, im: 0 },
			]
			const v = [
				{ re: 1, im: 0 },
				{ re: 0.5, im: 0 },
			]
			assert.throws(() => projectionComplexRecursive(u, v), RangeError)
		})
	})

	describe('cross-checks and algebraic identities', () => {
		test('matches independent iterative reference and Hermitian rank-1 matrix product across dimensions', () => {
			const rand = mulberry32(20261122)
			const randVec = (n) =>
				Array.from({ length: n }, () => ({
					re: (rand() - 0.5) * 20,
					im: (rand() - 0.5) * 20,
				}))

			for (const n of [1, 2, 3, 5, 8, 13, 32, 65]) {
				const u = randVec(n)
				const v = randVec(n)
				// Ensure v is well away from zero
				v[0].re += 5

				const p = projectionComplexRecursive(u, v)

				// 1. Cross-check against direct iterative formula
				const ref = referenceProjectionIterative(u, v)
				assertVectorClose(p, ref, 1e-11)

				// 2. Cross-check against explicit rank-1 projection matrix P = (v v^H) / ||v||^2
				const vNormSq = normSquared(v)
				const pu = new Array(n)
				for (let i = 0; i < n; i++) {
					let sumRe = 0
					let sumIm = 0
					for (let j = 0; j < n; j++) {
						// P_{ij} = v_i * conj(v_j) / ||v||^2
						const pijRe = (v[i].re * v[j].re + v[i].im * v[j].im) / vNormSq
						const pijIm = (v[i].im * v[j].re - v[i].re * v[j].im) / vNormSq
						sumRe += pijRe * u[j].re - pijIm * u[j].im
						sumIm += pijRe * u[j].im + pijIm * u[j].re
					}
					pu[i] = { re: sumRe, im: sumIm }
				}
				assertVectorClose(p, pu, 1e-11)

				// 3. Orthogonality: <u - p, v> = 0 and <u - p, p> = 0
				const residual = vecSub(u, p)
				assertComplexClose(hermitianInner(residual, v), { re: 0, im: 0 }, 1e-9, `orthogonality to v (n=${n})`)
				assertComplexClose(hermitianInner(residual, p), { re: 0, im: 0 }, 1e-9, `orthogonality to p (n=${n})`)

				// 4. Idempotence: proj_v(proj_v(u)) = proj_v(u)
				const p2 = projectionComplexRecursive(p, v)
				assertVectorClose(p2, p, 1e-11)

				// 5. Pythagorean theorem: ||u||^2 = ||p||^2 + ||u - p||^2
				const lhs = normSquared(u)
				const rhs = normSquared(p) + normSquared(residual)
				assert.ok(
					Math.abs(lhs - rhs) <= 1e-9 * Math.max(1, lhs),
					`Pythagorean mismatch for n=${n}: ${lhs} vs ${rhs}`,
				)

				// 6. Scale invariance in v: proj_{c*v}(u) = proj_v(u) for nonzero complex c
				const c = { re: -2.7, im: 4.1 }
				const pScaledV = projectionComplexRecursive(u, vecScale(c, v))
				assertVectorClose(pScaledV, p, 1e-11)
			}
		})

		test('linearity in u: proj_v(a*u1 + b*u2) = a*proj_v(u1) + b*proj_v(u2)', () => {
			const rand = mulberry32(99887766)
			const randVec = (n) =>
				Array.from({ length: n }, () => ({
					re: (rand() - 0.5) * 10,
					im: (rand() - 0.5) * 10,
				}))

			const n = 17
			const u1 = randVec(n)
			const u2 = randVec(n)
			const v = randVec(n)
			v[0].im += 3

			const a = { re: 1.75, im: -2.5 }
			const b = { re: -0.6, im: 3.2 }

			const combinedU = vecAdd(vecScale(a, u1), vecScale(b, u2))
			const lhs = projectionComplexRecursive(combinedU, v)
			const rhs = vecAdd(
				vecScale(a, projectionComplexRecursive(u1, v)),
				vecScale(b, projectionComplexRecursive(u2, v)),
			)
			assertVectorClose(lhs, rhs, 1e-11)
		})
	})
})
