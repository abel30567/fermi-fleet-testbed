import { test } from 'node:test'
import assert from 'node:assert/strict'
import { specialFunctionsComplexIterative } from './specialFunctionsComplexIterative.js'

const EULER_MASCHERONI = 0.57721566490153286

function assertComplexClose(actual, expected, tol = 1e-10, label = '') {
	const prefix = label ? `${label}: ` : ''
	assert.equal(typeof actual.re, 'number', `${prefix}re should be a number`)
	assert.equal(typeof actual.im, 'number', `${prefix}im should be a number`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${prefix}re mismatch: got ${actual.re}, expected ${expected.re} (diff=${Math.abs(actual.re - expected.re)}, tol=${tol})`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${prefix}im mismatch: got ${actual.im}, expected ${expected.im} (diff=${Math.abs(actual.im - expected.im)}, tol=${tol})`
	)
}

function cMul(a, b) {
	return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
}

function cDiv(a, b) {
	const d = b.re * b.re + b.im * b.im
	return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }
}

function cExp(z) {
	const r = Math.exp(z.re)
	return { re: r * Math.cos(z.im), im: r * Math.sin(z.im) }
}

function cSin(z) {
	return {
		re: Math.sin(z.re) * Math.cosh(z.im),
		im: Math.cos(z.re) * Math.sinh(z.im),
	}
}

function cCos(z) {
	return {
		re: Math.cos(z.re) * Math.cosh(z.im),
		im: -Math.sin(z.re) * Math.sinh(z.im),
	}
}

function cSqrt(z) {
	const r = Math.hypot(z.re, z.im)
	const theta = Math.atan2(z.im, z.re) / 2
	const sr = Math.sqrt(r)
	return { re: sr * Math.cos(theta), im: sr * Math.sin(theta) }
}

test('gamma: known real, half-integer, and complex values', () => {
	// Factorials: Gamma(n) = (n - 1)!
	assertComplexClose(specialFunctionsComplexIterative('gamma', { re: 1, im: 0 }), { re: 1, im: 0 }, 1e-12)
	assertComplexClose(specialFunctionsComplexIterative('gamma', { re: 5, im: 0 }), { re: 24, im: 0 }, 1e-12)
	assertComplexClose(specialFunctionsComplexIterative('gamma', { re: 7, im: 0 }), { re: 720, im: 0 }, 1e-10)

	// Half-integers
	assertComplexClose(
		specialFunctionsComplexIterative('gamma', { re: 0.5, im: 0 }),
		{ re: Math.sqrt(Math.PI), im: 0 },
		1e-12
	)
	assertComplexClose(
		specialFunctionsComplexIterative('gamma', { re: -0.5, im: 0 }),
		{ re: -2 * Math.sqrt(Math.PI), im: 0 },
		1e-12
	)
	assertComplexClose(
		specialFunctionsComplexIterative('gamma', { re: -1.5, im: 0 }),
		{ re: (4 / 3) * Math.sqrt(Math.PI), im: 0 },
		1e-12
	)

	// Known complex value: |Gamma(i)|^2 = pi / sinh(pi)
	const gammaI = specialFunctionsComplexIterative('gamma', { re: 0, im: 1 })
	const absSq = gammaI.re * gammaI.re + gammaI.im * gammaI.im
	assert.ok(Math.abs(absSq - Math.PI / Math.sinh(Math.PI)) < 1e-12)
})

