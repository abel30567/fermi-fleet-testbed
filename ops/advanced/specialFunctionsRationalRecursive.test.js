import test from 'node:test'
import assert from 'node:assert/strict'
import { specialFunctionsRationalRecursive as sf } from './specialFunctionsRationalRecursive.js'

const q = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

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

function assertNormalized(r, expectedNum, expectedDen) {
	assert.equal(typeof r, 'object')
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms, got ${r.num}/${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	}
	if (expectedNum !== undefined) {
		assert.deepEqual(r, { num: BigInt(expectedNum), den: BigInt(expectedDen ?? 1n) })
	}
}

test('gamma: positive integers, edge cases, and integer rational inputs', () => {
	assertNormalized(sf('gamma', 1), 1n, 1n)
	assertNormalized(sf('gamma', 2), 1n, 1n)
	assertNormalized(sf('gamma', 5), 24n, 1n)
	assertNormalized(sf('gamma', 10n), 362880n, 1n)
	assertNormalized(sf('gamma', q(12, 2)), 120n, 1n) // 6 -> 5! = 120
	assertNormalized(sf('gamma', 21), 2432902008176640000n, 1n) // 20!
})

test('beta: exact rational values and symmetry B(p, q) = B(q, p)', () => {
	assertNormalized(sf('beta', 1, 1), 1n, 1n)
	assertNormalized(sf('beta', 2, 3), 1n, 12n)
	assertNormalized(sf('beta', 3, 2), 1n, 12n)
	assertNormalized(sf('beta', 3, 3), 1n, 30n)
	assertNormalized(sf('beta', 5, 7), 1n, 2310n)
	assert.deepEqual(sf('beta', 7, 5), sf('beta', 5, 7))
})

test('pochhammer and falling factorials: normal, zero, negative order, and unnormalized inputs', () => {
	assertNormalized(sf('pochhammer', q(3, 2), 0), 1n, 1n)
	assertNormalized(sf('pochhammer', q(1, 2), 4), 105n, 16n) // (1/2)(3/2)(5/2)(7/2)
	assertNormalized(sf('pochhammer', q(-2, 1), 3), 0n, 1n) // (-2)(-1)(0) = 0
	assertNormalized(sf('pochhammer', q(4, -2), 2), 2n, 1n) // x = -2 -> (-2)(-1) = 2
	assertNormalized(sf('pochhammer', q(3, 1), -2), 1n, 2n) // 1 / ((1)_2) = 1/2
	assertNormalized(sf('pochhammer', q(1, 2), -2), 4n, 3n) // 1 / ((-3/2)(-1/2)) = 4/3

	assertNormalized(sf('falling', q(5, 2), 0), 1n, 1n)
	assertNormalized(sf('falling', q(5, 2), 3), 15n, 8n) // (5/2)(3/2)(1/2)
	assertNormalized(sf('falling', q(3, 1), 4), 0n, 1n)
})

test('binomial: standard, fractional, negative upper, and negative lower index', () => {
	assertNormalized(sf('binomial', q(10, 1), 4), 210n, 1n)
	assertNormalized(sf('binomial', q(1, 2), 3), 1n, 16n)
	assertNormalized(sf('binomial', q(-1, 1), 5), -1n, 1n)
	assertNormalized(sf('binomial', q(-1, 1), 6), 1n, 1n)
	assertNormalized(sf('binomial', q(5, 3), 0), 1n, 1n)
	assertNormalized(sf('binomial', q(5, 3), -3), 0n, 1n)
})

test('harmonic and digammaDiff: exact rational sums and identity H_n = psi(1+n) - psi(1)', () => {
	assertNormalized(sf('harmonic', 0), 0n, 1n)
	assertNormalized(sf('harmonic', 1), 1n, 1n)
	assertNormalized(sf('harmonic', 4), 25n, 12n)
	assertNormalized(sf('harmonic', 3, 2), 49n, 36n)
	assertNormalized(sf('harmonic', 4, 3), 2035n, 1728n)

	assertNormalized(sf('digammaDiff', q(1, 2), 0), 0n, 1n)
	assertNormalized(sf('digammaDiff', q(1, 2), 3), 46n, 15n) // 2 + 2/3 + 2/5 = 46/15
	assert.deepEqual(sf('digammaDiff', q(1, 1), 15), sf('harmonic', 15, 1))
})

