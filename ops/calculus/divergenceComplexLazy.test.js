import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divergenceComplexLazy } from './divergenceComplexLazy.js'

/**
 * Helper to assert two complex numbers are approximately equal.
 */
function assertComplexClose(actual, expected, tol = 1e-6, msg = '') {
	assert.equal(typeof actual, 'object', `expected complex object ${msg}`)
	assert.ok(actual !== null, `expected non-null complex object ${msg}`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`real part mismatch ${msg}: got ${actual.re}, expected ${expected.re} (diff=${Math.abs(actual.re - expected.re)}, tol=${tol})`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`imag part mismatch ${msg}: got ${actual.im}, expected ${expected.im} (diff=${Math.abs(actual.im - expected.im)}, tol=${tol})`
	)
}

/**
 * Complex multiplication helper for tests.
 */
function cmul(a, b) {
	return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
}

/**
 * Complex addition helper for tests.
 */
function cadd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

describe('divergenceComplexLazy - normal cases', () => {
	test('1D complex-valued field matches analytic derivative', () => {
		// F(x) = x^3 + i*sin(x)  =>  div F = 3x^2 + i*cos(x)
		const field = [([x]) => ({ re: x ** 3, im: Math.sin(x) })]
		const xs = [-2, -0.5, 0, 1.25, 3]
		const points = xs.map((x) => [x])

		const results = [...divergenceComplexLazy(field, points)]
		assert.equal(results.length, xs.length)

		xs.forEach((x, idx) => {
			assertComplexClose(results[idx], { re: 3 * x * x, im: Math.cos(x) }, 1e-7, `at x=${x}`)
		})
	})

	test('2D complex vector field as array of component functions', () => {
		// F(x, y) = (x^2 + i*x*y, y^2 - i*x^2)
		// dFx/dx = 2x + i*y, dFy/dy = 2y => div F = (2x + 2y) + i*y
		const field = [
			([x, y]) => ({ re: x * x, im: x * y }),
			([x, y]) => ({ re: y * y, im: -x * x }),
		]
		const pts = [
			[0, 0],
			[1, 2],
			[-3, 4.5],
			[2.5, -1.5],
		]

		const results = [...divergenceComplexLazy(field, pts)]
		assert.equal(results.length, pts.length)

		pts.forEach(([x, y], idx) => {
			assertComplexClose(results[idx], { re: 2 * x + 2 * y, im: y }, 1e-7, `at (${x},${y})`)
		})
	})

	test('3D complex vector field as single vector-valued function returning generator', () => {
		// F(x, y, z) = (e^x + i*x^3, sin(y) + i*y^2, z^3 + i*z*x)
		// div F = (e^x + cos(y) + 3z^2) + i*(3x^2 + 2y + x)
		function* vectorField([x, y, z]) {
			yield { re: Math.exp(x), im: x ** 3 }
			yield { re: Math.sin(y), im: y * y }
			yield { re: z ** 3, im: z * x }
		}
		const pts = [
			[0, 0, 0],
			[0.5, 1.0, -2.0],
			[-1.2, 0.7, 1.5],
		]

		const results = [...divergenceComplexLazy(vectorField, pts)]
		assert.equal(results.length, pts.length)

		pts.forEach(([x, y, z], idx) => {
			const expected = {
				re: Math.exp(x) + Math.cos(y) + 3 * z * z,
				im: 3 * x * x + 2 * y + x,
			}
			assertComplexClose(results[idx], expected, 1e-6, `at (${x},${y},${z})`)
		})
	})

	test('holomorphic complex-variable vector field with complex coordinates and complex step', () => {
		// F(z1, z2) = (z1^2, z2^3) => div F = 2*z1 + 3*z2^2
		const field = [
			([z1]) => cmul(z1, z1),
			([, z2]) => cmul(cmul(z2, z2), z2),
		]
		const pts = [
			[{ re: 1, im: 2 }, { re: -1, im: 0.5 }],
			[{ re: -2, im: -3 }, { re: 0.25, im: 1.5 }],
		]

		// Test with real step and with complex step (path-independent for holomorphic functions)
		const realStepResults = [...divergenceComplexLazy(field, pts, { h: 1e-6 })]
		const complexStepResults = [
			...divergenceComplexLazy(field, pts, { h: { re: 1e-6, im: 1e-6 } }),
		]

		pts.forEach(([z1, z2], idx) => {
			const z2Sq = cmul(z2, z2)
			const expected = {
				re: 2 * z1.re + 3 * z2Sq.re,
				im: 2 * z1.im + 3 * z2Sq.im,
			}
			assertComplexClose(realStepResults[idx], expected, 1e-6, `real step idx=${idx}`)
			assertComplexClose(complexStepResults[idx], expected, 1e-6, `complex step idx=${idx}`)
		})
	})

	test('all finite-difference methods (forward, backward, central, fivePoint) and accuracy hierarchy', () => {
		// F(x, y) = (exp(x) + i*cos(x), sin(y) + i*exp(y))
		// div F = (exp(x) + cos(y)) + i*(-sin(x) + exp(y))
		const field = [
			([x]) => ({ re: Math.exp(x), im: Math.cos(x) }),
			([, y]) => ({ re: Math.sin(y), im: Math.exp(y) }),
		]
		const pt = [[0.7, -0.4]]
		const exact = {
			re: Math.exp(0.7) + Math.cos(-0.4),
			im: -Math.sin(0.7) + Math.exp(-0.4),
		}

		// Use moderate step h=1e-2 so truncation errors clearly distinguish stencil orders
		const h = 1e-2
		const [fwd] = [...divergenceComplexLazy(field, pt, { h, method: 'forward' })]
		const [bwd] = [...divergenceComplexLazy(field, pt, { h, method: 'backward' })]
		const [ctr] = [...divergenceComplexLazy(field, pt, { h, method: 'central' })]
		const [fp] = [...divergenceComplexLazy(field, pt, { h, method: 'fivePoint' })]

		const err = (v) => Math.hypot(v.re - exact.re, v.im - exact.im)

		assert.ok(err(fwd) < 5e-2)
		assert.ok(err(bwd) < 5e-2)
		assert.ok(err(ctr) < 1e-4)
		assert.ok(err(fp) < 1e-9)
		assert.ok(err(fp) < err(ctr) && err(ctr) < err(fwd) && err(ctr) < err(bwd))
	})

	test('single vector function with forward and backward methods evaluates cleanly', () => {
		const field = ([x, y]) => [
			{ re: 3 * x + 2 * y, im: -x + 5 },
			{ re: 4 * y, im: 7 * y - x },
		]
		// Exact div = (3 + 4) + i*(-1 + 7) = 7 + 6i
		const pts = [[1, -2], [0, 3]]
		for (const method of ['forward', 'backward', 'central', 'fivePoint']) {
			const res = [...divergenceComplexLazy(field, pts, { method })]
			for (const v of res) {
				assertComplexClose(v, { re: 7, im: 6 }, 1e-6, `method=${method}`)
			}
		}
	})

	test('per-axis step sizes (array and generator)', () => {
		const field = [
			([x]) => ({ re: x * x, im: 2 * x }),
			([, y]) => ({ re: 3 * y, im: y * y }),
		]
		const pts = [[2, -3]]
		// Exact: (2*2 + 3) + i*(2 + 2*(-3)) = 7 - 4i
		const [resArr] = [...divergenceComplexLazy(field, pts, { h: [1e-5, 2e-6] })]
		function* stepGen() {
			yield 1e-5
			yield 2e-6
		}
		const [resGen] = [...divergenceComplexLazy(field, pts, { h: stepGen() })]

		assertComplexClose(resArr, { re: 7, im: -4 }, 1e-7)
		assertComplexClose(resGen, { re: 7, im: -4 }, 1e-7)
	})
})

