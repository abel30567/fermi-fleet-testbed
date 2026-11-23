import { describe, test } from 'node:test'
import assert from 'node:assert'
import { curlFloatRecursive } from './curlFloatRecursive.js'

/**
 * Assert two 3D vectors are within `tol` in every component.
 * @param {number[]} actual
 * @param {number[]} expected
 * @param {number} [tol=1e-10]
 */
function assertVecClose(actual, expected, tol = 1e-10) {
	assert.equal(actual.length, 3, `expected length 3, got ${actual.length}`)
	for (let i = 0; i < 3; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		assert.ok(
			Number.isFinite(actual[i]) && diff <= tol,
			`component[${i}]: expected ${expected[i]} ± ${tol}, got ${actual[i]} (diff=${diff})`,
		)
	}
}

/**
 * Independent 4th-order central-difference numerical gradient of a scalar field.
 * @param {(p: [number, number, number]) => number} scalarField
 * @param {[number, number, number]} p
 * @param {number} [h=1e-4]
 * @returns {[number, number, number]}
 */
function numericalGrad(scalarField, p, h = 1e-4) {
	const [x, y, z] = p
	const d = (f) => (-f(2 * h) + 8 * f(h) - 8 * f(-h) + f(-2 * h)) / (12 * h)
	return [
		d((t) => scalarField([x + t, y, z])),
		d((t) => scalarField([x, y + t, z])),
		d((t) => scalarField([x, y, z + t])),
	]
}

/**
 * Independent 4th-order central-difference numerical divergence of a vector field.
 * @param {(p: [number, number, number]) => [number, number, number]} vectorField
 * @param {[number, number, number]} p
 * @param {number} [h=1e-3]
 * @returns {number}
 */
function numericalDiv(vectorField, p, h = 1e-3) {
	const [x, y, z] = p
	const dAxis = (axis, evalAt) =>
		(-evalAt(2 * h)[axis] +
			8 * evalAt(h)[axis] -
			8 * evalAt(-h)[axis] +
			evalAt(-2 * h)[axis]) /
		(12 * h)
	return (
		dAxis(0, (t) => vectorField([x + t, y, z])) +
		dAxis(1, (t) => vectorField([x, y + t, z])) +
		dAxis(2, (t) => vectorField([x, y, z + t]))
	)
}

describe('curlFloatRecursive — conservative and irrotational fields', () => {
	test('constant field has zero curl', () => {
		const F = () => [3.5, -7.25, 11.125]
		const curl = curlFloatRecursive(F, [1.2, -3.4, 5.6])
		assertVecClose(curl, [0, 0, 0], 1e-14)
	})

	test('radial linear field F(r) = r has zero curl', () => {
		const F = ([x, y, z]) => [x, y, z]
		assertVecClose(curlFloatRecursive(F, [2.5, -1.5, 4.0]), [0, 0, 0], 1e-14)
	})

	test('polynomial conservative field grad(x^2*y + y^2*z + z^2*x) has zero curl', () => {
		const F = ([x, y, z]) => [2 * x * y + z * z, x * x + 2 * y * z, y * y + 2 * z * x]
		assertVecClose(curlFloatRecursive(F, [1.3, -2.1, 0.7]), [0, 0, 0], 1e-11)
	})

	test('inverse-square central force field F(r) = r / |r|^3 has zero curl away from origin', () => {
		const F = ([x, y, z]) => {
			const r3 = Math.hypot(x, y, z) ** 3
			return [x / r3, y / r3, z / r3]
		}
		assertVecClose(curlFloatRecursive(F, [1.5, -2.0, 0.75]), [0, 0, 0], 1e-11)
	})
})

describe('curlFloatRecursive — rotational fields', () => {
	test('planar vortex F = [-y, x, 0] has curl [0, 0, 2]', () => {
		const F = ([x, y]) => [-y, x, 0]
		assertVecClose(curlFloatRecursive(F, [3.1, -4.2, 5.3]), [0, 0, 2], 1e-12)
	})

	test('rigid-body rotation F = omega x r has curl 2 * omega', () => {
		const omega = [2.25, -3.5, 5.75]
		const F = ([x, y, z]) => [
			omega[1] * z - omega[2] * y,
			omega[2] * x - omega[0] * z,
			omega[0] * y - omega[1] * x,
		]
		const expected = [2 * omega[0], 2 * omega[1], 2 * omega[2]]
		assertVecClose(curlFloatRecursive(F, [-1.7, 0.9, 2.3]), expected, 1e-12)
	})

	test('cyclic shear fields F = [z, x, y] and G = [y, z, x] have curls [1, 1, 1] and [-1, -1, -1]', () => {
		const F = ([x, y, z]) => [z, x, y]
		const G = ([x, y, z]) => [y, z, x]
		assertVecClose(curlFloatRecursive(F, [0.5, -0.5, 1.5]), [1, 1, 1], 1e-12)
		assertVecClose(curlFloatRecursive(G, [0.5, -0.5, 1.5]), [-1, -1, -1], 1e-12)
	})
})

