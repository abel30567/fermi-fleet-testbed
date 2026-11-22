import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { curlBigIntIterative, SCALE } from './curlBigIntIterative.js';

describe('curlBigIntIterative', () => {
	describe('normal cases', () => {
		it('returns zero vector for a constant vector field', () => {
			const F = () => [7n, -42n, 100n];
			assert.deepEqual(curlBigIntIterative(F, [1n, 2n, 3n], 1n), [0n, 0n, 0n]);
		});

		it('computes exact curl of 2D rigid rotation F(x, y, z) = [-y, x, 0]', () => {
			const F = ([x, y, _z]) => [-y, x, 0n];
			assert.deepEqual(
				curlBigIntIterative(F, [5n, -3n, 10n], 1n),
				[0n, 0n, 2n * SCALE],
			);
		});

		it('computes exact curl of general rigid-body rotation F(r) = ω × r (curl = 2ω)', () => {
			const omega = [3n, -7n, 11n];
			const F = ([x, y, z]) => [
				omega[1] * z - omega[2] * y,
				omega[2] * x - omega[0] * z,
				omega[0] * y - omega[1] * x,
			];
			assert.deepEqual(
				curlBigIntIterative(F, [13n, -5n, 29n], 4n),
				[2n * omega[0] * SCALE, 2n * omega[1] * SCALE, 2n * omega[2] * SCALE],
			);
		});

		it('computes exact curl for quadratic non-conservative field F = [y^2, z^2, x^2]', () => {
			// ∂Fz/∂y - ∂Fy/∂z = 0 - 2z = -2z
			// ∂Fx/∂z - ∂Fz/∂x = 0 - 2x = -2x
			// ∂Fy/∂x - ∂Fx/∂y = 0 - 2y = -2y
			const F = ([x, y, z]) => [y * y, z * z, x * x];
			const p = [4n, -9n, 6n];
			const expected = [-2n * p[2] * SCALE, -2n * p[0] * SCALE, -2n * p[1] * SCALE];

			assert.deepEqual(curlBigIntIterative(F, p, 1n), expected);
			assert.deepEqual(curlBigIntIterative(F, p, 25n), expected);
		});

		it('computes exact curl for mixed bilinear/quadratic field', () => {
			// F = [x*y + z^2, y*z - x^2, z*x + y^2]
			// curl_x = ∂(zx + y^2)/∂y - ∂(yz - x^2)/∂z = 2y - y = y
			// curl_y = ∂(xy + z^2)/∂z - ∂(zx + y^2)/∂x = 2z - z = z
			// curl_z = ∂(yz - x^2)/∂x - ∂(xy + z^2)/∂y = -2x - x = -3x
			const F = ([x, y, z]) => [x * y + z * z, y * z - x * x, z * x + y * y];
			const [x, y, z] = [5n, -8n, 12n];
			assert.deepEqual(
				curlBigIntIterative(F, [x, y, z], 7n),
				[y * SCALE, z * SCALE, -3n * x * SCALE],
			);
		});

		it('defaults step h to 1n when omitted', () => {
			const F = ([x, y, _z]) => [-y, x, 0n];
			assert.deepEqual(curlBigIntIterative(F, [2n, 3n, 4n]), [0n, 0n, 2n * SCALE]);
		});

		it('produces exact fixed-point values for terminating fractional derivatives', () => {
			// F([x, y, z]) = [0n, x / 4n, (-3n * y) / 8n]
			// At origin with h = 8n (denominator 2h = 16n):
			//   ∂Fz/∂y = (-3 - 3) / 16 = -6/16 = -0.375
			//   ∂Fy/∂x = (2 - (-2)) / 16 = 4/16 = 0.25
			const F = ([x, y, _z]) => [0n, x / 4n, (-3n * y) / 8n];
			assert.deepEqual(curlBigIntIterative(F, [0n, 0n, 0n], 8n), [
				-375000000000000000n,
				0n,
				250000000000000000n,
			]);
		});

		it('rounds exact half-ULP ties away from zero symmetrically', () => {
			// With h = 2n * SCALE, denominator = 4n * SCALE.
			// When ΔF = 2n, numerator = 2n * SCALE -> exact +0.5 ULP -> rounds to +1n.
			// When ΔF = -2n, numerator = -2n * SCALE -> exact -0.5 ULP -> rounds to -1n.
			const h = 2n * SCALE;
			const F = ([x, y, _z]) => [
				0n,
				x > 0n ? 1n : x < 0n ? -1n : 0n,
				y > 0n ? -1n : y < 0n ? 1n : 0n,
			];
			assert.deepEqual(curlBigIntIterative(F, [0n, 0n, 0n], h), [-1n, 0n, 1n]);
		});

		it('rounds non-terminating fractional derivatives to nearest (half away from zero)', () => {
			// At origin with h = 3n:
			// F([x, y, z]) = [0n, x / 3n, (2n * y) / 3n]
			//   curl_x = (2 - (-2)) / 6 = 2/3 -> 666666666666666667n
			//   curl_y = 0
			//   curl_z = (1 - (-1)) / 6 = 1/3 -> 333333333333333333n
			const F = ([x, y, _z]) => [0n, x / 3n, (2n * y) / 3n];
			assert.deepEqual(curlBigIntIterative(F, [0n, 0n, 0n], 3n), [
				666666666666666667n,
				0n,
				333333333333333333n,
			]);

			// Negated field verifies exact odd symmetry for rounding
			const negF = (p) => F(p).map((v) => -v);
			assert.deepEqual(curlBigIntIterative(negF, [0n, 0n, 0n], 3n), [
				-666666666666666667n,
				0n,
				-333333333333333333n,
			]);
		});

		it('preserves scale invariance when coordinates, step, and field share fixed-point 10^18 scaling', () => {
			// Representing F(x, y, z) = [0, 0.25 * x^2, 0] in 10^18 fixed-point:
			// F_y = (x * x) / (4n * SCALE), so ∂F_y/∂x = 0.5 * x.
			// At x = 3 * SCALE, curl_z = 1.5 * SCALE.
			const F = ([x, _y, _z]) => [0n, (x * x) / (4n * SCALE), 0n];
			const point = [3n * SCALE, 0n, 0n];
			const h = 10n ** 12n;
			assert.deepEqual(curlBigIntIterative(F, point, h), [0n, 0n, 1500000000000000000n]);
		});
	});

	describe('edge cases', () => {
		it('handles zero vector field at the origin', () => {
			const zero = () => [0n, 0n, 0n];
			assert.deepEqual(curlBigIntIterative(zero, [0n, 0n, 0n], 1n), [0n, 0n, 0n]);
		});

		it('handles negative coordinates and negative curl components', () => {
			const F = ([x, y, z]) => [y, -x, -z * y];
			// curl_x = ∂(-zy)/∂y - ∂(-x)/∂z = -z - 0 = -z
			// curl_y = ∂(y)/∂z - ∂(-zy)/∂x = 0 - 0 = 0
			// curl_z = ∂(-x)/∂x - ∂(y)/∂y = -1 - 1 = -2
			const p = [-10n, -20n, -30n];
			assert.deepEqual(curlBigIntIterative(F, p, 5n), [30n * SCALE, 0n, -2n * SCALE]);
		});

		it('maintains exact precision for very large BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
			const bigX = 10n ** 40n + 123456789n;
			const bigY = -(10n ** 40n) + 987654321n;
			const bigZ = 10n ** 40n + 555555555n;
			const F = ([x, y, z]) => [y * y, z * z, x * x];
			const h = 10n ** 20n;

			assert.deepEqual(curlBigIntIterative(F, [bigX, bigY, bigZ], h), [
				-2n * bigZ * SCALE,
				-2n * bigX * SCALE,
				-2n * bigY * SCALE,
			]);
		});

		it('does not mutate caller point and resists F mutating its input argument', () => {
			const point = [3n, 4n, 5n];
			const mutatingF = (p) => {
				const out = [-p[1], p[0], 0n];
				p[0] = 999999n;
				p[1] = -999999n;
				p[2] = 42n;
				return out;
			};
			const result = curlBigIntIterative(mutatingF, point, 2n);
			assert.deepEqual(result, [0n, 0n, 2n * SCALE]);
			assert.deepEqual(point, [3n, 4n, 5n]);
		});

		it('evaluates F exactly 6 times (2 central-difference points per axis)', () => {
			let calls = 0;
			const F = ([x, y, z]) => {
				calls++;
				return [y, z, x];
			};
			curlBigIntIterative(F, [1n, 2n, 3n], 1n);
			assert.equal(calls, 6);
		});
	});

	describe('input validation', () => {
		const validF = ([x, y, z]) => [x, y, z];
		const validPoint = [1n, 2n, 3n];

		it('throws TypeError when F is not a function', () => {
			for (const bad of [null, undefined, 123, 'fn', {}, []]) {
				assert.throws(() => curlBigIntIterative(bad, validPoint, 1n), TypeError);
			}
		});

		it('throws TypeError when point is not an Array', () => {
			for (const bad of [null, undefined, '123', { 0: 1n, 1: 2n, 2: 3n }, 42n]) {
				assert.throws(() => curlBigIntIterative(validF, bad, 1n), TypeError);
			}
		});

		it('throws RangeError when point does not have length 3', () => {
			for (const bad of [[], [1n], [1n, 2n], [1n, 2n, 3n, 4n]]) {
				assert.throws(() => curlBigIntIterative(validF, bad, 1n), RangeError);
			}
		});

		it('throws TypeError when any element of point is not a BigInt', () => {
			for (const bad of [
				[1, 2n, 3n],
				[1n, '2', 3n],
				[1n, 2n, null],
				[1n, 2n, undefined],
			]) {
				assert.throws(() => curlBigIntIterative(validF, bad, 1n), TypeError);
			}
		});

		it('throws TypeError when h is not a BigInt', () => {
			for (const bad of [1, 0, -1, '1', null, NaN, {}]) {
				assert.throws(() => curlBigIntIterative(validF, validPoint, bad), TypeError);
			}
		});

		it('throws RangeError when h is zero or negative', () => {
			for (const bad of [0n, -1n, -1000n]) {
				assert.throws(() => curlBigIntIterative(validF, validPoint, bad), RangeError);
			}
		});

		it('throws TypeError or RangeError when F returns an invalid 3D BigInt vector', () => {
			assert.throws(() => curlBigIntIterative(() => null, validPoint, 1n), TypeError);
			assert.throws(() => curlBigIntIterative(() => [1n, 2n], validPoint, 1n), RangeError);
			assert.throws(() => curlBigIntIterative(() => [1n, 2n, 3n, 4n], validPoint, 1n), RangeError);
			assert.throws(() => curlBigIntIterative(() => [1, 2n, 3n], validPoint, 1n), TypeError);
			assert.throws(() => curlBigIntIterative(() => [1n, 2n, 3.5], validPoint, 1n), TypeError);
		});
	});

	describe('independent mathematical and numerical cross-checks', () => {
		it('satisfies vector calculus identity: curl(grad(φ)) = 0', () => {
			// Scalar potential φ(x, y, z) = 3 x^2 y - 2 y z^2 + 5 x z - 7 x + 4 y^2
			// Gradient ∇φ = [6xy + 5z - 7, 3x^2 - 2z^2 + 8y, -4yz + 5x]
			const gradPhi = ([x, y, z]) => [
				6n * x * y + 5n * z - 7n,
				3n * x * x - 2n * z * z + 8n * y,
				-4n * y * z + 5n * x,
			];
			for (const pt of [
				[0n, 0n, 0n],
				[3n, -5n, 7n],
				[-100n, 250n, -75n],
			]) {
				assert.deepEqual(curlBigIntIterative(gradPhi, pt, 3n), [0n, 0n, 0n]);
			}
		});

		it('satisfies linearity: curl(aF + bG) = a*curl(F) + b*curl(G)', () => {
			const F = ([x, y, z]) => [y * y - 3n * z, x * z + 2n * y, x * y - z * z];
			const G = ([x, y, z]) => [2n * z * x, -y * y + 4n * x, 5n * y * z];
			const a = 7n;
			const b = -11n;
			const combined = (p) => {
				const fp = F(p);
				const gp = G(p);
				return [
					a * fp[0] + b * gp[0],
					a * fp[1] + b * gp[1],
					a * fp[2] + b * gp[2],
				];
			};

			const point = [6n, -4n, 9n];
			const h = 3n;
			const curlCombined = curlBigIntIterative(combined, point, h);
			const curlF = curlBigIntIterative(F, point, h);
			const curlG = curlBigIntIterative(G, point, h);

			assert.deepEqual(curlCombined, [
				a * curlF[0] + b * curlG[0],
				a * curlF[1] + b * curlG[1],
				a * curlF[2] + b * curlG[2],
			]);
		});

		it('satisfies product rule: curl(φF) = (grad φ) × F + φ * curl(F)', () => {
			// Linear φ and linear F make φF quadratic, so central difference is exact.
			const phi = ([x, y, z]) => 2n * x - 3n * y + 5n * z + 1n;
			const gradPhi = [2n, -3n, 5n];
			const F = ([x, y, z]) => [4n * y - z, 3n * z + 2n * x, -5n * x + y];
			const phiF = (p) => {
				const s = phi(p);
				const fv = F(p);
				return [s * fv[0], s * fv[1], s * fv[2]];
			};

			const point = [7n, -2n, 4n];
			const lhs = curlBigIntIterative(phiF, point, 2n);

			const fv = F(point);
			const cross = [
				gradPhi[1] * fv[2] - gradPhi[2] * fv[1],
				gradPhi[2] * fv[0] - gradPhi[0] * fv[2],
				gradPhi[0] * fv[1] - gradPhi[1] * fv[0],
			];
			const s = phi(point);
			const curlF = curlBigIntIterative(F, point, 2n);
			const rhs = [
				cross[0] * SCALE + s * curlF[0],
				cross[1] * SCALE + s * curlF[1],
				cross[2] * SCALE + s * curlF[2],
			];

			assert.deepEqual(lhs, rhs);
		});

		it('satisfies identity: div(curl(F)) = 0 via independent numerical divergence on a cubic field', () => {
			// Cubic vector field F = [x*y^2 - z^3, x^2*z + y^3, x*y*z - x^3]
			const F = ([x, y, z]) => [
				x * y * y - z * z * z,
				x * x * z + y * y * y,
				x * y * z - x * x * x,
			];
			const p = [5n, -3n, 4n];
			const h = 2n;

			// Compute central-difference divergence of curl(F) independently:
			// div(G) = (Gx(x+h) - Gx(x-h) + Gy(y+h) - Gy(y-h) + Gz(z+h) - Gz(z-h)) / (2h)
			let divNumerator = 0n;
			for (let axis = 0; axis < 3; axis++) {
				const pPlus = [...p];
				const pMinus = [...p];
				pPlus[axis] += h;
				pMinus[axis] -= h;
				const cPlus = curlBigIntIterative(F, pPlus, h);
				const cMinus = curlBigIntIterative(F, pMinus, h);
				divNumerator += cPlus[axis] - cMinus[axis];
			}

			assert.equal(divNumerator, 0n);
		});

		it('matches independent IEEE-754 analytic & finite-difference reference on a cubic field', () => {
			// F(x, y, z) = [x*y*z, x^2*z - y^3, y*z^2 + x^3] in fixed-point 10^18 coordinates:
			// Scale product of 3 fixed-point values by dividing by SCALE^2.
			const S2 = SCALE * SCALE;
			const F = ([x, y, z]) => [
				(x * y * z) / S2,
				(x * x * z - y * y * y) / S2,
				(y * z * z + x * x * x) / S2,
			];

			// Point (1.5, -2.0, 0.5) in 10^18 fixed-point:
			const px = 1.5;
			const py = -2.0;
			const pz = 0.5;
			const point = [1500000000000000000n, -2000000000000000000n, 500000000000000000n];
			const h = 10n ** 12n; // 10^-6 in fixed-point units -> O(h^2) ≈ 10^-12 error

			const actual = curlBigIntIterative(F, point, h);

			// Independent analytic curl in float64:
			// curl_x = ∂(y z^2 + x^3)/∂y - ∂(x^2 z - y^3)/∂z = z^2 - x^2
			// curl_y = ∂(x y z)/∂z - ∂(y z^2 + x^3)/∂x = x*y - 3*x^2
			// curl_z = ∂(x^2 z - y^3)/∂x - ∂(x y z)/∂y = 2*x*z - x*z = x*z
			const expectedFloat = [
				pz * pz - px * px,
				px * py - 3 * px * px,
				px * pz,
			];

			for (let i = 0; i < 3; i++) {
				const actualFloat = Number(actual[i]) / 1e18;
				assert.ok(
					Math.abs(actualFloat - expectedFloat[i]) < 1e-9,
					`Component ${i}: expected ~${expectedFloat[i]}, got ${actualFloat}`,
				);
			}
		});
	});
});
