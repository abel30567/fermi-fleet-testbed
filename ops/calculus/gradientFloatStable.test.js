import test from 'node:test';
import assert from 'node:assert/strict';
import { gradientFloatStable } from './gradientFloatStable.js';

/**
 * Helper to assert two numeric vectors are close component-wise.
 */
function assertVecClose(actual, expected, { absTol = 1e-11, relTol = 1e-11 } = {}) {
	assert.equal(actual.length, expected.length, `length mismatch: ${actual.length} vs ${expected.length}`);
	for (let i = 0; i < expected.length; i++) {
		const err = Math.abs(actual[i] - expected[i]);
		const bound = absTol + relTol * Math.abs(expected[i]);
		assert.ok(
			err <= bound,
			`index ${i}: expected ${expected[i]}, got ${actual[i]} (err=${err}, bound=${bound})`
		);
	}
}

test('normal cases: constant, linear, and quadratic forms', () => {
	// Constant function with huge offset
	const gConst = gradientFloatStable(() => 1e12, [3, -7, 42]);
	assert.deepEqual(gConst, [0, 0, 0]);
	assert.ok(!Object.is(gConst[0], -0));

	// Affine function f(x) = 3x0 - 2.5x1 + 7x2 + 11
	const fLinear = ([x0, x1, x2]) => 3 * x0 - 2.5 * x1 + 7 * x2 + 11;
	assertVecClose(gradientFloatStable(fLinear, [1.2, -3.4, 5.6]), [3, -2.5, 7], {
		absTol: 1e-13,
		relTol: 1e-13,
	});

	// Quadratic form f(x) = 0.5 * x^T A x + b^T x with symmetric A
	const A = [
		[4, 1, -2],
		[1, 3, 0.5],
		[-2, 0.5, 5],
	];
	const b = [-1, 2, -3];
	const fQuad = (v) => {
		let sum = 0;
		for (let i = 0; i < 3; i++) {
			sum += b[i] * v[i];
			for (let j = 0; j < 3; j++) {
				sum += 0.5 * v[i] * A[i][j] * v[j];
			}
		}
		return sum;
	};
	const x = [1.5, -2.25, 0.75];
	const expected = [0, 1, 2].map((i) => b[i] + A[i][0] * x[0] + A[i][1] * x[1] + A[i][2] * x[2]);
	assertVecClose(gradientFloatStable(fQuad, x), expected, { absTol: 1e-12, relTol: 1e-12 });
});

test('normal cases: Rosenbrock and nonlinear multivariate transcendental functions', () => {
	// Rosenbrock: f(x, y) = (1 - x)^2 + 100 * (y - x^2)^2
	const rosenbrock = ([x, y]) => (1 - x) ** 2 + 100 * (y - x * x) ** 2;
	const rosenGrad = ([x, y]) => [-2 * (1 - x) - 400 * x * (y - x * x), 200 * (y - x * x)];

	for (const pt of [
		[1, 1],
		[-1.2, 1.0],
		[0.5, 0.25],
		[2.3, -1.7],
	]) {
		assertVecClose(gradientFloatStable(rosenbrock, pt), rosenGrad(pt), {
			absTol: 1e-11,
			relTol: 1e-11,
		});
	}

	// f(x, y, z) = sin(x * y) + exp(z) * cos(x) - log(1 + y^2)
	const fTrans = ([x, y, z]) => Math.sin(x * y) + Math.exp(z) * Math.cos(x) - Math.log(1 + y * y);
	const gradTrans = ([x, y, z]) => [
		y * Math.cos(x * y) - Math.exp(z) * Math.sin(x),
		x * Math.cos(x * y) - (2 * y) / (1 + y * y),
		Math.exp(z) * Math.cos(x),
	];

	const p = [0.7, -1.3, 0.4];
	assertVecClose(gradientFloatStable(fTrans, p), gradTrans(p), {
		absTol: 1e-12,
		relTol: 1e-12,
	});
});

test('normal cases: higher-dimensional coupled function (10D)', () => {
	const n = 10;
	const x = Array.from({ length: n }, (_, i) => (i - 4.5) * 0.35);
	const f = (v) => {
		let sum = 0;
		for (let i = 0; i < n; i++) {
			sum += Math.sin(v[i]) * v[(i + 1) % n] + 0.1 * v[i] * v[i];
		}
		return sum;
	};
	const expected = x.map((xi, i) => {
		const prev = (i - 1 + n) % n;
		const next = (i + 1) % n;
		return Math.cos(xi) * x[next] + Math.sin(x[prev]) + 0.2 * xi;
	});

	assertVecClose(gradientFloatStable(f, x), expected, { absTol: 1e-12, relTol: 1e-12 });
});