test('gamma: cross-checks with recurrence, Euler reflection, and Legendre duplication identities', () => {
	const testPoints = [
		{ re: 1.3, im: 2.1 },
		{ re: -0.7, im: 1.5 },
		{ re: 0.25, im: -0.8 },
		{ re: -2.4, im: -1.1 },
	]

	for (const z of testPoints) {
		const gz = specialFunctionsComplexIterative('gamma', z)
		const gz1 = specialFunctionsComplexIterative('gamma', { re: z.re + 1, im: z.im })
		// Recurrence: Gamma(z + 1) = z * Gamma(z)
		assertComplexClose(gz1, cMul(z, gz), 1e-10, `gamma recurrence at (${z.re}, ${z.im})`)

		// Euler reflection: Gamma(z) * Gamma(1 - z) = pi / sin(pi * z)
		const g1mz = specialFunctionsComplexIterative('gamma', { re: 1 - z.re, im: -z.im })
		const prod = cMul(gz, g1mz)
		const rhs = cDiv({ re: Math.PI, im: 0 }, cSin({ re: Math.PI * z.re, im: Math.PI * z.im }))
		assertComplexClose(prod, rhs, 1e-10, `Euler reflection at (${z.re}, ${z.im})`)
	}

	// Legendre duplication: Gamma(z) * Gamma(z + 0.5) = 2^{1 - 2z} * sqrt(pi) * Gamma(2z)
	const z = { re: 1.2, im: 0.9 }
	const lhs = cMul(
		specialFunctionsComplexIterative('gamma', z),
		specialFunctionsComplexIterative('gamma', { re: z.re + 0.5, im: z.im })
	)
	const twoPow = cExp({ re: (1 - 2 * z.re) * Math.LN2, im: -2 * z.im * Math.LN2 })
	const g2z = specialFunctionsComplexIterative('gamma', { re: 2 * z.re, im: 2 * z.im })
	const rhs = cMul({ re: Math.sqrt(Math.PI), im: 0 }, cMul(twoPow, g2z))
	assertComplexClose(lhs, rhs, 1e-10, 'Legendre duplication')
})

test('logGamma: inverse cross-check exp(logGamma(z)) === gamma(z) and recurrence', () => {
	const points = [
		{ re: 1, im: 0 },
		{ re: 6, im: 0 },
		{ re: 0.25, im: 0 },
		{ re: 2.5, im: 3.1 },
		{ re: -1.3, im: 2.2 },
		{ re: -2.7, im: -0.9 },
		{ re: -0.5, im: 0 },
	]

	for (const z of points) {
		const lg = specialFunctionsComplexIterative('logGamma', z)
		const g = specialFunctionsComplexIterative('gamma', z)
		assertComplexClose(cExp(lg), g, 1e-10, `exp(logGamma) at (${z.re}, ${z.im})`)
	}

	// Large real value where Gamma(z) would overflow, logGamma remains finite: ln(200!)
	let expectedLn200Fact = 0
	for (let k = 2; k <= 200; k++) {
		expectedLn200Fact += Math.log(k)
	}
	assertComplexClose(
		specialFunctionsComplexIterative('logGamma', { re: 201, im: 0 }),
		{ re: expectedLn200Fact, im: 0 },
		1e-9
	)
})

test('digamma: exact values, recurrence, reflection, and numerical derivative cross-check', () => {
	// psi(1) = -gamma, psi(1/2) = -gamma - 2*ln(2), psi(4) = -gamma + 1 + 1/2 + 1/3
	assertComplexClose(
		specialFunctionsComplexIterative('digamma', { re: 1, im: 0 }),
		{ re: -EULER_MASCHERONI, im: 0 },
		1e-12
	)
	assertComplexClose(
		specialFunctionsComplexIterative('digamma', { re: 0.5, im: 0 }),
		{ re: -EULER_MASCHERONI - 2 * Math.LN2, im: 0 },
		1e-12
	)
	assertComplexClose(
		specialFunctionsComplexIterative('digamma', { re: 4, im: 0 }),
		{ re: -EULER_MASCHERONI + 1 + 0.5 + 1 / 3, im: 0 },
		1e-12
	)

	// Complex points: recurrence psi(z+1) - psi(z) = 1/z and reflection psi(1-z) - psi(z) = pi*cot(pi*z)
	const points = [
		{ re: 1.4, im: 2.3 },
		{ re: -1.6, im: 0.8 },
		{ re: 0.2, im: -1.7 },
	]
	for (const z of points) {
		const pz = specialFunctionsComplexIterative('digamma', z)
		const pz1 = specialFunctionsComplexIterative('digamma', { re: z.re + 1, im: z.im })
		const invZ = cDiv({ re: 1, im: 0 }, z)
		assertComplexClose(
			{ re: pz1.re - pz.re, im: pz1.im - pz.im },
			invZ,
			1e-12,
			`digamma recurrence at (${z.re}, ${z.im})`
		)

		const p1mz = specialFunctionsComplexIterative('digamma', { re: 1 - z.re, im: -z.im })
		const piZ = { re: Math.PI * z.re, im: Math.PI * z.im }
		const piCot = cMul({ re: Math.PI, im: 0 }, cDiv(cCos(piZ), cSin(piZ)))
		assertComplexClose(
			{ re: p1mz.re - pz.re, im: p1mz.im - pz.im },
			piCot,
			1e-11,
			`digamma reflection at (${z.re}, ${z.im})`
		)
	}

	// Independent cross-check: central finite difference of logGamma along real axis
	const z0 = { re: 2.3, im: 1.7 }
	const h = 1e-6
	const lgPlus = specialFunctionsComplexIterative('logGamma', { re: z0.re + h, im: z0.im })
	const lgMinus = specialFunctionsComplexIterative('logGamma', { re: z0.re - h, im: z0.im })
	const numericDeriv = {
		re: (lgPlus.re - lgMinus.re) / (2 * h),
		im: (lgPlus.im - lgMinus.im) / (2 * h),
	}
	const psiZ0 = specialFunctionsComplexIterative('digamma', z0)
	assertComplexClose(psiZ0, numericDeriv, 1e-8, 'digamma vs d/dz logGamma')
})