describe('divergenceComplexLazy - edge cases', () => {
	test('empty points stream yields nothing and does not invoke field', () => {
		let calls = 0
		const field = [
			([x]) => {
				calls++
				return { re: x, im: 0 }
			},
		]
		const results = [...divergenceComplexLazy(field, [])]
		assert.deepEqual(results, [])
		assert.equal(calls, 0)
	})

	test('constant field yields exact +0 (no -0)', () => {
		const field = [
			() => ({ re: 5, im: -3 }),
			() => ({ re: -2, im: 7 }),
		]
		const [res] = [...divergenceComplexLazy(field, [[1, 2]])]
		assert.deepStrictEqual(res, { re: 0, im: 0 })
		assert.ok(Object.is(res.re, 0))
		assert.ok(Object.is(res.im, 0))
	})

	test('divergence-free (solenoidal) complex rotational field yields zero', () => {
		// F(x, y) = (-y + i*y, x - i*x) => dFx/dx + dFy/dy = 0
		const field = [
			([, y]) => ({ re: -y, im: y }),
			([x]) => ({ re: x, im: -x }),
		]
		const pts = [[0, 0], [5, -7], [-1.23, 4.56]]
		for (const res of divergenceComplexLazy(field, pts)) {
			assertComplexClose(res, { re: 0, im: 0 }, 1e-10)
		}
	})

	test('supports TypedArray points and generator-based points & field', () => {
		function* fieldGen() {
			yield ([x]) => ({ re: 2 * x, im: -x })
			yield ([, y]) => ({ re: -y, im: 4 * y })
			yield ([, , z]) => ({ re: 5 * z, im: 3 * z })
		}
		function* pointGen() {
			yield new Float64Array([1, 2, 3])
			yield (function* () {
				yield -1
				yield 0
				yield 4
			})()
		}
		const results = [...divergenceComplexLazy(fieldGen(), pointGen())]
		assert.equal(results.length, 2)
		for (const r of results) {
			// Exact: (2 - 1 + 5) + i*(-1 + 4 + 3) = 6 + 6i
			assertComplexClose(r, { re: 6, im: 6 }, 1e-7)
		}
	})

	test('5D linear complex vector field', () => {
		const coeffs = [
			{ re: 1, im: -2 },
			{ re: 3, im: 4 },
			{ re: -5, im: 0.5 },
			{ re: 0, im: -1.5 },
			{ re: 2.5, im: 1 },
		]
		const field = coeffs.map(
			(c, idx) => (pt) => ({ re: c.re * pt[idx], im: c.im * pt[idx] })
		)
		const expected = coeffs.reduce(cadd, { re: 0, im: 0 })
		const [res] = [...divergenceComplexLazy(field, [[1, -2, 3, -4, 5]])]
		assertComplexClose(res, expected, 1e-7)
	})
})

