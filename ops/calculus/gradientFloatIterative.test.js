import test from 'node:test';
import assert from 'node:assert/strict';
import { gradientFloatIterative } from './gradientFloatIterative.js';

function assertVectorClose(actual, expected, tol = 1e-7) {
	assert.equal(actual.length, expected.length, `expected length ${expected.length}, got ${actual.length}`);
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i]);
		assert.ok(
			diff <= tol,
			`index ${i}: expected ${expected[i]} ± ${tol}, got ${actual[i]} (diff=${diff})`
		);
	}
}

test('1D polynomial derivative matches analytic derivative', () => {
	const f = ([x]) => 3 * x ** 2 - 2 * x + 5;
	assertVectorClose(gradientFloatIterative(f, [2]), [10], 1e-8);
	assertVectorClose(gradientFloatIterative(f, [-3.5]), [-23], 1e-8);
});

test('2D quadratic form gradient matches analytic gradient', () => {
	const f = ([x, y]) => x * x + 3 * x * y + 2 * y * y - 4 * x + y;
	// ∇f = [2x + 3y - 4, 3x + 4y + 1]
	assertVectorClose(gradientFloatIterative(f, [1.5, -2.25]), [-7.75, -3.5], 1e-8);
});

test('3D smooth transcendental function matches analytic gradient', () => {
	const f = ([x, y, z]) => Math.sin(x) * Math.cos(y) + Math.exp(z) * x;
	const p = [0.7, -1.1, 0.4];
	const expected = [
		Math.cos(p[0]) * Math.cos(p[1]) + Math.exp(p[2]),
		-Math.sin(p[0]) * Math.sin(p[1]),
		Math.exp(p[2]) * p[0],
	];
	assertVectorClose(gradientFloatIterative(f, p), expected, 1e-8);
});

test('higher-dimensional weighted sum of squares', () => {
	const p = [1, -2, 3, -4, 5, -6, 7, -8];
	const f = (x) => {
		let sum = 0;
		for (let i = 0; i < x.length; i++) {
			sum += (i + 1) * x[i] * x[i];
		}
		return sum;
	};
	const expected = p.map((v, i) => 2 * (i + 1) * v);
	assertVectorClose(gradientFloatIterative(f, p), expected, 1e-6);
});

test('supports explicit custom step size h', () => {
	const f = ([x, y]) => Math.pow(x, 3) - Math.pow(y, 3);
	assertVectorClose(gradientFloatIterative(f, [2, -1], 1e-5), [12, -3], 1e-7);
	assertVectorClose(gradientFloatIterative(f, [2, -1], 1e-7), [12, -3], 1e-6);
});

test('edge cases: constant function, critical point, and no negative zero', () => {
	const constant = () => 42;
	const gConst = gradientFloatIterative(constant, [1, -2, 3]);
	assert.deepEqual(gConst, [0, 0, 0]);
	for (const v of gConst) {
		assert.ok(Object.is(v, 0), 'expected +0, not -0');
	}

	const bowl = ([x, y]) => -(x * x + y * y);
	const gZero = gradientFloatIterative(bowl, [0, 0]);
	assert.deepEqual(gZero, [0, 0]);
	assert.ok(Object.is(gZero[0], 0));
	assert.ok(Object.is(gZero[1], 0));
});

test('edge case: empty point returns empty gradient', () => {
	const g = gradientFloatIterative(() => 1, []);
	assert.deepEqual(g, []);
});

test('edge case: does not mutate input point even if fn mutates its argument', () => {
	const point = [2, 3, 4];
	const snapshot = point.slice();
	const f = (x) => {
		const val = x[0] * x[1] + x[2] * x[2];
		x[0] = 9999;
		x[1] = -9999;
		return val;
	};
	const g = gradientFloatIterative(f, point);
	assert.deepEqual(point, snapshot);
	assertVectorClose(g, [3, 2, 8], 1e-8);
});

test('input validation rejects invalid fn, point, and h', () => {
	assert.throws(() => gradientFloatIterative(null, [1]), TypeError);
	assert.throws(() => gradientFloatIterative(123, [1]), TypeError);

	assert.throws(() => gradientFloatIterative(() => 0, null), TypeError);
	assert.throws(() => gradientFloatIterative(() => 0, 'abc'), TypeError);
	assert.throws(() => gradientFloatIterative(() => 0, { 0: 1, length: 1 }), TypeError);

	assert.throws(() => gradientFloatIterative(() => 0, ['1']), TypeError);
	assert.throws(() => gradientFloatIterative(() => 0, [1, undefined]), TypeError);
	// eslint-disable-next-line no-sparse-arrays
	assert.throws(() => gradientFloatIterative(() => 0, new Array(2)), TypeError);

	assert.throws(() => gradientFloatIterative(() => 0, [NaN]), RangeError);
	assert.throws(() => gradientFloatIterative(() => 0, [Infinity]), RangeError);
	assert.throws(() => gradientFloatIterative(() => 0, [0, -Infinity]), RangeError);

	assert.throws(() => gradientFloatIterative(() => 0, [1], '1e-6'), TypeError);
	assert.throws(() => gradientFloatIterative(() => 0, [1], null), TypeError);
	assert.throws(() => gradientFloatIterative(() => 0, [1], 0), RangeError);
	assert.throws(() => gradientFloatIterative(() => 0, [1], -1e-6), RangeError);
	assert.throws(() => gradientFloatIterative(() => 0, [1], NaN), RangeError);
	assert.throws(() => gradientFloatIterative(() => 0, [1], Infinity), RangeError);
});

