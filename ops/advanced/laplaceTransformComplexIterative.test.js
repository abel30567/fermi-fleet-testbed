import { test } from 'node:test'
import assert from 'node:assert/strict'
import { laplaceTransformComplexIterative } from './laplaceTransformComplexIterative.js'

/** Complex arithmetic helpers for analytical closed-form verification. */
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im })
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im })
const cMul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
const cDiv = (a, b) => {
	const denom = b.re * b.re + b.im * b.im
	return {
		re: (a.re * b.re + a.im * b.im) / denom,
		im: (a.im * b.re - a.re * b.im) / denom,
	}
}
const cExp = (z) => {
	const r = Math.exp(z.re)
	return { re: r * Math.cos(z.im), im: r * Math.sin(z.im) }
}

function assertComplexClose(actual, expected, tol = 1e-6, label = '') {
	const reErr = Math.abs(actual.re - expected.re)
	const imErr = Math.abs(actual.im - expected.im)
	assert.ok(
		reErr <= tol && imErr <= tol,
		`${label ? `${label}: ` : ''}expected (${expected.re}, ${expected.im}), got (${actual.re}, ${actual.im}) (errors: re=${reErr}, im=${imErr}, tol=${tol})`,
	)
}

test('normal case: constant complex function L{c}(s) = c / s', () => {
	const c = { re: 3, im: -4 }
	const s = { re: 2, im: 5 }
	const actual = laplaceTransformComplexIterative(() => c, s)
	const expected = cDiv(c, s)
	assertComplexClose(actual, expected, 1e-6)
})

test('normal case: complex exponential L{e^(a t)}(s) = 1 / (s - a)', () => {
	const a = { re: 0.5, im: 2 }
	const s = { re: 2.5, im: -1 }
	const fn = (t) => cExp({ re: a.re * t, im: a.im * t })
	const actual = laplaceTransformComplexIterative(fn, s)
	const expected = cDiv({ re: 1, im: 0 }, cSub(s, a))
	assertComplexClose(actual, expected, 1e-6)
})

test('normal case: powers L{t^n}(s) = n! / s^(n+1)', () => {
	const s = { re: 2, im: 1 }
	const s2 = cMul(s, s)
	const s3 = cMul(s2, s)
	const s4 = cMul(s3, s)

	assertComplexClose(
		laplaceTransformComplexIterative((t) => ({ re: t, im: 0 }), s),
		cDiv({ re: 1, im: 0 }, s2),
		1e-6,
		't^1',
	)
	assertComplexClose(
		laplaceTransformComplexIterative((t) => ({ re: t * t, im: 0 }), s),
		cDiv({ re: 2, im: 0 }, s3),
		1e-6,
		't^2',
	)
	assertComplexClose(
		laplaceTransformComplexIterative((t) => ({ re: t * t * t, im: 0 }), s),
		cDiv({ re: 6, im: 0 }, s4),
		1e-6,
		't^3',
	)
})

test('normal case: trigonometric functions cos(w t) and sin(w t)', () => {
	const w = 3
	const s = { re: 1.5, im: 2 }
	const denom = cAdd(cMul(s, s), { re: w * w, im: 0 })

	const cosActual = laplaceTransformComplexIterative((t) => ({ re: Math.cos(w * t), im: 0 }), s)
	const cosExpected = cDiv(s, denom)
	assertComplexClose(cosActual, cosExpected, 1e-6, 'cos(3t)')

	const sinActual = laplaceTransformComplexIterative((t) => ({ re: Math.sin(w * t), im: 0 }), s)
	const sinExpected = cDiv({ re: w, im: 0 }, denom)
	assertComplexClose(sinActual, sinExpected, 1e-6, 'sin(3t)')
})

test('normal case: t * e^(a t) matches 1 / (s - a)^2', () => {
	const a = { re: -1, im: 1.5 }
	const s = { re: 1.5, im: -0.5 }
	const fn = (t) => {
		const e = cExp({ re: a.re * t, im: a.im * t })
		return { re: t * e.re, im: t * e.im }
	}
	const diff = cSub(s, a)
	const expected = cDiv({ re: 1, im: 0 }, cMul(diff, diff))
	const actual = laplaceTransformComplexIterative(fn, s)
	assertComplexClose(actual, expected, 1e-6)
})

test('edge case: identically zero function returns exact { re: 0, im: 0 } without -0', () => {
	const res = laplaceTransformComplexIterative(() => ({ re: 0, im: 0 }), { re: 1, im: 2 })
	assert.deepEqual(res, { re: 0, im: 0 })
	assert.equal(Object.is(res.re, -0), false)
	assert.equal(Object.is(res.im, -0), false)
})

