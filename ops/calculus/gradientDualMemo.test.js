import { describe, test } from 'node:test'
import assert from 'node:assert'
import { gradientDualMemo, DUAL_OPS, createDual } from './gradientDualMemo.js'

/**
 * Independent central finite-difference gradient estimator for numerical
 * cross-checking against forward-mode dual automatic differentiation.
 *
 * @param {function(number[]): number} scalarFn
 * @param {number[]} point
 * @param {number} [h=1e-6]
 * @returns {number[]}
 */
function numericalGradient(scalarFn, point, h = 1e-6) {
	return point.map((_, i) => {
		const plus = point.slice()
		const minus = point.slice()
		plus[i] += h
		minus[i] -= h
		return (scalarFn(plus) - scalarFn(minus)) / (2 * h)
	})
}

function assertClose(actual, expected, tol = 1e-12, label = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected}`
	)
}

function assertArrayClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assertClose(actual[i], expected[i], tol, `index ${i}`)
	}
}

describe('gradientDualMemo - normal cases & analytical derivatives', () => {
	test('computes exact gradient of a multivariate polynomial', () => {
		// f(x, y, z) = 3x^2*y + 2y*z - 5z + 7
		// ∂f/∂x = 6xy, ∂f/∂y = 3x^2 + 2z, ∂f/∂z = 2y - 5
		const poly = ([x, y, z], ops) =>
			ops.add(
				ops.sub(
					ops.add(ops.mul(3, ops.mul(ops.pow(x, 2), y)), ops.mul(2, ops.mul(y, z))),
					ops.mul(5, z)
				),
				7
			)

		const res = gradientDualMemo(poly, [2, -3, 4])
		assertClose(res.value, 3 * 4 * -3 + 2 * -3 * 4 - 5 * 4 + 7)
		assertArrayClose(res.gradient, [6 * 2 * -3, 3 * 4 + 2 * 4, 2 * -3 - 5])
		assert.deepStrictEqual(res.duals, [
			{ v: -73, d: -36 },
			{ v: -73, d: 20 },
			{ v: -73, d: -11 },
		])
	})

	test('computes exact gradient of transcendental composition', () => {
		// f(x, y) = sin(x * y) + exp(x) * log(y) - tanh(y)
		// ∂f/∂x = y*cos(x*y) + exp(x)*log(y)
		// ∂f/∂y = x*cos(x*y) + exp(x)/y - sech^2(y)
		const fn = ([x, y], ops) =>
			ops.sub(
				ops.add(ops.sin(ops.mul(x, y)), ops.mul(ops.exp(x), ops.log(y))),
				ops.tanh(y)
			)

		const x = 0.7
		const y = 2.5
		const res = gradientDualMemo(fn, [x, y])

		const expectedVal = Math.sin(x * y) + Math.exp(x) * Math.log(y) - Math.tanh(y)
		const tanhY = Math.tanh(y)
		const expectedGrad = [
			y * Math.cos(x * y) + Math.exp(x) * Math.log(y),
			x * Math.cos(x * y) + Math.exp(x) / y - (1 - tanhY * tanhY),
		]

		assertClose(res.value, expectedVal, 1e-14)
		assertArrayClose(res.gradient, expectedGrad, 1e-13)
		for (let i = 0; i < 2; i++) {
			assertClose(res.duals[i].v, expectedVal, 1e-14)
			assertClose(res.duals[i].d, expectedGrad[i], 1e-13)
		}
	})

	test('supports all table-driven dual ops (div, sqrt, tan, sigmoid, abs, neg, dual-exponent pow)', () => {
		// f(x, y) = x^y + sqrt(x) / (1 + y^2) + sigmoid(x) + neg(tan(0.2 * y)) + abs(x - 3)
		const fn = ([x, y], ops) =>
			ops.add(
				ops.add(
					ops.add(
						ops.add(ops.pow(x, y), ops.div(ops.sqrt(x), ops.add(1, ops.mul(y, y)))),
						ops.sigmoid(x)
					),
					ops.neg(ops.tan(ops.mul(0.2, y)))
				),
				ops.abs(ops.sub(x, 3))
			)

		const x = 1.8
		const y = 2.2
		const res = gradientDualMemo(fn, [x, y])

		const sig = 1 / (1 + Math.exp(-x))
		const denom = 1 + y * y
		const cos02y = Math.cos(0.2 * y)
		const expectedDx =
			y * x ** (y - 1) +
			(0.5 / Math.sqrt(x)) / denom +
			sig * (1 - sig) -
			1 // abs(x - 3) has x - 3 < 0 so derivative is -1
		const expectedDy =
			x ** y * Math.log(x) +
			(-Math.sqrt(x) * (2 * y)) / (denom * denom) -
			0.2 / (cos02y * cos02y)

		assertArrayClose(res.gradient, [expectedDx, expectedDy], 1e-12)
	})

	test('accepts dual number objects { v, d } directly in point array', () => {
		// f(x, y) = x^2 + 3*y
		const fn = ([x, y], ops) => ops.add(ops.pow(x, 2), ops.mul(3, y))
		const res = gradientDualMemo(fn, [createDual(4, 99), createDual(-2, -5)])
		assert.equal(res.value, 10)
		assert.deepStrictEqual(res.gradient, [8, 3])
	})
})

describe('gradientDualMemo - independent cross-checks', () => {
	test('matches central finite-difference gradient on Rosenbrock function', () => {
		// Rosenbrock: f(x, y) = (1 - x)^2 + 100 * (y - x^2)^2
		const rosenbrockDual = ([x, y], ops) => {
			const t1 = ops.sub(1, x)
			const t2 = ops.sub(y, ops.mul(x, x))
			return ops.add(ops.mul(t1, t1), ops.mul(100, ops.mul(t2, t2)))
		}
		const rosenbrockScalar = ([x, y]) => (1 - x) ** 2 + 100 * (y - x * x) ** 2

		const points = [
			[1, 1], // global minimum where gradient = [0, 0]
			[-1.2, 1.0],
			[0.5, 0.25],
			[2.3, -1.7],
		]

		for (const pt of points) {
			const ad = gradientDualMemo(rosenbrockDual, pt)
			const fd = numericalGradient(rosenbrockScalar, pt, 1e-6)
			assertClose(ad.value, rosenbrockScalar(pt), 1e-12)
			assertArrayClose(ad.gradient, fd, 1e-5)
		}
	})

	test('matches central finite-difference gradient on 4D log-sum-exp (softmax gradient)', () => {
		// f(x) = log(sum_i exp(x_i)), ∂f/∂x_i = exp(x_i) / sum_j exp(x_j)
		const lseDual = (xs, ops) => {
			let acc = ops.const(0)
			for (const xi of xs) {
				acc = ops.add(acc, ops.exp(xi))
			}
			return ops.log(acc)
		}
		const lseScalar = (xs) => Math.log(xs.reduce((s, v) => s + Math.exp(v), 0))

		const pt = [-1.5, 0.2, 2.1, 0.8]
		const ad = gradientDualMemo(lseDual, pt)
		const fd = numericalGradient(lseScalar, pt, 1e-6)

		// Cross-check 1: numerical finite differences
		assertArrayClose(ad.gradient, fd, 1e-6)

		// Cross-check 2: softmax probability simplex invariant (sum of partial derivatives == 1)
		const gradSum = ad.gradient.reduce((a, b) => a + b, 0)
		assertClose(gradSum, 1, 1e-14)
	})

	test('satisfies directional derivative identity ∇f(x) · u == D_u f(x)', () => {
		const fn = ([x, y, z], ops) =>
			ops.add(ops.mul(ops.sin(x), ops.cos(y)), ops.mul(ops.exp(ops.mul(0.5, z)), ops.pow(x, 2)))

		const x = [1.1, -0.6, 0.8]
		const u = [0.3, -1.2, 0.7]
		const { gradient } = gradientDualMemo(fn, x)

		const dotProduct = gradient.reduce((sum, gi, i) => sum + gi * u[i], 0)
		const seededAlongU = x.map((xi, i) => createDual(xi, u[i]))
		const directional = fn(seededAlongU, DUAL_OPS)

		assertClose(dotProduct, directional.d, 1e-13)
	})
})

describe('gradientDualMemo - memoization & precomputed basis behavior', () => {
	test('memoizes repeated calls for the same function and point', () => {
		let calls = 0
		const fn = ([x, y], ops) => {
			calls++
			return ops.add(ops.mul(x, x), ops.mul(y, y))
		}

		const r1 = gradientDualMemo(fn, [3, 4])
		assert.equal(calls, 2)
		assert.equal(r1.value, 25)
		assert.deepStrictEqual(r1.gradient, [6, 8])

		const r2 = gradientDualMemo(fn, [3, 4])
		assert.equal(calls, 2, 'cached call should not re-invoke fn')
		assert.deepStrictEqual(r2, r1)

		// Canonical -0 vs +0 key check
		const r3 = gradientDualMemo(fn, [0, -0])
		assert.equal(calls, 4)
		const r4 = gradientDualMemo(fn, [-0, 0])
		assert.equal(calls, 4, '-0 and +0 should share the same memo key')
		assert.deepStrictEqual(r4, r3)
	})

	test('protects cached entries from caller mutation and isolates caches per function', () => {
		const f1 = ([x], ops) => ops.mul(2, x)
		const f2 = ([x], ops) => ops.mul(5, x)

		const a = gradientDualMemo(f1, [3])
		a.gradient[0] = 9999
		a.duals[0].d = 9999

		const aAgain = gradientDualMemo(f1, [3])
		assert.deepStrictEqual(aAgain.gradient, [2])
		assert.deepStrictEqual(aAgain.duals, [{ v: 6, d: 2 }])

		const b = gradientDualMemo(f2, [3])
		assert.deepStrictEqual(b.gradient, [5])
	})

	test('respects memoize: false and LRU maxCacheSize eviction', () => {
		let calls = 0
		const fn = ([x], ops) => {
			calls++
			return ops.pow(x, 3)
		}

		gradientDualMemo(fn, [2], { memoize: false })
		gradientDualMemo(fn, [2], { memoize: false })
		assert.equal(calls, 2)

		// Test LRU eviction with maxCacheSize = 2
		calls = 0
		const fnLru = ([x], ops) => {
			calls++
			return ops.mul(x, x)
		}
		gradientDualMemo(fnLru, [1], { maxCacheSize: 2 }) // cache: [1]
		gradientDualMemo(fnLru, [2], { maxCacheSize: 2 }) // cache: [1, 2]
		assert.equal(calls, 2)

		// Touch key [1] so [2] becomes LRU
		gradientDualMemo(fnLru, [1], { maxCacheSize: 2 }) // cache: [2, 1]
		assert.equal(calls, 2)

		// Insert [3], evicting [2]
		gradientDualMemo(fnLru, [3], { maxCacheSize: 2 }) // cache: [1, 3]
		assert.equal(calls, 3)

		// [1] should still hit; [2] should miss
		gradientDualMemo(fnLru, [1], { maxCacheSize: 2 })
		assert.equal(calls, 3)
		gradientDualMemo(fnLru, [2], { maxCacheSize: 2 })
		assert.equal(calls, 4)
	})
})

describe('gradientDualMemo - edge cases & input validation', () => {
	test('handles 1D functions, constant functions, negative bases, and high dimensions (> 16)', () => {
		// 1D function with negative base and integer exponent
		const cubic = ([x], ops) => ops.pow(x, 3)
		const rNeg = gradientDualMemo(cubic, [-2])
		assert.equal(rNeg.value, -8)
		assert.deepStrictEqual(rNeg.gradient, [12])

		// Constant function
		const constantFn = (_xs, ops) => ops.const(42)
		const rConst = gradientDualMemo(constantFn, [1, 2, 3])
		assert.equal(rConst.value, 42)
		assert.deepStrictEqual(rConst.gradient, [0, 0, 0])

		// Power of 0 and abs(0)
		const zeroEdge = ([x], ops) => ops.add(ops.pow(x, 0), ops.abs(x))
		const rZero = gradientDualMemo(zeroEdge, [0])
		assert.equal(rZero.value, 1)
		assert.deepStrictEqual(rZero.gradient, [0])

		// High-dimensional point (n = 24 > PRECOMPUTED_BASIS_MAX = 16)
		const dim = 24
		const pt = Array.from({ length: dim }, (_, i) => i + 1)
		const sumOfSquares = (xs, ops) =>
			xs.reduce((acc, xi, idx) => ops.add(acc, ops.mul(idx + 1, ops.mul(xi, xi))), ops.const(0))

		const rHigh = gradientDualMemo(sumOfSquares, pt)
		const expectedGrad = pt.map((val, idx) => 2 * (idx + 1) * val)
		assert.deepStrictEqual(rHigh.gradient, expectedGrad)
	})

	test('validates arguments, options, domain errors, and fn return values', () => {
		const id = ([x]) => x

		assert.throws(() => gradientDualMemo(null, [1]), TypeError)
		assert.throws(() => gradientDualMemo('not-a-fn', [1]), TypeError)
		assert.throws(() => gradientDualMemo(id, 'not-an-array'), TypeError)
		assert.throws(() => gradientDualMemo(id, []), RangeError)
		assert.throws(() => gradientDualMemo(id, [NaN]), RangeError)
		assert.throws(() => gradientDualMemo(id, [Infinity]), RangeError)
		assert.throws(() => gradientDualMemo(id, [{ v: 1, d: NaN }]), RangeError)
		assert.throws(() => gradientDualMemo(id, ['bad']), TypeError)

		assert.throws(() => gradientDualMemo(id, [1], null), TypeError)
		assert.throws(() => gradientDualMemo(id, [1], []), TypeError)
		assert.throws(() => gradientDualMemo(id, [1], { memoize: 'yes' }), TypeError)
		assert.throws(() => gradientDualMemo(id, [1], { maxCacheSize: 0 }), RangeError)
		assert.throws(() => gradientDualMemo(id, [1], { maxCacheSize: 1.5 }), RangeError)

		// Invalid return values from fn
		assert.throws(() => gradientDualMemo(() => 42, [1]), TypeError)
		assert.throws(() => gradientDualMemo(() => ({ v: 1, d: Infinity }), [1]), RangeError)

		// Domain errors inside DUAL_OPS
		assert.throws(() => gradientDualMemo(([x], ops) => ops.div(1, x), [0]), RangeError)
		assert.throws(() => gradientDualMemo(([x], ops) => ops.log(x), [0]), RangeError)
		assert.throws(() => gradientDualMemo(([x], ops) => ops.sqrt(x), [-1]), RangeError)
		assert.throws(
			() => gradientDualMemo(([x, y], ops) => ops.pow(x, y), [-2, 1.5]),
			RangeError
		)
	})
})