test('bernoulli and zetaNeg: exact classical values', () => {
	assertNormalized(sf('bernoulli', 0), 1n, 1n)
	assertNormalized(sf('bernoulli', 1), -1n, 2n)
	assertNormalized(sf('bernoulli', 2), 1n, 6n)
	assertNormalized(sf('bernoulli', 3), 0n, 1n)
	assertNormalized(sf('bernoulli', 4), -1n, 30n)
	assertNormalized(sf('bernoulli', 6), 1n, 42n)
	assertNormalized(sf('bernoulli', 10), 5n, 66n)
	assertNormalized(sf('bernoulli', 12), -691n, 2730n)

	assertNormalized(sf('zetaNeg', 0), -1n, 2n)
	assertNormalized(sf('zetaNeg', 1), -1n, 12n)
	assertNormalized(sf('zetaNeg', 2), 0n, 1n)
	assertNormalized(sf('zetaNeg', 3), 1n, 120n)
	assertNormalized(sf('zetaNeg', 5), -1n, 252n)
	assertNormalized(sf('zetaNeg', 11), 691n, 32760n)
})

test('orthogonal polynomials: legendre, chebyshevT, chebyshevU, hermite, laguerre', () => {
	const x = q(2, 3)
	// P_0 = 1, P_1 = x, P_2 = (3x^2 - 1)/2 = (4/3 - 1)/2 = 1/6, P_3 = (5x^3 - 3x)/2 = -7/27
	assertNormalized(sf('legendre', 0, x), 1n, 1n)
	assertNormalized(sf('legendre', 1, x), 2n, 3n)
	assertNormalized(sf('legendre', 2, x), 1n, 6n)
	assertNormalized(sf('legendre', 3, x), -7n, 27n)
	assertNormalized(sf('legendre', 10, q(1, 1)), 1n, 1n)
	assertNormalized(sf('legendre', 9, q(-1, 1)), -1n, 1n)

	// Chebyshev T_n(2/3): T_0=1, T_1=2/3, T_2=-1/9, T_3=-22/27, T_4=-79/81
	assertNormalized(sf('chebyshevT', 0, x), 1n, 1n)
	assertNormalized(sf('chebyshevT', 1, x), 2n, 3n)
	assertNormalized(sf('chebyshevT', 2, x), -1n, 9n)
	assertNormalized(sf('chebyshevT', 3, x), -22n, 27n)
	assertNormalized(sf('chebyshevT', 4, x), -79n, 81n)

	// Chebyshev U_n(2/3): U_0=1, U_1=4/3, U_2=7/9, U_3=-8/27
	assertNormalized(sf('chebyshevU', 0, x), 1n, 1n)
	assertNormalized(sf('chebyshevU', 1, x), 4n, 3n)
	assertNormalized(sf('chebyshevU', 2, x), 7n, 9n)
	assertNormalized(sf('chebyshevU', 3, x), -8n, 27n)

	// Hermite H_n(3/2): H_0=1, H_1=3, H_2=4*(9/4)-2=7, H_3=8*(27/8)-18=9
	assertNormalized(sf('hermite', 0, q(3, 2)), 1n, 1n)
	assertNormalized(sf('hermite', 1, q(3, 2)), 3n, 1n)
	assertNormalized(sf('hermite', 2, q(3, 2)), 7n, 1n)
	assertNormalized(sf('hermite', 3, q(3, 2)), 9n, 1n)

	// Laguerre L_n(x): L_0=1, L_1=1-x, L_2=(x^2-4x+2)/2
	assertNormalized(sf('laguerre', 0, q(1, 2)), 1n, 1n)
	assertNormalized(sf('laguerre', 1, q(1, 2)), 1n, 2n)
	assertNormalized(sf('laguerre', 2, q(1, 2)), 1n, 8n)
	// Generalized Laguerre L_2^(1/2)(1) = (1^2 - 2*(5/2)*1 + (5/2)*(3/2)) / 2 = (1 - 5 + 15/4)/2 = -1/8
	assertNormalized(sf('laguerre', 2, q(1, 1), q(1, 2)), -1n, 8n)
})

