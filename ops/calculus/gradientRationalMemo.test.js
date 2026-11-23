import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gradientRationalMemo } from './gradientRationalMemo.js';

/**
 * Helper to construct a Rational `{ num, den }` from BigInt or integer inputs.
 * @param {bigint | number} num
 * @param {bigint | number} [den=1n]
 * @returns {{ num: bigint, den: bigint }}
 */
function r(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) };
}

/**
 * Independent exact rational arithmetic helpers for test cross-checks.
 */
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

function norm(num, den) {
	if (num === 0n) return { num: 0n, den: 1n };
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	const g = gcd(num, den);
	return { num: num / g, den: den / g };
}

function rAdd(a, b) {
	return norm(a.num * b.den + b.num * a.den, a.den * b.den);
}

function rSub(a, b) {
	return norm(a.num * b.den - b.num * a.den, a.den * b.den);
}

function rMul(a, b) {
	return norm(a.num * b.num, a.den * b.den);
}

function rDiv(a, b) {
	return norm(a.num * b.den, a.den * b.num);
}

function rPow(base, exp) {
	let res = r(1n, 1n);
	for (let i = 0; i < exp; i++) {
		res = rMul(res, base);
	}
	return res;
}

function evalPoly(terms, point) {
	let sum = r(0n, 1n);
	for (const { coeff, powers } of terms) {
		let val = norm(coeff.num, coeff.den);
		for (let i = 0; i < point.length; i++) {
			val = rMul(val, rPow(point[i], powers[i]));
		}
		sum = rAdd(sum, val);
	}
	return sum;
}

function dot(u, v) {
	let sum = r(0n, 1n);
	for (let i = 0; i < u.length; i++) {
		sum = rAdd(sum, rMul(u[i], v[i]));
	}
	return sum;
}

