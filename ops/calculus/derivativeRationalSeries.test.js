import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { derivativeRationalSeries } from './derivativeRationalSeries.js';

/** @param {bigint} a @param {bigint} b */
function gcd(a, b) {
	a = a < 0n ? -a : a;
	b = b < 0n ? -b : b;
	while (b !== 0n) {
		const r = a % b;
		a = b;
		b = r;
	}
	return a;
}

/** @param {bigint} num @param {bigint} [den=1n] */
function rat(num, den = 1n) {
	if (den === 0n) throw new RangeError('zero den');
	if (num === 0n) return { num: 0n, den: 1n };
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	const g = gcd(num, den);
	return { num: num / g, den: den / g };
}

function addRat(a, b) {
	return rat(a.num * b.den + b.num * a.den, a.den * b.den);
}

function subRat(a, b) {
	return rat(a.num * b.den - b.num * a.den, a.den * b.den);
}

function mulRat(a, b) {
	return rat(a.num * b.num, a.den * b.den);
}

function divRat(a, b) {
	return rat(a.num * b.den, a.den * b.num);
}

function ratToNumber(r) {
	return Number(r.num) / Number(r.den);
}

function assertCanonicalRational(r, label = 'rational') {
	assert.equal(typeof r, 'object', `${label} must be object`);
	assert.notEqual(r, null, `${label} must not be null`);
	assert.equal(typeof r.num, 'bigint', `${label}.num must be bigint`);
	assert.equal(typeof r.den, 'bigint', `${label}.den must be bigint`);
	assert.ok(r.den > 0n, `${label}.den must be > 0n, got ${r.den}`);
	if (r.num === 0n) {
		assert.equal(r.den, 1n, `${label} zero must have den === 1n`);
	} else {
		assert.equal(
			gcd(r.num, r.den),
			1n,
			`${label} must be in lowest terms: ${r.num}/${r.den}`
		);
	}
}

function assertSeriesEqual(actual, expected) {
	assert.equal(
		actual.length,
		expected.length,
		`length mismatch: got ${actual.length}, expected ${expected.length}`
	);
	for (let i = 0; i < actual.length; i++) {
		assertCanonicalRational(actual[i], `result[${i}]`);
		assert.deepEqual(actual[i], expected[i], `mismatch at index ${i}`);
	}
}

/** Exact polynomial multiplication over Q */
function polyMul(f, g) {
	const out = Array.from({ length: f.length + g.length - 1 }, () => rat(0n));
	for (let i = 0; i < f.length; i++) {
		for (let j = 0; j < g.length; j++) {
			out[i + j] = addRat(out[i + j], mulRat(f[i], g[j]));
		}
	}
	return trimPoly(out);
}

/** Exact polynomial addition over Q */
function polyAdd(f, g) {
	const len = Math.max(f.length, g.length);
	const out = new Array(len);
	for (let i = 0; i < len; i++) {
		const a = i < f.length ? f[i] : rat(0n);
		const b = i < g.length ? g[i] : rat(0n);
		out[i] = addRat(a, b);
	}
	return trimPoly(out);
}

function polyScale(f, s) {
	return trimPoly(f.map((c) => mulRat(c, s)));
}

function trimPoly(p) {
	let end = p.length;
	while (end > 1 && p[end - 1].num === 0n) {
		end--;
	}
	return p.slice(0, end);
}

/** Evaluate polynomial at rational x using Horner's method */
function evalPolyRat(coeffs, x) {
	let acc = rat(0n);
	for (let i = coeffs.length - 1; i >= 0; i--) {
		acc = addRat(mulRat(acc, x), coeffs[i]);
	}
	return acc;
}

/** Binomial coefficient as exact rational */
function binom(n, k) {
	let num = 1n;
	let den = 1n;
	for (let i = 1; i <= k; i++) {
		num *= BigInt(n - i + 1);
		den *= BigInt(i);
	}
	return rat(num, den);
}