test('independent cross-check: complex-step differentiation (zero subtractive cancellation)', () => {
	// Complex arithmetic helpers for analytic f(x, y) = exp(x * y) / (1 + x^2 + y^2) + sin(x - 2y)
	const cAdd = ([ar, ai], [br, bi]) => [ar + br, ai + bi];
	const cSub = ([ar, ai], [br, bi]) => [ar - br, ai - bi];
	const cMul = ([ar, ai], [br, bi]) => [ar * br - ai * bi, ar * bi + ai * br];
	const cDiv = ([ar, ai], [br, bi]) => {
		const d = br * br + bi * bi;
		return [(ar * br + ai * bi) / d, (ai * br - ar * bi) / d];
	};
	const cExp = ([r, i]) => {
		const er = Math.exp(r);
		return [er * Math.cos(i), er * Math.sin(i)];
	};
	const cSin = ([r, i]) => [Math.sin(r) * Math.cosh(i), Math.cos(r) * Math.sinh(i)];

	const fComplex = (zx, zy) => {
		const num = cExp(cMul(zx, zy));
		const den = cAdd([1, 0], cAdd(cMul(zx, zx), cMul(zy, zy)));
		const term1 = cDiv(num, den);
		const term2 = cSin(cSub(zx, cMul([2, 0], zy)));
		return cAdd(term1, term2);
	};

	const fReal = ([x, y]) => Math.exp(x * y) / (1 + x * x + y * y) + Math.sin(x - 2 * y);

	const hComplex = 1e-30;
	for (const [x, y] of [
		[0.6, -0.8],
		[-1.1, 0.45],
		[0.0, 1.2],
	]) {
		const dfdxComplex = fComplex([x, hComplex], [y, 0])[1] / hComplex;
		const dfdyComplex = fComplex([x, 0], [y, hComplex])[1] / hComplex;
		const actual = gradientFloatStable(fReal, [x, y]);
		assertVecClose(actual, [dfdxComplex, dfdyComplex], { absTol: 1e-12, relTol: 1e-12 });
	}
});

test('independent cross-check: Fundamental Theorem of Calculus line integral via Gauss-Legendre', () => {
	// f(b) - f(a) = integral_0^1 grad(f)(a + t*(b - a)) . (b - a) dt
	const f = ([x, y, z]) => Math.exp(0.3 * x * y) + Math.cos(y - z) + x * z * z;
	const a = [-0.4, 0.2, 0.5];
	const b = [0.9, -0.6, 1.3];
	const d = b.map((bi, i) => bi - a[i]);

	// 5-point Gauss-Legendre nodes and weights on [-1, 1]
	const glNodes = [
		-Math.sqrt(5 + 2 * Math.sqrt(10 / 7)) / 3,
		-Math.sqrt(5 - 2 * Math.sqrt(10 / 7)) / 3,
		0,
		Math.sqrt(5 - 2 * Math.sqrt(10 / 7)) / 3,
		Math.sqrt(5 + 2 * Math.sqrt(10 / 7)) / 3,
	];
	const glWeights = [
		(322 - 13 * Math.sqrt(70)) / 900,
		(322 + 13 * Math.sqrt(70)) / 900,
		128 / 225,
		(322 + 13 * Math.sqrt(70)) / 900,
		(322 - 13 * Math.sqrt(70)) / 900,
	];

	// Composite 4-panel Gauss-Legendre on [0, 1]
	const panels = 4;
	let integral = 0;
	for (let p = 0; p < panels; p++) {
		const t0 = p / panels;
		const t1 = (p + 1) / panels;
		const mid = 0.5 * (t0 + t1);
		const half = 0.5 * (t1 - t0);
		for (let k = 0; k < glNodes.length; k++) {
			const t = mid + half * glNodes[k];
			const pt = a.map((ai, i) => ai + t * d[i]);
			const g = gradientFloatStable(f, pt);
			const dot = g[0] * d[0] + g[1] * d[1] + g[2] * d[2];
			integral += half * glWeights[k] * dot;
		}
	}

	const exactDiff = f(b) - f(a);
	assert.ok(
		Math.abs(integral - exactDiff) < 1e-12,
		`FTC line integral mismatch: ${integral} vs ${exactDiff}`
	);
});

