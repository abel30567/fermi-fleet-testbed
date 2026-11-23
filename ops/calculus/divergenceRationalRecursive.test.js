import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divergenceRationalRecursive } from './divergenceRationalRecursive.js'

const Q = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

const qAdd = (a, b) => ({
	num: a.num * b.den + b.num * a.den,
	den: a.den * b.den,
})
const qSub = (a, b) => ({
	num: a.num * b.den - b.num * a.den,
	den: a.den * b.den,
})
const qMul = (a, b) => ({ num: a.num * b.num, den: a.den * b.den })

/**
 * Independent iterative reference implementation (no recursion, iterative GCD)
 * for cross-checking exact rational results.
 */
function iterativeDivergenceReference(components, point, step) {
	const iterGcd = (a, b) => {
		let x = a < 0n ? -a : a
		let y = b < 0n ? -b : b
		while (y !== 0n) {
			const t = x % y
			x = y
			y = t
		}
		return x
	}
	const norm = (r) => {
		if (r.num === 0n) return { num: 0n, den: 1n }
		const num = r.den < 0n ? -r.num : r.num
		const den = r.den < 0n ? -r.den : r.den
		const g = iterGcd(num, den)
		return { num: num / g, den: den / g }
	}
	let total = { num: 0n, den: 1n }
	const twoH = norm({ num: 2n * step.num, den: step.den })
	for (let i = 0; i < components.length; i++) {
		const pPlus = point.map((p, j) => (j === i ? norm(qAdd(p, step)) : norm(p)))
		const pMinus = point.map((p, j) =>
			j === i ? norm(qSub(p, step)) : norm(p),
		)
		const diff = norm(qSub(norm(components[i](pPlus)), norm(components[i](pMinus))))
		const partial = norm({ num: diff.num * twoH.den, den: diff.den * twoH.num })
		total = norm(qAdd(total, partial))
	}
	return total
}

