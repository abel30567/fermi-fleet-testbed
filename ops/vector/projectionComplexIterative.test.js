import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { projectionComplexIterative } from './projectionComplexIterative.js'

const c = (re, im = 0) => ({ re, im })

function assertComplexClose(actual, expected, eps = 1e-12, msg = '') {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`${msg} re mismatch: expected ${expected.re}, got ${actual.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`${msg} im mismatch: expected ${expected.im}, got ${actual.im}`
	)
}

function assertVectorClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, expected.length, 'Vector lengths must match')
	for (let i = 0; i < expected.length; i++) {
		assertComplexClose(actual[i], expected[i], eps, `index ${i}`)
	}
}

/**
 * Independent reference computation via the rank-1 Hermitian projection matrix
 * P = (v * v^H) / (v^H * v), returning P * u.
 */
function projectionViaMatrix(u, v) {
	const n = v.length
	let denom = 0
	for (let i = 0; i < n; i++) {
		denom += v[i].re * v[i].re + v[i].im * v[i].im
	}

	// Build n x n projection matrix P where P[j][k] = (v[j] * conj(v[k])) / denom
	const P = Array.from({ length: n }, (_, j) =>
		Array.from({ length: n }, (_, k) => ({
			re: (v[j].re * v[k].re + v[j].im * v[k].im) / denom,
			im: (v[j].im * v[k].re - v[j].re * v[k].im) / denom,
		}))
	)

	// Matrix-vector product P * u
	return P.map((row) => {
		let re = 0
		let im = 0
		for (let k = 0; k < n; k++) {
			re += row[k].re * u[k].re - row[k].im * u[k].im
			im += row[k].re * u[k].im + row[k].im * u[k].re
		}
		return { re, im }
	})
}

function innerProduct(a, b) {
	let re = 0
	let im = 0
	for (let i = 0; i < a.length; i++) {
		re += a[i].re * b[i].re + a[i].im * b[i].im
		im += a[i].im * b[i].re - a[i].re * b[i].im
	}
	return { re, im }
}

function normSquared(a) {
	let sum = 0
	for (let i = 0; i < a.length; i++) {
		sum += a[i].re * a[i].re + a[i].im * a[i].im
	}
	return sum
}

function subVectors(a, b) {
	return a.map((x, i) => ({ re: x.re - b[i].re, im: x.im - b[i].im }))
}

function scaleVector(alpha, v) {
	return v.map((x) => ({
		re: alpha.re * x.re - alpha.im * x.im,
		im: alpha.re * x.im + alpha.im * x.re,
	}))
}

function addVectors(a, b) {
	return a.map((x, i) => ({ re: x.re + b[i].re, im: x.im + b[i].im }))
}

describe('projectionComplexIterative', () => {
	describe('normal cases', () => {
		it('projects purely real vectors identically to real projection', () => {
			const u = [c(3, 0), c(4, 0)]
			const v = [c(1, 0), c(0, 0)]
			assert.deepStrictEqual(projectionComplexIterative(u, v), [c(3, 0), c(0, 0)])

			const u2 = [c(1, 0), c(2, 0), c(3, 0)]
			const v2 = [c(1, 0), c(1, 0), c(1, 0)]
			assertVectorClose(projectionComplexIterative(u2, v2), [c(2, 0), c(2, 0), c(2, 0)])
		})

		it('matches hand-worked complex 2D projection', () => {
			// u = [1 + 2i, 3 - i], v = [1 + i, 2i]
			// <u, v> = (1+2i)(1-i) + (3-i)(-2i) = (3+i) + (-2-6i) = 1 - 5i
			// <v, v> = 2 + 4 = 6
			// proj = ((1 - 5i) / 6) * [1 + i, 2i] = [1 - 2/3 i, 5/3 + 1/3 i]
			const u = [c(1, 2), c(3, -1)]
			const v = [c(1, 1), c(0, 2)]
			const result = projectionComplexIterative(u, v)
			assertVectorClose(result, [c(1, -2 / 3), c(5 / 3, 1 / 3)])
		})

		it('projects purely imaginary vectors accurately', () => {
			const u = [c(0, 2), c(0, -4)]
			const v = [c(0, 1), c(0, 1)]
			// <u, v> = (2i)(-i) + (-4i)(-i) = 2 - 4 = -2, <v, v> = 2, scale = -1
			assertVectorClose(projectionComplexIterative(u, v), [c(0, -1), c(0, -1)])
		})

		it('projects higher-dimensional complex vectors', () => {
			const u = [c(2, -1), c(0, 3), c(-4, 2), c(1, 1)]
			const v = [c(1, 0), c(0, 1), c(1, 1), c(-1, 2)]
			// <u, v> = (2-i)(1) + (3i)(-i) + (-4+2i)(1-i) + (1+i)(-1-2i)
			//        = (2-i) + 3 + (-2+6i) + (1-3i) = 4 + 2i
			// <v, v> = 1 + 1 + 2 + 5 = 9
			// scale = (4 + 2i) / 9
			const expected = scaleVector(c(4 / 9, 2 / 9), v)
			assertVectorClose(projectionComplexIterative(u, v), expected)
		})
	})

	describe('edge cases', () => {
		it('returns u unchanged for any 1D projection onto a nonzero complex vector', () => {
			const u = [c(3, -5)]
			const v = [c(0, 2)]
			assertVectorClose(projectionComplexIterative(u, v), u)

			const v2 = [c(-7, 11)]
			assertVectorClose(projectionComplexIterative(u, v2), u)
		})

		it('returns zero vector when u is zero (without negative zeros)', () => {
			const u = [c(0, 0), c(0, 0)]
			const v = [c(-1, 2), c(3, -4)]
			const result = projectionComplexIterative(u, v)
			assert.deepStrictEqual(result, [c(0, 0), c(0, 0)])
			for (const entry of result) {
				assert.ok(!Object.is(entry.re, -0))
				assert.ok(!Object.is(entry.im, -0))
			}
		})

		it('returns zero vector when u and v are Hermitian-orthogonal', () => {
			// <u, v> = (1)(i) + (i)(1) -> wait: conj(v) = [-i, 1] -> (1)(-i) + (i)(1) = 0
			const u = [c(1, 0), c(0, 1)]
			const v = [c(0, 1), c(1, 0)]
			const result = projectionComplexIterative(u, v)
			assert.deepStrictEqual(result, [c(0, 0), c(0, 0)])
		})

		it('returns u when u is a complex scalar multiple of v', () => {
			const v = [c(2, -3), c(1, 4), c(-5, 0)]
			const alpha = c(-1.5, 2.5)
			const u = scaleVector(alpha, v)
			assertVectorClose(projectionComplexIterative(u, v), u)
		})

		it('does not mutate input vectors or elements', () => {
			const u = [c(1, 2), c(3, 4)]
			const v = [c(5, -1), c(2, 3)]
			const uSnapshot = structuredClone(u)
			const vSnapshot = structuredClone(v)

			const result = projectionComplexIterative(u, v)
			assert.deepStrictEqual(u, uSnapshot)
			assert.deepStrictEqual(v, vSnapshot)
			assert.notEqual(result, u)
			assert.notEqual(result, v)
		})
	})

	describe('input validation', () => {
		it('throws TypeError if u or v is not an array', () => {
			for (const bad of [null, undefined, 42, 'vec', { re: 1, im: 0 }]) {
				assert.throws(() => projectionComplexIterative(bad, [c(1, 0)]), TypeError)
				assert.throws(() => projectionComplexIterative([c(1, 0)], bad), TypeError)
			}
		})

		it('throws TypeError if any element is not a { re, im } numeric object', () => {
			for (const badEl of [null, undefined, 1, '1+i', {}, { re: 1 }, { im: 1 }, { re: '1', im: 0 }, { re: 1, im: null }]) {
				assert.throws(() => projectionComplexIterative([badEl], [c(1, 0)]), TypeError)
				assert.throws(() => projectionComplexIterative([c(1, 0)], [badEl]), TypeError)
			}
		})

		it('throws RangeError for non-finite components (NaN, Infinity, -Infinity)', () => {
			for (const badNum of [NaN, Infinity, -Infinity]) {
				assert.throws(() => projectionComplexIterative([c(badNum, 0)], [c(1, 0)]), RangeError)
				assert.throws(() => projectionComplexIterative([c(0, badNum)], [c(1, 0)]), RangeError)
				assert.throws(() => projectionComplexIterative([c(1, 0)], [c(badNum, 0)]), RangeError)
				assert.throws(() => projectionComplexIterative([c(1, 0)], [c(0, badNum)]), RangeError)
			}
		})

		it('throws RangeError for empty vectors', () => {
			assert.throws(() => projectionComplexIterative([], []), RangeError)
		})

		it('throws RangeError for mismatched vector lengths', () => {
			assert.throws(
				() => projectionComplexIterative([c(1, 0), c(2, 0)], [c(1, 0)]),
				RangeError
			)
		})

		it('throws RangeError when projecting onto the zero vector', () => {
			assert.throws(() => projectionComplexIterative([c(1, 2)], [c(0, 0)]), RangeError)
			assert.throws(
				() => projectionComplexIterative([c(1, 0), c(0, 1)], [c(0, 0), c(0, 0)]),
				RangeError
			)
		})

		it('throws RangeError on numeric overflow', () => {
			assert.throws(
				() => projectionComplexIterative([c(1, 0)], [c(1e200, 1e200)]),
				RangeError
			)
		})
	})

	describe('cross-checks and mathematical identities', () => {
		const testPairs = [
			{
				u: [c(3, -2)],
				v: [c(-4, 5)],
			},
			{
				u: [c(1, -3), c(4, 2)],
				v: [c(2, 1), c(-1, 3)],
			},
			{
				u: [c(-2, 5), c(3, 0), c(1, -4)],
				v: [c(0, 2), c(-3, 1), c(4, 4)],
			},
			{
				u: [c(0.5, -1.25), c(2.75, 0.5), c(-1.5, 3.25), c(4, -2), c(-0.75, -0.25)],
				v: [c(1.5, 0.75), c(-2, 1.25), c(0.25, -3), c(1, 1), c(2.5, -0.5)],
			},
		]

		it('matches independent rank-1 Hermitian projection matrix P * u', () => {
			for (const { u, v } of testPairs) {
				const iterative = projectionComplexIterative(u, v)
				const viaMatrix = projectionViaMatrix(u, v)
				assertVectorClose(iterative, viaMatrix, 1e-12)
			}
		})

		it('satisfies residual orthogonality, idempotence, and Pythagorean theorem', () => {
			for (const { u, v } of testPairs) {
				const p = projectionComplexIterative(u, v)
				const residual = subVectors(u, p)

				// Orthogonality: <u - p, v> == 0
				const orth = innerProduct(residual, v)
				assertComplexClose(orth, c(0, 0), 1e-11, 'residual orthogonality')

				// Idempotence: proj_v(proj_v(u)) == proj_v(u)
				const p2 = projectionComplexIterative(p, v)
				assertVectorClose(p2, p, 1e-11)

				// Pythagorean theorem: ||u||^2 == ||p||^2 + ||u - p||^2
				const lhs = normSquared(u)
				const rhs = normSquared(p) + normSquared(residual)
				assert.ok(
					Math.abs(lhs - rhs) <= 1e-11 * Math.max(1, lhs),
					`Pythagorean mismatch: ${lhs} vs ${rhs}`
				)
			}
		})

		it('is invariant under nonzero complex scaling of v', () => {
			const scalars = [c(3, 0), c(-2, 0), c(0, 5), c(1.5, -2.5)]
			for (const { u, v } of testPairs) {
				const base = projectionComplexIterative(u, v)
				for (const alpha of scalars) {
					const scaled = projectionComplexIterative(u, scaleVector(alpha, v))
					assertVectorClose(scaled, base, 1e-11)
				}
			}
		})

		it('is linear in u: proj_v(a*u1 + b*u2) == a*proj_v(u1) + b*proj_v(u2)', () => {
			const u1 = [c(1, 2), c(-3, 1), c(0, 4)]
			const u2 = [c(-2, 1), c(5, -2), c(3, 1)]
			const v = [c(1, -1), c(2, 3), c(-1, 2)]
			const a = c(2, -1)
			const b = c(-0.5, 3)

			const combinedU = addVectors(scaleVector(a, u1), scaleVector(b, u2))
			const lhs = projectionComplexIterative(combinedU, v)

			const p1 = projectionComplexIterative(u1, v)
			const p2 = projectionComplexIterative(u2, v)
			const rhs = addVectors(scaleVector(a, p1), scaleVector(b, p2))

			assertVectorClose(lhs, rhs, 1e-11)
		})

		it('minimizes Euclidean distance ||u - c*v|| over complex perturbations', () => {
			const u = [c(2, -1), c(-3, 4), c(1, 2)]
			const v = [c(1, 1), c(0, -2), c(3, -1)]
			const p = projectionComplexIterative(u, v)
			const minDistSq = normSquared(subVectors(u, p))

			const perturbations = [c(0.1, 0), c(0, -0.1), c(0.05, 0.05), c(-1, 2)]
			for (const delta of perturbations) {
				const perturbed = addVectors(p, scaleVector(delta, v))
				const distSq = normSquared(subVectors(u, perturbed))
				const expectedDistSq = minDistSq + (delta.re * delta.re + delta.im * delta.im) * normSquared(v)
				assert.ok(distSq > minDistSq)
				assert.ok(Math.abs(distSq - expectedDistSq) <= 1e-11 * Math.max(1, expectedDistSq))
			}
		})
	})
})
