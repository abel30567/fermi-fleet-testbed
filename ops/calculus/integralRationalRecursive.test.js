import test from 'node:test';
import assert from 'node:assert/strict';
import { integralRationalRecursive } from './integralRationalRecursive.js';

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

function assertNormalized(val) {
	assert.equal(typeof val, 'object');
	assert.notEqual(val, null);
	assert.equal(typeof val.num, 'bigint');
	assert.equal(typeof val.den, 'bigint');
	assert.ok(val.den > 0n, `expected den > 0n, got ${val.den}`);
	assert.equal(gcd(val.num, val.den), 1n, `expected lowest terms, got ${val.num}/${val.den}`);
	if (val.num === 0n) {
		assert.equal(val.den, 1n, `expected 0n/1n for zero, got 0n/${val.den}`);
	}
}

function norm(num, den) {
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

function rAdd(p, q) {
	return norm(p.num * q.den + q.num * p.den, p.den * q.den);
}

function rSub(p, q) {
	return norm(p.num * q.den - q.num * p.den, p.den * q.den);
}

function rMul(p, q) {
	return norm(p.num * q.num, p.den * q.den);
}

function rPow(base, exp) {
	let res = { num: 1n, den: 1n };
	for (let i = 0; i < exp; i++) {
		res = rMul(res, base);
	}
	return res;
}

/**
 * Independent reference implementation via direct term-by-term FTC summation:
 *   sum_{k=0}^{n} (c_k / (k + 1)) * (b^(k+1) - a^(k+1))
 */
function naiveDirectIntegral(coeffs, a, b) {
	let acc = { num: 0n, den: 1n };
	for (let k = 0; k < coeffs.length; k++) {
		const c = norm(coeffs[k].num, coeffs[k].den);
		const powerDiff = rSub(rPow(norm(b.num, b.den), k + 1), rPow(norm(a.num, a.den), k + 1));
		const term = rMul(norm(c.num, c.den * BigInt(k + 1)), powerDiff);
		acc = rAdd(acc, term);
	}
	return acc;
}

/**
 * Independent polynomial evaluator (Horner's method) for Simpson's rule cross-check.
 */
function evalPolyHorner(coeffs, x) {
	let acc = { num: 0n, den: 1n };
	for (let i = coeffs.length - 1; i >= 0; i--) {
		acc = rAdd(rMul(acc, x), norm(coeffs[i].num, coeffs[i].den));
	}
	return acc;
}

/**
 * Exact Simpson's rule: ((b - a) / 6) * (P(a) + 4 * P((a + b) / 2) + P(b)).
 * Mathematically exact for all polynomials of degree <= 3.
 */
function exactSimpsonCubic(coeffs, a, b) {
	const mid = rMul(rAdd(a, b), r(1n, 2n));
	const fa = evalPolyHorner(coeffs, a);
	const fm = evalPolyHorner(coeffs, mid);
	const fb = evalPolyHorner(coeffs, b);
	const weighted = rAdd(rAdd(fa, rMul(r(4n), fm)), fb);
	return rMul(rMul(rSub(b, a), r(1n, 6n)), weighted);
}

test('integrates constant polynomial', () => {
	// integral_1^5 3 dx = 12
	const res = integralRationalRecursive([r(3)], r(1), r(5));
	assertNormalized(res);
	assert.deepEqual(res, r(12, 1));
});

test('integrates linear and quadratic polynomials', () => {
	// integral_0^2 (1 + 2x) dx = [x + x^2]_0^2 = 6
	const lin = integralRationalRecursive([r(1), r(2)], r(0), r(2));
	assertNormalized(lin);
	assert.deepEqual(lin, r(6, 1));

	// integral_0^1 x^2 dx = 1/3
	const quad = integralRationalRecursive([r(0), r(0), r(1)], r(0), r(1));
	assertNormalized(quad);
	assert.deepEqual(quad, r(1, 3));
});

test('integrates polynomial with negative and fractional coefficients and bounds', () => {
	// P(x) = 1/2 - (2/3)x + (3/4)x^2 on [-1/3, 2/5]
	const coeffs = [r(1, 2), r(-2, 3), r(3, 4)];
	const a = r(-1, 3);
	const b = r(2, 5);
	const res = integralRationalRecursive(coeffs, a, b);
	assertNormalized(res);
	assert.deepEqual(res, naiveDirectIntegral(coeffs, a, b));
});

test('normalizes unreduced inputs and negative denominators', () => {
	// P(x) = (4/8) + (-6/-9)x = 1/2 + (2/3)x on [2/-4, -6/-4] = [-1/2, 3/2]
	// F(x) = (1/2)x + (1/3)x^2
	// F(3/2) - F(-1/2) = (3/4 + 3/4) - (-1/4 + 1/12) = 3/2 - (-1/6) = 5/3
	const res = integralRationalRecursive(
		[r(4, 8), r(-6, -9)],
		r(2, -4),
		r(-6, -4),
	);
	assertNormalized(res);
	assert.deepEqual(res, r(5, 3));
});

test('handles exact BigInt precision beyond Number.MAX_SAFE_INTEGER', () => {
	const big = 10n ** 30n;
	// integral_0^1 (big + (big + 1)x) dx = big + (big + 1)/2 = (3*big + 1)/2
	const res = integralRationalRecursive([r(big, 1n), r(big + 1n, 1n)], r(0), r(1));
	assertNormalized(res);
	assert.deepEqual(res, norm(3n * big + 1n, 2n));
});

test('edge cases: empty polynomial, zero polynomial, and trailing zeros', () => {
	const empty = integralRationalRecursive([], r(-7, 3), r(11, 5));
	assertNormalized(empty);
	assert.deepEqual(empty, r(0, 1));

	const zeros = integralRationalRecursive([r(0, 5), r(0, -7), r(0, 13)], r(1, 2), r(9, 4));
	assertNormalized(zeros);
	assert.deepEqual(zeros, r(0, 1));

	const base = integralRationalRecursive([r(2, 3), r(-1, 5)], r(1, 4), r(7, 3));
	const withTrailing = integralRationalRecursive(
		[r(2, 3), r(-1, 5), r(0, 1), r(0, 9), r(0, -3)],
		r(1, 4),
		r(7, 3),
	);
	assertNormalized(withTrailing);
	assert.deepEqual(withTrailing, base);
});

test('edge cases: zero-width interval, reversed bounds, exact cancellation, symmetry', () => {
	const coeffs = [r(5, 7), r(-3, 2), r(4, 9), r(1, 3)];

	// a === b
	const same = integralRationalRecursive(coeffs, r(2, 3), r(4, 6));
	assertNormalized(same);
	assert.deepEqual(same, r(0, 1));

	// Reversed bounds: integral_b^a = -integral_a^b
	const forward = integralRationalRecursive(coeffs, r(-1, 2), r(5, 3));
	const backward = integralRationalRecursive(coeffs, r(5, 3), r(-1, 2));
	assertNormalized(forward);
	assertNormalized(backward);
	assert.deepEqual(backward, { num: -forward.num, den: forward.den });

	// Exact cancellation to zero: integral_0^2 (x - 1) dx = 0/1
	const cancelled = integralRationalRecursive([r(-1), r(1)], r(0), r(2));
	assertNormalized(cancelled);
	assert.deepEqual(cancelled, r(0, 1));

	// Odd polynomial over symmetric interval [-a, a] integrates to 0
	const odd = integralRationalRecursive([r(0), r(3, 5), r(0), r(-7, 11), r(0), r(2, 3)], r(-4, 7), r(4, 7));
	assertNormalized(odd);
	assert.deepEqual(odd, r(0, 1));

	// Even polynomial over [-a, a] equals 2 * integral_0^a
	const evenCoeffs = [r(5, 3), r(0), r(-2, 7), r(0), r(11, 13)];
	const fullEven = integralRationalRecursive(evenCoeffs, r(-3, 5), r(3, 5));
	const halfEven = integralRationalRecursive(evenCoeffs, r(0), r(3, 5));
	assertNormalized(fullEven);
	assert.deepEqual(fullEven, rMul(r(2), halfEven));
});

test('satisfies calculus additivity and linearity invariants', () => {
	const p = [r(1, 3), r(-2, 5), r(7, 4), r(-1, 6), r(3, 8)];
	const q = [r(-4, 7), r(3, 2), r(0, 1), r(5, 9), r(-2, 11)];
	const a = r(-5, 6);
	const c = r(2, 7);
	const b = r(9, 4);

	// Interval additivity: int_a^c + int_c^b == int_a^b
	const left = integralRationalRecursive(p, a, c);
	const right = integralRationalRecursive(p, c, b);
	const whole = integralRationalRecursive(p, a, b);
	assertNormalized(whole);
	assert.deepEqual(rAdd(left, right), whole);

	// Linearity: int(alpha * P + beta * Q) == alpha * int(P) + beta * int(Q)
	const alpha = r(5, 11);
	const beta = r(-3, 7);
	const combined = p.map((pc, i) => rAdd(rMul(alpha, pc), rMul(beta, q[i])));
	const lhs = integralRationalRecursive(combined, a, b);
	const rhs = rAdd(
		rMul(alpha, integralRationalRecursive(p, a, b)),
		rMul(beta, integralRationalRecursive(q, a, b)),
	);
	assertNormalized(lhs);
	assert.deepEqual(lhs, rhs);
});

test('independent cross-check against exact Simpson rule for cubic polynomials', () => {
	const cases = [
		{ coeffs: [r(2, 3), r(-5, 7), r(3, 5), r(-11, 13)], a: r(-1, 2), b: r(3, 4) },
		{ coeffs: [r(-7, 2), r(0, 1), r(9, 4), r(1, 6)], a: r(-5, 3), b: r(-1, 7) },
		{ coeffs: [r(100, 3), r(-25, 11), r(4, 9), r(17, 5)], a: r(1, 5), b: r(11, 3) },
	];

	for (const { coeffs, a, b } of cases) {
		const actual = integralRationalRecursive(coeffs, a, b);
		const expected = exactSimpsonCubic(coeffs, a, b);
		assertNormalized(actual);
		assert.deepEqual(actual, expected);
	}
});

test('independent cross-check against direct summation on high-degree polynomial', () => {
	// Degree-24 polynomial to exercise multi-level divide-and-conquer splitting
	const coeffs = Array.from({ length: 25 }, (_, k) =>
		r(BigInt((k % 2 === 0 ? 1 : -1) * (k * 3 + 1)), BigInt(k + 2)),
	);
	const a = r(-2, 5);
	const b = r(3, 7);
	const actual = integralRationalRecursive(coeffs, a, b);
	const expected = naiveDirectIntegral(coeffs, a, b);
	assertNormalized(actual);
	assert.deepEqual(actual, expected);
});

test('rejects invalid inputs with TypeError or RangeError', () => {
	// Invalid coeffs container
	assert.throws(() => integralRationalRecursive(null, r(0), r(1)), TypeError);
	assert.throws(() => integralRationalRecursive(undefined, r(0), r(1)), TypeError);
	assert.throws(() => integralRationalRecursive('123', r(0), r(1)), TypeError);
	assert.throws(() => integralRationalRecursive({}, r(0), r(1)), TypeError);

	// Invalid coefficient elements
	assert.throws(() => integralRationalRecursive([null], r(0), r(1)), TypeError);
	assert.throws(() => integralRationalRecursive([1], r(0), r(1)), TypeError);
	assert.throws(() => integralRationalRecursive([{ num: 1, den: 2 }], r(0), r(1)), TypeError);
	assert.throws(() => integralRationalRecursive([{ num: 1n, den: 2 }], r(0), r(1)), TypeError);
	assert.throws(() => integralRationalRecursive([{ num: 1, den: 2n }], r(0), r(1)), TypeError);

	// Sparse array rejected
	const sparse = new Array(2);
	sparse[0] = r(1);
	assert.throws(() => integralRationalRecursive(sparse, r(0), r(1)), TypeError);

	// Zero denominator in coeffs rejected even when a === b
	assert.throws(() => integralRationalRecursive([r(1, 0)], r(2), r(2)), RangeError);

	// Invalid bounds rejected even when coeffs is empty
	assert.throws(() => integralRationalRecursive([], null, r(1)), TypeError);
	assert.throws(() => integralRationalRecursive([], r(0), undefined), TypeError);
	assert.throws(() => integralRationalRecursive([], { num: 0, den: 1 }, r(1)), TypeError);
	assert.throws(() => integralRationalRecursive([], r(0), { num: 1n, den: '1' }), TypeError);

	// Zero denominator in bounds
	assert.throws(() => integralRationalRecursive([r(1)], r(1, 0), r(2)), RangeError);
	assert.throws(() => integralRationalRecursive([r(1)], r(0), r(5, 0)), RangeError);
});