test('hypergeom: exact terminating polynomials and truncated non-terminating series', () => {
	// _0 F_0(; ; 1) truncated to 6 terms = sum_{k=0}^5 1/k! = 163/60
	assertNormalized(sf('hypergeom', [], [], q(1, 1), 6), 163n, 60n)
	// _1 F_0(1; ; 1/2) truncated to 5 terms = 1 + 1/2 + 1/4 + 1/8 + 1/16 = 31/16
	assertNormalized(sf('hypergeom', [q(1, 1)], [], q(1, 2), 5), 31n, 16n)
	// _2 F_1(-4, 2; 3; 1) = Chu-Vandermonde = (3-2)_4 / (3)_4 = (1)_4 / (3)_4 = 24 / 360 = 1/15
	assertNormalized(sf('hypergeom', [q(-4, 1), q(2, 1)], [q(3, 1)], q(1, 1)), 1n, 15n)
	// z = 0 always returns 1
	assertNormalized(sf('hypergeom', [q(1, 2)], [q(3, 2)], q(0, 1), 5), 1n, 1n)
})

test('independent cross-checks: hypergeometric, polynomial, and combinatorial identities', () => {
	const x = q(3, 5)
	const oneMinusXOver2 = q(1, 5) // (1 - 3/5) / 2 = 1/5

	// 1. Legendre via hypergeometric: P_n(x) = _2F_1(-n, n+1; 1; (1-x)/2)
	for (let n = 0; n <= 8; n++) {
		assert.deepEqual(
			sf('legendre', n, x),
			sf('hypergeom', [q(-n), q(n + 1)], [q(1)], oneMinusXOver2),
			`Legendre/hypergeom mismatch at n=${n}`
		)
	}

	// 2. Chebyshev T_n via hypergeometric: T_n(x) = _2F_1(-n, n; 1/2; (1-x)/2)
	for (let n = 0; n <= 8; n++) {
		assert.deepEqual(
			sf('chebyshevT', n, x),
			sf('hypergeom', [q(-n), q(n)], [q(1, 2)], oneMinusXOver2),
			`ChebyshevT/hypergeom mismatch at n=${n}`
		)
	}

	// 3. Chebyshev identity: T_n(x)^2 - (x^2 - 1) * U_{n-1}(x)^2 = 1
	for (let n = 1; n <= 10; n++) {
		const tn = sf('chebyshevT', n, x)
		const un1 = sf('chebyshevU', n - 1, x)
		// Compute lhs = tn^2 - (x^2 - 1) * un1^2 independently with BigInt
		const x2m1Num = x.num * x.num - x.den * x.den
		const x2m1Den = x.den * x.den
		const term1Num = tn.num * tn.num
		const term1Den = tn.den * tn.den
		const term2Num = x2m1Num * un1.num * un1.num
		const term2Den = x2m1Den * un1.den * un1.den
		const lhsNum = term1Num * term2Den - term2Num * term1Den
		const lhsDen = term1Den * term2Den
		assert.equal(lhsNum, lhsDen, `Pell identity failed for Chebyshev at n=${n}`)
	}

	// 4. Generalized Laguerre via hypergeometric: L_n^(alpha)(x) = C(n+alpha, n) * _1F_1(-n; alpha+1; x)
	const alpha = q(3, 4)
	for (let n = 0; n <= 6; n++) {
		const lag = sf('laguerre', n, x, alpha)
		const bin = sf('binomial', q(4 * n + 3, 4), n)
		const hyp = sf('hypergeom', [q(-n)], [q(7, 4)], x)
		const prodNum = bin.num * hyp.num
		const prodDen = bin.den * hyp.den
		const g = gcd(prodNum, prodDen)
		assert.deepEqual(lag, { num: prodNum / g, den: prodDen / g }, `Laguerre/hypergeom mismatch at n=${n}`)
	}

	// 5. Faulhaber's formula cross-check for Bernoulli numbers:
	// sum_{k=0}^{m-1} k^p = (1 / (p+1)) * sum_{j=0}^p C(p+1, j) * B_j * m^{p+1-j}
	const m = 11n
	for (let p = 1; p <= 8; p++) {
		let directSum = 0n
		for (let k = 0n; k < m; k++) {
			directSum += k ** BigInt(p)
		}
		let num = 0n
		let den = 1n
		for (let j = 0; j <= p; j++) {
			const bj = sf('bernoulli', j)
			const c = sf('binomial', q(p + 1), j).num
			const mPow = m ** BigInt(p + 1 - j)
			const tNum = c * bj.num * mPow
			const tDen = bj.den
			num = num * tDen + tNum * den
			den = den * tDen
		}
		den *= BigInt(p + 1)
		assert.equal(num % den, 0n)
		assert.equal(num / den, directSum, `Faulhaber cross-check failed at p=${p}`)
	}

	// 6. Beta vs Gamma/Binomial cross-check: B(p, q) = 1 / ((p + q - 1) * C(p + q - 2, p - 1))
	for (let p = 1; p <= 6; p++) {
		for (let r = 1; r <= 6; r++) {
			const b = sf('beta', p, r)
			const c = sf('binomial', q(p + r - 2), p - 1)
			assert.deepEqual(b, { num: 1n, den: BigInt(p + r - 1) * c.num })
		}
	}
})

