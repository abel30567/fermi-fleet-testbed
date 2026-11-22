import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { specialFunctionsRationalIterative } from './specialFunctionsRationalIterative.js';

const r = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) });

function gcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

function norm(num, den = 1n) {
	if (num === 0n) return { num: 0n, den: 1n };
	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const g = gcd(n, d);
	return { num: n / g, den: d / g };
}

const rAdd = (a, b) => norm(a.num * b.den + b.num * a.den, a.den * b.den);
const rSub = (a, b) => norm(a.num * b.den - b.num * a.den, a.den * b.den);
const rMul = (a, b) => norm(a.num * b.num, a.den * b.den);
const rDiv = (a, b) => norm(a.num * b.den, a.den * b.num);

function rPow(q, n) {
	let acc = r(1);
	for (let i = 0; i < n; i++) {
		acc = rMul(acc, q);
	}
	return acc;
}

function assertLowestTerms(q) {
	assert.equal(typeof q.num, 'bigint');
	assert.equal(typeof q.den, 'bigint');
	assert.ok(q.den > 0n, `Expected positive denominator, got ${q.den}`);
	if (q.num === 0n) {
		assert.equal(q.den, 1n, 'Zero must have denominator 1n');
	} else {
		assert.equal(gcd(q.num, q.den), 1n, `Fraction ${q.num}/${q.den} is not in lowest terms`);
	}
}

