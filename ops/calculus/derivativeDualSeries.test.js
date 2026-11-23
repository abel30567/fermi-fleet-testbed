import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { derivativeDualSeries } from './derivativeDualSeries.js';

function assertClose(actual, expected, tol = 1e-12, label = '') {
	const diff = Math.abs(actual - expected);
	assert.ok(
		diff <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`
	);
}

function assertDualClose(actual, expected, tol = 1e-12, label = '') {
	assertClose(actual.v, expected.v, tol, `${label}.v`);
	assertClose(actual.d, expected.d, tol, `${label}.d`);
}

function factorial(n) {
	let f = 1;
	for (let i = 2; i <= n; i += 1) {
		f *= i;
	}
	return f;
}

describe('derivativeDualSeries — power series (closed-form dual Horner)', () => {
	it('computes exact first derivative of a polynomial over dual numbers', () => {
		// P(x) = 3 - 2x + 5x^2 - 4x^3
		// P'(x) = -2 + 10x - 12x^2
		// P''(x) = 10 - 24x
		const coeffs = [3, -2, 5, -4];
		const z = { v: 2, d: 3 };

		const res = derivativeDualSeries(coeffs, z);
		// P'(2) = -2 + 20 - 48 = -30
		// P''(2) * 3 = (10 - 48) * 3 = -114
		assert.deepStrictEqual(res, { v: -30, d: -114 });
	});

	it('supports higher-order derivatives (order = 0, 1, 2, 3, 4)', () => {
		// P(x) = 1 + 2x + 3x^2 + 4x^3 + 5x^4
		const coeffs = [1, 2, 3, 4, 5];
		const z = { v: 1.5, d: -2 };
		const x = z.v;
		const d = z.d;

		const p0 = 1 + 2 * x + 3 * x ** 2 + 4 * x ** 3 + 5 * x ** 4;
		const p1 = 2 + 6 * x + 12 * x ** 2 + 20 * x ** 3;
		const p2 = 6 + 24 * x + 60 * x ** 2;
		const p3 = 24 + 120 * x;
		const p4 = 120;

		assertDualClose(derivativeDualSeries(coeffs, z, { order: 0 }), { v: p0, d: p1 * d }, 1e-12, 'order 0');
		assertDualClose(derivativeDualSeries(coeffs, z, { order: 1 }), { v: p1, d: p2 * d }, 1e-12, 'order 1');
		assertDualClose(derivativeDualSeries(coeffs, z, { order: 2 }), { v: p2, d: p3 * d }, 1e-12, 'order 2');
		assertDualClose(derivativeDualSeries(coeffs, z, { order: 3 }), { v: p3, d: p4 * d }, 1e-12, 'order 3');
		assertDualClose(derivativeDualSeries(coeffs, z, { order: 4 }), { v: p4, d: 0 }, 1e-12, 'order 4');
	});

	it('differentiates transcendental Maclaurin series accurately (exp, sin, ln(1+x), geometric)', () => {
		// exp(x) = sum x^k / k!
		const expCoeffs = Array.from({ length: 24 }, (_, k) => 1 / factorial(k));
		const zExp = { v: 0.75, d: 1.25 };
		const eVal = Math.exp(zExp.v);
		assertDualClose(
			derivativeDualSeries(expCoeffs, zExp),
			{ v: eVal, d: eVal * zExp.d },
			1e-14,
			'exp'
		);

		// sin(x) = sum_{m=0}^11 (-1)^m x^(2m+1) / (2m+1)!
		const sinCoeffs = Array.from({ length: 24 }, (_, k) =>
			k % 2 === 1 ? ((-1) ** ((k - 1) / 2)) / factorial(k) : 0
		);
		const zSin = { v: 0.9, d: -0.5 };
		assertDualClose(
			derivativeDualSeries(sinCoeffs, zSin, { order: 1 }),
			{ v: Math.cos(zSin.v), d: -Math.sin(zSin.v) * zSin.d },
			1e-14,
			'sin order 1'
		);
		assertDualClose(
			derivativeDualSeries(sinCoeffs, zSin, { order: 2 }),
			{ v: -Math.sin(zSin.v), d: -Math.cos(zSin.v) * zSin.d },
			1e-14,
			'sin order 2'
		);

		// ln(1 + x) = sum_{k=1}^60 (-1)^(k-1) x^k / k
		const log1pCoeffs = Array.from({ length: 61 }, (_, k) =>
			k === 0 ? 0 : ((-1) ** (k - 1)) / k
		);
		const zLog = { v: 0.25, d: 2 };
		assertDualClose(
			derivativeDualSeries(log1pCoeffs, zLog, { order: 1 }),
			{ v: 1 / (1 + zLog.v), d: (-1 / (1 + zLog.v) ** 2) * zLog.d },
			1e-13,
			'ln(1+x)'
		);

		// 1 / (1 - x) = sum_{k=0}^70 x^k
		const geomCoeffs = Array.from({ length: 71 }, () => 1);
		const zGeom = { v: 0.3, d: 0.4 };
		assertDualClose(
			derivativeDualSeries(geomCoeffs, zGeom, { order: 1 }),
			{ v: 1 / (1 - zGeom.v) ** 2, d: (2 / (1 - zGeom.v) ** 3) * zGeom.d },
			1e-13,
			'1/(1-x)'
		);
	});

	it('supports non-zero expansion center x0', () => {
		// exp(x) expanded around x0 = 1: sum e * (x - 1)^k / k!
		const x0 = 1;
		const e = Math.E;
		const coeffs = Array.from({ length: 20 }, (_, k) => e / factorial(k));
		const z = { v: 1.4, d: 0.8 };

		const expected = Math.exp(z.v);
		assertDualClose(
			derivativeDualSeries(coeffs, z, { order: 1, center: x0 }),
			{ v: expected, d: expected * z.d },
			1e-13,
			'centered exp'
		);
	});

	it('propagates parameter derivatives when coefficients are dual numbers', () => {
		// P(x; t) = (1 + t) + (2 + 3t)x + (4 - t)x^2 evaluated at t = 0 with dt = 1
		// P_x(x; t) = (2 + 3t) + 2(4 - t)x
		// At t = 0:
		//   P_x(x; 0) = 2 + 8x
		//   d/dt [P_x(x(t); t)] = P_xx(x; 0) * x'(t) + d/dt P_x(x; t)|_{t=0}
		//                       = 8 * d + (3 - 2x)
		const coeffs = [
			{ v: 1, d: 1 },
			{ v: 2, d: 3 },
			{ v: 4, d: -1 },
		];
		const z = { v: 2.5, d: 1.5 };
		const res = derivativeDualSeries(coeffs, z);

		assertDualClose(res, { v: 2 + 8 * 2.5, d: 8 * 1.5 + (3 - 2 * 2.5) }, 1e-12, 'dual coeffs');
	});
});

describe('derivativeDualSeries — callable functions (Richardson series & forward-mode AD)', () => {
	it('differentiates scalar real-valued functions over dual numbers', () => {
		const f = (x) => Math.exp(x) * Math.sin(x);
		// f'(x) = exp(x) * (sin(x) + cos(x))
		// f''(x) = 2 * exp(x) * cos(x)
		// f'''(x) = 2 * exp(x) * (cos(x) - sin(x))
		const z = { v: 0.7, d: 2.5 };
		const e = Math.exp(z.v);
		const s = Math.sin(z.v);
		const c = Math.cos(z.v);

		const res1 = derivativeDualSeries(f, z, { order: 1 });
		assertDualClose(res1, { v: e * (s + c), d: 2 * e * c * z.d }, 1e-9, 'scalar order 1');

		const res2 = derivativeDualSeries(f, z, { order: 2 });
		assertDualClose(res2, { v: 2 * e * c, d: 2 * e * (c - s) * z.d }, 1e-7, 'scalar order 2');

		const res0 = derivativeDualSeries(f, z, { order: 0 });
		assertDualClose(res0, { v: e * s, d: e * (s + c) * z.d }, 1e-10, 'scalar order 0');
	});

	it('leverages exact forward-mode AD when given a dual-aware function', () => {
		// f(z) = sin(z^2) in dual arithmetic
		const dualSinSq = (z) => {
			const sqV = z.v * z.v;
			const sqD = 2 * z.v * z.d;
			return {
				v: Math.sin(sqV),
				d: Math.cos(sqV) * sqD,
			};
		};

		const z = { v: 1.2, d: -0.75 };
		const x = z.v;
		const f0 = Math.sin(x * x);
		const f1 = 2 * x * Math.cos(x * x);
		const f2 = 2 * Math.cos(x * x) - 4 * x * x * Math.sin(x * x);

		const res0 = derivativeDualSeries(dualSinSq, z, { order: 0 });
		assertDualClose(res0, { v: f0, d: f1 * z.d }, 1e-15, 'dual fn order 0');

		const res1 = derivativeDualSeries(dualSinSq, z, { order: 1 });
		// .v comes directly from exact AD!
		assertClose(res1.v, f1, 1e-15, 'dual fn order 1 exact .v');
		assertClose(res1.d, f2 * z.d, 1e-10, 'dual fn order 1 .d');
	});

	it('handles scalar functions that strictly reject non-number arguments', () => {
		const strictCubic = (x) => {
			if (typeof x !== 'number') {
				throw new TypeError('expected number');
			}
			return x * x * x - 2 * x;
		};
		const res = derivativeDualSeries(strictCubic, { v: 3, d: 2 });
		// f'(3) = 27 - 2 = 25, f''(3) * 2 = 18 * 2 = 36
		assertDualClose(res, { v: 25, d: 36 }, 1e-9, 'strict scalar');
	});
});

describe('derivativeDualSeries — edge cases', () => {
	it('returns { v: 0, d: 0 } for constant series and orders exceeding degree', () => {
		assert.deepStrictEqual(derivativeDualSeries([42], { v: 5, d: 7 }), { v: 0, d: 0 });
		assert.deepStrictEqual(derivativeDualSeries([1, 2, 3], { v: 4, d: -2 }, { order: 3 }), {
			v: 0,
			d: 0,
		});
		assert.deepStrictEqual(derivativeDualSeries([1, 2, 3], { v: 4, d: -2 }, { order: 10 }), {
			v: 0,
			d: 0,
		});
	});

	it('normalizes negative zero to positive zero', () => {
		const res = derivativeDualSeries([0, -0, 0], { v: -0, d: -1 });
		assert.strictEqual(Object.is(res.v, 0), true);
		assert.strictEqual(Object.is(res.d, 0), true);
	});

	it('handles dual.d === 0 cleanly for both series and functions', () => {
		const resSeries = derivativeDualSeries([1, -3, 2, 5], { v: -2, d: 0 });
		// P'(x) = -3 + 4x + 15x^2 => P'(-2) = -3 - 8 + 60 = 49
		assert.deepStrictEqual(resSeries, { v: 49, d: 0 });

		const resFn = derivativeDualSeries((x) => Math.cos(x), { v: 1.1, d: 0 });
		assertClose(resFn.v, -Math.sin(1.1), 1e-11);
		assert.strictEqual(resFn.d, 0);
	});

	it('respects custom step size h for callable functions', () => {
		const res = derivativeDualSeries((x) => Math.log(x), { v: 2, d: 4 }, { h: 1e-2 });
		// f'(2) = 0.5, f''(2) * 4 = -0.25 * 4 = -1
		assertDualClose(res, { v: 0.5, d: -1 }, 1e-10, 'custom h');
	});
});

describe('derivativeDualSeries — invalid inputs', () => {
	it('throws TypeError for invalid target or dual argument types', () => {
		assert.throws(() => derivativeDualSeries(null, { v: 1, d: 1 }), TypeError);
		assert.throws(() => derivativeDualSeries(123, { v: 1, d: 1 }), TypeError);
		assert.throws(() => derivativeDualSeries('x^2', { v: 1, d: 1 }), TypeError);
		assert.throws(() => derivativeDualSeries([1, 2], null), TypeError);
		assert.throws(() => derivativeDualSeries([1, 2], [1, 2]), TypeError);
		assert.throws(() => derivativeDualSeries([1, 2], { v: '1', d: 1 }), TypeError);
		assert.throws(() => derivativeDualSeries([1, 'bad'], { v: 1, d: 1 }), TypeError);
		assert.throws(() => derivativeDualSeries([1, 2], { v: 1, d: 1 }, 'bad'), TypeError);
		assert.throws(() => derivativeDualSeries([1, 2], { v: 1, d: 1 }, { order: '1' }), TypeError);
		assert.throws(() => derivativeDualSeries([1, 2], { v: 1, d: 1 }, { center: '0' }), TypeError);
		assert.throws(() => derivativeDualSeries((x) => x, { v: 1, d: 1 }, { h: '0.01' }), TypeError);
		assert.throws(() => derivativeDualSeries(() => 'nope', { v: 1, d: 1 }), TypeError);
	});

	it('throws RangeError for empty coeffs, non-finite values, or out-of-range options', () => {
		assert.throws(() => derivativeDualSeries([], { v: 1, d: 1 }), RangeError);
		assert.throws(() => derivativeDualSeries([1, NaN], { v: 1, d: 1 }), RangeError);
		assert.throws(() => derivativeDualSeries([1, Infinity], { v: 1, d: 1 }), RangeError);
		assert.throws(() => derivativeDualSeries([1, { v: 1, d: NaN }], { v: 1, d: 1 }), RangeError);
		assert.throws(() => derivativeDualSeries([1, 2], { v: NaN, d: 1 }), RangeError);
		assert.throws(() => derivativeDualSeries([1, 2], { v: 1, d: -Infinity }), RangeError);
		assert.throws(() => derivativeDualSeries([1, 2], { v: 1, d: 1 }, { order: -1 }), RangeError);
		assert.throws(() => derivativeDualSeries([1, 2], { v: 1, d: 1 }, { order: 1.5 }), RangeError);
		assert.throws(() => derivativeDualSeries([1, 2], { v: 1, d: 1 }, { center: Infinity }), RangeError);
		assert.throws(() => derivativeDualSeries((x) => x, { v: 1, d: 1 }, { h: 0 }), RangeError);
		assert.throws(() => derivativeDualSeries((x) => x, { v: 1, d: 1 }, { h: -1e-3 }), RangeError);
		assert.throws(() => derivativeDualSeries((x) => x, { v: 1, d: 1 }, { order: 9 }), RangeError);
		assert.throws(() => derivativeDualSeries((x) => Math.log(x), { v: -1, d: 1 }), RangeError);
	});
});

describe('derivativeDualSeries — independent cross-checks', () => {
	it('satisfies the dual derivative shift identity f^(m)(v + d*eps).d === f^(m+1)(v) * d', () => {
		const coeffs = [0.5, -1.2, 3.4, -0.7, 0.25, -0.04];
		const v = -1.3;
		const d = 2.7;

		for (let m = 0; m <= 4; m += 1) {
			const dm = derivativeDualSeries(coeffs, { v, d }, { order: m });
			const dmNext = derivativeDualSeries(coeffs, { v, d: 1 }, { order: m + 1 });
			assertClose(dm.d, dmNext.v * d, 1e-12, `dual identity at order ${m}`);
		}
	});

	it('agrees across closed-form series, callable function, and independent central differences', () => {
		// Polynomial P(x) = 2 - 5x + 3x^2 - x^3 + 0.5x^4
		const coeffs = [2, -5, 3, -1, 0.5];
		const polyFn = (x) => 2 - 5 * x + 3 * x ** 2 - x ** 3 + 0.5 * x ** 4;
		const z = { v: 1.8, d: -1.4 };

		const fromSeries = derivativeDualSeries(coeffs, z, { order: 1 });
		const fromCallable = derivativeDualSeries(polyFn, z, { order: 1 });

		// Independent 2-point central finite difference for P'(v) and P''(v)
		const eps = 1e-5;
		const fd1 = (polyFn(z.v + eps) - polyFn(z.v - eps)) / (2 * eps);
		const fd2 = (polyFn(z.v + eps) - 2 * polyFn(z.v) + polyFn(z.v - eps)) / (eps * eps);

		assertDualClose(fromSeries, fromCallable, 1e-9, 'series vs callable');
		assertClose(fromSeries.v, fd1, 1e-7, 'series.v vs finite diff');
		assertClose(fromSeries.d, fd2 * z.d, 1e-5, 'series.d vs finite diff');
	});

	it('is invariant under Taylor re-centering of a polynomial around an arbitrary point x0', () => {
		// P(x) = 1 - 3x + 2x^2 + 4x^3 - x^4
		// Re-expand around x0 = 2: c_k(x0) = P^(k)(x0) / k!
		const orig = [1, -3, 2, 4, -1];
		const x0 = 2;
		const recentered = Array.from(
			{ length: orig.length },
			(_, k) => derivativeDualSeries(orig, { v: x0, d: 0 }, { order: k }).v / factorial(k)
		);

		const z = { v: -0.6, d: 3.1 };
		for (let order = 0; order <= 4; order += 1) {
			const a = derivativeDualSeries(orig, z, { order });
			const b = derivativeDualSeries(recentered, z, { order, center: x0 });
			assertDualClose(a, b, 1e-11, `recentering invariance order ${order}`);
		}
	});

	it('satisfies linearity D(a*P + b*Q) = a*D(P) + b*D(Q) over dual numbers', () => {
		const p = [1, -2, 3, -4];
		const q = [5, 0.5, -1, 2];
		const a = 2.5;
		const b = -1.75;
		const combined = p.map((pk, i) => a * pk + b * q[i]);
		const z = { v: 1.2, d: -0.9 };

		const dp = derivativeDualSeries(p, z);
		const dq = derivativeDualSeries(q, z);
		const dc = derivativeDualSeries(combined, z);

		assertDualClose(
			dc,
			{ v: a * dp.v + b * dq.v, d: a * dp.d + b * dq.d },
			1e-12,
			'linearity'
		);
	});
});