test('edge case: Gaussian at s = 0 matches sqrt(pi) / 2', () => {
	const actual = laplaceTransformComplexIterative(
		(t) => ({ re: Math.exp(-t * t), im: 0 }),
		{ re: 0, im: 0 },
		{ tMax: 10, steps: 2000 },
	)
	assertComplexClose(actual, { re: Math.sqrt(Math.PI) / 2, im: 0 }, 1e-10)
})

test('edge case: compactly supported function with negative Re(s) avoids 0 * Infinity NaN', () => {
	// f(t) = (1 - t)^2 for t in [0, 1], 0 for t > 1
	// Exact integral ∫_0^1 (1 - t)^2 e^(-s t) dt = 1/s - 2/s^2 + 2*(1 - e^(-s))/s^3
	const s = { re: -20, im: 2 }
	const fn = (t) => (t <= 1 ? { re: (1 - t) * (1 - t), im: 0 } : { re: 0, im: 0 })
	// With tMax = 50 and s.re = -20, exp(-s.re * 50) = exp(1000) = Infinity,
	// while f(t) = 0 for t > 1; implementation must handle 0 * Infinity safely.
	const actual = laplaceTransformComplexIterative(fn, s, { tMax: 50, steps: 10000 })

	const s2 = cMul(s, s)
	const s3 = cMul(s2, s)
	const one = { re: 1, im: 0 }
	const expNegS = cExp({ re: -s.re, im: -s.im })
	const term1 = cDiv(one, s)
	const term2 = cDiv({ re: 2, im: 0 }, s2)
	const term3 = cDiv(cMul({ re: 2, im: 0 }, cSub(one, expNegS)), s3)
	const expected = cAdd(cSub(term1, term2), term3)

	// Value magnitude is ~1.19e5 because e^(20) is large; verify tight relative accuracy
	const relTol = 1e-5 * Math.hypot(expected.re, expected.im)
	assertComplexClose(actual, expected, relTol)
})

test('edge case: minimal valid steps = 2 and large positive s.re underflow', () => {
	const resMinSteps = laplaceTransformComplexIterative(
		(t) => ({ re: t, im: t }),
		{ re: 0, im: 0 },
		{ tMax: 2, steps: 2 },
	)
	// Simpson's rule is exact for linear polynomials: ∫_0^2 (t + i t) dt = 2 + 2i
	assertComplexClose(resMinSteps, { re: 2, im: 2 }, 1e-12)

	// Large s.re where exp(-s.re * t) underflows to 0 for most of [0, 50]
	const s = { re: 50, im: 0 }
	const resLargeS = laplaceTransformComplexIterative(
		() => ({ re: 1, im: 0 }),
		s,
		{ tMax: 2, steps: 4000 },
	)
	assertComplexClose(resLargeS, { re: 1 / 50, im: 0 }, 1e-8)
})

test('cross-check: Laplace linearity, frequency-shift, and time-scaling identities', () => {
	const f1 = (t) => ({ re: Math.cos(2 * t), im: Math.sin(t) })
	const f2 = (t) => ({ re: t * Math.exp(-0.5 * t), im: Math.exp(-t) })
	const c1 = { re: 2, im: -3 }
	const c2 = { re: -1.5, im: 0.5 }
	const s = { re: 2.5, im: 1.5 }

	// 1. Linearity: L{c1*f1 + c2*f2}(s) == c1*L{f1}(s) + c2*L{f2}(s)
	const lhsLin = laplaceTransformComplexIterative(
		(t) => cAdd(cMul(c1, f1(t)), cMul(c2, f2(t))),
		s,
	)
	const F1 = laplaceTransformComplexIterative(f1, s)
	const F2 = laplaceTransformComplexIterative(f2, s)
	const rhsLin = cAdd(cMul(c1, F1), cMul(c2, F2))
	assertComplexClose(lhsLin, rhsLin, 1e-10, 'linearity')

	// 2. Frequency-shift: L{e^(a t) * f2(t)}(s) == L{f2}(s - a)
	const a = { re: 0.75, im: -1.25 }
	const lhsShift = laplaceTransformComplexIterative(
		(t) => cMul(cExp({ re: a.re * t, im: a.im * t }), f2(t)),
		s,
	)
	const rhsShift = laplaceTransformComplexIterative(f2, cSub(s, a))
	assertComplexClose(lhsShift, rhsShift, 1e-7, 'frequency-shift')

	// 3. Time-scaling: L{f1(c * t)}(s) == (1/c) * L{f1}(s / c) for c > 0
	const scale = 2.5
	const lhsScale = laplaceTransformComplexIterative((t) => f1(scale * t), s)
	const F1Scaled = laplaceTransformComplexIterative(f1, { re: s.re / scale, im: s.im / scale })
	const rhsScale = { re: F1Scaled.re / scale, im: F1Scaled.im / scale }
	assertComplexClose(lhsScale, rhsScale, 1e-6, 'time-scaling')
})