test('erf and erfc: values, symmetries, large-argument erfc, and Simpson quadrature cross-check', () => {
	assertComplexClose(specialFunctionsComplexIterative('erf', { re: 0, im: 0 }), { re: 0, im: 0 }, 1e-15)
	assertComplexClose(specialFunctionsComplexIterative('erfc', { re: 0, im: 0 }), { re: 1, im: 0 }, 1e-15)

	// Reference real values
	assertComplexClose(
		specialFunctionsComplexIterative('erf', { re: 1, im: 0 }),
		{ re: 0.8427007929497149, im: 0 },
		1e-12
	)
	assertComplexClose(
		specialFunctionsComplexIterative('erfc', { re: 4, im: 0 }),
		{ re: 1.5417257900280018e-8, im: 0 },
		1e-16
	)
	assertComplexClose(
		specialFunctionsComplexIterative('erfc', { re: 6, im: 0 }),
		{ re: 2.1519736712498916e-17, im: 0 },
		1e-26
	)

	// Symmetries: erf(-z) = -erf(z), erf(conj(z)) = conj(erf(z)), erf(z) + erfc(z) = 1
	const samplePoints = [
		{ re: 0.7, im: 1.2 },
		{ re: -1.5, im: 0.9 },
		{ re: 2.8, im: -1.1 },
		{ re: 0, im: 2.5 },
		{ re: 4.5, im: 2.0 },
	]
	for (const z of samplePoints) {
		const ez = specialFunctionsComplexIterative('erf', z)
		const ecz = specialFunctionsComplexIterative('erfc', z)
		const emz = specialFunctionsComplexIterative('erf', { re: -z.re, im: -z.im })
		const eConj = specialFunctionsComplexIterative('erf', { re: z.re, im: -z.im })

		assertComplexClose({ re: ez.re + ecz.re, im: ez.im + ecz.im }, { re: 1, im: 0 }, 1e-11)
		assertComplexClose(emz, { re: -ez.re, im: -ez.im }, 1e-11)
		assertComplexClose(eConj, { re: ez.re, im: -ez.im }, 1e-11)
	}

	// Independent cross-check: composite Simpson contour integral (2/sqrt(pi)) * int_0^1 z * exp(-(u*z)^2) du
	function simpsonErf(z, steps = 4000) {
		const h = 1 / steps
		let accRe = 0
		let accIm = 0
		for (let i = 0; i <= steps; i++) {
			const u = i * h
			const w = i === 0 || i === steps ? 1 : i % 2 === 1 ? 4 : 2
			const uz = { re: u * z.re, im: u * z.im }
			const negUz2 = { re: -(uz.re * uz.re - uz.im * uz.im), im: -2 * uz.re * uz.im }
			const val = cMul(z, cExp(negUz2))
			accRe += w * val.re
			accIm += w * val.im
		}
		const scale = (2 / Math.sqrt(Math.PI)) * (h / 3)
		return { re: accRe * scale, im: accIm * scale }
	}

	const contourPoints = [
		{ re: 1.1, im: 0.8 },
		{ re: -0.6, im: 1.4 },
		{ re: 2.2, im: -1.3 },
		{ re: 0, im: 1.8 },
	]
	for (const z of contourPoints) {
		assertComplexClose(
			specialFunctionsComplexIterative('erf', z),
			simpsonErf(z),
			1e-10,
			`erf vs Simpson contour integral at (${z.re}, ${z.im})`
		)
	}
})

