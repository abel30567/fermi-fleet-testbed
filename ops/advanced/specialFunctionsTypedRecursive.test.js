import { describe, test } from 'node:test'
import assert from 'node:assert'
import { specialFunctionsTypedRecursive } from './specialFunctionsTypedRecursive.js'

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-12, msg = '') {
	assert.ok(
		Number.isFinite(actual) && Number.isFinite(expected),
		`${msg} expected finite values, got actual=${actual}, expected=${expected}`
	)
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.abs(expected))
	assert.ok(
		diff <= limit,
		`${msg} actual=${actual}, expected=${expected}, diff=${diff}, limit=${limit}`
	)
}

/**
 * Independent composite Simpson's rule numerical integration for erf(x):
 * erf(x) = (2 / sqrt(pi)) * integral_0^x exp(-t^2) dt
 */
function erfSimpson(x, steps = 2000) {
	const n = steps % 2 === 0 ? steps : steps + 1
	const h = x / n
	let sum = 1 + Math.exp(-x * x)
	for (let i = 1; i < n; i++) {
		const t = i * h
		sum += (i % 2 === 0 ? 2 : 4) * Math.exp(-t * t)
	}
	return (2 / Math.sqrt(Math.PI)) * (h / 3) * sum
}

/**
 * Independent direct alternating Maclaurin power series for J_0(x) (reliable for |x| <= 6).
 */
function besselJ0Maclaurin(x) {
	const halfXSq = (x * x) / 4
	let term = 1
	let sum = 1
	for (let k = 1; k <= 60; k++) {
		term *= -halfXSq / (k * k)
		sum += term
		if (Math.abs(term) < 1e-17) {
			break
		}
	}
	return sum
}

