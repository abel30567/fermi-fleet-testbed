import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
	divergenceBigIntIterative,
	SCALE,
	DEFAULT_STEP,
} from './divergenceBigIntIterative.js';

/** Helper: converts a small integer or decimal string to fixed-point BigInt (scaled by 10^18). */
function fp(value) {
	if (typeof value === 'bigint') {
		return value * SCALE;
	}
	const str = String(value);
	const negative = str.startsWith('-');
	const absStr = negative ? str.slice(1) : str;
	const [intPart, fracPart = ''] = absStr.split('.');
	if (fracPart.length > 18) {
		throw new RangeError('Too many fractional digits for 10^18 scale');
	}
	const paddedFrac = fracPart.padEnd(18, '0');
	const magnitude = BigInt(intPart || '0') * SCALE + BigInt(paddedFrac);
	return negative ? -magnitude : magnitude;
}

/** Helper: fixed-point multiplication rounded toward zero. */
function mulFP(a, b) {
	return (a * b) / SCALE;
}

/** Helper: absolute value of a BigInt. */
function absBigInt(x) {
	return x < 0n ? -x : x;
}

describe('divergenceBigIntIterative', () => {
	describe('normal cases & analytic cross-checks', () => {
		test('constant vector field has exact divergence 0', () => {
			const F = () => [fp('3.5'), fp('-7.25'), fp('42')];
			const result = divergenceBigIntIterative(F, [fp(1), fp(-2), fp('0.5')]);
			assert.equal(result, 0n);
		});

		test('identity / radial field F(x) = x has exact divergence n in 1D, 2D, 3D, and 5D', () => {
			const identity = (p) => p.slice();
			assert.equal(divergenceBigIntIterative(identity, [fp(5)]), fp(1));
			assert.equal(divergenceBigIntIterative(identity, [fp(1), fp(-3)]), fp(2));
			assert.equal(
				divergenceBigIntIterative(identity, [fp('1.25'), fp('-4.5'), fp('9.75')]),
				fp(3)
			);
			assert.equal(
				divergenceBigIntIterative(identity, [fp(0), fp(1), fp(2), fp(3), fp(4)]),
				fp(5)
			);
		});

		test('general affine linear vector field matches exact analytic trace', () => {
			// F(x, y, z) = [3x - 2y + 5, 4x + 7y - z, x + y - 2.5z]
			// Analytic divergence = 3 + 7 - 2.5 = 7.5
			const F = ([x, y, z]) => [
				3n * x - 2n * y + fp(5),
				4n * x + 7n * y - z,
				x + y - (5n * z) / 2n,
			];
			const result = divergenceBigIntIterative(F, [fp('2.5'), fp('-1.2'), fp('4.8')]);
			assert.equal(result, fp('7.5'));
		});

		test('negative divergence on scaled linear field', () => {
			// F(x, y, z) = [-5x, -2y, -3z] -> div F = -10
			const F = ([x, y, z]) => [-5n * x, -2n * y, -3n * z];
			assert.equal(divergenceBigIntIterative(F, [fp(10), fp(-20), fp(30)]), fp(-10));
		});

		test('non-integer fractional coefficients sum accurately', () => {
			// F(x, y) = [x/3, y/6] -> div F = 1/3 + 1/6 = 1/2 = 0.5
			const F = ([x, y]) => [x / 3n, y / 6n];
			const result = divergenceBigIntIterative(F, [fp(6), fp(12)], 6n * 10n ** 12n);
			assert.equal(result, fp('0.5'));
		});

		test('quadratic field F(x, y, z) = [x^2, y^2, z^2] matches analytic 2(x + y + z)', () => {
			const F = ([x, y, z]) => [mulFP(x, x), mulFP(y, y), mulFP(z, z)];
			const p = [fp(3), fp(-4), fp('2.5')];
			// Analytic: 2*(3 - 4 + 2.5) = 3.0
			const analytic = 2n * (p[0] + p[1] + p[2]);
			const result = divergenceBigIntIterative(F, p);
			assert.ok(
				absBigInt(result - analytic) <= 10n ** 6n,
				`expected ${result} within 1e6 of ${analytic}`
			);
		});

		test('coupled polynomial field F(x, y, z) = [x^2*y, y^2*z, z^2*x] matches analytic 2(xy + yz + zx)', () => {
			const F = ([x, y, z]) => [
				mulFP(mulFP(x, x), y),
				mulFP(mulFP(y, y), z),
				mulFP(mulFP(z, z), x),
			];
			const p = [fp('1.5'), fp('-2'), fp('3.25')];
			const [x, y, z] = p;
			// Analytic: 2*(1.5*(-2) + (-2)*3.25 + 3.25*1.5) = 2*(-3 - 6.5 + 4.875) = -9.25
			const analytic = 2n * (mulFP(x, y) + mulFP(y, z) + mulFP(z, x));
			assert.equal(analytic, fp('-9.25'));
			const result = divergenceBigIntIterative(F, p);
			assert.ok(
				absBigInt(result - analytic) <= 10n ** 7n,
				`expected ${result} within 1e7 of ${analytic}`
			);
		});

		test('cubic field F(x, y) = [x^3, y^3] matches analytic 3(x^2 + y^2) and improves with smaller step', () => {
			const F = ([x, y]) => [mulFP(mulFP(x, x), x), mulFP(mulFP(y, y), y)];
			const p = [fp(2), fp(-3)];
			// Analytic: 3*(4 + 9) = 39
			const analytic = fp(39);

			const coarse = divergenceBigIntIterative(F, p, 10n ** 15n); // h = 1e-3
			const fine = divergenceBigIntIterative(F, p, DEFAULT_STEP); // h = 1e-6

			const coarseErr = absBigInt(coarse - analytic);
			const fineErr = absBigInt(fine - analytic);
			assert.ok(fineErr < coarseErr, `expected fineErr (${fineErr}) < coarseErr (${coarseErr})`);
			assert.ok(fineErr <= 10n ** 7n, `expected fineErr (${fineErr}) <= 1e7`);
		});
	});

	describe('solenoidal & vector calculus identity cross-checks', () => {
		test('2D incompressible rotation field F(x, y) = [-y, x] has exact divergence 0', () => {
			const F = ([x, y]) => [-y, x];
			assert.equal(divergenceBigIntIterative(F, [fp('3.14159'), fp('-2.71828')]), 0n);
		});

		test('3D solenoidal field with non-zero cancelling partials has exact divergence 0', () => {
			// F(x, y, z) = [x*y, -0.5*y^2 + z, 0] -> ∂F_x/∂x = y, ∂F_y/∂y = -y, ∂F_z/∂z = 0 => div F = 0
			const F = ([x, y, z]) => [mulFP(x, y), -mulFP(y, y) / 2n + z, 0n];
			const p = [fp(4), fp(-6), fp(2)];
			const result = divergenceBigIntIterative(F, p);
			assert.equal(result, 0n);
		});

		test('curl of smooth 3D vector potential A(x,y,z) = [y*z, z*x^2, x*y^3] has divergence 0 (div(curl A) = 0)', () => {
			// F = curl(A) = [3*x*y^2 - x^2, y - y^3, 2*z*x - z]
			// Analytic partials: (3y^2 - 2x) + (1 - 3y^2) + (2x - 1) = 0 identically
			const curlA = ([x, y, z]) => [
				3n * mulFP(x, mulFP(y, y)) - mulFP(x, x),
				y - mulFP(mulFP(y, y), y),
				2n * mulFP(z, x) - z,
			];
			const points = [
				[0n, 0n, 0n],
				[fp(2), fp(3), fp(4)],
				[fp('-1.5'), fp('2.25'), fp('-0.75')],
			];
			for (const p of points) {
				const result = divergenceBigIntIterative(curlA, p);
				assert.ok(
					absBigInt(result) <= 10n ** 7n,
					`expected div(curl A) near 0 at ${p}, got ${result}`
				);
			}
		});

		test('linearity: div(a*F + b*G) == a*div(F) + b*div(G)', () => {
			const F = ([x, y, z]) => [2n * x + y, -3n * y + z, 4n * z];
			const G = ([x, y, z]) => [mulFP(x, x), mulFP(y, z), -2n * z];
			const a = 3n;
			const b = -5n;
			const combined = (p) => {
				const fpVal = F(p);
				const gpVal = G(p);
				return [
					a * fpVal[0] + b * gpVal[0],
					a * fpVal[1] + b * gpVal[1],
					a * fpVal[2] + b * gpVal[2],
				];
			};
			const p = [fp('1.5'), fp('-2.5'), fp('3.5')];
			const lhs = divergenceBigIntIterative(combined, p);
			const rhs =
				a * divergenceBigIntIterative(F, p) + b * divergenceBigIntIterative(G, p);
			assert.ok(absBigInt(lhs - rhs) <= 10n ** 6n, `expected ${lhs} ≈ ${rhs}`);
		});
	});

	describe('edge cases', () => {
		test('1D vector field reduces to scalar derivative', () => {
			// F([x]) = [5x^2 - 3x + 7] -> F'(x) = 10x - 3
			const F = ([x]) => [5n * mulFP(x, x) - 3n * x + fp(7)];
			const result = divergenceBigIntIterative(F, [fp(4)]);
			assert.equal(result, fp(37));
		});

		test('origin point [0n, 0n, 0n] and high-dimensional (10D) vector field', () => {
			// F_i(x) = (i + 1) * x_i -> div F = 1 + 2 + ... + 10 = 55
			const F = (p) => p.map((coord, idx) => BigInt(idx + 1) * coord);
			const origin10D = Array(10).fill(0n);
			assert.equal(divergenceBigIntIterative(F, origin10D), fp(55));
		});

		test('very large BigInt coordinates far beyond Number.MAX_SAFE_INTEGER remain exact', () => {
			const huge = 10n ** 45n;
			// F(x, y) = [7x, -4y] -> div F = 3 (exact even at 10^45)
			const F = ([x, y]) => [7n * x, -4n * y];
			const result = divergenceBigIntIterative(F, [huge, -huge]);
			assert.equal(result, fp(3));
		});

		test('minimum valid step size (step = 1n) works on linear field', () => {
			const F = ([x, y]) => [4n * x, -9n * y];
			assert.equal(divergenceBigIntIterative(F, [fp(1), fp(2)], 1n), fp(-5));
		});

		test('does not mutate caller point and tolerates vectorField mutating its input array', () => {
			const point = [fp(2), fp(3), fp(4)];
			const snapshot = point.slice();
			const mutatingField = (p) => {
				const out = [2n * p[0], 3n * p[1], 5n * p[2]];
				// Deliberately corrupt input array
				p[0] = 999999n;
				p[1] = -999999n;
				p[2] = 0n;
				return out;
			};
			const result = divergenceBigIntIterative(mutatingField, point);
			assert.equal(result, fp(10));
			assert.deepEqual(point, snapshot);
		});
	});

	describe('invalid inputs', () => {
		const validField = (p) => p.slice();

		test('throws TypeError when vectorField is not a function', () => {
			for (const bad of [null, undefined, 42, 'fn', {}, []]) {
				assert.throws(() => divergenceBigIntIterative(bad, [0n]), TypeError);
			}
		});

		test('throws TypeError when point is not an Array', () => {
			for (const bad of [null, undefined, 0n, '0', { 0: 0n, length: 1 }]) {
				assert.throws(() => divergenceBigIntIterative(validField, bad), TypeError);
			}
		});

		test('throws RangeError when point is empty', () => {
			assert.throws(() => divergenceBigIntIterative(validField, []), RangeError);
		});

		test('throws TypeError when point contains non-BigInt elements or holes', () => {
			const sparse = [1n, , 3n]; // eslint-disable-line no-sparse-arrays
			for (const bad of [[1, 2], [1n, '2'], [1n, null], [1n, undefined], sparse]) {
				assert.throws(() => divergenceBigIntIterative(validField, bad), TypeError);
			}
		});

		test('throws TypeError for non-BigInt step and RangeError for non-positive step', () => {
			for (const badType of [1000, '1000', null, {}, NaN]) {
				assert.throws(
					() => divergenceBigIntIterative(validField, [0n], badType),
					TypeError
				);
			}
			for (const badRange of [0n, -1n, -DEFAULT_STEP]) {
				assert.throws(
					() => divergenceBigIntIterative(validField, [0n], badRange),
					RangeError
				);
			}
		});

		test('throws on invalid vectorField return values', () => {
			assert.throws(
				() => divergenceBigIntIterative(() => 'not-an-array', [0n, 0n]),
				TypeError
			);
			assert.throws(
				() => divergenceBigIntIterative(() => [0n], [0n, 0n]),
				RangeError
			);
			assert.throws(
				() => divergenceBigIntIterative(() => [0n, 1], [0n, 0n]),
				TypeError
			);
		});
	});
});