test('besselJ: boundary values, closed-form half-integer cross-checks, recurrence, and Neumann sum', () => {
	// Boundary values at z = 0
	assertComplexClose(specialFunctionsComplexIterative('besselJ', { re: 0, im: 0 }), { re: 1, im: 0 }, 1e-15)
	assertComplexClose(
		specialFunctionsComplexIterative('besselJ', { re: 0, im: 0 }, { order: 2 }),
		{ re: 0, im: 0 },
		1e-15
	)
	assertComplexClose(
		specialFunctionsComplexIterative('besselJ', { re: 0, im: 0 }, { order: -3 }),
		{ re: 0, im: 0 },
		1e-15
	)

	// Closed-form cross-check: J_{1/2}(z) = sqrt(2/(pi*z)) * sin(z), J_{-1/2}(z) = sqrt(2/(pi*z)) * cos(z)
	const complexZ = [
		{ re: 1.5, im: 0 },
		{ re: 1.2, im: 0.9 },
		{ re: 2.4, im: -1.3 },
		{ re: -1.1, im: 1.7 },
	]
	for (const z of complexZ) {
		const coeff = cSqrt(cDiv({ re: 2, im: 0 }, { re: Math.PI * z.re, im: Math.PI * z.im }))
		const expectedHalf = cMul(coeff, cSin(z))
		const expectedNegHalf = cMul(coeff, cCos(z))

		assertComplexClose(
			specialFunctionsComplexIterative('besselJ', z, { order: 0.5 }),
			expectedHalf,
			1e-11,
			`J_{1/2} closed form at (${z.re}, ${z.im})`
		)
		assertComplexClose(
			specialFunctionsComplexIterative('besselJ', z, { order: -0.5 }),
			expectedNegHalf,
			1e-11,
			`J_{-1/2} closed form at (${z.re}, ${z.im})`
		)
	}

	// Recurrence identity for complex order: J_{nu-1}(z) + J_{nu+1}(z) = (2*nu/z) * J_nu(z)
	const z = { re: 1.8, im: -0.7 }
	const nu = { re: 1.3, im: 0.4 }
	const jPrev = specialFunctionsComplexIterative('besselJ', z, { order: { re: nu.re - 1, im: nu.im } })
	const jCur = specialFunctionsComplexIterative('besselJ', z, { order: nu })
	const jNext = specialFunctionsComplexIterative('besselJ', z, { order: { re: nu.re + 1, im: nu.im } })
	const lhs = { re: jPrev.re + jNext.re, im: jPrev.im + jNext.im }
	const rhs = cMul(cDiv({ re: 2 * nu.re, im: 2 * nu.im }, z), jCur)
	assertComplexClose(lhs, rhs, 1e-11, 'complex-order Bessel recurrence')

	// Negative integer parity: J_{-n}(z) = (-1)^n J_n(z)
	const j3 = specialFunctionsComplexIterative('besselJ', z, { order: 3 })
	const jNeg3 = specialFunctionsComplexIterative('besselJ', z, { order: -3 })
	assertComplexClose(jNeg3, { re: -j3.re, im: -j3.im }, 1e-12)

	// Neumann addition identity: J_0(z)^2 + 2 * sum_{k=1}^{20} J_k(z)^2 = 1
	const j0 = specialFunctionsComplexIterative('besselJ', z, { order: 0 })
	let neumann = cMul(j0, j0)
	for (let k = 1; k <= 20; k++) {
		const jk = specialFunctionsComplexIterative('besselJ', z, { order: k })
		const jk2 = cMul(jk, jk)
		neumann = { re: neumann.re + 2 * jk2.re, im: neumann.im + 2 * jk2.im }
	}
	assertComplexClose(neumann, { re: 1, im: 0 }, 1e-11, 'Neumann sum identity')
})