test('invalid inputs throw appropriate TypeError or RangeError', () => {
	assert.throws(() => sf('', 1), TypeError)
	assert.throws(() => sf(123, 1), TypeError)
	assert.throws(() => sf('unknownFn', 1), RangeError)

	// Invalid rational inputs and zero denominators
	assert.throws(() => sf('legendre', 2, 0.5), TypeError)
	assert.throws(() => sf('legendre', 2, { num: 1, den: 2 }), TypeError)
	assert.throws(() => sf('legendre', 2, { num: 1n, den: 0n }), RangeError)
	assert.throws(() => sf('legendre', 2, null), TypeError)

	// Domain / range errors
	assert.throws(() => sf('gamma', 0), RangeError)
	assert.throws(() => sf('gamma', -3), RangeError)
	assert.throws(() => sf('gamma', q(3, 2)), RangeError)
	assert.throws(() => sf('beta', 0, 2), RangeError)
	assert.throws(() => sf('falling', q(1, 2), -1), RangeError)
	assert.throws(() => sf('harmonic', -1), RangeError)
	assert.throws(() => sf('harmonic', 3, 0), RangeError)
	assert.throws(() => sf('bernoulli', -1), RangeError)
	assert.throws(() => sf('zetaNeg', -2), RangeError)
	assert.throws(() => sf('chebyshevT', -1, q(1, 2)), RangeError)
	assert.throws(() => sf('chebyshevU', 1.5, q(1, 2)), TypeError)

	// Poles
	assert.throws(() => sf('pochhammer', q(1, 1), -2), RangeError)
	assert.throws(() => sf('digammaDiff', q(-1, 1), 3), RangeError)
	assert.throws(() => sf('hypergeom', [q(1, 2)], [q(-1, 1)], q(1, 2), 4), RangeError)
	assert.throws(() => sf('hypergeom', [q(1, 2)], [q(1, 1)], q(1, 2)), RangeError)

	// Wrong arity / malformed arrays
	assert.throws(() => sf('gamma'), TypeError)
	assert.throws(() => sf('gamma', 1, 2), TypeError)
	assert.throws(() => sf('hypergeom', 'not-an-array', [], q(1, 2), 3), TypeError)
	assert.throws(() => sf('hypergeom', [], 'not-an-array', q(1, 2), 3), TypeError)
})