describe('gradientRationalMemo', () => {
	describe('normal cases', () => {
		it('computes exact 1D polynomial derivative', () => {
			// f(x) = (2/3)x^3 - (1/2)x^2 + 5x - 7/4
			// f'(x) = 2x^2 - x + 5
			// At x = 3/2: 2*(9/4) - 3/2 + 5 = 9/2 - 3/2 + 5 = 8
			const terms = [
				{ coeff: r(2, 3), powers: [3] },
				{ coeff: r(-1, 2), powers: [2] },
				{ coeff: r(5, 1), powers: [1] },
				{ coeff: r(-7, 4), powers: [0] },
			];
			const grad = gradientRationalMemo(terms, [r(3, 2)]);
			assert.deepEqual(grad, [r(8, 1)]);
		});

		it('computes exact 2D polynomial gradient with cross terms', () => {
			// f(x, y) = (3/2)x^2*y - (1/4)x*y^3 + 2x - 5y + 9
			// df/dx = 3xy - (1/4)y^3 + 2
			// df/dy = (3/2)x^2 - (3/4)x*y^2 - 5
			// At (x, y) = (2/3, -1/2):
			// df/dx = 3*(2/3)*(-1/2) - (1/4)*(-1/8) + 2 = -1 + 1/32 + 2 = 33/32
			// df/dy = (3/2)*(4/9) - (3/4)*(2/3)*(1/4) - 5 = 2/3 - 1/8 - 5 = (16 - 3 - 120)/24 = -107/24
			const terms = [
				{ coeff: r(3, 2), powers: [2, 1] },
				{ coeff: r(-1, 4), powers: [1, 3] },
				{ coeff: r(2, 1), powers: [1, 0] },
				{ coeff: r(-5, 1), powers: [0, 1] },
				{ coeff: r(9, 1), powers: [0, 0] },
			];
			const grad = gradientRationalMemo(terms, [r(2, 3), r(-1, 2)]);
			assert.deepEqual(grad, [r(33, 32), r(-107, 24)]);
		});

		it('computes exact 3D polynomial gradient with multi-variable cross terms', () => {
			// f(x, y, z) = (1/3)x^2*y*z^3 - (2/5)x*y^2*z + (4/7)z^2
			// df/dx = (2/3)x*y*z^3 - (2/5)y^2*z
			// df/dy = (1/3)x^2*z^3 - (4/5)x*y*z
			// df/dz = x^2*y*z^2 - (2/5)x*y^2 + (8/7)z
			// At (x, y, z) = (3/2, -5/3, 1/2):
			// df/dx = (2/3)*(3/2)*(-5/3)*(1/8) - (2/5)*(25/9)*(1/2) = -5/24 - 5/9 = (-15 - 40)/72 = -55/72
			// df/dy = (1/3)*(9/4)*(1/8) - (4/5)*(3/2)*(-5/3)*(1/2) = 3/32 + 1 = 35/32
			// df/dz = (9/4)*(-5/3)*(1/4) - (2/5)*(3/2)*(25/9) + (8/7)*(1/2)
			//       = -15/16 - 5/3 + 4/7 = (-315 - 560 + 192)/336 = -683/336
			const terms = [
				{ coeff: r(1, 3), powers: [2, 1, 3] },
				{ coeff: r(-2, 5), powers: [1, 2, 1] },
				{ coeff: r(4, 7), powers: [0, 0, 2] },
			];
			const grad = gradientRationalMemo(terms, [r(3, 2), r(-5, 3), r(1, 2)]);
			assert.deepEqual(grad, [r(-55, 72), r(35, 32), r(-683, 336)]);
		});

		it('handles high-precision BigInt rationals without precision loss', () => {
			const bigNum = 10n ** 30n + 7n;
			const bigDen = 10n ** 20n + 3n;
			// f(x, y) = x^2 + (bigNum/bigDen)*y
			// grad = [2x, bigNum/bigDen]
			const terms = [
				{ coeff: r(1, 1), powers: [2, 0] },
				{ coeff: { num: bigNum, den: bigDen }, powers: [0, 1] },
			];
			const x = { num: 10n ** 25n + 1n, den: 3n };
			const y = { num: -(10n ** 25n), den: 7n };
			const grad = gradientRationalMemo(terms, [x, y]);
			assert.deepEqual(grad, [
				norm(2n * x.num, x.den),
				norm(bigNum, bigDen),
			]);
		});
	});

	describe('edge cases', () => {
		it('returns zero vector for constant and empty polynomials', () => {
			const pt = [r(5, 7), r(-3, 11), r(2, 1)];
			assert.deepEqual(gradientRationalMemo([], pt), [r(0, 1), r(0, 1), r(0, 1)]);
			assert.deepEqual(
				gradientRationalMemo([{ coeff: r(42, 5), powers: [0, 0, 0] }], pt),
				[r(0, 1), r(0, 1), r(0, 1)],
			);
		});

		it('handles zero coordinates accurately (including 0^0 = 1 in linear derivative terms)', () => {
			// f(x, y) = (7/3)x + 4x^2*y + (5/2)y^3
			// df/dx = 7/3 + 8xy -> at (0, 0) is 7/3
			// df/dy = 4x^2 + (15/2)y^2 -> at (0, 0) is 0/1
			const terms = [
				{ coeff: r(7, 3), powers: [1, 0] },
				{ coeff: r(4, 1), powers: [2, 1] },
				{ coeff: r(5, 2), powers: [0, 3] },
			];
			assert.deepEqual(gradientRationalMemo(terms, [r(0, 1), r(0, 1)]), [r(7, 3), r(0, 1)]);
			assert.deepEqual(gradientRationalMemo(terms, [r(0, 5), r(-2, 3)]), [
				r(7, 3),
				r(10, 3),
			]);
		});

		it('canonicalizes negative denominators, unreduced rationals, and cancelling duplicate monomials', () => {
			// f(x, y) = (6/-9)x^2 + (2/3)x^2 + (-4/-8)x*y + (1/2)x*y + (0/5)y^4
			// Simplifies to f(x, y) = x*y -> grad = [y, x]
			const terms = [
				{ coeff: r(6, -9), powers: [2, 0] },
				{ coeff: r(2, 3), powers: [2, 0] },
				{ coeff: r(-4, -8), powers: [1, 1] },
				{ coeff: r(1, 2), powers: [1, 1] },
				{ coeff: r(0, 5), powers: [0, 4] },
			];
			const grad = gradientRationalMemo(terms, [r(10, -15), r(-12, -16)]);
			assert.deepEqual(grad, [r(3, 4), r(-2, 3)]);
		});

		it('preserves memoization consistency across equivalent representations and resists caller mutation', () => {
			const termsA = [
				{ coeff: r(2, 4), powers: [2, 1] },
				{ coeff: r(-3, 6), powers: [0, 2] },
			];
			const termsB = [
				{ coeff: r(1, -2), powers: [0, 2] },
				{ coeff: r(1, 4), powers: [2, 1] },
				{ coeff: r(1, 4), powers: [2, 1] },
				{ coeff: r(0, 9), powers: [5, 5] },
			];
			const pointA = [r(4, 6), r(-2, 4)];
			const pointB = [r(-2, -3), r(1, -2)];

			const res1 = gradientRationalMemo(termsA, pointA);
			// Mutate returned vector and its Rational objects to ensure cache is isolated
			res1[0].num = 999999n;
			res1[0].den = 1n;
			res1.push(r(1, 1));

			const res2 = gradientRationalMemo(termsA, pointA);
			const res3 = gradientRationalMemo(termsB, pointB);

			// f(x, y) = (1/2)x^2*y - (1/2)y^2
			// df/dx = x*y = (2/3)*(-1/2) = -1/3
			// df/dy = (1/2)x^2 - y = (1/2)*(4/9) - (-1/2) = 2/9 + 1/2 = 13/18
			const expected = [r(-1, 3), r(13, 18)];
			assert.deepEqual(res2, expected);
			assert.deepEqual(res3, expected);
		});

		it('rejects invalid inputs with strict TypeError/RangeError validation', () => {
			assert.throws(() => gradientRationalMemo(null, [r(1, 1)]), TypeError);
			assert.throws(() => gradientRationalMemo([], 'not-array'), TypeError);
			assert.throws(() => gradientRationalMemo([], []), RangeError);

			// Invalid rational shapes and zero denominator
			assert.throws(() => gradientRationalMemo([], [{ num: 1, den: 1n }]), TypeError);
			assert.throws(() => gradientRationalMemo([], [{ num: 1n, den: 1 }]), TypeError);
			assert.throws(() => gradientRationalMemo([], [{ num: 1n, den: 0n }]), RangeError);
			assert.throws(() => gradientRationalMemo([], [null]), TypeError);

			// Invalid monomial shapes
			assert.throws(() => gradientRationalMemo([null], [r(1, 1)]), TypeError);
			assert.throws(
				() => gradientRationalMemo([{ coeff: r(1, 0), powers: [1] }], [r(1, 1)]),
				RangeError,
			);
			assert.throws(
				() => gradientRationalMemo([{ coeff: r(1, 1), powers: [1, 2] }], [r(1, 1)]),
				RangeError,
			);
			assert.throws(
				() => gradientRationalMemo([{ coeff: r(1, 1), powers: [-1] }], [r(1, 1)]),
				RangeError,
			);
			assert.throws(
				() => gradientRationalMemo([{ coeff: r(1, 1), powers: [1.5] }], [r(1, 1)]),
				TypeError,
			);
			assert.throws(
				() => gradientRationalMemo([{ coeff: r(1, 1), powers: [Number.NaN] }], [r(1, 1)]),
				TypeError,
			);
			assert.throws(
				() => gradientRationalMemo([{ coeff: r(1, 1), powers: [1n] }], [r(1, 1)]),
				TypeError,
			);
		});
	});

	describe('independent mathematical cross-checks', () => {
		it('matches exact central finite difference directional derivative on quadratic and approaches it on higher degrees', () => {
			// For any degree <= 2 polynomial, central difference (f(x+hv) - f(x-hv)) / (2h) == grad(f)(x) · v identically!
			const quad = [
				{ coeff: r(5, 3), powers: [2, 0, 0] },
				{ coeff: r(-7, 4), powers: [1, 1, 0] },
				{ coeff: r(2, 5), powers: [0, 2, 0] },
				{ coeff: r(11, 6), powers: [0, 1, 1] },
				{ coeff: r(-3, 2), powers: [0, 0, 2] },
				{ coeff: r(4, 7), powers: [1, 0, 1] },
				{ coeff: r(-1, 3), powers: [1, 0, 0] },
				{ coeff: r(9, 11), powers: [0, 0, 0] },
			];
			const x = [r(3, 5), r(-2, 7), r(5, 4)];
			const v = [r(-1, 3), r(4, 5), r(7, 6)];
			const h = r(1, 13);

			const xPlus = x.map((xi, i) => rAdd(xi, rMul(h, v[i])));
			const xMinus = x.map((xi, i) => rSub(xi, rMul(h, v[i])));
			const centralDiff = rDiv(rSub(evalPoly(quad, xPlus), evalPoly(quad, xMinus)), rMul(r(2, 1), h));

			const grad = gradientRationalMemo(quad, x);
			const directional = dot(grad, v);
			assert.deepEqual(directional, centralDiff);

			// For a degree-4 polynomial, central difference converges as O(h^2):
			// Check |centralDiff - directional| < 10^-20 for h = 10^-12
			const quartic = [
				{ coeff: r(2, 3), powers: [4, 0] },
				{ coeff: r(-5, 7), powers: [2, 2] },
				{ coeff: r(3, 5), powers: [1, 3] },
				{ coeff: r(-1, 2), powers: [0, 1] },
			];
			const p2 = [r(4, 5), r(-3, 7)];
			const dir2 = [r(2, 3), r(-5, 4)];
			const tinyH = { num: 1n, den: 10n ** 12n };
			const pPlus = p2.map((xi, i) => rAdd(xi, rMul(tinyH, dir2[i])));
			const pMinus = p2.map((xi, i) => rSub(xi, rMul(tinyH, dir2[i])));
			const cd4 = rDiv(rSub(evalPoly(quartic, pPlus), evalPoly(quartic, pMinus)), rMul(r(2, 1), tinyH));
			const dirDeriv4 = dot(gradientRationalMemo(quartic, p2), dir2);
			const err = rSub(cd4, dirDeriv4);
			const absErrNum = err.num < 0n ? -err.num : err.num;
			// absErrNum / err.den < 1 / 10^20  <=>  absErrNum * 10^20 < err.den
			assert.equal(absErrNum * 10n ** 20n < err.den, true);
		});

		it('satisfies exact linearity: grad(a*f + b*g) === a*grad(f) + b*grad(g)', () => {
			const f = [
				{ coeff: r(3, 4), powers: [3, 1, 0] },
				{ coeff: r(-5, 6), powers: [1, 2, 2] },
				{ coeff: r(7, 2), powers: [0, 0, 1] },
			];
			const g = [
				{ coeff: r(-2, 5), powers: [2, 1, 1] },
				{ coeff: r(11, 7), powers: [1, 2, 2] },
				{ coeff: r(4, 9), powers: [0, 3, 0] },
			];
			const a = r(-5, 3);
			const b = r(7, 11);
			const point = [r(-3, 4), r(5, 6), r(2, 9)];

			const combined = [
				...f.map((t) => ({ coeff: rMul(a, t.coeff), powers: t.powers })),
				...g.map((t) => ({ coeff: rMul(b, t.coeff), powers: t.powers })),
			];

			const lhs = gradientRationalMemo(combined, point);
			const gradF = gradientRationalMemo(f, point);
			const gradG = gradientRationalMemo(g, point);
			const rhs = gradF.map((gf, i) => rAdd(rMul(a, gf), rMul(b, gradG[i])));

			assert.deepEqual(lhs, rhs);
		});

		it('satisfies exact Euler homogeneous function theorem: x · grad(f)(x) === d * f(x)', () => {
			// Homogeneous polynomial of total degree d = 4 in 3 variables
			const d = 4;
			const homog = [
				{ coeff: r(2, 3), powers: [4, 0, 0] },
				{ coeff: r(-5, 7), powers: [2, 1, 1] },
				{ coeff: r(11, 13), powers: [1, 3, 0] },
				{ coeff: r(-3, 5), powers: [0, 2, 2] },
				{ coeff: r(7, 4), powers: [0, 0, 4] },
			];
			const point = [r(3, 5), r(-4, 7), r(2, 3)];
			const grad = gradientRationalMemo(homog, point);
			const lhs = dot(point, grad);
			const rhs = rMul(r(d, 1), evalPoly(homog, point));

			assert.deepEqual(lhs, rhs);
		});
	});
});