describe('specialFunctionsTypedRecursive', () => {
	describe('input validation and container behavior', () => {
		test('throws TypeError for non-Float64Array inputs', () => {
			for (const bad of [null, undefined, [1, 2, 3], new Float32Array([1]), new Int32Array([1]), '123', 42, {}]) {
				assert.throws(
					() => specialFunctionsTypedRecursive(bad),
					{ name: 'TypeError' }
				)
			}
		})

		test('throws TypeError for non-string fnName', () => {
			const input = new Float64Array([1, 2])
			for (const badName of [123, null, {}, [], true]) {
				assert.throws(
					() => specialFunctionsTypedRecursive(input, badName),
					{ name: 'TypeError' }
				)
			}
		})

		test('throws RangeError for unsupported fnName (including prototype properties)', () => {
			const input = new Float64Array([1, 2])
			for (const badName of ['', 'zeta', 'beta', 'GAMMA', 'toString', 'constructor']) {
				assert.throws(
					() => specialFunctionsTypedRecursive(input, badName),
					{ name: 'RangeError' }
				)
			}
		})

		test('handles empty and single-element Float64Arrays without mutating input', () => {
			const empty = new Float64Array(0)
			const emptyOut = specialFunctionsTypedRecursive(empty)
			assert.ok(emptyOut instanceof Float64Array)
			assert.strictEqual(emptyOut.length, 0)
			assert.notStrictEqual(emptyOut, empty)

			const single = new Float64Array([5])
			const singleOut = specialFunctionsTypedRecursive(single)
			assert.ok(singleOut instanceof Float64Array)
			assert.strictEqual(singleOut.length, 1)
			assertClose(singleOut[0], 24, 1e-13)
			assert.strictEqual(single[0], 5)
		})

		test('defaults to gamma when fnName is omitted', () => {
			const input = new Float64Array([1, 2, 3, 4, 5])
			const outDefault = specialFunctionsTypedRecursive(input)
			const outExplicit = specialFunctionsTypedRecursive(input, 'gamma')
			assert.deepStrictEqual(outDefault, outExplicit)
		})

		test('handles large Float64Array safely with O(log n) recursion depth', () => {
			const n = 20000
			const input = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				input[i] = (i - n / 2) * 0.001
			}
			const erfOut = specialFunctionsTypedRecursive(input, 'erf')
			const erfcOut = specialFunctionsTypedRecursive(input, 'erfc')
			assert.strictEqual(erfOut.length, n)
			for (let i = 0; i < n; i += 137) {
				assertClose(erfOut[i] + erfcOut[i], 1, 1e-14, 1e-14)
			}
		})
	})

	describe('gamma', () => {
		test('cross-checks exact factorials Gamma(n) = (n - 1)!', () => {
			const ns = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20])
			const out = specialFunctionsTypedRecursive(ns, 'gamma')
			let fact = 1
			const expectedByN = new Map([[1, 1]])
			for (let k = 2; k <= 20; k++) {
				fact *= k - 1
				expectedByN.set(k, fact)
			}
			for (let i = 0; i < ns.length; i++) {
				assertClose(out[i], expectedByN.get(ns[i]), 1e-13, 1e-13, `gamma(${ns[i]})`)
			}
		})

		test('cross-checks half-integer values and reflection formula for negatives', () => {
			const sqrtPi = Math.sqrt(Math.PI)
			// Gamma(0.5) = sqrt(pi), Gamma(1.5) = sqrt(pi)/2, Gamma(2.5) = 3*sqrt(pi)/4,
			// Gamma(-0.5) = -2*sqrt(pi), Gamma(-1.5) = 4*sqrt(pi)/3, Gamma(-2.5) = -8*sqrt(pi)/15
			const input = new Float64Array([0.5, 1.5, 2.5, -0.5, -1.5, -2.5])
			const expected = [
				sqrtPi,
				0.5 * sqrtPi,
				0.75 * sqrtPi,
				-2 * sqrtPi,
				(4 / 3) * sqrtPi,
				(-8 / 15) * sqrtPi,
			]
			const out = specialFunctionsTypedRecursive(input, 'gamma')
			for (let i = 0; i < input.length; i++) {
				assertClose(out[i], expected[i], 1e-13, 1e-13, `gamma(${input[i]})`)
			}

			// Cross-check Euler's reflection formula: Gamma(x) * Gamma(1 - x) = pi / sin(pi * x)
			const xs = new Float64Array([-3.3, -1.7, -0.25, 0.25, 0.7])
			const gx = specialFunctionsTypedRecursive(xs, 'gamma')
			const oneMinusX = Float64Array.from(xs, (x) => 1 - x)
			const g1mx = specialFunctionsTypedRecursive(oneMinusX, 'gamma')
			for (let i = 0; i < xs.length; i++) {
				assertClose(gx[i] * g1mx[i], Math.PI / Math.sin(Math.PI * xs[i]), 1e-12, 1e-12)
			}
		})

		test('handles large values near float64 overflow, poles, NaN, and infinities', () => {
			const input = new Float64Array([170, 171, 172, +0, -0, -1, -2, -10, NaN, Infinity, -Infinity])
			const out = specialFunctionsTypedRecursive(input, 'gamma')
			// 169! = 4.269068009004705e+304, 170! = 7.257415615307999e+306
			assertClose(out[0], 4.269068009004705e304, 1e-12)
			assertClose(out[1], 7.257415615307999e306, 1e-12)
			assert.strictEqual(out[2], Infinity)
			assert.strictEqual(out[3], Infinity)
			assert.strictEqual(out[4], -Infinity)
			assert.ok(Number.isNaN(out[5]))
			assert.ok(Number.isNaN(out[6]))
			assert.ok(Number.isNaN(out[7]))
			assert.ok(Number.isNaN(out[8]))
			assert.strictEqual(out[9], Infinity)
			assert.ok(Number.isNaN(out[10]))
		})
	})

	describe('lgamma', () => {
		test('cross-checks lgamma against exact ln((n - 1)!) and ln|gamma(x)|', () => {
			const input = new Float64Array([0.5, 1, 2, 3, 5, 10, 50, -0.5, -2.5, -3.25])
			const lg = specialFunctionsTypedRecursive(input, 'lgamma')
			const g = specialFunctionsTypedRecursive(input, 'gamma')

			assert.strictEqual(lg[1], 0)
			assert.strictEqual(lg[2], 0)
			for (let i = 0; i < input.length; i++) {
				assertClose(lg[i], Math.log(Math.abs(g[i])), 1e-12, 1e-12, `lgamma(${input[i]})`)
			}

			// Independent sum of logs for ln(99!) = lgamma(100)
			let sumLog = 0
			for (let k = 2; k < 100; k++) {
				sumLog += Math.log(k)
			}
			const lg100 = specialFunctionsTypedRecursive(new Float64Array([100]), 'lgamma')[0]
			assertClose(lg100, sumLog, 1e-13, 1e-13)
		})

		test('handles poles, NaN, and infinities', () => {
			const input = new Float64Array([0, -0, -1, -5, NaN, Infinity, -Infinity])
			const out = specialFunctionsTypedRecursive(input, 'lgamma')
			assert.strictEqual(out[0], Infinity)
			assert.strictEqual(out[1], Infinity)
			assert.strictEqual(out[2], Infinity)
			assert.strictEqual(out[3], Infinity)
			assert.ok(Number.isNaN(out[4]))
			assert.strictEqual(out[5], Infinity)
			assert.strictEqual(out[6], Infinity)
		})
	})

	describe('erf and erfc', () => {
		test('cross-checks erf against composite Simpson numerical integration and erf + erfc = 1', () => {
			const input = new Float64Array([-3.5, -2.0, -1.5, -1.0, -0.5, 0, 0.25, 0.5, 1.0, 1.49, 1.5, 1.51, 2.0, 3.5])
			const erfOut = specialFunctionsTypedRecursive(input, 'erf')
			const erfcOut = specialFunctionsTypedRecursive(input, 'erfc')

			for (let i = 0; i < input.length; i++) {
				const x = input[i]
				const simpson = erfSimpson(x)
				assertClose(erfOut[i], simpson, 1e-12, 1e-12, `erf(${x}) vs Simpson`)
				assertClose(erfOut[i] + erfcOut[i], 1, 1e-14, 1e-14, `erf(${x}) + erfc(${x})`)
			}

			// Symmetry: erf(-x) = -erf(x) and erfc(-x) = 2 - erfc(x)
			const pos = new Float64Array([0.3, 1.2, 1.8, 4.0])
			const neg = Float64Array.from(pos, (x) => -x)
			const erfPos = specialFunctionsTypedRecursive(pos, 'erf')
			const erfNeg = specialFunctionsTypedRecursive(neg, 'erf')
			const erfcPos = specialFunctionsTypedRecursive(pos, 'erfc')
			const erfcNeg = specialFunctionsTypedRecursive(neg, 'erfc')
			for (let i = 0; i < pos.length; i++) {
				assertClose(erfNeg[i], -erfPos[i], 1e-15, 1e-15)
				assertClose(erfcNeg[i], 2 - erfcPos[i], 1e-14, 1e-14)
			}
		})

		test('maintains high relative accuracy for erfc in the far tail and handles special values', () => {
			// Known high-precision values:
			// erfc(5)  = 1.5374597944280349e-12
			// erfc(10) = 2.0884875837625448e-45
			// erfc(20) = 5.3958656116079005e-176
			const tailInput = new Float64Array([5, 10, 20, 30])
			const tailOut = specialFunctionsTypedRecursive(tailInput, 'erfc')
			assertClose(tailOut[0], 1.5374597944280349e-12, 1e-13, 0)
			assertClose(tailOut[1], 2.0884875837625448e-45, 1e-13, 0)
			assertClose(tailOut[2], 5.3958656116079005e-176, 1e-12, 0)
			assert.strictEqual(tailOut[3], 0)

			const special = new Float64Array([+0, -0, NaN, Infinity, -Infinity])
			const erfSpec = specialFunctionsTypedRecursive(special, 'erf')
			const erfcSpec = specialFunctionsTypedRecursive(special, 'erfc')
			assert.ok(Object.is(erfSpec[0], 0))
			assert.ok(Object.is(erfSpec[1], -0))
			assert.ok(Number.isNaN(erfSpec[2]))
			assert.strictEqual(erfSpec[3], 1)
			assert.strictEqual(erfSpec[4], -1)

			assert.strictEqual(erfcSpec[0], 1)
			assert.strictEqual(erfcSpec[1], 1)
			assert.ok(Number.isNaN(erfcSpec[2]))
			assert.strictEqual(erfcSpec[3], 0)
			assert.strictEqual(erfcSpec[4], 2)
		})
	})

	describe('besselJ0', () => {
		test('cross-checks against Maclaurin series, known zeros, symmetry, and asymptotic region', () => {
			// Cross-check against independent Maclaurin power series for |x| <= 6
			const small = new Float64Array([-6, -3.5, -1, 0, 0.5, 1, 2, 4, 6])
			const outSmall = specialFunctionsTypedRecursive(small, 'besselJ0')
			for (let i = 0; i < small.length; i++) {
				assertClose(outSmall[i], besselJ0Maclaurin(small[i]), 1e-13, 1e-13, `besselJ0(${small[i]})`)
			}

			// Known high-precision zeros of J_0(x), spanning both integral and asymptotic regimes:
			// j_{0,1}, j_{0,2}, j_{0,3}, j_{0,9}, j_{0,10}, j_{0,11}, j_{0,20}
			const zeros = new Float64Array([
				2.4048255576957728,
				5.5200781102863106,
				8.6537279129110122,
				27.4934791320402548,
				30.6346064684319751,
				33.7758202135735687,
				62.048469190227170,
			])
			const zeroVals = specialFunctionsTypedRecursive(zeros, 'besselJ0')
			for (let i = 0; i < zeros.length; i++) {
				assertClose(zeroVals[i], 0, 0, 1e-13, `J_0(zero ${i})`)
			}

			// Continuity across the x = 30 regime boundary and evenness J_0(-x) = J_0(x)
			// Reference values:
			// J_0(30)      = -0.08636798358104014
			// J_0(30.0001) = -0.08635610806275075
			// J_0(100)     =  0.019985850304223124
			const large = new Float64Array([-100, -30, 30, 30.0001, 100])
			const outLarge = specialFunctionsTypedRecursive(large, 'besselJ0')
			assertClose(outLarge[0], outLarge[4], 1e-15, 1e-15)
			assertClose(outLarge[1], outLarge[2], 1e-15, 1e-15)
			assertClose(outLarge[2], -0.08636798358104014, 1e-13, 1e-13)
			assertClose(outLarge[3], -0.08635610806275075, 1e-13, 1e-13)
			assertClose(outLarge[4], 0.019985850304223124, 1e-13, 1e-13)
		})

		test('satisfies Bessel differential equation x*J0"(x) + J0\'(x) + x*J0(x) = 0 numerically', () => {
			// Verify via 4th-order central finite differences at both moderate and asymptotic x
			const h = 1e-2
			for (const x of [3.7, 15.2, 35.4]) {
				const pts = new Float64Array([x - 2 * h, x - h, x, x + h, x + 2 * h])
				const [jm2, jm1, j0, jp1, jp2] = specialFunctionsTypedRecursive(pts, 'besselJ0')
				const d1 = (jm2 - 8 * jm1 + 8 * jp1 - jp2) / (12 * h)
				const d2 = (-jm2 + 16 * jm1 - 30 * j0 + 16 * jp1 - jp2) / (12 * h * h)
				const residual = x * d2 + d1 + x * j0
				assertClose(residual, 0, 0, 1e-8, `Bessel ODE residual at x=${x}`)
			}
		})

		test('handles NaN and infinities', () => {
			const special = new Float64Array([NaN, Infinity, -Infinity])
			const out = specialFunctionsTypedRecursive(special, 'besselJ0')
			assert.ok(Number.isNaN(out[0]))
			assert.strictEqual(out[1], 0)
			assert.strictEqual(out[2], 0)
		})
	})
})
