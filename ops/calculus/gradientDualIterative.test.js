import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gradientDualIterative, dual, dualOps } from './gradientDualIterative.js';

/**
 * Helper: assert two numeric vectors are element-wise close within `tol`.
 *
 * @param {number[]} actual
 * @param {number[]} expected
 * @param {number} [tol=1e-12]
 */
function assertVectorClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, expected.length, `vector length mismatch: ${actual.length} vs ${expected.length}`);
	for (let i = 0; i < actual.length; i += 1) {
		const diff = Math.abs(actual[i] - expected[i]);
		assert.ok(
			diff <= tol,
			`index ${i}: expected ${expected[i]}, got ${actual[i]} (diff ${diff} > ${tol})`,
		);
	}
}

/**
 * Independent central finite-difference gradient estimator for scalar functions.
 *
 * @param {(x: number[]) => number} scalarFn
 * @param {number[]} point
 * @param {number} [h=1e-6]
 * @returns {number[]}
 */
function centralDifferenceGradient(scalarFn, point, h = 1e-6) {
	const grad = new Array(point.length);
	for (let i = 0; i < point.length; i += 1) {
		const plus = point.slice();
		const minus = point.slice();
		plus[i] += h;
		minus[i] -= h;
		grad[i] = (scalarFn(plus) - scalarFn(minus)) / (2 * h);
	}
	return grad;
}

