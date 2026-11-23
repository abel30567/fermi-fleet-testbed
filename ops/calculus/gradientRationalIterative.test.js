import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { gradientRationalIterative } from './gradientRationalIterative.js'

const r = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function norm(q) {
	if (q.num === 0n) return { num: 0n, den: 1n }
	const sign = q.den < 0n ? -1n : 1n
	const num = q.num * sign
	const den = q.den * sign
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

const add = (a, b) => norm({ num: a.num * b.den + b.num * a.den, den: a.den * b.den })
const sub = (a, b) => norm({ num: a.num * b.den - b.num * a.den, den: a.den * b.den })
const mul = (a, b) => norm({ num: a.num * b.num, den: a.den * b.den })
const div = (a, b) => norm({ num: a.num * b.den, den: a.den * b.num })

function dot(u, v) {
	let acc = r(0n, 1n)
	for (let i = 0; i < u.length; i += 1) {
		acc = add(acc, mul(u[i], v[i]))
	}
	return acc
}

function assertLowestTerms(q) {
	assert.equal(typeof q.num, 'bigint')
	assert.equal(typeof q.den, 'bigint')
	assert.ok(q.den > 0n, `expected positive denominator, got ${q.den}`)
	if (q.num === 0n) {
		assert.equal(q.den, 1n)
	} else {
		assert.equal(gcd(q.num, q.den), 1n, `expected lowest terms for ${q.num}/${q.den}`)
	}
}

describe('gradientRationalIterative', () => {
	test('constant function has zero gradient', () => {
		const f = () => r(42n, 7n)
		const grad = gradientRationalIterative(f, [r(1n, 3n), r(-5n, 2n), r(0n, 1n)])
		assert.deepEqual(grad, [r(0n, 1n), r(0n, 1n), r(0n, 1n)])
		for (const component of grad) assertLowestTerms(component)
	})

	test('affine function gradient equals exact coefficient vector', () => {
		// f(x, y, z) = (3/4)x - (5/6)y + (7/2)z + 11/13
		const coeffs = [r(3n, 4n), r(-5n, 6n), r(7n, 2n)]
		const bias = r(11n, 13n)
		const f = (pt) => add(dot(coeffs, pt), bias)

		const grad = gradientRationalIterative(f, [r(-2n, 5n), r(9n, 7n), r(4n, 3n)], r(1n, 3n))
		assert.deepEqual(grad, coeffs)
		for (const component of grad) assertLowestTerms(component)
	})

	test('cross-check: quadratic form gradient matches exact analytical gradient identically', () => {
		// f(x, y, z) = 2x^2 - (3/2)xy + (5/3)y^2 + (1/4)yz - (7/5)z^2 + (2/3)x - y + 9
		// Analytical gradient:
		// df/dx = 4x - (3/2)y + 2/3
		// df/dy = -(3/2)x + (10/3)y + (1/4)z - 1
		// df/dz = (1/4)y - (14/5)z
		const f = ([x, y, z]) => {
			let acc = r(9n, 1n)
			acc = add(acc, mul(r(2n, 1n), mul(x, x)))
			acc = add(acc, mul(r(-3n, 2n), mul(x, y)))
			acc = add(acc, mul(r(5n, 3n), mul(y, y)))
			acc = add(acc, mul(r(1n, 4n), mul(y, z)))
			acc = add(acc, mul(r(-7n, 5n), mul(z, z)))
			acc = add(acc, mul(r(2n, 3n), x))
			acc = add(acc, mul(r(-1n, 1n), y))
			return acc
		}

		const analyticalGrad = ([x, y, z]) => [
			add(add(mul(r(4n, 1n), x), mul(r(-3n, 2n), y)), r(2n, 3n)),
			add(add(add(mul(r(-3n, 2n), x), mul(r(10n, 3n), y)), mul(r(1n, 4n), z)), r(-1n, 1n)),
			add(mul(r(1n, 4n), y), mul(r(-14n, 5n), z)),
		]

		const points = [
			[r(0n, 1n), r(0n, 1n), r(0n, 1n)],
			[r(1n, 2n), r(-3n, 4n), r(5n, 6n)],
			[r(-7n, 3n), r(11n, 5n), r(-13n, 7n)],
		]

		// Central difference is exact for quadratic polynomials regardless of step size h
		const steps = [r(1n, 1n), r(1n, 1000n), r(3n, 17n)]

		for (const pt of points) {
			const expected = analyticalGrad(pt)
			for (const h of steps) {
				const actual = gradientRationalIterative(f, pt, h)
				assert.deepEqual(actual, expected)
				for (const component of actual) assertLowestTerms(component)
			}
		}
	})

	test('cross-check: directional derivative equals dot(grad(f), v) for quadratic form', () => {
		// f(x, y) = (1/2)(3x^2 + 4xy + 5y^2) - 2x + (1/3)y
		const f = ([x, y]) =>
			add(
				add(
					mul(r(3n, 2n), mul(x, x)),
					add(mul(r(2n, 1n), mul(x, y)), mul(r(5n, 2n), mul(y, y))),
				),
				add(mul(r(-2n, 1n), x), mul(r(1n, 3n), y)),
			)

		const pt = [r(7n, 11n), r(-5n, 13n)]
		const dir = [r(2n, 3n), r(-4n, 5n)]
		const t = r(1n, 7n)

		const grad = gradientRationalIterative(f, pt)
		const fromGrad = dot(grad, dir)

		const ptPlus = [add(pt[0], mul(t, dir[0])), add(pt[1], mul(t, dir[1]))]
		const ptMinus = [sub(pt[0], mul(t, dir[0])), sub(pt[1], mul(t, dir[1]))]
		const directional = div(sub(f(ptPlus), f(ptMinus)), mul(r(2n, 1n), t))

		assert.deepEqual(fromGrad, directional)
		assertLowestTerms(fromGrad)
	})

	test('cross-check: cubic central difference matches exact analytical expansion 3x^2 + h^2', () => {
		// f(x, y) = x^3 - 2y^3
		// Central difference gives [3x^2 + h^2, -2*(3y^2 + h^2)]
		const f = ([x, y]) =>
			sub(mul(mul(x, x), x), mul(r(2n, 1n), mul(mul(y, y), y)))

		const x = r(5n, 3n)
		const y = r(-7n, 4n)
		const h = r(1n, 100n)

		const grad = gradientRationalIterative(f, [x, y], h)
		const h2 = mul(h, h)
		const expected = [
			add(mul(r(3n, 1n), mul(x, x)), h2),
			mul(r(-2n, 1n), add(mul(r(3n, 1n), mul(y, y)), h2)),
		]

		assert.deepEqual(grad, expected)
		for (const component of grad) assertLowestTerms(component)
	})

	test('cross-check: linearity of gradient operator for arbitrary functions', () => {
		const f = ([x, y]) => add(mul(mul(x, x), x), mul(x, y))
		const g = ([x, y]) => sub(mul(y, mul(y, y)), mul(r(4n, 3n), x))
		const alpha = r(5n, 7n)
		const beta = r(-11n, 6n)
		const combined = (pt) => add(mul(alpha, f(pt)), mul(beta, g(pt)))

		const pt = [r(2n, 3n), r(-1n, 5n)]
		const h = r(1n, 50n)

		const gradF = gradientRationalIterative(f, pt, h)
		const gradG = gradientRationalIterative(g, pt, h)
		const gradCombined = gradientRationalIterative(combined, pt, h)

		const expected = [
			add(mul(alpha, gradF[0]), mul(beta, gradG[0])),
			add(mul(alpha, gradF[1]), mul(beta, gradG[1])),
		]
		assert.deepEqual(gradCombined, expected)
	})

	test('edge cases: 0D point, 1D point, stationary point, and default step h', () => {
		assert.deepEqual(
			gradientRationalIterative(() => r(1n, 1n), []),
			[],
		)

		// 1D: f(x) = (x - 3/2)^2, stationary point at x = 3/2
		const f1 = ([x]) => {
			const d = sub(x, r(3n, 2n))
			return mul(d, d)
		}
		assert.deepEqual(gradientRationalIterative(f1, [r(3n, 2n)]), [r(0n, 1n)])
		assert.deepEqual(gradientRationalIterative(f1, [r(5n, 2n)]), [r(2n, 1n)])
	})

	test('normalizes unreduced inputs, negative denominators, and unreduced f outputs', () => {
		// f(x, y) = x + y returned unnormalized with negative denominator
		const f = ([x, y]) => {
			const s = add(x, y)
			return { num: -6n * s.num, den: -6n * s.den }
		}

		const point = [
			{ num: -6n, den: -9n }, // 2/3
			{ num: 4n, den: -8n }, // -1/2
		]
		const h = { num: -2n, den: -6n } // +1/3

		const grad = gradientRationalIterative(f, point, h)
		assert.deepEqual(grad, [r(1n, 1n), r(1n, 1n)])
		for (const component of grad) assertLowestTerms(component)
	})

	test('handles very large BigInt rationals without precision loss', () => {
		// f(x, y) = x^2 + y^2 at huge coordinates where float64 loses all precision
		const big = 10n ** 30n
		const f = ([x, y]) => add(mul(x, x), mul(y, y))
		const pt = [r(big + 1n, 3n), r(-big - 2n, 5n)]
		const h = r(1n, 10n ** 20n)

		const grad = gradientRationalIterative(f, pt, h)
		const expected = [
			norm({ num: 2n * (big + 1n), den: 3n }),
			norm({ num: 2n * (-big - 2n), den: 5n }),
		]
		assert.deepEqual(grad, expected)
		for (const component of grad) assertLowestTerms(component)
	})

	test('does not mutate input point array or its elements', () => {
		const p0 = { num: 2n, den: 4n }
		const p1 = { num: -3n, den: 6n }
		const point = [p0, p1]

		// Even if f mutates the array it receives, caller's point remains untouched
		const f = (pt) => {
			const val = add(pt[0], pt[1])
			pt[0] = r(999n, 1n)
			return val
		}

		const grad = gradientRationalIterative(f, point, r(1n, 10n))
		assert.deepEqual(grad, [r(1n, 1n), r(1n, 1n)])
		assert.strictEqual(point[0], p0)
		assert.strictEqual(point[1], p1)
		assert.deepEqual(p0, { num: 2n, den: 4n })
		assert.deepEqual(p1, { num: -3n, den: 6n })
	})

	test('input validation errors', () => {
		const validF = ([x]) => x
		const validPt = [r(1n, 1n)]

		assert.throws(() => gradientRationalIterative(null, validPt), TypeError)
		assert.throws(() => gradientRationalIterative(validF, 'not-an-array'), TypeError)
		assert.throws(() => gradientRationalIterative(validF, [null]), TypeError)
		assert.throws(() => gradientRationalIterative(validF, [{ num: 1, den: 2n }]), TypeError)
		assert.throws(() => gradientRationalIterative(validF, [{ num: 1n, den: 0n }]), RangeError)

		assert.throws(() => gradientRationalIterative(validF, validPt, null), TypeError)
		assert.throws(() => gradientRationalIterative(validF, validPt, { num: 1, den: 2 }), TypeError)
		assert.throws(() => gradientRationalIterative(validF, validPt, r(1n, 0n)), RangeError)
		assert.throws(() => gradientRationalIterative(validF, validPt, r(0n, 1n)), RangeError)
		assert.throws(() => gradientRationalIterative(validF, validPt, r(-1n, 10n)), RangeError)
		assert.throws(() => gradientRationalIterative(validF, validPt, { num: 1n, den: -10n }), RangeError)

		assert.throws(() => gradientRationalIterative(() => null, validPt), TypeError)
		assert.throws(() => gradientRationalIterative(() => ({ num: 1n, den: 0n }), validPt), RangeError)
	})
})