test('cross-check: independent composite midpoint rule agrees on non-elementary complex integrand', () => {
	// Non-elementary integrand: f(t) = ((1 + i*t) / (1 + t^2)) * e^(-t^2 / 2)
	// Converges for all complex s, including Re(s) < 0.
	const fn = (t) => {
		const factor = Math.exp(-0.5 * t * t) / (1 + t * t)
		return { re: factor, im: t * factor }
	}
	const s = { re: -0.5, im: 1.75 }
	const tMax = 12

	// Independent reference: composite midpoint rule
	const midpointSteps = 20000
	const dm = tMax / midpointSteps
	let refRe = 0
	let refIm = 0
	for (let k = 0; k < midpointSteps; k++) {
		const t = (k + 0.5) * dm
		const fVal = fn(t)
		const kernel = cExp({ re: -s.re * t, im: -s.im * t })
		const prod = cMul(fVal, kernel)
		refRe += prod.re
		refIm += prod.im
	}
	const reference = { re: refRe * dm, im: refIm * dm }

	const actual = laplaceTransformComplexIterative(fn, s, { tMax, steps: 4000 })
	assertComplexClose(actual, reference, 1e-7, 'midpoint cross-check')
})

test('validation errors: invalid fn, s, options, fn(t) return value, and overflow', () => {
	const unit = () => ({ re: 1, im: 0 })
	const validS = { re: 1, im: 0 }

	// Invalid fn
	assert.throws(() => laplaceTransformComplexIterative(null, validS), TypeError)
	assert.throws(() => laplaceTransformComplexIterative(42, validS), TypeError)

	// Invalid s
	assert.throws(() => laplaceTransformComplexIterative(unit, null), TypeError)
	assert.throws(() => laplaceTransformComplexIterative(unit, [1, 0]), TypeError)
	assert.throws(() => laplaceTransformComplexIterative(unit, { re: '1', im: 0 }), TypeError)
	assert.throws(() => laplaceTransformComplexIterative(unit, { re: 1 }), TypeError)
	assert.throws(() => laplaceTransformComplexIterative(unit, { re: NaN, im: 0 }), RangeError)
	assert.throws(() => laplaceTransformComplexIterative(unit, { re: 1, im: Infinity }), RangeError)

	// Invalid options
	assert.throws(() => laplaceTransformComplexIterative(unit, validS, null), TypeError)
	assert.throws(() => laplaceTransformComplexIterative(unit, validS, []), TypeError)
	assert.throws(() => laplaceTransformComplexIterative(unit, validS, 'bad'), TypeError)

	// Invalid options.tMax
	assert.throws(() => laplaceTransformComplexIterative(unit, validS, { tMax: '50' }), TypeError)
	assert.throws(() => laplaceTransformComplexIterative(unit, validS, { tMax: null }), TypeError)
	assert.throws(() => laplaceTransformComplexIterative(unit, validS, { tMax: 0 }), RangeError)
	assert.throws(() => laplaceTransformComplexIterative(unit, validS, { tMax: -5 }), RangeError)
	assert.throws(() => laplaceTransformComplexIterative(unit, validS, { tMax: Infinity }), RangeError)
	assert.throws(() => laplaceTransformComplexIterative(unit, validS, { tMax: NaN }), RangeError)

	// Invalid options.steps
	assert.throws(() => laplaceTransformComplexIterative(unit, validS, { steps: '100' }), TypeError)
	assert.throws(() => laplaceTransformComplexIterative(unit, validS, { steps: null }), TypeError)
	assert.throws(() => laplaceTransformComplexIterative(unit, validS, { steps: 0 }), RangeError)
	assert.throws(() => laplaceTransformComplexIterative(unit, validS, { steps: 1 }), RangeError)
	assert.throws(() => laplaceTransformComplexIterative(unit, validS, { steps: 3 }), RangeError)
	assert.throws(() => laplaceTransformComplexIterative(unit, validS, { steps: -4 }), RangeError)
	assert.throws(() => laplaceTransformComplexIterative(unit, validS, { steps: 10.5 }), RangeError)
	assert.throws(() => laplaceTransformComplexIterative(unit, validS, { steps: Infinity }), RangeError)

	// Invalid fn(t) return value
	assert.throws(() => laplaceTransformComplexIterative(() => 1, validS), TypeError)
	assert.throws(() => laplaceTransformComplexIterative(() => null, validS), TypeError)
	assert.throws(() => laplaceTransformComplexIterative(() => ({ re: NaN, im: 0 }), validS), RangeError)
	assert.throws(() => laplaceTransformComplexIterative(() => ({ re: 0, im: -Infinity }), validS), RangeError)

	// Divergent / overflowing integral
	assert.throws(
		() => laplaceTransformComplexIterative(unit, { re: -100, im: 0 }, { tMax: 50, steps: 100 }),
		RangeError,
	)
})