describe('curlFloatRecursive — nonlinear fields and analytic cross-checks', () => {
	test('cubic polynomial field matches exact analytic curl', () => {
		// F = [x^2 y z, y^2 z x, z^2 x y]
		const F = ([x, y, z]) => [x * x * y * z, y * y * z * x, z * z * x * y]
		const analyticCurl = ([x, y, z]) => [
			x * (z * z - y * y),
			y * (x * x - z * z),
			z * (y * y - x * x),
		]

		const points = [
			[1.2, -0.8, 2.3],
			[-2.5, 1.7, -0.4],
			[0, 3.1, -2.2],
		]
		for (const p of points) {
			assertVecClose(curlFloatRecursive(F, p), analyticCurl(p), 1e-10)
		}
	})

	test('transcendental field [sin(y*z), exp(x*z), cos(x*y)] matches analytic curl on grid', () => {
		const F = ([x, y, z]) => [Math.sin(y * z), Math.exp(x * z), Math.cos(x * y)]
		const analyticCurl = ([x, y, z]) => [
			-x * Math.sin(x * y) - x * Math.exp(x * z),
			y * Math.cos(y * z) + y * Math.sin(x * y),
			z * Math.exp(x * z) - z * Math.cos(y * z),
		]

		const points = [
			[0, 0, 0],
			[0.7, -1.1, 0.5],
			[-1.2, 0.9, -0.6],
			[1.4, 0.3, -0.8],
		]
		for (const p of points) {
			assertVecClose(curlFloatRecursive(F, p), analyticCurl(p), 1e-10)
		}
	})
})

describe('curlFloatRecursive — vector calculus identities', () => {
	test('identity: curl(grad f) = 0 for smooth nonlinear scalar potential', () => {
		const f = ([x, y, z]) =>
			Math.sin(x * y) + Math.exp(0.5 * z) * Math.cos(x) + x * y * y * z * z * z

		// Cross-check with both analytic gradient and independent numerical gradient
		const analyticGrad = ([x, y, z]) => [
			y * Math.cos(x * y) - Math.exp(0.5 * z) * Math.sin(x) + y * y * z * z * z,
			x * Math.cos(x * y) + 2 * x * y * z * z * z,
			0.5 * Math.exp(0.5 * z) * Math.cos(x) + 3 * x * y * y * z * z,
		]
		const numericGradField = (p) => numericalGrad(f, p, 1e-4)

		const points = [
			[0.6, -0.9, 1.1],
			[-1.3, 0.7, -0.5],
		]
		for (const p of points) {
			assertVecClose(curlFloatRecursive(analyticGrad, p), [0, 0, 0], 1e-10)
			assertVecClose(curlFloatRecursive(numericGradField, p), [0, 0, 0], 1e-7)
		}
	})

	test('identity: div(curl F) = 0 for smooth nonlinear vector field', () => {
		const F = ([x, y, z]) => [
			Math.exp(0.3 * x * y) * Math.sin(z),
			Math.cos(y * z) + x * x * x * z,
			Math.sin(x * z) + y * y * Math.exp(0.2 * x),
		]
		const curlField = (p) => curlFloatRecursive(F, p)

		const points = [
			[0.5, -0.7, 1.2],
			[-0.9, 1.1, -0.4],
		]
		for (const p of points) {
			const divCurl = numericalDiv(curlField, p, 1e-3)
			assert.ok(
				Math.abs(divCurl) < 1e-7,
				`expected div(curl F) ≈ 0 at ${JSON.stringify(p)}, got ${divCurl}`,
			)
		}
	})

	test('identity: product rule curl(f * F) = (grad f) x F + f * curl(F)', () => {
		const f = ([x, y, z]) => Math.exp(0.2 * x) * (1 + y * y + Math.sin(z))
		const gradF = ([x, y, z]) => [
			0.2 * Math.exp(0.2 * x) * (1 + y * y + Math.sin(z)),
			Math.exp(0.2 * x) * 2 * y,
			Math.exp(0.2 * x) * Math.cos(z),
		]
		const F = ([x, y, z]) => [y * z, Math.sin(x) + z * z, x * y]
		const scaledField = (p) => {
			const s = f(p)
			const v = F(p)
			return [s * v[0], s * v[1], s * v[2]]
		}

		const p = [0.8, -1.2, 0.6]
		const lhs = curlFloatRecursive(scaledField, p)
		const g = gradF(p)
		const v = F(p)
		const s = f(p)
		const cF = curlFloatRecursive(F, p)
		const rhs = [
			g[1] * v[2] - g[2] * v[1] + s * cF[0],
			g[2] * v[0] - g[0] * v[2] + s * cF[1],
			g[0] * v[1] - g[1] * v[0] + s * cF[2],
		]
		assertVecClose(lhs, rhs, 1e-10)
	})
})