describe('gradientDualIterative', () => {
	describe('normal cases', () => {
		it('computes 1D polynomial derivative using manual { v, d } arithmetic', () => {
			// f(x) = x^3 - 2x + 5, f'(x) = 3x^2 - 2
			const f = ([x]) => {
				const x2 = { v: x.v * x.v, d: 2 * x.v * x.d };
				const x3 = { v: x2.v * x.v, d: x2.d * x.v + x2.v * x.d };
				return { v: x3.v - 2 * x.v + 5, d: x3.d - 2 * x.d };
			};

			const grad = gradientDualIterative(f, [4]);
			assertVectorClose(grad, [3 * 16 - 2], 1e-15);
		});

		it('computes 3D multivariate polynomial gradient using dualOps', () => {
			// f(x, y, z) = x^2 * y + y * z^3 - 4 * x * z
			// df/dx = 2xy - 4z
			// df/dy = x^2 + z^3
			// df/dz = 3yz^2 - 4x
			const f = ([x, y, z], D) =>
				D.sub(
					D.add(D.mul(D.pow(x, 2), y), D.mul(y, D.pow(z, 3))),
					D.mul(4, D.mul(x, z)),
				);

			const [x, y, z] = [2, -3, 1.5];
			const expected = [
				2 * x * y - 4 * z,
				x * x + z * z * z,
				3 * y * z * z - 4 * x,
			];
			const actual = gradientDualIterative(f, [x, y, z]);
			assertVectorClose(actual, expected, 1e-13);
		});

		it('computes gradient of Rosenbrock function', () => {
			// f(x, y) = (1 - x)^2 + 100 * (y - x^2)^2
			// df/dx = -2(1 - x) - 400x(y - x^2)
			// df/dy = 200(y - x^2)
			const rosenbrock = ([x, y], D) => {
				const term1 = D.pow(D.sub(1, x), 2);
				const term2 = D.mul(100, D.pow(D.sub(y, D.mul(x, x)), 2));
				return D.add(term1, term2);
			};

			// At minimum (1, 1), gradient is [0, 0]
			assertVectorClose(gradientDualIterative(rosenbrock, [1, 1]), [0, 0], 1e-15);

			// At non-stationary point (-1.2, 1.5)
			const [x, y] = [-1.2, 1.5];
			const expected = [
				-2 * (1 - x) - 400 * x * (y - x * x),
				200 * (y - x * x),
			];
			assertVectorClose(gradientDualIterative(rosenbrock, [x, y]), expected, 1e-12);
		});

		it('computes gradient of transcendental composition (sin, cos, exp, log, sqrt, div)', () => {
			// f(x, y) = exp(sin(x)) * log(y) + sqrt(x^2 + y^2) / cos(x)
			const f = ([x, y], D) =>
				D.add(
					D.mul(D.exp(D.sin(x)), D.log(y)),
					D.div(D.sqrt(D.add(D.mul(x, x), D.mul(y, y))), D.cos(x)),
				);

			const [x, y] = [0.4, 2.5];
			const r = Math.hypot(x, y);
			const cosX = Math.cos(x);
			const sinX = Math.sin(x);
			const expSinX = Math.exp(sinX);
			const dfdx =
				expSinX * cosX * Math.log(y) +
				((x / r) * cosX - r * -sinX) / (cosX * cosX);
			const dfdy = expSinX / y + (y / r) / cosX;

			assertVectorClose(gradientDualIterative(f, [x, y]), [dfdx, dfdy], 1e-13);
		});

		it('supports general dual exponentiation a^b where both base and exponent vary', () => {
			// f(x, y) = x^y for x > 0
			// df/dx = y * x^(y - 1)
			// df/dy = x^y * ln(x)
			const f = ([x, y], D) => D.pow(x, y);
			const [x, y] = [2.5, 1.7];
			const expected = [
				y * Math.pow(x, y - 1),
				Math.pow(x, y) * Math.log(x),
			];
			assertVectorClose(gradientDualIterative(f, [x, y]), expected, 1e-13);
		});

		it('accepts dual numbers { v, d } as input point coordinates without mutating them', () => {
			const f = ([x, y], D) => D.add(D.mul(x, y), D.sin(y));
			const pt = [dual(3, 99), dual(0.5, -42)];
			const snapshot = structuredClone(pt);

			const grad = gradientDualIterative(f, pt);
			assertVectorClose(grad, [0.5, 3 + Math.cos(0.5)], 1e-14);
			assert.deepEqual(pt, snapshot);
		});
	});

	describe('edge cases', () => {
		it('returns an empty gradient for a 0-dimensional point []', () => {
			let calls = 0;
			const f = () => {
				calls += 1;
				return dual(1, 0);
			};
			assert.deepEqual(gradientDualIterative(f, []), []);
			assert.equal(calls, 0);
		});

		it('returns exact +0 (not -0) for constant functions', () => {
			const constant = () => ({ v: 42, d: -0 });
			const grad = gradientDualIterative(constant, [1, 2, 3]);
			assert.deepEqual(grad, [0, 0, 0]);
			for (const g of grad) {
				assert.ok(Object.is(g, 0), 'expected +0 rather than -0');
			}
		});

		it('handles high-dimensional inputs iteratively without stack issues', () => {
			// f(x) = sum_{i=0}^{n-1} (i + 1) * x_i^2 => df/dx_i = 2 * (i + 1) * x_i
			const n = 80;
			const point = Array.from({ length: n }, (_, i) => (i - 40) * 0.1);
			const f = (xs, D) => {
				let acc = dual(0, 0);
				for (let i = 0; i < xs.length; i += 1) {
					acc = D.add(acc, D.mul(i + 1, D.mul(xs[i], xs[i])));
				}
				return acc;
			};

			const actual = gradientDualIterative(f, point);
			const expected = point.map((val, i) => 2 * (i + 1) * val);
			assertVectorClose(actual, expected, 1e-12);
		});

		it('isolates coordinates even if fn mutates the dual array passed to it', () => {
			const f = (xs, D) => {
				const out = D.add(D.mul(xs[0], 3), D.mul(xs[1], 5));
				xs[0].v = 9999;
				xs[0].d = 9999;
				xs[1] = { v: -1, d: -1 };
				return out;
			};
			assertVectorClose(gradientDualIterative(f, [1, 2]), [3, 5], 1e-15);
		});

		it('supports tan, neg, abs, and pow(..., 0) / pow(..., 1) dual operations', () => {
			// f(x, y) = tan(x) - abs(y) + x^0 + y^1 at (0.3, -2)
			// df/dx = sec^2(x)
			// df/dy = -(-1) + 1 = 2 (since y < 0 => d/dy |y| = -1)
			const f = ([x, y], D) =>
				D.add(
					D.add(D.tan(x), D.neg(D.abs(y))),
					D.add(D.pow(x, 0), D.pow(y, 1)),
				);

			const x = 0.3;
			const y = -2;
			const sec2 = 1 / (Math.cos(x) * Math.cos(x));
			assertVectorClose(gradientDualIterative(f, [x, y]), [sec2, 2], 1e-14);
		});
	});

	describe('independent cross-checks', () => {
		it('matches central finite-difference numerical gradient across diverse functions', () => {
			const scalarFn = ([x, y, z, w]) =>
				Math.exp(-0.5 * (x * x + y * y)) * Math.cos(z * w) +
				Math.log(1 + x * x + w * w) / (1 + Math.sin(y) * Math.sin(y));

			const dualFn = ([x, y, z, w], D) => {
				const gauss = D.exp(D.mul(-0.5, D.add(D.mul(x, x), D.mul(y, y))));
				const term1 = D.mul(gauss, D.cos(D.mul(z, w)));
				const num = D.log(D.add(1, D.add(D.mul(x, x), D.mul(w, w))));
				const sinY = D.sin(y);
				const den = D.add(1, D.mul(sinY, sinY));
				return D.add(term1, D.div(num, den));
			};

			const testPoints = [
				[0.5, -0.7, 1.2, 0.3],
				[-1.1, 0.2, -0.4, 1.8],
				[0, 0, 0.9, -0.5],
			];

			for (const pt of testPoints) {
				const adGrad = gradientDualIterative(dualFn, pt);
				const fdGrad = centralDifferenceGradient(scalarFn, pt, 1e-6);
				assertVectorClose(adGrad, fdGrad, 1e-8);
			}
		});

		it('satisfies linearity of the gradient operator: grad(a*f + b*g) == a*grad(f) + b*grad(g)', () => {
			const f = ([x, y, z], D) => D.mul(D.sin(x), D.add(D.mul(y, y), z));
			const g = ([x, y, z], D) => D.exp(D.sub(x, D.mul(0.5, D.mul(y, z))));
			const alpha = 2.75;
			const beta = -1.4;
			const combo = (xs, D) => D.add(D.mul(alpha, f(xs, D)), D.mul(beta, g(xs, D)));

			const pt = [0.6, -1.3, 0.9];
			const gf = gradientDualIterative(f, pt);
			const gg = gradientDualIterative(g, pt);
			const gCombo = gradientDualIterative(combo, pt);
			const expected = gf.map((v, i) => alpha * v + beta * gg[i]);

			assertVectorClose(gCombo, expected, 1e-13);
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError when fn is not a function', () => {
			for (const badFn of [null, undefined, 123, 'fn', {}, []]) {
				assert.throws(
					() => gradientDualIterative(badFn, [1, 2]),
					TypeError,
				);
			}
		});

		it('throws TypeError when point is not an array', () => {
			const f = ([x]) => x;
			for (const badPt of [null, undefined, 42, '12', { v: 1, d: 0 }]) {
				assert.throws(
					() => gradientDualIterative(f, badPt),
					TypeError,
				);
			}
		});

		it('throws TypeError for non-numeric or malformed point coordinates', () => {
			const f = ([x]) => x;
			for (const badCoord of ['1', null, undefined, [], { v: 1 }, { d: 0 }, { v: '1', d: 0 }]) {
				assert.throws(
					() => gradientDualIterative(f, [badCoord]),
					TypeError,
				);
			}
		});

		it('throws RangeError for non-finite point coordinates', () => {
			const f = ([x]) => x;
			for (const badCoord of [NaN, Infinity, -Infinity, { v: NaN, d: 0 }, { v: 1, d: Infinity }]) {
				assert.throws(
					() => gradientDualIterative(f, [badCoord]),
					RangeError,
				);
			}
		});

		it('throws TypeError when fn does not return a valid dual object { v, d }', () => {
			for (const badReturn of [null, undefined, 5, 'ok', [1, 2], { v: 1 }, { d: 2 }, { v: '1', d: 0 }]) {
				assert.throws(
					() => gradientDualIterative(() => badReturn, [1]),
					TypeError,
				);
			}
		});

		it('throws RangeError when fn returns non-finite dual components', () => {
			for (const badReturn of [{ v: NaN, d: 1 }, { v: 1, d: NaN }, { v: Infinity, d: 0 }, { v: 0, d: -Infinity }]) {
				assert.throws(
					() => gradientDualIterative(() => badReturn, [1]),
					RangeError,
				);
			}
		});

		it('throws RangeError on singular dual operations (div by 0, log <= 0, sqrt < 0, abs at 0)', () => {
			assert.throws(() => gradientDualIterative(([x], D) => D.div(1, x), [0]), RangeError);
			assert.throws(() => gradientDualIterative(([x], D) => D.log(x), [0]), RangeError);
			assert.throws(() => gradientDualIterative(([x], D) => D.sqrt(x), [-1]), RangeError);
			assert.throws(() => gradientDualIterative(([x], D) => D.sqrt(x), [0]), RangeError);
			assert.throws(() => gradientDualIterative(([x], D) => D.abs(x), [0]), RangeError);
			assert.throws(() => dualOps.pow(dual(-2, 1), dual(0.5, 1)), RangeError);
		});
	});
});