describe('divergenceComplexLazy - lazy/streaming behavior', () => {
	test('consumes infinite point generator strictly on demand and cleans up on early exit', () => {
		let pulled = 0
		let cleanedUp = false

		function* infinitePoints() {
			try {
				let k = 0
				while (true) {
					pulled++
					yield [k, k * 2]
					k++
				}
			} finally {
				cleanedUp = true
			}
		}

		// F(x, y) = (x^2 + i*y, y^2 + i*x) => div F = (2x + 2y) + 0i
		const field = [
			([x, y]) => ({ re: x * x, im: y }),
			([x, y]) => ({ re: y * y, im: x }),
		]

		const stream = divergenceComplexLazy(field, infinitePoints())

		// Nothing consumed before first .next()
		assert.equal(pulled, 0)
		assert.equal(cleanedUp, false)

		const collected = []
		for (const val of stream) {
			collected.push(val)
			assert.equal(pulled, collected.length, 'must pull strictly one point per yielded result')
			if (collected.length === 5) break
		}

		assert.equal(pulled, 5)
		assert.equal(cleanedUp, true, 'early break must close underlying point generator')

		collected.forEach((v, k) => {
			// x = k, y = 2k => 2x + 2y = 6k
			assertComplexClose(v, { re: 6 * k, im: 0 }, 1e-6, `at k=${k}`)
		})
	})

	test('field generator is not consumed until iteration starts and is consumed only once', () => {
		let fieldYields = 0
		function* lazyField() {
			fieldYields++
			yield ([x]) => ({ re: x * x, im: 0 })
			fieldYields++
			yield ([, y]) => ({ re: 0, im: y * y })
		}

		const gen = divergenceComplexLazy(lazyField(), [[1, 2], [3, 4], [5, 6]])
		assert.equal(fieldYields, 0, 'lazy field generator must not be consumed before .next()')

		const first = gen.next()
		assert.equal(first.done, false)
		assert.equal(fieldYields, 2)
		assertComplexClose(first.value, { re: 2, im: 4 }, 1e-7)

		const rest = [...gen]
		assert.equal(rest.length, 2)
		assert.equal(fieldYields, 2, 'field generator must only be consumed once across stream')
		assertComplexClose(rest[0], { re: 6, im: 8 }, 1e-7)
		assertComplexClose(rest[1], { re: 10, im: 12 }, 1e-7)
	})

	test('streams 5,000 points incrementally without materializing the input sequence', () => {
		const N = 5000
		function* streamPoints() {
			for (let i = 0; i < N; i++) {
				yield [i * 1e-3, -i * 2e-3]
			}
		}
		// F(x, y) = (x^2 + i*x, y + i*y^2) => div F = (2x + 1) + i*(1 + 2y)
		const field = [
			([x]) => ({ re: x * x, im: x }),
			([, y]) => ({ re: y, im: y * y }),
		]

		let count = 0
		let last = null
		for (const val of divergenceComplexLazy(field, streamPoints())) {
			count++
			last = val
		}
		assert.equal(count, N)
		const xLast = (N - 1) * 1e-3
		const yLast = -(N - 1) * 2e-3
		assertComplexClose(last, { re: 2 * xLast + 1, im: 1 + 2 * yLast }, 1e-6)
	})
})