test('input validation rejects non-number or non-finite fn results and float64 step limits', () => {
	assert.throws(() => gradientFloatIterative(() => '42', [1]), TypeError);
	assert.throws(() => gradientFloatIterative(() => undefined, [1]), TypeError);
	assert.throws(() => gradientFloatIterative(() => NaN, [1]), RangeError);
	assert.throws(() => gradientFloatIterative(() => Infinity, [1]), RangeError);

	// Step underflow: 1e16 + 1e-6 === 1e16 in IEEE-754 float64
	assert.throws(() => gradientFloatIterative(([x]) => x, [1e16], 1e-6), RangeError);
	// Step overflow: MAX_VALUE + MAX_VALUE === Infinity
	assert.throws(() => gradientFloatIterative(([x]) => x, [Number.MAX_VALUE], Number.MAX_VALUE), RangeError);
});

test('cross-check 1: agrees with forward-mode dual-number automatic differentiation', () => {
	// Independent dual-number forward-mode AD implementation
	const dual = (v, d = 0) => ({ v, d });
	const dAdd = (a, b) => dual(a.v + b.v, a.d + b.d);
	const dMul = (a, b) => dual(a.v * b.v, a.d * b.v + a.v * b.d);
	const dDiv = (a, b) => dual(a.v / b.v, (a.d * b.v - a.v * b.d) / (b.v * b.v));
	const dSin = (a) => dual(Math.sin(a.v), Math.cos(a.v) * a.d);
	const dExp = (a) => {
		const e = Math.exp(a.v);
		return dual(e, e * a.d);
	};

	// f(x, y, z) = exp(x * y) + sin(x + z^2) / (1 + y^2)
	const fFloat = ([x, y, z]) => Math.exp(x * y) + Math.sin(x + z * z) / (1 + y * y);
	const fDual = ([x, y, z]) => {
		const term1 = dExp(dMul(x, y));
		const num = dSin(dAdd(x, dMul(z, z)));
		const den = dAdd(dual(1), dMul(y, y));
		return dAdd(term1, dDiv(num, den));
	};

	const point = [0.6, -0.8, 1.2];
	const adGrad = point.map((_, i) => {
		const dualPoint = point.map((val, j) => dual(val, i === j ? 1 : 0));
		return fDual(dualPoint).d;
	});

	const numGrad = gradientFloatIterative(fFloat, point);
	assertVectorClose(numGrad, adGrad, 1e-8);
});

test('cross-check 2: directional derivative and line integral (fundamental theorem of calculus)', () => {
	const f = ([x, y, z]) => x * x * y + Math.sin(y * z) - Math.log(1 + x * x + z * z);
	const p = [1.1, -0.7, 0.9];
	const grad = gradientFloatIterative(f, p);

	// Directional derivative check along arbitrary direction u
	const u = [0.3, -0.5, 0.8];
	const eps = 1e-6;
	const directionalNumeric = (f(p.map((v, i) => v + eps * u[i])) - f(p.map((v, i) => v - eps * u[i]))) / (2 * eps);
	const directionalFromGrad = grad[0] * u[0] + grad[1] * u[1] + grad[2] * u[2];
	assert.ok(
		Math.abs(directionalNumeric - directionalFromGrad) < 1e-8,
		`directional mismatch: ${directionalNumeric} vs ${directionalFromGrad}`
	);

	// Fundamental theorem of calculus for line integrals:
	// ∫_0^1 ∇f(a + t(b - a)) · (b - a) dt = f(b) - f(a) using composite Simpson's rule
	const a = [-0.5, 0.4, 0.2];
	const b = [1.2, -0.9, 1.1];
	const delta = b.map((bi, i) => bi - a[i]);
	const steps = 100; // even
	const dt = 1 / steps;
	let integral = 0;
	for (let k = 0; k <= steps; k++) {
		const t = k * dt;
		const pt = a.map((ai, i) => ai + t * delta[i]);
		const g = gradientFloatIterative(f, pt);
		const integrand = g[0] * delta[0] + g[1] * delta[1] + g[2] * delta[2];
		const weight = k === 0 || k === steps ? 1 : k % 2 === 1 ? 4 : 2;
		integral += weight * integrand;
	}
	integral *= dt / 3;
	const exactDiff = f(b) - f(a);
	assert.ok(
		Math.abs(integral - exactDiff) < 1e-7,
		`line integral mismatch: ${integral} vs ${exactDiff}`
	);
});