test('zeta: known constants, trivial zeros, critical-line zero, Dirichlet series, and functional equation', () => {
	// Known exact values
	assertComplexClose(specialFunctionsComplexIterative('zeta', { re: 2, im: 0 }), { re: Math.PI ** 2 / 6, im: 0 }, 1e-12)
	assertComplexClose(specialFunctionsComplexIterative('zeta', { re: 4, im: 0 }), { re: Math.PI ** 4 / 90, im: 0 }, 1e-12)
	assertComplexClose(specialFunctionsComplexIterative('zeta', { re: 0, im: 0 }), { re: -0.5, im: 0 }, 1e-12)
	assertComplexClose(specialFunctionsComplexIterative('zeta', { re: -1, im: 0 }), { re: -1 / 12, im: 0 }, 1e-12)
	assertComplexClose(specialFunctionsComplexIterative('zeta', { re: -3, im: 0 }), { re: 1 / 120, im: 0 }, 1e-12)

	// Trivial zeros at negative even integers
	assertComplexClose(specialFunctionsComplexIterative('zeta', { re: -2, im: 0 }), { re: 0, im: 0 }, 1e-14)
	assertComplexClose(specialFunctionsComplexIterative('zeta', { re: -4, im: 0 }), { re: 0, im: 0 }, 1e-14)
	assertComplexClose(specialFunctionsComplexIterative('zeta', { re: -6, im: 0 }), { re: 0, im: 0 }, 1e-14)

	// First nontrivial zero on the critical line: s = 0.5 + 14.13472514173469379i
	const firstZero = specialFunctionsComplexIterative('zeta', {
		re: 0.5,
		im: 14.13472514173469379,
	})
	assertComplexClose(firstZero, { re: 0, im: 0 }, 1e-11, 'first nontrivial Riemann zero')

	// Independent cross-check: direct Dirichlet series sum_{n=1}^{500} n^{-s} at Re(s) = 4
	const sDir = { re: 4, im: 2.5 }
	let dirSum = { re: 0, im: 0 }
	for (let n = 1; n <= 500; n++) {
		const lnN = Math.log(n)
		const term = cExp({ re: -sDir.re * lnN, im: -sDir.im * lnN })
		dirSum = { re: dirSum.re + term.re, im: dirSum.im + term.im }
	}
	assertComplexClose(
		specialFunctionsComplexIterative('zeta', sDir),
		dirSum,
		1e-8,
		'zeta vs direct Dirichlet series'
	)

	// Functional equation cross-check across critical strip:
	// zeta(s) = 2^s * pi^{s-1} * sin(pi*s/2) * Gamma(1-s) * zeta(1-s)
	const sFunc = { re: 0.3, im: 2.1 }
	const zs = specialFunctionsComplexIterative('zeta', sFunc)
	const z1ms = specialFunctionsComplexIterative('zeta', { re: 1 - sFunc.re, im: -sFunc.im })
	const g1ms = specialFunctionsComplexIterative('gamma', { re: 1 - sFunc.re, im: -sFunc.im })
	const twoS = cExp({ re: sFunc.re * Math.LN2, im: sFunc.im * Math.LN2 })
	const piSm1 = cExp({ re: (sFunc.re - 1) * Math.log(Math.PI), im: sFunc.im * Math.log(Math.PI) })
	const sinHalf = cSin({ re: (Math.PI * sFunc.re) / 2, im: (Math.PI * sFunc.im) / 2 })
	const rhs = cMul(cMul(cMul(twoS, piSm1), sinHalf), cMul(g1ms, z1ms))
	assertComplexClose(zs, rhs, 1e-11, 'Riemann functional equation')

	// Removable zero of (1 - 2^{1-s}) at s = 1 + 2*pi*i / ln(2) should evaluate cleanly without pole error
	const removable = specialFunctionsComplexIterative('zeta', {
		re: 1,
		im: (2 * Math.PI) / Math.LN2,
	})
	assert.ok(Number.isFinite(removable.re) && Number.isFinite(removable.im))
})

