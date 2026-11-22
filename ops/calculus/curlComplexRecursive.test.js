import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { curlComplexRecursive } from './curlComplexRecursive.js';

// Complex arithmetic helpers for tests
const c = (re, im = 0) => ({ re, im });
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a, b) => ({
	re: a.re * b.re - a.im * b.im,
	im: a.re * b.im + a.im * b.re,
});
const cScale = (a, s) => ({ re: a.re * s, im: a.im * s });
const cPowInt = (z, n) => {
	let acc = c(1, 0);
	for (let k = 0; k < n; k++) acc = cMul(acc, z);
	return acc;
};
const cExp = (z) => {
	const er = Math.exp(z.re);
	return { re: er * Math.cos(z.im), im: er * Math.sin(z.im) };
};
const cSin = (z) => ({
	re: Math.sin(z.re) * Math.cosh(z.im),
	im: Math.cos(z.re) * Math.sinh(z.im),
});
const cCos = (z) => ({
	re: Math.cos(z.re) * Math.cosh(z.im),
	im: -Math.sin(z.re) * Math.sinh(z.im),
});
const cAbs = (z) => Math.hypot(z.re, z.im);

function assertComplexNear(actual, expected, tol = 1e-10, label = '') {
	assert.equal(typeof actual.re, 'number', `${label} re should be number`);
	assert.equal(typeof actual.im, 'number', `${label} im should be number`);
	assert.equal(Object.is(actual.re, -0), false, `${label} re must not be -0`);
	assert.equal(Object.is(actual.im, -0), false, `${label} im must not be -0`);
	const err = cAbs(cSub(actual, expected));
	assert.ok(
		err <= tol,
		`${label}: expected (${expected.re}, ${expected.im}), got (${actual.re}, ${actual.im}), |err|=${err} > ${tol}`,
	);
}

function assertVectorNear(actual, expected, tol = 1e-10, label = 'vector') {
	assert.equal(actual.length, 3);
	for (let i = 0; i < 3; i++) {
		assertComplexNear(actual[i], expected[i], tol, `${label}[${i}]`);
	}
}