describe('divergenceRationalRecursive', () => {
	test('constant vector field has zero divergence', () => {
		const field = [() => Q(7n, 3n), () => Q(-5n, 11n), () => Q(42n, 1n)]
		const res = divergenceRationalRecursive(field, [Q(1n), Q(2n), Q(3n)])
		assert.deepEqual(res, { num: 0n, den: 1n })
	})

	test('1D scalar derivative (base case of recursion)', () => {
		// F(x) = (5/3) x^2 - (2/7) x + 1 => F'(x) = (10/3) x - 2/7
		// At x = 3/5: F'(3/5) = 2 - 2/7 = 12/7
		const field = [
			([x]) =>
				qAdd(
					qSub(qMul(Q(5n, 3n), qMul(x, x)), qMul(Q(2n, 7n), x)),
					Q(1n),
				),
		]
		const res = divergenceRationalRecursive(field, [Q(3n, 5n)], Q(1n, 10n))
		assert.deepEqual(res, { num: 12n, den: 7n })
	})

	test('linear 3D vector field equals exact trace of Jacobian matrix', () => {
		// F(x, y, z) = (2x/3 + 5y - z, -x + y/4 + 2z, 3x - 7y + 5z/6)
		// Analytic divergence = 2/3 + 1/4 + 5/6 = 8/12 + 3/12 + 10/12 = 21/12 = 7/4
		const field = [
			([x, y, z]) => qSub(qAdd(qMul(Q(2n, 3n), x), qMul(Q(5n), y)), z),
			([x, y, z]) =>
				qAdd(qSub(qMul(Q(1n, 4n), y), x), qMul(Q(2n), z)),
			([x, y, z]) =>
				qAdd(qSub(qMul(Q(3n), x), qMul(Q(7n), y)), qMul(Q(5n, 6n), z)),
		]
		const pt = [Q(-11n, 7n), Q(13n, 5n), Q(17n, 9n)]
		const res = divergenceRationalRecursive(field, pt, Q(1n, 7n))
		assert.deepEqual(res, { num: 7n, den: 4n })
	})

	test('quadratic 3D vector field matches exact analytic divergence regardless of step size', () => {
		// F(x, y, z) = (x^2 + y*z, 3*x*y - y^2, z^2/2 + x*z)
		// Analytic div(F) = 2x + (3x - 2y) + (z + x) = 6x - 2y + z
		// At (1/2, -3/4, 5/6): 3 + 3/2 + 5/6 = 18/6 + 9/6 + 5/6 = 32/6 = 16/3
		const field = [
			([x, y, z]) => qAdd(qMul(x, x), qMul(y, z)),
			([x, y]) => qSub(qMul(Q(3n), qMul(x, y)), qMul(y, y)),
			([x, , z]) => qAdd(qMul(Q(1n, 2n), qMul(z, z)), qMul(x, z)),
		]
		const pt = [Q(1n, 2n), Q(-3n, 4n), Q(5n, 6n)]
		const r1 = divergenceRationalRecursive(field, pt, Q(1n, 100n))
		const r2 = divergenceRationalRecursive(field, pt, Q(7n, 3n))
		assert.deepEqual(r1, { num: 16n, den: 3n })
		assert.deepEqual(r2, { num: 16n, den: 3n })
	})

	test('solenoidal (divergence-free) 2D rotational and 3D curl fields yield exact 0/1', () => {
		// 2D rotation F(x, y) = (-y, x) => div = 0
		const rot2d = [([, y]) => ({ num: -y.num, den: y.den }), ([x]) => x]
		assert.deepEqual(
			divergenceRationalRecursive(rot2d, [Q(19n, 23n), Q(-31n, 37n)]),
			{ num: 0n, den: 1n },
		)

		// 3D curl of A = (y*z, z*x, x*y) => curl(A) = (x - x, y - y, z - z); use A = (x*y^2, y*z^2, z*x^2)
		// curl(A) = (-2yz, -2zx, -2xy) which is quadratic, so central difference is exact => div = 0
		const curlA = [
			([, y, z]) => qMul(Q(-2n), qMul(y, z)),
			([x, , z]) => qMul(Q(-2n), qMul(z, x)),
			([x, y]) => qMul(Q(-2n), qMul(x, y)),
		]
		assert.deepEqual(
			divergenceRationalRecursive(curlA, [Q(3n, 7n), Q(-5n, 11n), Q(13n, 17n)]),
			{ num: 0n, den: 1n },
		)
	})

	test('cubic field has exact central-difference truncation term h^2', () => {
		// F(x) = (x^3): central diff is ((x+h)^3 - (x-h)^3)/(2h) = 3x^2 + h^2
		// At x = 2/3, h = 1/5: 3*(4/9) + 1/25 = 4/3 + 1/25 = 103/75
		const field = [([x]) => qMul(x, qMul(x, x))]
		const res = divergenceRationalRecursive(field, [Q(2n, 3n)], Q(1n, 5n))
		assert.deepEqual(res, { num: 103n, den: 75n })
	})

	test('normalizes unreduced and negative-denominator inputs and outputs', () => {
		// Components deliberately return unreduced fractions with negative denominators
		const field = [
			([x]) => ({ num: -4n * x.num, den: -2n * x.den }), // 2x
			([, y]) => ({ num: 6n * y.num, den: -4n * y.den }), // -3y/2
		]
		// div = 2 - 3/2 = 1/2
		const pt = [
			{ num: -6n, den: -9n },
			{ num: 10n, den: -15n },
		]
		const step = { num: -2n, den: -6n } // positive 1/3
		const res = divergenceRationalRecursive(field, pt, step)
		assert.deepEqual(res, { num: 1n, den: 2n })
		assert.ok(res.den > 0n)
	})

	test('handles high-dimensional vector field (n = 15) and large BigInts without mutation', () => {
		const n = 15
		// F_i(x) = (1/(i+1)) * x_i => div = sum_{k=1}^{15} 1/k = H_15 = 1195757 / 360360
		const field = Array.from({ length: n }, (_, i) => {
			const k = BigInt(i + 1)
			return (pt) => ({ num: pt[i].num, den: pt[i].den * k })
		})
		const bigBase = 10n ** 30n
		const pt = Array.from({ length: n }, (_, i) =>
			Q(bigBase + BigInt(i), BigInt(i + 2)),
		)
		const snapshot = pt.map((r) => ({ ...r }))

		const res = divergenceRationalRecursive(field, pt, Q(1n, 10n ** 12n))
		assert.deepEqual(res, { num: 1195757n, den: 360360n })
		assert.deepEqual(pt, snapshot)
	})

	test('independent cross-check against iterative reference and linearity identity', () => {
		// Non-quadratic rational/polynomial field in 5D
		const F = [
			([x, y]) => qAdd(qMul(x, qMul(x, x)), qMul(Q(2n, 3n), y)),
			([x, y, z]) => qSub(qMul(y, qMul(y, y)), qMul(x, z)),
			([, , z, w]) => qAdd(qMul(Q(5n, 7n), qMul(z, z)), w),
			([, , , w, u]) => qMul(Q(-3n, 11n), qMul(w, u)),
			([x, , , , u]) => qAdd(qMul(Q(13n, 17n), u), qMul(x, x)),
		]
		const G = [
			([x]) => qMul(Q(4n, 9n), x),
			([, y]) => qMul(Q(-1n, 6n), qMul(y, y)),
			([, , z]) => qMul(Q(7n, 2n), z),
			([, , , w]) => qMul(Q(2n, 5n), qMul(w, w)),
			([, , , , u]) => qMul(Q(-8n, 13n), u),
		]
		const pt = [Q(2n, 5n), Q(-3n, 7n), Q(5n, 11n), Q(-7n, 13n), Q(11n, 17n)]
		const h = Q(1n, 19n)

		// Cross-check recursive implementation against iterative reference
		const recF = divergenceRationalRecursive(F, pt, h)
		const refF = iterativeDivergenceReference(F, pt, h)
		assert.deepEqual(recF, refF)

		const recG = divergenceRationalRecursive(G, pt, h)
		const refG = iterativeDivergenceReference(G, pt, h)
		assert.deepEqual(recG, refG)

		// Linearity cross-check: div(a*F + b*G) == a*div(F) + b*div(G)
		const a = Q(3n, 4n)
		const b = Q(-5n, 6n)
		const combined = F.map(
			(fi, i) => (p) => qAdd(qMul(a, fi(p)), qMul(b, G[i](p))),
		)
		const recCombined = divergenceRationalRecursive(combined, pt, h)
		const expectedCombined = iterativeDivergenceReference(combined, pt, h)
		assert.deepEqual(recCombined, expectedCombined)

		// Verify a*recF + b*recG == recCombined (reduced)
		const lhs = qAdd(qMul(a, recF), qMul(b, recG))
		assert.equal(lhs.num * recCombined.den, recCombined.num * lhs.den)
	})

	test('rejects invalid inputs with appropriate errors', () => {
		const id1 = [([x]) => x]

		assert.throws(() => divergenceRationalRecursive('not-array', [Q(1n)]), TypeError)
		assert.throws(() => divergenceRationalRecursive([], []), RangeError)
		assert.throws(() => divergenceRationalRecursive([42], [Q(1n)]), TypeError)
		assert.throws(() => divergenceRationalRecursive(id1, 'not-array'), TypeError)
		assert.throws(() => divergenceRationalRecursive(id1, [Q(1n), Q(2n)]), RangeError)
		assert.throws(
			() => divergenceRationalRecursive(id1, [{ num: 1, den: 1n }]),
			TypeError,
		)
		assert.throws(
			() => divergenceRationalRecursive(id1, [{ num: 1n, den: 0n }]),
			RangeError,
		)
		assert.throws(
			() => divergenceRationalRecursive(id1, [Q(1n)], { num: 0n, den: 1n }),
			RangeError,
		)
		assert.throws(
			() => divergenceRationalRecursive(id1, [Q(1n)], { num: -1n, den: 5n }),
			RangeError,
		)
		assert.throws(
			() => divergenceRationalRecursive(id1, [Q(1n)], { num: 1n, den: 0n }),
			RangeError,
		)
		assert.throws(
			() => divergenceRationalRecursive(id1, [Q(1n)], null),
			TypeError,
		)
		// Component returning invalid rational or zero denominator
		assert.throws(
			() => divergenceRationalRecursive([() => 123], [Q(1n)]),
			TypeError,
		)
		assert.throws(
			() => divergenceRationalRecursive([() => ({ num: 1n, den: 0n })], [Q(1n)]),
			RangeError,
		)
	})
})