describe('divergenceComplexLazy - invalid input handling', () => {
	const validField = [([x]) => ({ re: x, im: 0 })]

	test('rejects invalid field argument eagerly', () => {
		for (const bad of [null, undefined, 42, 'abc', {}, []]) {
			assert.throws(() => divergenceComplexLazy(bad, [[1]]), /field/i)
		}
		assert.throws(() => divergenceComplexLazy([123], [[1]]), TypeError)
	})

	test('rejects invalid points argument eagerly', () => {
		for (const bad of [null, undefined, 42, 'abc', {}]) {
			assert.throws(() => divergenceComplexLazy(validField, bad), TypeError)
		}
	})

	test('rejects invalid options argument eagerly', () => {
		for (const bad of [null, 42, 'central', []]) {
			assert.throws(() => divergenceComplexLazy(validField, [[1]], bad), TypeError)
		}
		assert.throws(
			() => divergenceComplexLazy(validField, [[1]], { method: 'unknown' }),
			RangeError
		)
		assert.throws(
			() => divergenceComplexLazy(validField, [[1]], { method: 123 }),
			RangeError
		)
	})

	test('rejects invalid step size h', () => {
		for (const badH of [0, -1e-6, NaN, Infinity, -Infinity, { re: 0, im: 0 }, []]) {
			assert.throws(() => divergenceComplexLazy(validField, [[1]], { h: badH }), RangeError)
		}
		for (const badH of ['1e-6', null, { re: NaN, im: 1 }, { re: 1 }]) {
			assert.throws(() => divergenceComplexLazy(validField, [[1]], { h: badH }), TypeError)
		}
		// Mismatched per-axis step length
		assert.throws(
			() => divergenceComplexLazy(validField, [[1]], { h: [1e-6, 1e-6] }),
			RangeError
		)
	})

	test('rejects invalid points, dimension mismatches, and bad coordinates during iteration', () => {
		assert.throws(() => [...divergenceComplexLazy(validField, [null])], TypeError)
		assert.throws(() => [...divergenceComplexLazy(validField, ['x'])], TypeError)
		assert.throws(() => [...divergenceComplexLazy(validField, [[]])], RangeError)
		assert.throws(() => [...divergenceComplexLazy(validField, [[1, 2]])], RangeError)
		assert.throws(() => [...divergenceComplexLazy(validField, [[NaN]])], RangeError)
		assert.throws(() => [...divergenceComplexLazy(validField, [[Infinity]])], RangeError)
		assert.throws(() => [...divergenceComplexLazy(validField, [['1']])], TypeError)
		assert.throws(() => [...divergenceComplexLazy(validField, [[{ re: 1, im: NaN }]])], TypeError)
	})

	test('rejects malformed field outputs and lazy empty/invalid field generators', () => {
		assert.throws(
			() => [...divergenceComplexLazy([() => 42], [[1]])],
			TypeError
		)
		assert.throws(
			() => [...divergenceComplexLazy([() => ({ re: NaN, im: 0 })], [[1]])],
			TypeError
		)
		assert.throws(
			() => [...divergenceComplexLazy(() => [{ re: 1, im: 0 }, { re: 2, im: 0 }], [[1]])],
			RangeError
		)
		assert.throws(
			() => [...divergenceComplexLazy(() => 'not-iterable', [[1]])],
			TypeError
		)
		function* emptyFieldGen() {}
		assert.throws(
			() => [...divergenceComplexLazy(emptyFieldGen(), [[1]])],
			RangeError
		)
	})
})