test('numerical stability: catastrophic cancellation resistance vs naive fixed-step difference', () => {
	// Large constant background 1e8 causes severe cancellation for small fixed h = 1e-6
	const f = ([x, y]) => 1e8 + Math.sin(x) + Math.cos(y);
	const pt = [0.7, 1.1];
	const exact = [Math.cos(0.7), -Math.sin(1.1)];

	const stableGrad = gradientFloatStable(f, pt);
	const stableErr = Math.max(Math.abs(stableGrad[0] - exact[0]), Math.abs(stableGrad[1] - exact[1]));

	// Compare against naive fixed-step central difference with h = 1e-6
	const hNaive = 1e-6;
	const naive0 = (f([pt[0] + hNaive, pt[1]]) - f([pt[0] - hNaive, pt[1]])) / (2 * hNaive);
	const naive1 = (f([pt[0], pt[1] + hNaive]) - f([pt[0], pt[1] - hNaive])) / (2 * hNaive);
	const naiveErr = Math.max(Math.abs(naive0 - exact[0]), Math.abs(naive1 - exact[1]));

	assert.ok(stableErr < 1e-6, `stable gradient error too large: ${stableErr}`);
	assert.ok(stableErr < naiveErr * 0.05, `expected stableErr (${stableErr}) << naiveErr (${naiveErr})`);
});

test('edge cases: extreme scales, mixed scales, and large/tiny coordinates', () => {
	// Large coordinates: x ~ 1e12
	const fLarge = ([x, y]) => 2.5 * x - 1.25 * y;
	assertVecClose(gradientFloatStable(fLarge, [1e12, -3e12]), [2.5, -1.25], {
		absTol: 1e-10,
		relTol: 1e-10,
	});

	// Very large coordinates near overflow of span^2 (1e200): ratio scaling prevents overflow
	const fHuge = ([x]) => 3 * x;
	assertVecClose(gradientFloatStable(fHuge, [1e200]), [3], {
		absTol: 1e-10,
		relTol: 1e-10,
	});

	// Tiny coordinates near underflow of span^2 (1e-200)
	assertVecClose(gradientFloatStable(fHuge, [1e-200]), [3], {
		absTol: 1e-10,
		relTol: 1e-10,
	});

	// Mixed coordinate scales in one vector: [1e-8, 1e8] (16 orders of magnitude)
	// Terms are O(1) so float64 f(x, y) retains full precision while coordinates and partials span 16/8 orders
	const fMixed = ([x, y]) => Math.sin(x) + 1e-16 * y * y;
	assertVecClose(gradientFloatStable(fMixed, [1e-8, 1e8]), [Math.cos(1e-8), 2e-8], {
		absTol: 1e-14,
		relTol: 1e-11,
	});
});

test('edge cases: near-boundary and exact-boundary domains (automatic shrink & one-sided fallback)', () => {
	// Near x = 0 for sqrt(x): default h0 >> x would evaluate sqrt(negative) without shrinking
	const fSqrt = ([x]) => Math.sqrt(x);
	const xNear = 1e-8;
	assertVecClose(gradientFloatStable(fSqrt, [xNear]), [0.5 / Math.sqrt(xNear)], {
		absTol: 1e-7,
		relTol: 1e-10,
	});

	// Exact left boundary: defined only for x >= 0 (returns NaN for x < 0)
	const fHalfRight = ([x]) => (x < 0 ? Number.NaN : x * x + 3 * x + 2);
	assertVecClose(gradientFloatStable(fHalfRight, [0]), [3], {
		absTol: 1e-11,
		relTol: 1e-11,
	});

	// Exact right boundary: defined only for x <= 0 (returns NaN for x > 0)
	const fHalfLeft = ([x]) => (x > 0 ? Number.NaN : -2 * x * x + 5 * x - 1);
	assertVecClose(gradientFloatStable(fHalfLeft, [0]), [5], {
		absTol: 1e-11,
		relTol: 1e-11,
	});
});