describe('curlFloatRecursive — edge cases, options, and validation', () => {
	test('normalizes -0 to +0 and does not mutate input point', () => {
		const F = () => [0, 0, 0]
		const point = [0, 0, 0]
		const result = curlFloatRecursive(F, point)
		assert.deepStrictEqual(point, [0, 0, 0])
		for (const comp of result) {
			assert.ok(Object.is(comp, 0), `expected +0, got ${comp}`)
		}
	})

	test('supports Float64Array point and Float64Array field return values', () => {
		const F = ([x, y, z]) => new Float64Array([-y, x, z * z])
		const point = new Float64Array([1.5, -2.5, 3.5])
		assertVecClose(curlFloatRecursive(F, point), [0, 0, 2], 1e-12)
	})

	test('handles large coordinate magnitudes via adaptive step scaling', () => {
		const F = ([x, y, z]) => [-3 * y + z, 2 * x - 4 * z, 5 * x + y]
		// curl = [1 - (-4), 1 - 5, 2 - (-3)] = [5, -4, 5]
		assertVecClose(curlFloatRecursive(F, [1e6, -1e6, 5e5]), [5, -4, 5], 1e-8)
	})

	test('respects custom step, maxDepth, and tolerance options', () => {
		const F = ([x, y, z]) => [Math.sin(y), Math.cos(z), Math.exp(x)]
		// curl = [0 - (-sin(z)), 0 - exp(x), 0 - cos(y)] = [sin(z), -exp(x), -cos(y)]
		const p = [0.4, 0.7, 1.1]
		const expected = [Math.sin(1.1), -Math.exp(0.4), -Math.cos(0.7)]

		// maxDepth: 0 (single central difference)
		assertVecClose(
			curlFloatRecursive(F, p, { step: 1e-4, maxDepth: 0 }),
			expected,
			1e-7,
		)
		// recursive Richardson refinement improves accuracy substantially
		assertVecClose(
			curlFloatRecursive(F, p, { step: 1e-2, maxDepth: 5, tolerance: 1e-13 }),
			expected,
			1e-11,
		)
	})

	test('validates field, point, options, and field output', () => {
		const okField = ([x, y, z]) => [x, y, z]

		assert.throws(() => curlFloatRecursive(null, [0, 0, 0]), TypeError)
		assert.throws(() => curlFloatRecursive('not-fn', [0, 0, 0]), TypeError)

		assert.throws(() => curlFloatRecursive(okField, null), TypeError)
		assert.throws(() => curlFloatRecursive(okField, { 0: 1, 1: 2, 2: 3 }), TypeError)
		assert.throws(() => curlFloatRecursive(okField, [1, 2]), RangeError)
		assert.throws(() => curlFloatRecursive(okField, [1, 2, 3, 4]), RangeError)
		assert.throws(() => curlFloatRecursive(okField, ['1', 2, 3]), TypeError)
		assert.throws(() => curlFloatRecursive(okField, [NaN, 0, 0]), RangeError)
		assert.throws(() => curlFloatRecursive(okField, [0, Infinity, 0]), RangeError)

		assert.throws(() => curlFloatRecursive(okField, [0, 0, 0], null), TypeError)
		assert.throws(() => curlFloatRecursive(okField, [0, 0, 0], []), TypeError)
		assert.throws(() => curlFloatRecursive(okField, [0, 0, 0], { step: 0 }), RangeError)
		assert.throws(() => curlFloatRecursive(okField, [0, 0, 0], { step: -1e-3 }), RangeError)
		assert.throws(() => curlFloatRecursive(okField, [0, 0, 0], { step: NaN }), RangeError)
		assert.throws(() => curlFloatRecursive(okField, [0, 0, 0], { maxDepth: -1 }), RangeError)
		assert.throws(() => curlFloatRecursive(okField, [0, 0, 0], { maxDepth: 1.5 }), RangeError)
		assert.throws(() => curlFloatRecursive(okField, [0, 0, 0], { maxDepth: 25 }), RangeError)
		assert.throws(() => curlFloatRecursive(okField, [0, 0, 0], { tolerance: -1 }), RangeError)
		assert.throws(() => curlFloatRecursive(okField, [0, 0, 0], { tolerance: Infinity }), RangeError)

		assert.throws(() => curlFloatRecursive(() => 'bad', [0, 0, 0]), TypeError)
		assert.throws(() => curlFloatRecursive(() => [1, 2], [0, 0, 0]), RangeError)
		assert.throws(() => curlFloatRecursive(() => [1, NaN, 3], [0, 0, 0]), RangeError)
		assert.throws(() => curlFloatRecursive(() => [1, 2, Infinity], [0, 0, 0]), RangeError)

		// Underflowing step relative to coordinate precision
		assert.throws(
			() => curlFloatRecursive(okField, [1, 1, 1], { step: 1e-300 }),
			RangeError,
		)
	})
})