describe('divergenceComplexLazy - independent mathematical cross-checks', () => {
	test('2D Divergence Theorem (Gauss theorem): area integral of div F equals boundary flux', () => {
		// Complex vector field F(x, y) = (P(x, y), Q(x, y)) on rectangle [a, b] x [c, d]
		const P = (x, y) => ({
			re: x * x * Math.cos(y) + Math.exp(x * 0.5),
			im: Math.sin(x * y) + x * y * y,
		})
		const Q = (x, y) => ({
			re: y * y * x + Math.sin(y),
			im: Math.cos(x) * Math.exp(y * 0.5) - y * y * y,
		})

		const field = [([x, y]) => P(x, y), ([x, y]) => Q(x, y)]

		const a = 0.2
		const b = 1.4
		const c = -0.3
		const d = 1.1
		const N = 40 // even number of subintervals for composite Simpson's rule
		const dx = (b - a) / N
		const dy = (d - c) / N

		const simpsonWeight = (i, n) => (i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2)

		// Stream all (N+1)*(N+1) grid points lazily into divergenceComplexLazy
		function* gridPoints() {
			for (let i = 0; i <= N; i++) {
				const x = a + i * dx
				for (let j = 0; j <= N; j++) {
					const y = c + j * dy
					yield [x, y]
				}
			}
		}

		let areaRe = 0
		let areaIm = 0
		let k = 0
		for (const divVal of divergenceComplexLazy(field, gridPoints(), {
			h: 1e-4,
			method: 'fivePoint',
		})) {
			const i = Math.floor(k / (N + 1))
			const j = k % (N + 1)
			const w = simpsonWeight(i, N) * simpsonWeight(j, N)
			areaRe += w * divVal.re
			areaIm += w * divVal.im
			k++
		}
		const areaIntegral = {
			re: areaRe * (dx / 3) * (dy / 3),
			im: areaIm * (dx / 3) * (dy / 3),
		}

		// Independent boundary flux:
		// ∮ F · n ds = ∫_c^d (P(b,y) - P(a,y)) dy + ∫_a^b (Q(x,d) - Q(x,c)) dx
		let fluxRe = 0
		let fluxIm = 0
		for (let j = 0; j <= N; j++) {
			const y = c + j * dy
			const w = simpsonWeight(j, N) * (dy / 3)
			const right = P(b, y)
			const left = P(a, y)
			fluxRe += w * (right.re - left.re)
			fluxIm += w * (right.im - left.im)
		}
		for (let i = 0; i <= N; i++) {
			const x = a + i * dx
			const w = simpsonWeight(i, N) * (dx / 3)
			const top = Q(x, d)
			const bottom = Q(x, c)
			fluxRe += w * (top.re - bottom.re)
			fluxIm += w * (top.im - bottom.im)
		}
		const boundaryFlux = { re: fluxRe, im: fluxIm }

		assertComplexClose(areaIntegral, boundaryFlux, 1e-6, '2D Gauss Divergence Theorem')
	})

	test('3D vector calculus identity: div(curl(A)) = 0 for nonlinear complex vector potential', () => {
		// Vector potential A(x, y, z) = (A_x, A_y, A_z):
		//   A_x = x*y*z + i*sin(y*z)
		//   A_y = exp(x*z) + i*(x^2 * y)
		//   A_z = cos(x*y) + i*(z^2 * x)
		// Analytic curl F = ∇ × A:
		//   F_x = ∂A_z/∂y - ∂A_y/∂z = (-x*sin(x*y) - x*exp(x*z)) + i*(0 - 0)
		//   F_y = ∂A_x/∂z - ∂A_z/∂x = (x*y + y*sin(x*y)) + i*(y*cos(y*z) - z^2)
		//   F_z = ∂A_y/∂x - ∂A_x/∂y = (z*exp(x*z) - x*z) + i*(2*x*y - z*cos(y*z))
		const curlA = [
			([x, y, z]) => ({
				re: -x * Math.sin(x * y) - x * Math.exp(x * z),
				im: 0,
			}),
			([x, y, z]) => ({
				re: x * y + y * Math.sin(x * y),
				im: y * Math.cos(y * z) - z * z,
			}),
			([x, y, z]) => ({
				re: z * Math.exp(x * z) - x * z,
				im: 2 * x * y - z * Math.cos(y * z),
			}),
		]

		const pts = [
			[0.3, -0.7, 0.5],
			[-1.1, 0.4, -0.8],
			[0.9, 1.2, 0.2],
		]

		for (const divVal of divergenceComplexLazy(curlA, pts, { h: 1e-4, method: 'fivePoint' })) {
			assertComplexClose(divVal, { re: 0, im: 0 }, 1e-8, 'div(curl(A)) == 0')
		}
	})

	test('product rule identity: div(phi * F) = (grad phi) . F + phi * div(F)', () => {
		// Scalar complex field: phi(x, y) = (x*y + 1) + i*(x^2 - y)
		// Analytic grad phi = (y + i*2x, x - i)
		const phi = ([x, y]) => ({ re: x * y + 1, im: x * x - y })
		const gradPhi = ([x, y]) => [
			{ re: y, im: 2 * x },
			{ re: x, im: -1 },
		]

		// Vector field: F(x, y) = (sin(x) + i*y^2, exp(y) - i*x)
		const F = [
			([x, y]) => ({ re: Math.sin(x), im: y * y }),
			([x, y]) => ({ re: Math.exp(y), im: -x }),
		]
		const phiF = F.map((fi) => (pt) => cmul(phi(pt), fi(pt)))

		const pts = [
			[0.5, -0.5],
			[-1.2, 0.8],
			[2.0, 1.1],
		]

		const divPhiF = [...divergenceComplexLazy(phiF, pts)]
		const divF = [...divergenceComplexLazy(F, pts)]

		pts.forEach((pt, idx) => {
			const [gx, gy] = gradPhi(pt)
			const [fx, fy] = F.map((fn) => fn(pt))
			const gradDotF = cadd(cmul(gx, fx), cmul(gy, fy))
			const rhs = cadd(gradDotF, cmul(phi(pt), divF[idx]))
			assertComplexClose(divPhiF[idx], rhs, 1e-6, `product rule at idx=${idx}`)
		})
	})
})