test('edge cases: empty vector, Float64Array, immutability, and options', () => {
	// Empty point vector
	assert.deepEqual(gradientFloatStable(() => 42, []), []);
	assert.deepEqual(gradientFloatStable(() => 42, [], { withError: true }), {
		gradient: [],
		errors: [],
	});

	// Float64Array input + immutability even when f mutates its argument
	const xTyped = new Float64Array([1.5, -2.0]);
	const xSnapshot = Array.from(xTyped);
	const fMutating = (pt) => {
		const res = pt[0] * pt[0] + 3 * pt[1];
		pt[0] = 9999;
		pt[1] = -9999;
		return res;
	};
	assertVecClose(gradientFloatStable(fMutating, xTyped), [3.0, 3.0], {
		absTol: 1e-12,
		relTol: 1e-12,
	});
	assert.deepEqual(Array.from(xTyped), xSnapshot);

	// withError option returns accurate error bounds
	const fSmooth = ([x, y]) => Math.exp(x) * Math.sin(y);
	const { gradient, errors } = gradientFloatStable(fSmooth, [0.5, 1.0], {
		withError: true,
		step: [1e-2, 1e-2],
		maxOrder: 12,
		contractFactor: 2,
	});
	const exact = [Math.exp(0.5) * Math.sin(1.0), Math.exp(0.5) * Math.cos(1.0)];
	assertVecClose(gradient, exact, { absTol: 1e-12, relTol: 1e-12 });
	assert.equal(errors.length, 2);
	for (let i = 0; i < 2; i++) {
		assert.ok(Number.isFinite(errors[i]) && errors[i] >= 0);
		assert.ok(errors[i] < 1e-10, `expected tight error bound, got ${errors[i]}`);
	}

	// Custom small step for high-frequency oscillation sin(1e4 * x)
	const fOsc = ([x]) => Math.sin(1e4 * x);
	assertVecClose(gradientFloatStable(fOsc, [0.123], { step: 1e-5 }), [1e4 * Math.cos(1e4 * 0.123)], {
		absTol: 1e-8,
		relTol: 1e-10,
	});
});

test('input validation: rejects invalid functions, points, return values, and options', () => {
	// Invalid f
	for (const badF of [null, undefined, 42, 'fn', {}]) {
		assert.throws(() => gradientFloatStable(badF, [1]), TypeError);
	}

	// Invalid x container
	for (const badX of [null, undefined, 123, '123', {}, new Int32Array([1])]) {
		assert.throws(() => gradientFloatStable(() => 0, badX), TypeError);
	}

	// Invalid x elements
	assert.throws(() => gradientFloatStable(() => 0, ['1']), TypeError);
	assert.throws(() => gradientFloatStable(() => 0, [null]), TypeError);
	assert.throws(() => gradientFloatStable(() => 0, [1n]), TypeError);
	assert.throws(() => gradientFloatStable(() => 0, [Number.NaN]), RangeError);
	assert.throws(() => gradientFloatStable(() => 0, [Number.POSITIVE_INFINITY]), RangeError);
	assert.throws(() => gradientFloatStable(() => 0, [Number.NEGATIVE_INFINITY]), RangeError);

	// Invalid f(x) return values
	assert.throws(() => gradientFloatStable(() => undefined, [1]), TypeError);
	assert.throws(() => gradientFloatStable(() => '3', [1]), TypeError);
	assert.throws(() => gradientFloatStable(() => Number.NaN, [1]), RangeError);
	assert.throws(() => gradientFloatStable(() => Number.POSITIVE_INFINITY, [1]), RangeError);

	// Function finite only at the isolated point x = 0, NaN everywhere else
	assert.throws(
		() => gradientFloatStable(([x]) => (x === 0 ? 1 : Number.NaN), [0]),
		RangeError
	);

	// Invalid options
	const id = ([x]) => x;
	assert.throws(() => gradientFloatStable(id, [1], null), TypeError);
	assert.throws(() => gradientFloatStable(id, [1], []), TypeError);
	assert.throws(() => gradientFloatStable(id, [1], 5), TypeError);
	assert.throws(() => gradientFloatStable(id, [1], { step: 0 }), RangeError);
	assert.throws(() => gradientFloatStable(id, [1], { step: -1e-3 }), RangeError);
	assert.throws(() => gradientFloatStable(id, [1], { step: Number.NaN }), RangeError);
	assert.throws(() => gradientFloatStable(id, [1], { step: '1e-3' }), TypeError);
	assert.throws(() => gradientFloatStable(id, [1, 2], { step: [1e-3] }), RangeError);
	assert.throws(() => gradientFloatStable(id, [1, 2], { step: [1e-3, -1e-3] }), RangeError);
	assert.throws(() => gradientFloatStable(id, [1], { relTol: -1 }), RangeError);
	assert.throws(() => gradientFloatStable(id, [1], { absTol: Number.POSITIVE_INFINITY }), RangeError);
	assert.throws(() => gradientFloatStable(id, [1], { maxOrder: 0 }), RangeError);
	assert.throws(() => gradientFloatStable(id, [1], { maxOrder: 2.5 }), RangeError);
	assert.throws(() => gradientFloatStable(id, [1], { maxOrder: 25 }), RangeError);
	assert.throws(() => gradientFloatStable(id, [1], { contractFactor: 1 }), RangeError);
	assert.throws(() => gradientFloatStable(id, [1], { contractFactor: 0.5 }), RangeError);
	assert.throws(() => gradientFloatStable(id, [1], { withError: 'yes' }), TypeError);
});