test('input validation and domain error handling', () => {
	// Invalid fnName
	assert.throws(() => specialFunctionsComplexIterative(123, { re: 1, im: 0 }), TypeError)
	assert.throws(() => specialFunctionsComplexIterative(null, { re: 1, im: 0 }), TypeError)
	assert.throws(() => specialFunctionsComplexIterative('', { re: 1, im: 0 }), RangeError)
	assert.throws(() => specialFunctionsComplexIterative('unknownFn', { re: 1, im: 0 }), RangeError)

	// Invalid z
	assert.throws(() => specialFunctionsComplexIterative('gamma', null), TypeError)
	assert.throws(() => specialFunctionsComplexIterative('gamma', 2), TypeError)
	assert.throws(() => specialFunctionsComplexIterative('gamma', [1, 0]), TypeError)
	assert.throws(() => specialFunctionsComplexIterative('gamma', { re: '1', im: 0 }), TypeError)
	assert.throws(() => specialFunctionsComplexIterative('gamma', { re: 1 }), TypeError)
	assert.throws(() => specialFunctionsComplexIterative('gamma', { re: NaN, im: 0 }), RangeError)
	assert.throws(() => specialFunctionsComplexIterative('gamma', { re: 1, im: Infinity }), RangeError)
	assert.throws(() => specialFunctionsComplexIterative('gamma', { re: -Infinity, im: 0 }), RangeError)

	// Invalid options
	assert.throws(() => specialFunctionsComplexIterative('erf', { re: 1, im: 0 }, null), TypeError)
	assert.throws(() => specialFunctionsComplexIterative('erf', { re: 1, im: 0 }, []), TypeError)
	assert.throws(() => specialFunctionsComplexIterative('besselJ', { re: 1, im: 0 }, { order: '0' }), TypeError)
	assert.throws(() => specialFunctionsComplexIterative('besselJ', { re: 1, im: 0 }, { order: NaN }), RangeError)
	assert.throws(() => specialFunctionsComplexIterative('erf', { re: 1, im: 0 }, { maxIterations: '10' }), TypeError)
	assert.throws(() => specialFunctionsComplexIterative('erf', { re: 1, im: 0 }, { maxIterations: 0 }), RangeError)
	assert.throws(() => specialFunctionsComplexIterative('erf', { re: 1, im: 0 }, { maxIterations: 2.5 }), RangeError)
	assert.throws(() => specialFunctionsComplexIterative('erf', { re: 1, im: 0 }, { tolerance: '1e-6' }), TypeError)
	assert.throws(() => specialFunctionsComplexIterative('erf', { re: 1, im: 0 }, { tolerance: 0 }), RangeError)
	assert.throws(() => specialFunctionsComplexIterative('erf', { re: 1, im: 0 }, { tolerance: -1e-6 }), RangeError)
	assert.throws(() => specialFunctionsComplexIterative('erf', { re: 1, im: 0 }, { tolerance: Infinity }), RangeError)

	// Poles and singularities
	assert.throws(() => specialFunctionsComplexIterative('gamma', { re: 0, im: 0 }), RangeError)
	assert.throws(() => specialFunctionsComplexIterative('gamma', { re: -3, im: 0 }), RangeError)
	assert.throws(() => specialFunctionsComplexIterative('logGamma', { re: 0, im: 0 }), RangeError)
	assert.throws(() => specialFunctionsComplexIterative('logGamma', { re: -1, im: 0 }), RangeError)
	assert.throws(() => specialFunctionsComplexIterative('digamma', { re: 0, im: 0 }), RangeError)
	assert.throws(() => specialFunctionsComplexIterative('digamma', { re: -5, im: 0 }), RangeError)
	assert.throws(() => specialFunctionsComplexIterative('zeta', { re: 1, im: 0 }), RangeError)
	assert.throws(() => specialFunctionsComplexIterative('besselJ', { re: 0, im: 0 }, { order: -0.5 }), RangeError)
	assert.throws(
		() => specialFunctionsComplexIterative('besselJ', { re: 0, im: 0 }, { order: { re: 0, im: 1 } }),
		RangeError
	)

	// Overflow
	assert.throws(() => specialFunctionsComplexIterative('gamma', { re: 500, im: 0 }), RangeError)
})