describe('derivativeRationalSeries', () => {
	describe('normal cases and lowest-terms canonicalization', () => {
		it('differentiates a polynomial with fractional and negative coefficients (default order=1)', () => {
			// f(x) = 5/7 - (2/3)x + (3/4)x^2 - (5/6)x^3 + (7/12)x^4
			// f'(x) = -2/3 + (3/2)x - (5/2)x^2 + (7/3)x^3
			const coeffs = [
				rat(5n, 7n),
				rat(-2n, 3n),
				rat(3n, 4n),
				rat(-5n, 6n),
				rat(7n, 12n),
			];
			const result = derivativeRationalSeries(coeffs);
			assertSeriesEqual(result, [
				rat(-2n, 3n),
				rat(3n, 2n),
				rat(-5n, 2n),
				rat(7n, 3n),
			]);
		});

		it('matches explicit order=1 with default order', () => {
			const coeffs = [rat(1n, 2n), rat(3n, 5n), rat(-4n, 9n), rat(7n, 15n)];
			assertSeriesEqual(
				derivativeRationalSeries(coeffs),
				derivativeRationalSeries(coeffs, 1)
			);
		});

		it('normalizes unreduced inputs and negative denominators', () => {
			// c_0 = 10/-5, c_1 = 4/-6 (= -2/3), c_2 = 0/-8, c_3 = -6/-9 (= 2/3)
			// f'(x) = -2/3 + 0*x + 2*x^2
			const coeffs = [
				{ num: 10n, den: -5n },
				{ num: 4n, den: -6n },
				{ num: 0n, den: -8n },
				{ num: -6n, den: -9n },
			];
			const result = derivativeRationalSeries(coeffs, 1);
			assertSeriesEqual(result, [rat(-2n, 3n), rat(0n, 1n), rat(2n, 1n)]);
		});

		it('preserves exp(x) Maclaurin series under differentiation', () => {
			// exp(x) = sum_{k=0}^{9} x^k / k!
			const expSeries = [];
			let fact = 1n;
			for (let k = 0; k < 10; k++) {
				if (k > 1) fact *= BigInt(k);
				expSeries.push(rat(1n, fact));
			}
			for (let order = 0; order <= 5; order++) {
				const deriv = derivativeRationalSeries(expSeries, order);
				assertSeriesEqual(deriv, expSeries.slice(0, 10 - order));
			}
		});

		it('satisfies trig series identities sin\' = cos and cos\' = -sin', () => {
			// sin(x) up to x^7 (length 8), cos(x) up to x^6 (length 7)
			const sinSeries = [
				rat(0n),
				rat(1n, 1n),
				rat(0n),
				rat(-1n, 6n),
				rat(0n),
				rat(1n, 120n),
				rat(0n),
				rat(-1n, 5040n),
			];
			const cosSeries = [
				rat(1n, 1n),
				rat(0n),
				rat(-1n, 2n),
				rat(0n),
				rat(1n, 24n),
				rat(0n),
				rat(-1n, 720n),
			];
			const negSin6 = sinSeries.slice(0, 6).map((c) => rat(-c.num, c.den));
			const negSin6Direct = derivativeRationalSeries(sinSeries, 2);

			assertSeriesEqual(derivativeRationalSeries(sinSeries, 1), cosSeries);
			assertSeriesEqual(derivativeRationalSeries(cosSeries, 1), negSin6);
			assertSeriesEqual(negSin6Direct, negSin6);
			assertSeriesEqual(
				derivativeRationalSeries(sinSeries, 4),
				sinSeries.slice(0, 4)
			);
		});

		it('does not mutate the input array or its rational objects', () => {
			const c0 = { num: 2n, den: -4n };
			const c1 = { num: 6n, den: 9n };
			const coeffs = [c0, c1];
			const out0 = derivativeRationalSeries(coeffs, 0);
			const out1 = derivativeRationalSeries(coeffs, 1);

			assert.deepEqual(c0, { num: 2n, den: -4n });
			assert.deepEqual(c1, { num: 6n, den: 9n });
			assert.notEqual(out0, coeffs);
			assert.notEqual(out0[0], c0);
			assert.notEqual(out1[0], c1);
		});
	});

	describe('order=0, constant, zero, and higher-order derivatives', () => {
		it('handles order=0 by returning normalized copy of all coefficients', () => {
			const coeffs = [
				{ num: 6n, den: -4n },
				{ num: 0n, den: 5n },
				{ num: -9n, den: -12n },
			];
			const result = derivativeRationalSeries(coeffs, 0);
			assertSeriesEqual(result, [rat(-3n, 2n), rat(0n, 1n), rat(3n, 4n)]);
		});

		it('differentiates a constant polynomial to [{ num: 0n, den: 1n }]', () => {
			assertSeriesEqual(derivativeRationalSeries([rat(42n, 5n)]), [
				{ num: 0n, den: 1n },
			]);
			assertSeriesEqual(derivativeRationalSeries([rat(-1n, 3n)], 1), [
				{ num: 0n, den: 1n },
			]);
			assertSeriesEqual(derivativeRationalSeries([rat(0n, 1n)], 1), [
				{ num: 0n, den: 1n },
			]);
		});

		it('computes higher-order derivatives accurately up to and beyond degree', () => {
			// f(x) = 1 + 2x + 3x^2 + 4x^3 + (1/2)x^4
			const f = [rat(1n), rat(2n), rat(3n), rat(4n), rat(1n, 2n)];
			// f'(x) = 2 + 6x + 12x^2 + 2x^3
			assertSeriesEqual(derivativeRationalSeries(f, 1), [
				rat(2n),
				rat(6n),
				rat(12n),
				rat(2n),
			]);
			// f''(x) = 6 + 24x + 6x^2
			assertSeriesEqual(derivativeRationalSeries(f, 2), [
				rat(6n),
				rat(24n),
				rat(6n),
			]);
			// f'''(x) = 24 + 12x
			assertSeriesEqual(derivativeRationalSeries(f, 3), [rat(24n), rat(12n)]);
			// f^(4)(x) = 12
			assertSeriesEqual(derivativeRationalSeries(f, 4), [rat(12n)]);
			// f^(5)(x) = 0
			assertSeriesEqual(derivativeRationalSeries(f, 5), [rat(0n)]);
			// f^(1000000)(x) = 0 (fast short-circuit without computing 1000000!)
			assertSeriesEqual(derivativeRationalSeries(f, 1_000_000), [rat(0n)]);
		});

		it('matches repeated first-order differentiation for orders 0..7', () => {
			const f = [
				rat(3n, 11n),
				rat(-7n, 13n),
				rat(5n, 6n),
				rat(0n, 1n),
				rat(19n, 24n),
				rat(-2n, 15n),
				rat(11n, 42n),
			];
			let iterated = derivativeRationalSeries(f, 0);
			for (let order = 0; order <= 7; order++) {
				const direct = derivativeRationalSeries(f, order);
				assertSeriesEqual(direct, iterated);
				iterated = derivativeRationalSeries(iterated, 1);
			}
		});

		it('handles large BigInt coefficients and high orders without precision loss', () => {
			// Geometric series c_k = (2^100 + 1) / (3^50) for k = 0..24
			const bigNum = (1n << 100n) + 1n;
			const bigDen = 3n ** 50n;
			const coeffs = Array.from({ length: 25 }, () => rat(bigNum, bigDen));
			const order = 20;
			const result = derivativeRationalSeries(coeffs, order);
			assert.equal(result.length, 5);
			// c_j of 20th derivative is (bigNum / bigDen) * (j + 20)! / j!
			const fact = (n) => {
				let acc = 1n;
				for (let i = 2; i <= n; i++) acc *= BigInt(i);
				return acc;
			};
			for (let j = 0; j < 5; j++) {
				const falling = fact(j + order) / fact(j);
				const expected = rat(bigNum * falling, bigDen);
				assertCanonicalRational(result[j], `big[${j}]`);
				assert.deepEqual(result[j], expected);
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-array coeffs', () => {
			for (const bad of [null, undefined, 123, 'abc', {}, { length: 1 }]) {
				assert.throws(() => derivativeRationalSeries(bad), TypeError);
			}
		});

		it('throws RangeError for empty coeffs array', () => {
			assert.throws(() => derivativeRationalSeries([]), RangeError);
			assert.throws(() => derivativeRationalSeries([], 0), RangeError);
		});

		it('throws TypeError for sparse arrays or malformed rational elements', () => {
			const sparse = new Array(2);
			sparse[0] = rat(1n);
			assert.throws(() => derivativeRationalSeries(sparse), TypeError);

			const badElems = [
				null,
				undefined,
				42,
				'1/2',
				{},
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: '1', den: '2' },
				{ num: 1n },
				{ den: 1n },
			];
			for (const bad of badElems) {
				assert.throws(() => derivativeRationalSeries([rat(1n), bad]), TypeError);
			}
		});

		it('throws RangeError for zero denominators (even when order >= coeffs.length)', () => {
			assert.throws(
				() => derivativeRationalSeries([{ num: 1n, den: 0n }]),
				RangeError
			);
			assert.throws(
				() => derivativeRationalSeries([{ num: 0n, den: 0n }], 0),
				RangeError
			);
			assert.throws(
				() => derivativeRationalSeries([rat(1n), { num: 3n, den: 0n }], 10),
				RangeError
			);
		});

		it('throws TypeError or RangeError for invalid order values', () => {
			const valid = [rat(1n), rat(2n)];
			for (const badType of ['1', null, 1n, {}, [], true]) {
				assert.throws(
					() => derivativeRationalSeries(valid, badType),
					TypeError
				);
			}
			for (const badRange of [
				-1,
				-100,
				0.5,
				1.1,
				NaN,
				Infinity,
				-Infinity,
				Number.MAX_SAFE_INTEGER + 1,
			]) {
				assert.throws(
					() => derivativeRationalSeries(valid, badRange),
					RangeError
				);
			}
		});
	});

	describe('independent cross-checks', () => {
		it("verifies exact product rule (f * g)' = f' * g + f * g'", () => {
			const pairs = [
				[
					[rat(1n, 3n), rat(-2n, 5n), rat(7n, 4n), rat(-1n, 6n)],
					[rat(-5n, 2n), rat(3n, 7n), rat(0n, 1n), rat(4n, 9n), rat(-1n, 2n)],
				],
				[
					[rat(5n, 8n)],
					[rat(-3n, 4n), rat(2n, 3n), rat(11n, 12n)],
				],
				[
					[rat(0n, 1n), rat(1n, 1n), rat(-1n, 2n), rat(1n, 3n)],
					[rat(2n, 1n), rat(-3n, 4n), rat(5n, 6n)],
				],
			];

			for (const [f, g] of pairs) {
				const fg = polyMul(f, g);
				const lhs = trimPoly(derivativeRationalSeries(fg, 1));
				const fPrime = derivativeRationalSeries(f, 1);
				const gPrime = derivativeRationalSeries(g, 1);
				const rhs = polyAdd(polyMul(fPrime, g), polyMul(f, gPrime));
				assertSeriesEqual(lhs, rhs);
			}
		});

		it('verifies general Leibniz rule (f * g)^(m) = sum C(m,k) f^(k) g^(m-k)', () => {
			const f = [rat(2n, 3n), rat(-1n, 5n), rat(4n, 7n), rat(3n, 2n), rat(-5n, 6n)];
			const g = [rat(-1n, 4n), rat(3n, 2n), rat(-2n, 9n), rat(5n, 3n)];
			const fg = polyMul(f, g);

			for (const m of [2, 3, 4]) {
				const lhs = trimPoly(derivativeRationalSeries(fg, m));
				let rhs = [rat(0n)];
				for (let k = 0; k <= m; k++) {
					const fk = derivativeRationalSeries(f, k);
					const gmk = derivativeRationalSeries(g, m - k);
					const term = polyScale(polyMul(fk, gmk), binom(m, k));
					rhs = polyAdd(rhs, term);
				}
				assertSeriesEqual(lhs, rhs);
			}
		});

		it('verifies linearity (a*f + b*g)^(m) = a*f^(m) + b*g^(m)', () => {
			const f = [rat(1n, 2n), rat(-3n, 4n), rat(5n, 6n), rat(-7n, 8n), rat(9n, 10n)];
			const g = [rat(-2n, 3n), rat(4n, 5n), rat(-6n, 7n), rat(8n, 9n)];
			const a = rat(7n, 11n);
			const b = rat(-13n, 5n);

			const combined = polyAdd(polyScale(f, a), polyScale(g, b));
			for (const m of [0, 1, 2, 3]) {
				const lhs = trimPoly(derivativeRationalSeries(combined, m));
				const rhs = polyAdd(
					polyScale(derivativeRationalSeries(f, m), a),
					polyScale(derivativeRationalSeries(g, m), b)
				);
				assertSeriesEqual(lhs, rhs);
			}
		});

		it('matches numerical central difference approximation at rational points x', () => {
			// f(x) = 2/3 - (5/4)x + (7/6)x^2 - (3/8)x^3 + (1/5)x^4 - (2/9)x^5
			const f = [
				rat(2n, 3n),
				rat(-5n, 4n),
				rat(7n, 6n),
				rat(-3n, 8n),
				rat(1n, 5n),
				rat(-2n, 9n),
			];
			const f1 = derivativeRationalSeries(f, 1);
			const f2 = derivativeRationalSeries(f, 2);

			const testPoints = [
				rat(-3n, 4n),
				rat(0n, 1n),
				rat(1n, 3n),
				rat(7n, 5n),
				rat(-11n, 6n),
			];

			// Exact rational central difference with h = 10^-12 (error is O(h^2) ~ 10^-24)
			const hRat = rat(1n, 1_000_000_000_000n);
			const twoH = mulRat(rat(2n), hRat);
			const hSq = mulRat(hRat, hRat);

			// Floating-point central difference with h = 1e-5
			const hFloat = 1e-5;
			const evalFloat = (coeffs, x) => {
				let acc = 0;
				for (let i = coeffs.length - 1; i >= 0; i--) {
					acc = acc * x + ratToNumber(coeffs[i]);
				}
				return acc;
			};

			for (const x of testPoints) {
				const exactF1 = evalPolyRat(f1, x);
				const exactF2 = evalPolyRat(f2, x);

				// 1. Exact rational central difference for f'(x)
				const fxPlus = evalPolyRat(f, addRat(x, hRat));
				const fxMinus = evalPolyRat(f, subRat(x, hRat));
				const fx = evalPolyRat(f, x);
				const approxF1Rat = divRat(subRat(fxPlus, fxMinus), twoH);
				const err1Rat = Math.abs(ratToNumber(subRat(approxF1Rat, exactF1)));
				assert.ok(
					err1Rat < 1e-20,
					`exact rational central diff error too large at x=${x.num}/${x.den}: ${err1Rat}`
				);

				// 2. Exact rational second central difference for f''(x)
				const approxF2Rat = divRat(
					subRat(addRat(fxPlus, fxMinus), mulRat(rat(2n), fx)),
					hSq
				);
				const err2Rat = Math.abs(ratToNumber(subRat(approxF2Rat, exactF2)));
				assert.ok(
					err2Rat < 1e-18,
					`exact rational 2nd central diff error too large at x=${x.num}/${x.den}: ${err2Rat}`
				);

				// 3. Floating-point central difference cross-check
				const xFloat = ratToNumber(x);
				const approxF1Float =
					(evalFloat(f, xFloat + hFloat) - evalFloat(f, xFloat - hFloat)) /
					(2 * hFloat);
				const err1Float = Math.abs(approxF1Float - ratToNumber(exactF1));
				assert.ok(
					err1Float < 1e-8,
					`float central diff error too large at x=${x.num}/${x.den}: ${err1Float}`
				);
			}
		});
	});
});
