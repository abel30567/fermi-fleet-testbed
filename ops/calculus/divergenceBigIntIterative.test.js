import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	divergenceBigIntIterative,
	SCALE,
} from './divergenceBigIntIterative.js';

describe('divergenceBigIntIterative', () => {
	describe('normal cases', () => {
		it('computes exact divergence for a 1D quadratic field', () => {
			// F(x) = [3x^2 + 2x + 5] => div(F)(x) = 6x + 2
			const F = ([x]) => [3n * x * x + 2n * x + 5n];
			assert.equal(divergenceBigIntIterative(F, [4n], 1n), 26n * SCALE);
			assert.equal(divergenceBigIntIterative(F, [4n], 7n), 26n * SCALE);
			assert.equal(divergenceBigIntIterative(F, [-5n], 3n), -28n * SCALE);
		});

		it('computes exact divergence for a 2D linear vector field', () => {
			// F(x, y) = [2x + 3y, -5x + 7y] => div(F) = 2 + 7 = 9
			const F = ([x, y]) => [2n * x + 3n * y, -5n * x + 7n * y];
			assert.equal(divergenceBigIntIterative(F, [10n, -20n], 1n), 9n * SCALE);
			assert.equal(divergenceBigIntIterative(F, [10n, -20n], 5n), 9n * SCALE);
		});

		it('computes exact divergence for a 3D polynomial vector field', () => {
			// F(x, y, z) = [x^2 * y, y^2 * z, z^2 * x]
			// div(F)(x, y, z) = 2xy + 2yz + 2zx (exact for central difference)
			const F = ([x, y, z]) => [x * x * y, y * y * z, z * z * x];
			const point = [3n, -4n, 5n];
			// 2*(3)*(-4) + 2*(-4)*(5) + 2*(5)*(3) = -24 - 40 + 30 = -34
			assert.equal(divergenceBigIntIterative(F, point, 1n), -34n * SCALE);
			assert.equal(divergenceBigIntIterative(F, point, 10n), -34n * SCALE);
		});

		it('computes exact divergence for a 4D vector field', () => {
			// F(x0, x1, x2, x3) = [x0^2, 2*x1^2, 3*x2^2, 4*x3^2]
			// div(F) = 2*x0 + 4*x1 + 6*x2 + 8*x3
			const F = ([x0, x1, x2, x3]) => [
				x0 * x0,
				2n * x1 * x1,
				3n * x2 * x2,
				4n * x3 * x3,
			];
			const point = [1n, 2n, 3n, 4n];
			// 2*1 + 4*2 + 6*3 + 8*4 = 2 + 8 + 18 + 32 = 60
			assert.equal(divergenceBigIntIterative(F, point, 2n), 60n * SCALE);
		});

		it('uses h = 1n as the default step size when omitted', () => {
			const F = ([x, y]) => [4n * x, -y];
			assert.equal(divergenceBigIntIterative(F, [5n, 6n]), 3n * SCALE);
		});

		it('produces accurate 10^18 fixed-point results for non-integer rational divergences', () => {
			// F([x]) = [x / 3n] evaluated at x = 0 with h = 3n:
			// (F(3) - F(-3)) / (2*3) = (1 - (-1)) / 6 = 1/3
			const oneThirdField = ([x]) => [x / 3n];
			assert.equal(
				divergenceBigIntIterative(oneThirdField, [0n], 3n),
				333_333_333_333_333_333n,
			);

			// (F(3) - F(-3)) / (2*3) = (2 - (-2)) / 6 = 2/3 -> rounds to 666...667
			const twoThirdsField = ([x]) => [2n * (x / 3n)];
			assert.equal(
				divergenceBigIntIterative(twoThirdsField, [0n], 3n),
				666_666_666_666_666_667n,
			);

			// Negative symmetry: -2/3 -> -666...667
			const negTwoThirdsField = ([x]) => [-2n * (x / 3n)];
			assert.equal(
				divergenceBigIntIterative(negTwoThirdsField, [0n], 3n),
				-666_666_666_666_666_667n,
			);
		});

		it('sums exact numerators before dividing to avoid per-component rounding drift', () => {
			// Each of 3 components contributes diff = 2 with 2h = 6 (1/3 each).
			// Sum of exact differences = 6 => 6 / 6 = 1.0 exactly (no 3 * 0.333... drift).
			const F = ([x, y, z]) => [x / 3n, y / 3n, z / 3n];
			assert.equal(
				divergenceBigIntIterative(F, [0n, 0n, 0n], 3n),
				1n * SCALE,
			);
		});

		it('applies round-half-to-even on exact half-ULP ties', () => {
			// denominator = 2 * h = 2 * SCALE => 1 unit of totalDiff equals 0.5 ULP
			const h = SCALE;
			// totalDiff = 1n => 0.5 ULP -> rounds to even 0n
			const halfUlp = ([x]) => [x > 0n ? 1n : 0n];
			assert.equal(divergenceBigIntIterative(halfUlp, [0n], h), 0n);

			// totalDiff = 3n => 1.5 ULP -> rounds to even 2n
			const oneAndHalfUlp = ([x]) => [x > 0n ? 3n : 0n];
			assert.equal(divergenceBigIntIterative(oneAndHalfUlp, [0n], h), 2n);

			// totalDiff = -3n => -1.5 ULP -> rounds to even -2n
			const negOneAndHalfUlp = ([x]) => [x > 0n ? -3n : 0n];
			assert.equal(divergenceBigIntIterative(negOneAndHalfUlp, [0n], h), -2n);
		});

		it('works seamlessly when point, h, and F all use fixed-point 10^18 coordinates', () => {
			// F(x, y) = [x/3, y/2] in 10^18 fixed-point; div(F) = 1/3 + 1/2 = 5/6
			const F = ([x, y]) => [x / 3n, y / 2n];
			const point = [6n * SCALE, 6n * SCALE];
			const h = 6n * 10n ** 12n; // divisible by 6, corresponds to h = 6e-6
			assert.equal(
				divergenceBigIntIterative(F, point, h),
				833_333_333_333_333_333n,
			);
		});
	});

	describe('edge cases', () => {
		it('returns 0n for a constant vector field', () => {
			const F = () => [42n, -99n, 0n];
			assert.equal(divergenceBigIntIterative(F, [1n, 2n, 3n], 1n), 0n);
		});

		it('returns 0n for a divergence-free 2D rotational field', () => {
			// F(x, y) = [-y, x] => div(F) = 0
			const F = ([x, y]) => [-y, x];
			assert.equal(divergenceBigIntIterative(F, [7n, -13n], 5n), 0n);
		});

		it('handles zero point and negative sink field', () => {
			// F(x, y, z) = [-x, -y, -z] => div(F) = -3
			const F = ([x, y, z]) => [-x, -y, -z];
			assert.equal(divergenceBigIntIterative(F, [0n, 0n, 0n], 1n), -3n * SCALE);
			assert.equal(
				divergenceBigIntIterative(F, [-100n, -200n, -300n], 4n),
				-3n * SCALE,
			);
		});

		it('handles very large BigInt coordinates far beyond Number.MAX_SAFE_INTEGER', () => {
			// F(x, y) = [x^2, y^2] => div(F) = 2x + 2y
			const F = ([x, y]) => [x * x, y * y];
			const big = 10n ** 30n;
			const h = 10n ** 10n;
			assert.equal(divergenceBigIntIterative(F, [big, -big], h), 0n);
			assert.equal(
				divergenceBigIntIterative(F, [big, 2n * big], h),
				6n * big * SCALE,
			);
		});

		it('does not mutate caller point and is resilient to F mutating its input argument', () => {
			const point = [10n, 20n, 30n];
			const F = (p) => {
				const out = [2n * p[0], 3n * p[1], 4n * p[2]];
				// Adversarially mutate input vector
				p[0] = 999_999n;
				p[1] = -999_999n;
				p[2] = 0n;
				return out;
			};
			assert.equal(divergenceBigIntIterative(F, point, 1n), 9n * SCALE);
			assert.deepEqual(point, [10n, 20n, 30n]);
		});

		it('throws TypeError or RangeError on invalid inputs', () => {
			const validF = ([x]) => [x];

			// Invalid F
			assert.throws(() => divergenceBigIntIterative(null, [1n]), TypeError);
			assert.throws(() => divergenceBigIntIterative(123, [1n]), TypeError);
			assert.throws(() => divergenceBigIntIterative({}, [1n]), TypeError);

			// Invalid point
			assert.throws(() => divergenceBigIntIterative(validF, null), TypeError);
			assert.throws(() => divergenceBigIntIterative(validF, 1n), TypeError);
			assert.throws(() => divergenceBigIntIterative(validF, []), RangeError);
			assert.throws(
				() => divergenceBigIntIterative(validF, [1n, 2]),
				TypeError,
			);
			assert.throws(
				() => divergenceBigIntIterative(validF, ['1']),
				TypeError,
			);

			// Invalid h
			assert.throws(
				() => divergenceBigIntIterative(validF, [1n], 1),
				TypeError,
			);
			assert.throws(
				() => divergenceBigIntIterative(validF, [1n], null),
				TypeError,
			);
			assert.throws(
				() => divergenceBigIntIterative(validF, [1n], 0n),
				RangeError,
			);
			assert.throws(
				() => divergenceBigIntIterative(validF, [1n], -5n),
				RangeError,
			);

			// Invalid F return values
			assert.throws(
				() => divergenceBigIntIterative(() => 42n, [1n]),
				TypeError,
			);
			assert.throws(
				() => divergenceBigIntIterative(() => [1n, 2n], [1n]),
				RangeError,
			);
			assert.throws(
				() => divergenceBigIntIterative(() => [1n, 2], [1n, 2n]),
				TypeError,
			);
		});
	});

	describe('independent mathematical cross-checks', () => {
		it('satisfies linearity: div(a*F + b*G) === a*div(F) + b*div(G)', () => {
			const F = ([x, y, z]) => [x * x + y, 3n * y * z, z * z - x];
			const G = ([x, y, z]) => [2n * x * y, -y * y + x, 5n * z + y];
			const alpha = 7n;
			const beta = -11n;
			const combined = (p) => {
				const fp = F(p);
				const gp = G(p);
				return fp.map((v, idx) => alpha * v + beta * gp[idx]);
			};

			const point = [5n, -3n, 8n];
			const h = 4n;
			const lhs = divergenceBigIntIterative(combined, point, h);
			const rhs =
				alpha * divergenceBigIntIterative(F, point, h) +
				beta * divergenceBigIntIterative(G, point, h);

			assert.equal(lhs, rhs);
		});

		it('satisfies the product rule: div(g * F) === grad(g) . F + g * div(F)', () => {
			// Linear scalar field g(x, y, z) = 2x - 3y + 5z + 7
			// Linear vector field F(x, y, z) = [x + y, 2y - z, 3z + x]
			// Product g*F is quadratic => central difference is exact.
			const g = ([x, y, z]) => 2n * x - 3n * y + 5n * z + 7n;
			const gradG = [2n, -3n, 5n];
			const F = ([x, y, z]) => [x + y, 2n * y - z, 3n * z + x];
			const gTimesF = (p) => {
				const gp = g(p);
				return F(p).map((v) => gp * v);
			};

			const point = [11n, -7n, 13n];
			const h = 3n;

			const fp = F(point);
			const dotGradGF =
				gradG[0] * fp[0] + gradG[1] * fp[1] + gradG[2] * fp[2];
			const divF = 1n + 2n + 3n; // exact analytic divergence of F
			const expected = (dotGradGF + g(point) * divF) * SCALE;

			assert.equal(divergenceBigIntIterative(gTimesF, point, h), expected);
		});

		it('satisfies vector calculus identity: div(curl(A)) === 0n', () => {
			// For A(x, y, z) = [x*y*z, x^2*z, y^2*x]:
			// curl(A) = [dA_z/dy - dA_y/dz, dA_x/dz - dA_z/dx, dA_y/dx - dA_x/dy]
			//         = [2*x*y - x^2, x*y - y^2, 2*x*z - x*z]
			//         = [2*x*y - x^2, x*y - y^2, x*z]
			const curlA = ([x, y, z]) => [2n * x * y - x * x, x * y - y * y, x * z];
			assert.equal(divergenceBigIntIterative(curlA, [9n, -4n, 17n], 1n), 0n);
			assert.equal(
				divergenceBigIntIterative(curlA, [-123n, 456n, -789n], 25n),
				0n,
			);
		});

		it('equals the trace of an independently computed numerical Jacobian matrix', () => {
			const F = ([x, y, z]) => [
				x * x + 2n * y * z,
				-3n * x * y + y * y,
				4n * x * z - z * z,
			];
			const point = [6n, -5n, 9n];
			const h = 2n;
			const n = point.length;

			// Independently assemble full n x n Jacobian matrix J[i][j] = dF_i / dx_j (scaled)
			const jacobian = Array.from({ length: n }, () => new Array(n).fill(0n));
			for (let j = 0; j < n; j++) {
				const pPlus = point.slice();
				const pMinus = point.slice();
				pPlus[j] += h;
				pMinus[j] -= h;
				const fPlus = F(pPlus);
				const fMinus = F(pMinus);
				for (let i = 0; i < n; i++) {
					jacobian[i][j] = ((fPlus[i] - fMinus[i]) * SCALE) / (2n * h);
				}
			}

			let trace = 0n;
			for (let i = 0; i < n; i++) {
				trace += jacobian[i][i];
			}

			assert.equal(divergenceBigIntIterative(F, point, h), trace);
		});

		it('matches exact cubic central-difference expansion and floating-point analytic check', () => {
			// Exact integer cubic field: F(x, y, z) = [x^3, y^3, z^3]
			// Central difference of u^3 is ((u+h)^3 - (u-h)^3)/(2h) = 3u^2 + h^2
			const cubicInt = ([x, y, z]) => [x * x * x, y * y * y, z * z * z];
			const [x, y, z] = [4n, -7n, 11n];
			const hInt = 5n;
			const exactCentralDiff =
				(3n * x * x + 3n * y * y + 3n * z * z + 3n * hInt * hInt) * SCALE;
			assert.equal(
				divergenceBigIntIterative(cubicInt, [x, y, z], hInt),
				exactCentralDiff,
			);

			// Fixed-point 10^18 cubic field cross-checked against floating-point analytic derivative
			const cubicFixed = ([u, v, w]) => [
				(u * u * u) / (SCALE * SCALE),
				(v * v * v) / (SCALE * SCALE),
				(w * w * w) / (SCALE * SCALE),
			];
			const xf = 1.5;
			const yf = -2.25;
			const zf = 0.75;
			const fixedPoint = [
				BigInt(Math.round(xf * 1e6)) * 10n ** 12n,
				BigInt(Math.round(yf * 1e6)) * 10n ** 12n,
				BigInt(Math.round(zf * 1e6)) * 10n ** 12n,
			];
			const hFixed = 10n ** 12n; // h = 1e-6

			const actualFloat =
				Number(divergenceBigIntIterative(cubicFixed, fixedPoint, hFixed)) /
				1e18;
			const analyticFloat = 3 * (xf * xf + yf * yf + zf * zf);

			assert.ok(
				Math.abs(actualFloat - analyticFloat) < 1e-9,
				`Expected ${actualFloat} to be within 1e-9 of analytic ${analyticFloat}`,
			);
		});
	});
});