describe('curlComplexRecursive', () => {
	describe('normal cases & analytical solutions', () => {
		test('rigid rotation field F(x, y, z) = (-y, x, 0) yields (0, 0, 2)', () => {
			const field = ([x, y]) => [cScale(y, -1), x, c(0, 0)];
			const point = [c(1.5, -2.25), c(-3.1, 0.7), c(4.2, 1.1)];
			const result = curlComplexRecursive(field, point);
			assertVectorNear(result, [c(0, 0), c(0, 0), c(2, 0)], 1e-13);
		});

		test('purely imaginary linear field F(x, y, z) = (i*z, -i*x, i*y)', () => {
			const I = c(0, 1);
			const field = ([x, y, z]) => [cMul(I, z), cMul(c(0, -1), x), cMul(I, y)];
			const point = [c(2, 3), c(-1, 4), c(0.5, -2)];
			// ∂Fz/∂y - ∂Fy/∂z = i - 0 = i
			// ∂Fx/∂z - ∂Fz/∂x = i - 0 = i
			// ∂Fy/∂x - ∂Fx/∂y = -i - 0 = -i
			const result = curlComplexRecursive(field, point);
			assertVectorNear(result, [c(0, 1), c(0, 1), c(0, -1)], 1e-13);
		});

		test('holomorphic cubic polynomial field F(x, y, z) = (y^2*z, z^2*x, x^2*y)', () => {
			const field = ([x, y, z]) => [
				cMul(cMul(y, y), z),
				cMul(cMul(z, z), x),
				cMul(cMul(x, x), y),
			];
			const point = [c(1, 2), c(-0.5, 1.5), c(2, -1)];
			const [x, y, z] = point;
			const expected = [
				cSub(cMul(x, x), cScale(cMul(x, z), 2)),
				cSub(cMul(y, y), cScale(cMul(x, y), 2)),
				cSub(cMul(z, z), cScale(cMul(y, z), 2)),
			];
			const result = curlComplexRecursive(field, point);
			assertVectorNear(result, expected, 1e-12);
		});

		test('high-degree holomorphic polynomial field F(x, y, z) = (z^5, x^5, y^5)', () => {
			const field = ([x, y, z]) => [cPowInt(z, 5), cPowInt(x, 5), cPowInt(y, 5)];
			const point = [c(1.2, -0.8), c(-0.7, 1.1), c(0.9, 0.6)];
			const [x, y, z] = point;
			const expected = [
				cScale(cPowInt(y, 4), 5),
				cScale(cPowInt(z, 4), 5),
				cScale(cPowInt(x, 4), 5),
			];
			const result = curlComplexRecursive(field, point);
			assertVectorNear(result, expected, 1e-11);
		});

		test('complex transcendental field F = (exp(i*y)*sin(z), exp(i*z)*sin(x), exp(i*x)*sin(y))', () => {
			const I = c(0, 1);
			const field = ([x, y, z]) => [
				cMul(cExp(cMul(I, y)), cSin(z)),
				cMul(cExp(cMul(I, z)), cSin(x)),
				cMul(cExp(cMul(I, x)), cSin(y)),
			];
			const point = [c(0.4, 0.3), c(-0.6, 0.2), c(0.8, -0.5)];
			const [x, y, z] = point;
			const expected = [
				cSub(
					cMul(cExp(cMul(I, x)), cCos(y)),
					cMul(I, cMul(cExp(cMul(I, z)), cSin(x))),
				),
				cSub(
					cMul(cExp(cMul(I, y)), cCos(z)),
					cMul(I, cMul(cExp(cMul(I, x)), cSin(y))),
				),
				cSub(
					cMul(cExp(cMul(I, z)), cCos(x)),
					cMul(I, cMul(cExp(cMul(I, y)), cSin(z))),
				),
			];
			const result = curlComplexRecursive(field, point);
			assertVectorNear(result, expected, 1e-11);
		});

		test('electromagnetic complex plane wave satisfies ∇ × E = i (k × E)', () => {
			const I = c(0, 1);
			const k = [c(1.2, 0.1), c(-0.7, 0.2), c(0.5, -0.15)];
			const E0 = [c(2, -1), c(0.5, 1.5), c(-1, 0.25)];
			const field = ([x, y, z]) => {
				const dot = cAdd(cAdd(cMul(k[0], x), cMul(k[1], y)), cMul(k[2], z));
				const phase = cExp(cMul(I, dot));
				return [cMul(E0[0], phase), cMul(E0[1], phase), cMul(E0[2], phase)];
			};
			const point = [c(0.3, -0.2), c(0.7, 0.4), c(-0.5, 0.1)];
			const E = field(point);
			// i * (k × E)
			const expected = [
				cMul(I, cSub(cMul(k[1], E[2]), cMul(k[2], E[1]))),
				cMul(I, cSub(cMul(k[2], E[0]), cMul(k[0], E[2]))),
				cMul(I, cSub(cMul(k[0], E[1]), cMul(k[1], E[0]))),
			];
			const result = curlComplexRecursive(field, point);
			assertVectorNear(result, expected, 1e-11);
		});
	});

	describe('edge cases & options', () => {
		test('zero vector field returns exact zero vector without -0', () => {
			const field = () => [c(0, 0), c(0, 0), c(0, 0)];
			const result = curlComplexRecursive(field, [c(0, 0), c(0, 0), c(0, 0)]);
			for (const comp of result) {
				assert.equal(comp.re, 0);
				assert.equal(comp.im, 0);
				assert.equal(Object.is(comp.re, -0), false);
				assert.equal(Object.is(comp.im, -0), false);
			}
		});

		test('constant complex vector field has zero curl', () => {
			const field = () => [c(3.5, -7.2), c(-1.1, 4.4), c(9.0, 2.3)];
			const result = curlComplexRecursive(field, [c(10, -5), c(0, 0), c(-3, 8)]);
			assertVectorNear(result, [c(0, 0), c(0, 0), c(0, 0)], 1e-14);
		});

		test('handles -0 inputs and normalizes output free of -0', () => {
			const field = () => [c(-0, -0), c(-0, -0), c(-0, -0)];
			const result = curlComplexRecursive(field, [c(-0, -0), c(-0, -0), c(-0, -0)]);
			for (const comp of result) {
				assert.equal(Object.is(comp.re, -0), false);
				assert.equal(Object.is(comp.im, -0), false);
			}
		});

		test('maxDepth: 0 computes single-step central difference accurately for quadratic fields', () => {
			const field = ([x, y, z]) => [cMul(y, y), cMul(z, z), cMul(x, x)];
			const point = [c(1, -1), c(2, 0.5), c(-1.5, 2)];
			const [x, y, z] = point;
			// ∂(x^2)/∂y - ∂(z^2)/∂z = -2z
			// ∂(y^2)/∂z - ∂(x^2)/∂x = -2x
			// ∂(z^2)/∂x - ∂(y^2)/∂y = -2y
			const expected = [cScale(z, -2), cScale(x, -2), cScale(y, -2)];
			const result = curlComplexRecursive(field, point, { step: 1e-2, maxDepth: 0 });
			assertVectorNear(result, expected, 1e-12);
		});

		test('custom step, maxDepth, and tolerance: 0 work cleanly', () => {
			const field = ([x, y, z]) => [cExp(z), cExp(x), cExp(y)];
			const point = [c(0.5, 0.2), c(-0.3, 0.7), c(0.1, -0.4)];
			const [x, y, z] = point;
			const expected = [cExp(y), cExp(z), cExp(x)];
			const result = curlComplexRecursive(field, point, {
				step: 5e-3,
				maxDepth: 5,
				tolerance: 0,
			});
			assertVectorNear(result, expected, 1e-11);
		});

		test('large-magnitude derivatives converge using relative tolerance scaling', () => {
			const scale = 1e6;
			const field = ([x, y]) => [cScale(y, -scale), cScale(x, scale), c(0, 0)];
			const result = curlComplexRecursive(field, [c(1, 2), c(3, 4), c(5, 6)]);
			assertVectorNear(result, [c(0, 0), c(0, 0), c(2 * scale, 0)], 1e-6);
		});

		test('does not mutate caller point or allow field to mutate caller point', () => {
			const p0 = { re: 1, im: 2 };
			const p1 = { re: 3, im: 4 };
			const p2 = { re: 5, im: 6 };
			const point = [p0, p1, p2];
			const mutatingField = (pt) => {
				const out = [cScale(pt[1], -1), { re: pt[0].re, im: pt[0].im }, c(0, 0)];
				pt[0].re = 999;
				pt[1] = { re: -999, im: -999 };
				return out;
			};
			const result = curlComplexRecursive(mutatingField, point);
			assertVectorNear(result, [c(0, 0), c(0, 0), c(2, 0)], 1e-12);
			assert.deepEqual(point, [
				{ re: 1, im: 2 },
				{ re: 3, im: 4 },
				{ re: 5, im: 6 },
			]);
		});
	});

	describe('input validation', () => {
		const validField = () => [c(0, 0), c(0, 0), c(0, 0)];
		const validPoint = [c(0, 0), c(0, 0), c(0, 0)];

		test('throws TypeError for non-function field', () => {
			for (const bad of [null, undefined, 42, 'fn', {}, []]) {
				assert.throws(() => curlComplexRecursive(bad, validPoint), TypeError);
			}
		});

		test('throws TypeError or RangeError for invalid point', () => {
			for (const bad of [null, undefined, 123, 'pt', { x: 0, y: 0, z: 0 }]) {
				assert.throws(() => curlComplexRecursive(validField, bad), TypeError);
			}
			for (const badLen of [[], [c(0)], [c(0), c(0)], [c(0), c(0), c(0), c(0)]]) {
				assert.throws(() => curlComplexRecursive(validField, badLen), RangeError);
			}
			for (const badComp of [null, 5, [0, 0], { re: 1 }, { re: '1', im: 0 }, { re: 0, im: null }]) {
				assert.throws(() => curlComplexRecursive(validField, [badComp, c(0), c(0)]), TypeError);
			}
			for (const badFinite of [
				{ re: NaN, im: 0 },
				{ re: 0, im: Infinity },
				{ re: -Infinity, im: 0 },
			]) {
				assert.throws(() => curlComplexRecursive(validField, [c(0), badFinite, c(0)]), RangeError);
			}
		});

		test('throws TypeError or RangeError for invalid options', () => {
			for (const badOpts of [null, 123, 'opt', []]) {
				assert.throws(() => curlComplexRecursive(validField, validPoint, badOpts), TypeError);
			}
			assert.throws(() => curlComplexRecursive(validField, validPoint, { step: '0.01' }), TypeError);
			for (const badStep of [0, -1e-3, NaN, Infinity, -Infinity]) {
				assert.throws(() => curlComplexRecursive(validField, validPoint, { step: badStep }), RangeError);
			}
			assert.throws(() => curlComplexRecursive(validField, validPoint, { maxDepth: '4' }), TypeError);
			for (const badDepth of [-1, 1.5, 17, NaN, Infinity]) {
				assert.throws(
					() => curlComplexRecursive(validField, validPoint, { maxDepth: badDepth }),
					RangeError,
				);
			}
			assert.throws(() => curlComplexRecursive(validField, validPoint, { tolerance: '1e-9' }), TypeError);
			for (const badTol of [-1e-12, NaN, Infinity]) {
				assert.throws(
					() => curlComplexRecursive(validField, validPoint, { tolerance: badTol }),
					RangeError,
				);
			}
		});

		test('throws TypeError or RangeError for invalid field return values', () => {
			assert.throws(() => curlComplexRecursive(() => null, validPoint), TypeError);
			assert.throws(() => curlComplexRecursive(() => [c(0), c(0)], validPoint), RangeError);
			assert.throws(() => curlComplexRecursive(() => [c(0), { re: 1 }, c(0)], validPoint), TypeError);
			assert.throws(
				() => curlComplexRecursive(() => [c(0), c(0), { re: NaN, im: 0 }], validPoint),
				RangeError,
			);
			assert.throws(
				() => curlComplexRecursive(() => [c(Infinity, 0), c(0), c(0)], validPoint),
				RangeError,
			);
		});
	});

	describe('cross-checks & vector calculus identities', () => {
		test('identity: curl of a gradient is zero, ∇ × (∇φ) = 0', () => {
			// Scalar potential φ(x, y, z) = exp(x * y) + z^3
			// ∇φ = [y * exp(x*y), x * exp(x*y), 3 * z^2]
			const gradPhi = ([x, y, z]) => {
				const exy = cExp(cMul(x, y));
				return [cMul(y, exy), cMul(x, exy), cScale(cMul(z, z), 3)];
			};
			const point = [c(0.5, -0.4), c(-0.3, 0.8), c(1.1, 0.2)];
			const result = curlComplexRecursive(gradPhi, point);
			assertVectorNear(result, [c(0, 0), c(0, 0), c(0, 0)], 1e-11);
		});

		test('identity: divergence of a curl is zero, ∇ · (∇ × F) = 0', () => {
			const field = ([x, y, z]) => [
				cMul(cSin(y), cExp(z)),
				cMul(cCos(z), cMul(x, x)),
				cMul(cExp(x), cSin(y)),
			];
			const point = [c(0.4, 0.2), c(-0.5, 0.3), c(0.6, -0.25)];
			const h = 1e-4;
			// Independent iterative central-difference divergence of curlComplexRecursive
			let div = c(0, 0);
			for (let axis = 0; axis < 3; axis++) {
				const pPlus = point.map((v, i) => (i === axis ? c(v.re + h, v.im) : v));
				const pMinus = point.map((v, i) => (i === axis ? c(v.re - h, v.im) : v));
				const curlPlus = curlComplexRecursive(field, pPlus);
				const curlMinus = curlComplexRecursive(field, pMinus);
				const partial = cScale(cSub(curlPlus[axis], curlMinus[axis]), 0.5 / h);
				div = cAdd(div, partial);
			}
			assertComplexNear(div, c(0, 0), 1e-7, 'div(curl(F))');
		});

		test('identity: complex linearity ∇ × (αF + βG) = α(∇ × F) + β(∇ × G)', () => {
			const F = ([x, y, z]) => [cMul(y, cSin(z)), cMul(z, cExp(x)), cMul(x, cCos(y))];
			const G = ([x, y, z]) => [cPowInt(z, 3), cMul(x, y), cMul(y, z)];
			const alpha = c(2.5, -1.3);
			const beta = c(-0.7, 3.1);
			const combined = (pt) => {
				const fv = F(pt);
				const gv = G(pt);
				return [0, 1, 2].map((i) => cAdd(cMul(alpha, fv[i]), cMul(beta, gv[i])));
			};
			const point = [c(0.7, -0.2), c(-0.4, 0.5), c(0.3, 0.6)];
			const lhs = curlComplexRecursive(combined, point);
			const curlF = curlComplexRecursive(F, point);
			const curlG = curlComplexRecursive(G, point);
			const rhs = [0, 1, 2].map((i) => cAdd(cMul(alpha, curlF[i]), cMul(beta, curlG[i])));
			assertVectorNear(lhs, rhs, 1e-11, 'linearity');
		});

		test('identity: product rule ∇ × (f F) = (∇f) × F + f (∇ × F)', () => {
			// f(x, y, z) = x*y + z^2, ∇f = [y, x, 2z]
			const f = ([x, y, z]) => cAdd(cMul(x, y), cMul(z, z));
			const gradF = ([x, y, z]) => [y, x, cScale(z, 2)];
			const F = ([x, y, z]) => [cSin(y), cExp(z), cMul(x, x)];
			const fF = (pt) => {
				const s = f(pt);
				return F(pt).map((comp) => cMul(s, comp));
			};
			const point = [c(0.6, -0.3), c(0.2, 0.7), c(-0.4, 0.5)];
			const lhs = curlComplexRecursive(fF, point);

			const gf = gradF(point);
			const Fp = F(point);
			const curlF = curlComplexRecursive(F, point);
			const fp = f(point);
			const cross = [
				cSub(cMul(gf[1], Fp[2]), cMul(gf[2], Fp[1])),
				cSub(cMul(gf[2], Fp[0]), cMul(gf[0], Fp[2])),
				cSub(cMul(gf[0], Fp[1]), cMul(gf[1], Fp[0])),
			];
			const rhs = [0, 1, 2].map((i) => cAdd(cross[i], cMul(fp, curlF[i])));
			assertVectorNear(lhs, rhs, 1e-11, 'product rule');
		});

		test('cross-check against independent iterative 5-point stencil curl', () => {
			const field = ([x, y, z]) => [
				cMul(cExp(cMul(y, z)), cSin(x)),
				cMul(cCos(cAdd(x, z)), cMul(y, y)),
				cAdd(cPowInt(x, 3), cExp(cMul(y, c(0, 1)))),
			];
			const point = [c(0.5, 0.25), c(-0.35, 0.45), c(0.6, -0.2)];

			// Independent non-recursive 5-point stencil: (-f(x+2h) + 8f(x+h) - 8f(x-h) + f(x-2h)) / (12h)
			const h = 1e-3;
			const partials = [];
			for (let axis = 0; axis < 3; axis++) {
				const evalShift = (mult) =>
					field(point.map((v, i) => (i === axis ? c(v.re + mult * h, v.im) : v)));
				const fp2 = evalShift(2);
				const fp1 = evalShift(1);
				const fm1 = evalShift(-1);
				const fm2 = evalShift(-2);
				const col = [];
				for (let comp = 0; comp < 3; comp++) {
					const num = cAdd(
						cSub(cScale(fp1[comp], 8), fp2[comp]),
						cSub(fm2[comp], cScale(fm1[comp], 8)),
					);
					col.push(cScale(num, 1 / (12 * h)));
				}
				partials.push(col);
			}
			const refCurl = [
				cSub(partials[1][2], partials[2][1]),
				cSub(partials[2][0], partials[0][2]),
				cSub(partials[0][1], partials[1][0]),
			];

			const actual = curlComplexRecursive(field, point);
			assertVectorNear(actual, refCurl, 1e-10, '5-point stencil cross-check');
		});

		test('Cauchy-Riemann cross-check: imaginary-axis differentiation matches real-axis curl for holomorphic fields', () => {
			const field = ([x, y, z]) => [
				cMul(cExp(y), cCos(z)),
				cMul(cSin(z), cPowInt(x, 2)),
				cMul(cExp(x), cSin(y)),
			];
			const point = [c(0.3, -0.4), c(0.7, 0.2), c(-0.5, 0.6)];

			// Independent derivative along the imaginary axis: (F(p + i*h*e_j) - F(p - i*h*e_j)) / (2*i*h)
			// Dividing by i is multiplying by -i: (a + bi) * (-i) = b - ai
			const h = 1e-5;
			const partialsIm = [];
			for (let axis = 0; axis < 3; axis++) {
				const fp = field(point.map((v, i) => (i === axis ? c(v.re, v.im + h) : v)));
				const fm = field(point.map((v, i) => (i === axis ? c(v.re, v.im - h) : v)));
				const col = [0, 1, 2].map((comp) => {
					const d = cScale(cSub(fp[comp], fm[comp]), 0.5 / h);
					return c(d.im, -d.re); // d / i
				});
				partialsIm.push(col);
			}
			const imagCurl = [
				cSub(partialsIm[1][2], partialsIm[2][1]),
				cSub(partialsIm[2][0], partialsIm[0][2]),
				cSub(partialsIm[0][1], partialsIm[1][0]),
			];

			const actual = curlComplexRecursive(field, point);
			assertVectorNear(actual, imagCurl, 1e-9, 'Cauchy-Riemann imaginary-axis cross-check');
		});
	});
});
