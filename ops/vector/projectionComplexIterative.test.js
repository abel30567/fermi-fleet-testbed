import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { projectionComplexIterative } from './projectionComplexIterative.js'

const EPS = 1e-12

function assertComplexClose(actual, expected, eps = EPS, message = '') {
	assert.equal(typeof actual, 'object', `${message} expected object`)
	assert.ok(actual !== null, `${message} expected non-null object`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`${message} re mismatch: expected ${expected.re}, got ${actual.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`${message} im mismatch: expected ${expected.im}, got ${actual.im}`
	)
}

function assertVectorClose(actual, expected, eps = EPS, message = '') {
	assert.equal(actual.length, expected.length, `${message} length mismatch`)
	for (let i = 0; i < expected.length; i++) {
		assertComplexClose(actual[i], expected[i], eps, `${message}[${i}]`)
	}
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function complexConj(a) {
	return { re: a.re, im: -a.im }
}

function hermitianInnerProduct(u, v) {
	let re = 0
	let im = 0
	for (let i = 0; i < u.length; i++) {
		re += u[i].re * v[i].re + u[i].im * v[i].im
		im += u[i].im * v[i].re - u[i].re * v[i].im
	}
	return { re, im }
}

function normSquared(v) {
	let sum = 0
	for (let i = 0; i < v.length; i++) {
		sum += v[i].re * v[i].re + v[i].im * v[i].im
	}
	return sum
}

/**
 * Independent reference 1: rank-1 projection matrix P = (v * v^H) / ||v||^2,
 * returning P * u via explicit matrix construction and matrix-vector multiply.
 */
function projectionViaMatrix(u, v) {
	const n = v.length
	const denom = normSquared(v)
	const P = Array.from({ length: n }, (_, r) =>
		Array.from({ length: n }, (_, c) => {
			const prod = complexMul(v[r], complexConj(v[c]))
			return { re: prod.re / denom, im: prod.im / denom }
		})
	)

	return Array.from({ length: n }, (_, r) => {
		let re = 0
		let im = 0
		for (let c = 0; c < n; c++) {
			const term = complexMul(P[r][c], u[c])
			re += term.re
			im += term.im
		}
		return { re, im }
	})
}

/**
 * Independent reference 2: real-space R^(2n) projection onto the 2D real subspace
 * spanned by orthogonal real vectors v_hat = (Re v, Im v) and iv_hat = (-Im v, Re v).
 */
function projectionViaRealEmbedding(u, v) {
	const n = v.length
	const uReal = new Array(2 * n)
	const vReal = new Array(2 * n)
	const ivReal = new Array(2 * n)
	for (let i = 0; i < n; i++) {
		uReal[2 * i] = u[i].re
		uReal[2 * i + 1] = u[i].im
		vReal[2 * i] = v[i].re
		vReal[2 * i + 1] = v[i].im
		ivReal[2 * i] = -v[i].im
		ivReal[2 * i + 1] = v[i].re
	}

	let dotV = 0
	let dotIV = 0
	let normSq = 0
	for (let i = 0; i < 2 * n; i++) {
		dotV += uReal[i] * vReal[i]
		dotIV += uReal[i] * ivReal[i]
		normSq += vReal[i] * vReal[i]
	}

	const a = dotV / normSq
	const b = dotIV / normSq
	const out = new Array(n)
	for (let i = 0; i < n; i++) {
		out[i] = {
			re: a * vReal[2 * i] + b * ivReal[2 * i],
			im: a * vReal[2 * i + 1] + b * ivReal[2 * i + 1],
		}
	}
	return out
}

describe('projectionComplexIterative', () => {
	test('projects purely real vectors identically to real vector projection', () => {
		const u = [
			{ re: 3, im: 0 },
			{ re: 4, im: 0 },
		]
		const v = [
			{ re: 1, im: 0 },
			{ re: 0, im: 0 },
		]
		const result = projectionComplexIterative(u, v)
		assert.deepStrictEqual(result, [
			{ re: 3, im: 0 },
			{ re: 0, im: 0 },
		])
	})

	test('projects general complex 2D vectors accurately', () => {
		// u = [1 + i, 2 - i], v = [1, i]
		// <u, v> = (1 + i)(1) + (2 - i)(-i) = (1 + i) + (-1 - 2i) = -i
		// <v, v> = 1 + 1 = 2
		// scale = -0.5i
		// proj_v(u) = -0.5i * [1, i] = [-0.5i, 0.5]
		const u = [
			{ re: 1, im: 1 },
			{ re: 2, im: -1 },
		]
		const v = [
			{ re: 1, im: 0 },
			{ re: 0, im: 1 },
		]
		const result = projectionComplexIterative(u, v)
		assertVectorClose(result, [
			{ re: 0, im: -0.5 },
			{ re: 0.5, im: 0 },
		])
	})

	test('projects 1D complex vector onto any nonzero 1D complex vector as identity', () => {
		const u = [{ re: -3.5, im: 2.25 }]
		const v = [{ re: 0.7, im: -1.4 }]
		const result = projectionComplexIterative(u, v)
		assertVectorClose(result, u)
	})

	test('returns zero vector when u is zero vector', () => {
		const u = [
			{ re: 0, im: 0 },
			{ re: 0, im: 0 },
			{ re: 0, im: 0 },
		]
		const v = [
			{ re: 1, im: -2 },
			{ re: 3, im: 4 },
			{ re: -5, im: 0 },
		]
		const result = projectionComplexIterative(u, v)
		assert.deepStrictEqual(result, [
			{ re: 0, im: 0 },
			{ re: 0, im: 0 },
			{ re: 0, im: 0 },
		])
		// Ensure no -0 entries
		for (const c of result) {
			assert.ok(!Object.is(c.re, -0))
			assert.ok(!Object.is(c.im, -0))
		}
	})

	test('returns zero vector when u is orthogonal to v under Hermitian inner product', () => {
		// v = [1, i], u = [1, -i] => <u, v> = 1*1 + (-i)(-i) = 1 - 1 = 0
		const u = [
			{ re: 1, im: 0 },
			{ re: 0, im: -1 },
		]
		const v = [
			{ re: 1, im: 0 },
			{ re: 0, im: 1 },
		]
		const result = projectionComplexIterative(u, v)
		assertVectorClose(result, [
			{ re: 0, im: 0 },
			{ re: 0, im: 0 },
		])
	})

	test('returns u unchanged when u is a complex scalar multiple of v', () => {
		const v = [
			{ re: 2, im: -1 },
			{ re: 0, im: 3 },
			{ re: -1, im: 1 },
		]
		const alpha = { re: -1.5, im: 2.5 }
		const u = v.map((vi) => complexMul(alpha, vi))
		const result = projectionComplexIterative(u, v)
		assertVectorClose(result, u)
	})

	test('does not mutate input vectors or their elements', () => {
		const u = [
			{ re: 1, im: 2 },
			{ re: 3, im: -4 },
		]
		const v = [
			{ re: -2, im: 1 },
			{ re: 0, im: 5 },
		]
		const uSnap = structuredClone(u)
		const vSnap = structuredClone(v)

		const result = projectionComplexIterative(u, v)
		assert.deepStrictEqual(u, uSnap)
		assert.deepStrictEqual(v, vSnap)
		assert.notEqual(result, u)
		assert.notEqual(result, v)
		assert.notEqual(result[0], u[0])
		assert.notEqual(result[0], v[0])
	})

	test('satisfies algebraic properties: orthogonality, Pythagoras, idempotency, linearity, scale invariance', () => {
		const u1 = [
			{ re: 2.5, im: -1.3 },
			{ re: -0.7, im: 4.1 },
			{ re: 3.2, im: 0.9 },
			{ re: -1.8, im: -2.4 },
		]
		const u2 = [
			{ re: -0.5, im: 2.2 },
			{ re: 1.9, im: -3.1 },
			{ re: 0.4, im: 1.7 },
			{ re: 2.8, im: -0.6 },
		]
		const v = [
			{ re: 1.1, im: 0.8 },
			{ re: -2.3, im: 1.5 },
			{ re: 0.6, im: -1.9 },
			{ re: 3.0, im: 0.2 },
		]

		const p = projectionComplexIterative(u1, v)
		const r = u1.map((ui, i) => ({ re: ui.re - p[i].re, im: ui.im - p[i].im }))

		// 1. Residual orthogonal to v: <u - p, v> = 0
		assertComplexClose(hermitianInnerProduct(r, v), { re: 0, im: 0 })

		// 2. Pythagorean theorem: ||u||^2 = ||p||^2 + ||r||^2
		assert.ok(Math.abs(normSquared(u1) - (normSquared(p) + normSquared(r))) <= EPS)

		// 3. Idempotency: proj_v(proj_v(u)) = proj_v(u)
		const pp = projectionComplexIterative(p, v)
		assertVectorClose(pp, p)

		// 4. Complex linearity in u: proj_v(a*u1 + b*u2) = a*proj_v(u1) + b*proj_v(u2)
		const a = { re: 1.5, im: -0.75 }
		const b = { re: -0.4, im: 2.1 }
		const combined = u1.map((c1, i) => {
			const t1 = complexMul(a, c1)
			const t2 = complexMul(b, u2[i])
			return { re: t1.re + t2.re, im: t1.im + t2.im }
		})
		const p1 = projectionComplexIterative(u1, v)
		const p2 = projectionComplexIterative(u2, v)
		const expectedLinear = p1.map((c1, i) => {
			const t1 = complexMul(a, c1)
			const t2 = complexMul(b, p2[i])
			return { re: t1.re + t2.re, im: t1.im + t2.im }
		})
		assertVectorClose(projectionComplexIterative(combined, v), expectedLinear)

		// 5. Invariance under nonzero complex scaling of v: proj_(c*v)(u) = proj_v(u)
		const c = { re: -2.7, im: 3.4 }
		const cv = v.map((vi) => complexMul(c, vi))
		assertVectorClose(projectionComplexIterative(u1, cv), p)
	})

	test('independent cross-checks: rank-1 projection matrix and R^(2n) real embedding', () => {
		const cases = [
			{
				u: [
					{ re: 1, im: 2 },
					{ re: -3, im: 4 },
					{ re: 5, im: -6 },
				],
				v: [
					{ re: 0, im: 1 },
					{ re: 2, im: -1 },
					{ re: -1, im: 3 },
				],
			},
			{
				u: [
					{ re: 0.125, im: -0.75 },
					{ re: 2.5, im: 1.25 },
					{ re: -4.0, im: 0.5 },
					{ re: 3.125, im: -2.875 },
					{ re: -1.5, im: -0.25 },
				],
				v: [
					{ re: -0.5, im: 0.5 },
					{ re: 1.0, im: -2.0 },
					{ re: 0.25, im: 1.75 },
					{ re: -3.0, im: -0.5 },
					{ re: 2.25, im: 1.0 },
				],
			},
		]

		for (const { u, v } of cases) {
			const actual = projectionComplexIterative(u, v)
			const fromMatrix = projectionViaMatrix(u, v)
			const fromReal = projectionViaRealEmbedding(u, v)

			assertVectorClose(actual, fromMatrix, EPS, 'matrix cross-check')
			assertVectorClose(actual, fromReal, EPS, 'real-embedding cross-check')
		}
	})

	test('rejects invalid inputs with appropriate errors', () => {
		const valid = [{ re: 1, im: 0 }]

		// Non-array inputs
		assert.throws(() => projectionComplexIterative(null, valid), TypeError)
		assert.throws(() => projectionComplexIterative(valid, 'not-array'), TypeError)
		assert.throws(() => projectionComplexIterative({}, valid), TypeError)
		assert.throws(() => projectionComplexIterative(valid, undefined), TypeError)

		// Empty vectors and mismatched lengths
		assert.throws(() => projectionComplexIterative([], []), RangeError)
		assert.throws(
			() =>
				projectionComplexIterative(
					[{ re: 1, im: 0 }],
					[
						{ re: 1, im: 0 },
						{ re: 2, im: 0 },
					]
				),
			RangeError
		)

		// Invalid complex element shapes or types
		assert.throws(() => projectionComplexIterative([null], valid), TypeError)
		assert.throws(() => projectionComplexIterative(valid, [42]), TypeError)
		assert.throws(() => projectionComplexIterative([{ re: 1 }], valid), TypeError)
		assert.throws(() => projectionComplexIterative(valid, [{ re: '1', im: 0 }]), TypeError)

		// Non-finite components
		assert.throws(() => projectionComplexIterative([{ re: NaN, im: 0 }], valid), RangeError)
		assert.throws(() => projectionComplexIterative(valid, [{ re: 0, im: Infinity }]), RangeError)
		assert.throws(() => projectionComplexIterative([{ re: -Infinity, im: 1 }], valid), RangeError)

		// Zero target vector
		assert.throws(
			() =>
				projectionComplexIterative(
					[
						{ re: 1, im: 2 },
						{ re: 3, im: 4 },
					],
					[
						{ re: 0, im: 0 },
						{ re: 0, im: 0 },
					]
				),
			RangeError
		)

		// Intermediate overflow
		assert.throws(
			() =>
				projectionComplexIterative(
					[{ re: 1, im: 0 }],
					[{ re: 1e200, im: 0 }]
				),
			RangeError
		)
	})
})