describe('specialFunctionsRationalIterative', () => {
	describe('normal cases and canonical rational form', () => {
		test('harmonic numbers (standard and generalized)', () => {
			assert.deepEqual(specialFunctionsRationalIterative('harmonic', 0), r(0, 1));
			assert.deepEqual(specialFunctionsRationalIterative('harmonic', 1), r(1, 1));
			assert.deepEqual(specialFunctionsRationalIterative('harmonic', 2), r(3, 2));
			assert.deepEqual(specialFunctionsRationalIterative('harmonic', 3), r(11, 6));
			assert.deepEqual(specialFunctionsRationalIterative('harmonic', 4), r(25, 12));
			assert.deepEqual(specialFunctionsRationalIterative('harmonic', 5), r(137, 60));
			assert.deepEqual(specialFunctionsRationalIterative('harmonic', 5n, undefined), r(137, 60));

			assert.deepEqual(specialFunctionsRationalIterative('harmonic', 3, 2), r(49, 36));
			assert.deepEqual(specialFunctionsRationalIterative('harmonic', 4, 3), r(2035, 1728));
			assertLowestTerms(specialFunctionsRationalIterative('harmonic', 12, 2));
		});

		test('Bernoulli numbers (first Bernoulli numbers with B_1 = -1/2)', () => {
			const expected = [
				[0, r(1, 1)],
				[1, r(-1, 2)],
				[2, r(1, 6)],
				[3, r(0, 1)],
				[4, r(-1, 30)],
				[5, r(0, 1)],
				[6, r(1, 42)],
				[7, r(0, 1)],
				[8, r(-1, 30)],
				[10, r(5, 66)],
				[12, r(-691, 2730)],
				[14, r(7, 6)],
			];
			for (const [n, val] of expected) {
				const res = specialFunctionsRationalIterative('bernoulli', n);
				assertLowestTerms(res);
				assert.deepEqual(res, val);
			}
		});

		test('Pochhammer symbol (rising factorial)', () => {
			assert.deepEqual(specialFunctionsRationalIterative('pochhammer', r(7, 3), 0), r(1, 1));
			assert.deepEqual(specialFunctionsRationalIterative('pochhammer', r(1, 1), 5), r(120, 1));
			assert.deepEqual(specialFunctionsRationalIterative('pochhammer', r(1, 2), 3), r(15, 8));
			assert.deepEqual(specialFunctionsRationalIterative('pochhammer', r(-3, 1), 4), r(0, 1));
			assert.deepEqual(specialFunctionsRationalIterative('pochhammer', r(-5, 2), 3), r(-15, 8));
			// Unreduced negative-denominator input is normalized before computation
			assert.deepEqual(specialFunctionsRationalIterative('pochhammer', r(-2, -4), 3), r(15, 8));
		});

		test('generalized binomial coefficient', () => {
			assert.deepEqual(specialFunctionsRationalIterative('binomial', r(5, 1), 0), r(1, 1));
			assert.deepEqual(specialFunctionsRationalIterative('binomial', r(5, 1), 2), r(10, 1));
			assert.deepEqual(specialFunctionsRationalIterative('binomial', r(5, 1), 6), r(0, 1));
			assert.deepEqual(specialFunctionsRationalIterative('binomial', r(1, 2), 3), r(1, 16));
			assert.deepEqual(specialFunctionsRationalIterative('binomial', r(-1, 2), 4), r(35, 128));
			assert.deepEqual(specialFunctionsRationalIterative('binomial', r(-3, 1), 3), r(-10, 1));
		});

		test('exact Gamma and Beta functions', () => {
			assert.deepEqual(specialFunctionsRationalIterative('gamma', 1), r(1, 1));
			assert.deepEqual(specialFunctionsRationalIterative('gamma', 2), r(1, 1));
			assert.deepEqual(specialFunctionsRationalIterative('gamma', 6), r(120, 1));
			assert.deepEqual(specialFunctionsRationalIterative('gamma', 10n), r(362880, 1));
			assert.deepEqual(specialFunctionsRationalIterative('gamma', r(12, 3)), r(6, 1));
			assert.deepEqual(specialFunctionsRationalIterative('gamma', r(-10, -2)), r(24, 1));

			assert.deepEqual(specialFunctionsRationalIterative('beta', 1, 1), r(1, 1));
			assert.deepEqual(specialFunctionsRationalIterative('beta', 2, 3), r(1, 12));
			assert.deepEqual(specialFunctionsRationalIterative('beta', 3, 2), r(1, 12));
			assert.deepEqual(specialFunctionsRationalIterative('beta', 4, 5), r(1, 280));
			assert.deepEqual(specialFunctionsRationalIterative('beta', r(6, 2), r(8, 2)), r(1, 60));
		});

		test('Legendre polynomials', () => {
			const x = r(1, 3);
			assert.deepEqual(specialFunctionsRationalIterative('legendre', 0, x), r(1, 1));
			assert.deepEqual(specialFunctionsRationalIterative('legendre', 1, x), r(1, 3));
			// P_2(1/3) = (3*(1/9) - 1)/2 = -1/3
			assert.deepEqual(specialFunctionsRationalIterative('legendre', 2, x), r(-1, 3));
			// P_3(1/3) = (5*(1/27) - 3*(1/3))/2 = (-22/27)/2 = -11/27
			assert.deepEqual(specialFunctionsRationalIterative('legendre', 3, x), r(-11, 27));
			// P_4(1/2) = (35/16 - 30/4 + 3)/8 = (-37/16)/8 = -37/128
			assert.deepEqual(specialFunctionsRationalIterative('legendre', 4, r(1, 2)), r(-37, 128));
		});

		test('Chebyshev polynomials (first and second kind)', () => {
			const x = r(1, 3);
			assert.deepEqual(specialFunctionsRationalIterative('chebyshev', 0, x), r(1, 1));
			assert.deepEqual(specialFunctionsRationalIterative('chebyshev', 1, x), r(1, 3));
			// T_2(1/3) = 2*(1/9) - 1 = -7/9
			assert.deepEqual(specialFunctionsRationalIterative('chebyshev', 2, x), r(-7, 9));
			// T_3(1/3) = 4*(1/27) - 1 = -23/27
			assert.deepEqual(specialFunctionsRationalIterative('chebyshev', 3, x, 1), r(-23, 27));

			// Second kind U_n(1/3)
			assert.deepEqual(specialFunctionsRationalIterative('chebyshev', 0, x, 2), r(1, 1));
			assert.deepEqual(specialFunctionsRationalIterative('chebyshev', 1, x, 2), r(2, 3));
			// U_2(1/3) = 4*(1/9) - 1 = -5/9
			assert.deepEqual(specialFunctionsRationalIterative('chebyshev', 2, x, 2), r(-5, 9));
			// U_3(1/3) = 8*(1/27) - 4/3 = -28/27
			assert.deepEqual(specialFunctionsRationalIterative('chebyshev', 3, x, 2), r(-28, 27));
		});

		test('truncated exponential series', () => {
			assert.deepEqual(specialFunctionsRationalIterative('expSeries', r(3, 5), 0), r(0, 1));
			assert.deepEqual(specialFunctionsRationalIterative('expSeries', r(3, 5), 1), r(1, 1));
			assert.deepEqual(specialFunctionsRationalIterative('expSeries', r(0, 1), 6), r(1, 1));
			assert.deepEqual(specialFunctionsRationalIterative('expSeries', r(1, 1), 5), r(65, 24));
			assert.deepEqual(specialFunctionsRationalIterative('expSeries', r(-1, 2), 4), r(29, 48));
		});
	});

	describe('edge cases', () => {
		test('zero inputs, boundary values, and non-aliasing of returned objects', () => {
			const input = { num: 2n, den: 4n };
			const p1 = specialFunctionsRationalIterative('legendre', 1, input);
			assert.deepEqual(p1, r(1, 2));
			assert.notEqual(p1, input);
			assert.deepEqual(input, { num: 2n, den: 4n });

			// Legendre boundary values P_n(1) = 1, P_n(-1) = (-1)^n
			for (let n = 0; n <= 10; n++) {
				assert.deepEqual(specialFunctionsRationalIterative('legendre', n, r(1)), r(1));
				assert.deepEqual(
					specialFunctionsRationalIterative('legendre', n, r(-1)),
					r(n % 2 === 0 ? 1 : -1)
				);
			}

			// Chebyshev boundary values T_n(1) = 1, U_n(1) = n + 1
			for (let n = 0; n <= 10; n++) {
				assert.deepEqual(specialFunctionsRationalIterative('chebyshev', n, r(1), 1), r(1));
				assert.deepEqual(specialFunctionsRationalIterative('chebyshev', n, r(1), 2), r(n + 1));
			}

			// Negative denominator with zero numerator reduces to { num: 0n, den: 1n }
			assert.deepEqual(specialFunctionsRationalIterative('legendre', 1, { num: 0n, den: -7n }), r(0, 1));
		});
	});

	describe('invalid input validation', () => {
		test('rejects invalid function names and argument counts', () => {
			assert.throws(() => specialFunctionsRationalIterative(123), TypeError);
			assert.throws(() => specialFunctionsRationalIterative(null), TypeError);
			assert.throws(() => specialFunctionsRationalIterative('unknownFn', 1), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('harmonic'), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('harmonic', 3, 1, 2), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('bernoulli', 1, 2), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('pochhammer', r(1)), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('beta', 2), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('chebyshev', 2, r(1), 1, 9), RangeError);
		});

		test('rejects malformed rationals and zero denominators', () => {
			assert.throws(() => specialFunctionsRationalIterative('pochhammer', 1, 2), TypeError);
			assert.throws(() => specialFunctionsRationalIterative('pochhammer', null, 2), TypeError);
			assert.throws(() => specialFunctionsRationalIterative('pochhammer', [1n, 2n], 2), TypeError);
			assert.throws(
				() => specialFunctionsRationalIterative('binomial', { num: 1, den: 2n }, 2),
				TypeError
			);
			assert.throws(
				() => specialFunctionsRationalIterative('legendre', 2, { num: 1n, den: 0n }),
				RangeError
			);
			assert.throws(
				() => specialFunctionsRationalIterative('expSeries', { num: 0n, den: 0n }, 3),
				RangeError
			);
		});

		test('rejects invalid integers, NaN/Infinity, out-of-domain values, and Gamma/Beta poles', () => {
			assert.throws(() => specialFunctionsRationalIterative('harmonic', -1), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('harmonic', 1.5), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('harmonic', NaN), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('harmonic', Infinity), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('harmonic', '3'), TypeError);
			assert.throws(() => specialFunctionsRationalIterative('harmonic', 3, 0), RangeError);

			assert.throws(() => specialFunctionsRationalIterative('bernoulli', -2), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('bernoulli', -1n), RangeError);

			assert.throws(() => specialFunctionsRationalIterative('gamma', 0), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('gamma', -3), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('gamma', r(0, 1)), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('gamma', r(-2, 1)), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('gamma', r(1, 2)), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('gamma', '5'), TypeError);

			assert.throws(() => specialFunctionsRationalIterative('beta', 0, 2), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('beta', 2, -1), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('beta', r(3, 2), 2), RangeError);

			assert.throws(() => specialFunctionsRationalIterative('chebyshev', 2, r(1, 2), 3), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('chebyshev', 2, r(1, 2), 0), RangeError);
			assert.throws(() => specialFunctionsRationalIterative('expSeries', r(1, 2), -1), RangeError);
		});
	});

	describe('independent mathematical cross-checks', () => {
		test('Bernoulli defining recurrence and Faulhaber sum-of-powers identity', () => {
			// Recurrence: sum_{k=0}^{n} C(n+1, k) * B_k = 0 for all n >= 1
			for (let n = 1; n <= 12; n++) {
				let sum = r(0);
				for (let k = 0; k <= n; k++) {
					const coeff = specialFunctionsRationalIterative('binomial', r(n + 1), k);
					const bk = specialFunctionsRationalIterative('bernoulli', k);
					sum = rAdd(sum, rMul(coeff, bk));
				}
				assert.deepEqual(sum, r(0, 1), `Bernoulli recurrence failed at n=${n}`);
			}

			// Faulhaber: sum_{j=0}^{m-1} j^p = (1/(p+1)) * sum_{k=0}^{p} C(p+1, k) B_k m^{p+1-k}
			for (let p = 1; p <= 6; p++) {
				for (const m of [1, 4, 7]) {
					let directSum = 0n;
					for (let j = 0; j < m; j++) {
						directSum += BigInt(j) ** BigInt(p);
					}
					let faulhaber = r(0);
					for (let k = 0; k <= p; k++) {
						const coeff = specialFunctionsRationalIterative('binomial', r(p + 1), k);
						const bk = specialFunctionsRationalIterative('bernoulli', k);
						const mPow = r(BigInt(m) ** BigInt(p + 1 - k));
						faulhaber = rAdd(faulhaber, rMul(rMul(coeff, bk), mPow));
					}
					faulhaber = rDiv(faulhaber, r(p + 1));
					assert.deepEqual(faulhaber, r(directSum), `Faulhaber failed for p=${p}, m=${m}`);
				}
			}
		});

		test('Harmonic summation-by-parts identity: sum_{k=1}^n H_k = (n+1) H_n - n', () => {
			for (let n = 1; n <= 12; n++) {
				let lhs = r(0);
				for (let k = 1; k <= n; k++) {
					lhs = rAdd(lhs, specialFunctionsRationalIterative('harmonic', k));
				}
				const hn = specialFunctionsRationalIterative('harmonic', n);
				const rhs = rSub(rMul(r(n + 1), hn), r(n));
				assert.deepEqual(lhs, rhs);
			}
		});

		test('Pascal identity, upper negation, and Chu-Vandermonde identity', () => {
			const rationals = [r(5, 2), r(-7, 3), r(0, 1), r(4, 1)];
			for (const x of rationals) {
				for (let k = 1; k <= 6; k++) {
					// Pascal: C(x, k) = C(x - 1, k) + C(x - 1, k - 1)
					const lhs = specialFunctionsRationalIterative('binomial', x, k);
					const xMinus1 = rSub(x, r(1));
					const rhs = rAdd(
						specialFunctionsRationalIterative('binomial', xMinus1, k),
						specialFunctionsRationalIterative('binomial', xMinus1, k - 1)
					);
					assert.deepEqual(lhs, rhs);

					// Upper negation: C(-x, k) = (-1)^k (x)_k / k!
					const negBinom = specialFunctionsRationalIterative('binomial', r(-x.num, x.den), k);
					const poch = specialFunctionsRationalIterative('pochhammer', x, k);
					const fact = specialFunctionsRationalIterative('gamma', k + 1);
					const sign = k % 2 === 0 ? r(1) : r(-1);
					assert.deepEqual(negBinom, rMul(sign, rDiv(poch, fact)));
				}
			}

			// Chu-Vandermonde for rising factorials: (x + y)_n = sum_{k=0}^n C(n, k) (x)_k (y)_{n-k}
			const x = r(2, 5);
			const y = r(-3, 4);
			const xy = rAdd(x, y);
			for (let n = 0; n <= 6; n++) {
				const lhs = specialFunctionsRationalIterative('pochhammer', xy, n);
				let rhs = r(0);
				for (let k = 0; k <= n; k++) {
					const cnk = specialFunctionsRationalIterative('binomial', r(n), k);
					const px = specialFunctionsRationalIterative('pochhammer', x, k);
					const py = specialFunctionsRationalIterative('pochhammer', y, n - k);
					rhs = rAdd(rhs, rMul(cnk, rMul(px, py)));
				}
				assert.deepEqual(lhs, rhs);
			}
		});

		test('Beta-Gamma identity and Beta recurrence relations', () => {
			for (let a = 1; a <= 7; a++) {
				for (let b = 1; b <= 7; b++) {
					const betaAB = specialFunctionsRationalIterative('beta', a, b);
					assertLowestTerms(betaAB);
					const ga = specialFunctionsRationalIterative('gamma', a);
					const gb = specialFunctionsRationalIterative('gamma', b);
					const gab = specialFunctionsRationalIterative('gamma', a + b);
					assert.deepEqual(betaAB, rDiv(rMul(ga, gb), gab));

					// Recurrence: B(a, b) = B(a + 1, b) + B(a, b + 1)
					const b1 = specialFunctionsRationalIterative('beta', a + 1, b);
					const b2 = specialFunctionsRationalIterative('beta', a, b + 1);
					assert.deepEqual(betaAB, rAdd(b1, b2));
				}
			}
		});

		test('Legendre explicit binomial sum cross-check and parity', () => {
			const xs = [r(-3, 4), r(0, 1), r(2, 5), r(7, 3)];
			for (const x of xs) {
				for (let n = 0; n <= 7; n++) {
					const pn = specialFunctionsRationalIterative('legendre', n, x);
					assertLowestTerms(pn);

					// Explicit formula: P_n(x) = (1/2^n) sum_{k=0}^n C(n,k)^2 (x-1)^(n-k) (x+1)^k
					let sum = r(0);
					const xm1 = rSub(x, r(1));
					const xp1 = rAdd(x, r(1));
					for (let k = 0; k <= n; k++) {
						const cnk = specialFunctionsRationalIterative('binomial', r(n), k);
						const term = rMul(rMul(cnk, cnk), rMul(rPow(xm1, n - k), rPow(xp1, k)));
						sum = rAdd(sum, term);
					}
					const explicit = rDiv(sum, r(1n << BigInt(n)));
					assert.deepEqual(pn, explicit);

					// Parity: P_n(-x) = (-1)^n P_n(x)
					const pnNeg = specialFunctionsRationalIterative('legendre', n, r(-x.num, x.den));
					const expectedParity = n % 2 === 0 ? pn : r(-pn.num, pn.den);
					assert.deepEqual(pnNeg, expectedParity);
				}
			}
		});

		test('Chebyshev Pell identity and nesting property T_m(T_n(x)) = T_{mn}(x)', () => {
			const xs = [r(-2, 3), r(1, 5), r(5, 4)];
			for (const x of xs) {
				const x2Minus1 = rSub(rMul(x, x), r(1));
				for (let n = 1; n <= 8; n++) {
					const tn = specialFunctionsRationalIterative('chebyshev', n, x, 1);
					const unMinus1 = specialFunctionsRationalIterative('chebyshev', n - 1, x, 2);
					assertLowestTerms(tn);
					assertLowestTerms(unMinus1);

					// Pell identity: T_n(x)^2 - (x^2 - 1) U_{n-1}(x)^2 = 1
					const lhs = rSub(rMul(tn, tn), rMul(x2Minus1, rMul(unMinus1, unMinus1)));
					assert.deepEqual(lhs, r(1, 1));

					// Relation: T_n(x) = U_n(x) - x U_{n-1}(x)
					const un = specialFunctionsRationalIterative('chebyshev', n, x, 2);
					assert.deepEqual(tn, rSub(un, rMul(x, unMinus1)));
				}

				// Nesting: T_3(T_2(x)) = T_6(x)
				const t2 = specialFunctionsRationalIterative('chebyshev', 2, x, 1);
				const t3OfT2 = specialFunctionsRationalIterative('chebyshev', 3, t2, 1);
				const t6 = specialFunctionsRationalIterative('chebyshev', 6, x, 1);
				assert.deepEqual(t3OfT2, t6);
			}
		});

		test('expSeries cross-check against direct sum and binomial convolution identity', () => {
			const x = r(2, 3);
			const y = r(-1, 5);
			const N = 7;

			// Direct independent sum: sum_{k=0}^{N-1} x^k / Gamma(k + 1)
			let direct = r(0);
			for (let k = 0; k < N; k++) {
				const fact = specialFunctionsRationalIterative('gamma', k + 1);
				direct = rAdd(direct, rDiv(rPow(x, k), fact));
			}
			const expX = specialFunctionsRationalIterative('expSeries', x, N);
			assertLowestTerms(expX);
			assert.deepEqual(expX, direct);

			// Exact truncated convolution:
			// sum_{k=0}^{N-1} (x + y)^k / k! == sum_{i+j < N} (x^i / i!) (y^j / j!)
			const expXY = specialFunctionsRationalIterative('expSeries', rAdd(x, y), N);
			let conv = r(0);
			for (let i = 0; i < N; i++) {
				const xi = rDiv(rPow(x, i), specialFunctionsRationalIterative('gamma', i + 1));
				for (let j = 0; j < N - i; j++) {
					const yj = rDiv(rPow(y, j), specialFunctionsRationalIterative('gamma', j + 1));
					conv = rAdd(conv, rMul(xi, yj));
				}
			}
			assert.deepEqual(expXY, conv);
		});
	});
});
