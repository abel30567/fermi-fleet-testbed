import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
	divergenceBigIntRecursive,
	FIXED_POINT_SCALE
} from './divergenceBigIntRecursive.js';

const SCALE = 10n ** 18n;

/**
 * Independent iterative (non-recursive) reference implementation for cross-checking.
 */
function iterativeDivergenceReference(vectorField, point, step = 1n, scale = SCALE) {
	let sum = 0n;
	for (let i = 0; i < vectorField.length; i++) {
		const pPlus = [...point];
		pPlus[i] += step;
		const pMinus = [...point];
		pMinus[i] -= step;
		sum += vectorField[i](pPlus) - vectorField[i](pMinus);
	}
	const num = sum * scale;
	const den = 2n * step;
	const q = num / den;
	const r = num % den;
	const abs2r = (r < 0n ? -r : r) * 2n;
	if (abs2r > den || (abs2r === den && q % 2n !== 0n)) {
		return r > 0n ? q + 1n : q - 1n;
	}
	return q;
}

describe('divergenceBigIntRecursive', () => {
	test('exports FIXED_POINT_SCALE equal to 10^18', () => {
		assert.equal(FIXED_POINT_SCALE, 10n ** 18n);
	});

	describe('analytical exactness across dimensions (1D, 2D, 3D, higher-D)', () => {
		test('1D quadratic vector field matches exact analytical derivative', () => {
			// F(x) = 7x^2 - 3x + 11 => div(F) = 14x - 3
			const field = [([x]) => 7n * x * x - 3n * x + 11n];
			for (const x of [-100n, -1n, 0n, 5n, 42n]) {
				const analytical = (14n * x - 3n) * SCALE;
				assert.equal(divergenceBigIntRecursive(field, [x], 1n), analytical);
				assert.equal(divergenceBigIntRecursive(field, [x], 17n), analytical);
			}
		});

		test('2D mixed polynomial vector field matches analytical divergence', () => {
			// F(x, y) = (x^2 * y + 5x - y^3, y^2 * x - 2y + x^4)
			// dF_x/dx = 2xy + 5, dF_y/dy = 2xy - 2 => div(F) = 4xy + 3
			const field = [
				([x, y]) => x * x * y + 5n * x - y * y * y,
				([x, y]) => y * y * x - 2n * y + x * x * x * x
			];
			const point = [13n, -7n];
			const analytical = (4n * 13n * -7n + 3n) * SCALE;
			assert.equal(divergenceBigIntRecursive(field, point, 1n), analytical);
			assert.equal(divergenceBigIntRecursive(field, point, 9n), analytical);
		});

		test('3D position vector field F(x, y, z) = (x, y, z) has constant divergence 3', () => {
			const field = [([x]) => x, ([, y]) => y, ([, , z]) => z];
			assert.equal(divergenceBigIntRecursive(field, [0n, 0n, 0n]), 3n * SCALE);
			assert.equal(divergenceBigIntRecursive(field, [-999n, 12345n, -67890n], 5n), 3n * SCALE);
		});

		test('3D cubic field matches exact closed-form central difference formula', () => {
			// For F_i(x_i) = c_i * x_i^3, central diff = c_i * (3 * x_i^2 + h^2)
			const field = [
				([x]) => x * x * x,
				([, y]) => 2n * y * y * y,
				([, , z]) => -3n * z * z * z
			];
			const point = [4n, -5n, 6n];
			for (const h of [1n, 3n, 10n]) {
				const expected =
					(1n * (3n * 16n + h * h) +
						2n * (3n * 25n + h * h) -
						3n * (3n * 36n + h * h)) *
					SCALE;
				assert.equal(divergenceBigIntRecursive(field, point, h), expected);
			}
		});

		test('higher-dimensional fields (5D, 8D, 17D) match analytical & iterative cross-check', () => {
			for (const dim of [5, 8, 17]) {
				// F_i(p) = (i + 1) * p_i^2 + (-1)^i * p_i + sum of neighboring coordinates
				const field = Array.from({ length: dim }, (_, i) => (p) => {
					const coeff = BigInt(i + 1);
					const sign = i % 2 === 0 ? 1n : -1n;
					const neighbor = p[(i + 1) % dim];
					return coeff * p[i] * p[i] + sign * p[i] + 3n * neighbor;
				});
				const point = Array.from({ length: dim }, (_, i) => BigInt(i * 7 - 15));

				let analytical = 0n;
				for (let i = 0; i < dim; i++) {
					const coeff = BigInt(i + 1);
					const sign = i % 2 === 0 ? 1n : -1n;
					analytical += 2n * coeff * point[i] + sign;
				}

				const result = divergenceBigIntRecursive(field, point, 4n);
				assert.equal(result, analytical * SCALE);
				assert.equal(result, iterativeDivergenceReference(field, point, 4n));
			}
		});
	});

	describe('zero divergence / solenoidal fields', () => {
		test('constant vector field has zero divergence', () => {
			const field = [() => 100n, () => -200n, () => 300n];
			assert.equal(divergenceBigIntRecursive(field, [1n, 2n, 3n]), 0n);
		});

		test('2D rotational field (-y, x) is divergence-free', () => {
			const field = [([, y]) => -y, ([x]) => x];
			assert.equal(divergenceBigIntRecursive(field, [42n, -19n], 3n), 0n);
		});

		test('3D nonlinear solenoidal curl field has exact zero divergence', () => {
			// F = (y*z^2, -x*z^2, x^2 - y^2) => each component independent of its own axis
			const field = [
				([, y, z]) => y * z * z,
				([x, , z]) => -x * z * z,
				([x, y]) => x * x - y * y
			];
			assert.equal(divergenceBigIntRecursive(field, [-11n, 23n, -37n], 5n), 0n);
		});

		test('3D field with non-zero cancelling partials gives exact 0n', () => {
			// dF_x/dx = 2x, dF_y/dy = -x, dF_z/dz = -x => sum = 0
			const field = [
				([x]) => x * x,
				([x, y]) => -x * y,
				([x, , z]) => -x * z
			];
			assert.equal(divergenceBigIntRecursive(field, [999n, -500n, 1234n], 7n), 0n);
		});
	});

	describe('fixed-point scaling and non-integer results', () => {
		test('computes exact fixed-point value for 1/2 (0.5 * 10^18)', () => {
			// Step function: F(x) = 1n if x > 0n else 0n; at x=0, h=1: (1 - 0) / 2 = 0.5
			const field = [([x]) => (x > 0n ? 1n : 0n)];
			assert.equal(divergenceBigIntRecursive(field, [0n], 1n), 500_000_000_000_000_000n);
		});

		test('computes rounded fixed-point values for repeating decimals (1/3, 2/3, -1/6)', () => {
			// F(x) = 1n if x > 0n else 0n at x=0, h=3 => (1 - 0) / 6 = 1/6
			const posStep = [([x]) => (x > 0n ? 1n : 0n)];
			assert.equal(divergenceBigIntRecursive(posStep, [0n], 3n), 166_666_666_666_666_667n);

			// Negated => -1/6 (checks sign symmetry)
			const negStep = [([x]) => (x > 0n ? -1n : 0n)];
			assert.equal(divergenceBigIntRecursive(negStep, [0n], 3n), -166_666_666_666_666_667n);

			// Delta = 2n, 2h = 6n => 1/3
			const twoStep = [([x]) => (x > 0n ? 2n : 0n)];
			assert.equal(divergenceBigIntRecursive(twoStep, [0n], 3n), 333_333_333_333_333_333n);

			// Delta = 4n, 2h = 6n => 2/3
			const fourStep = [([x]) => (x > 0n ? 4n : 0n)];
			assert.equal(divergenceBigIntRecursive(fourStep, [0n], 3n), 666_666_666_666_666_667n);
		});

		test('avoids per-term rounding drift when fractional partials sum to an exact value', () => {
			// 6D field where each partial has delta = 1n and 2h = 6n (each 1/6); sum = 6/6 = 1.0 exactly
			const field = Array.from({ length: 6 }, (_, i) => (p) => (p[i] > 0n ? 1n : 0n));
			const origin = [0n, 0n, 0n, 0n, 0n, 0n];
			assert.equal(divergenceBigIntRecursive(field, origin, 3n), SCALE);
		});

		test('supports custom scale parameter and round-half-to-even tie-breaking', () => {
			// Delta = 1n, h = 2n => denominator 2h = 4n. With scale = 2n => 2 / 4 = 0.5 -> rounds to even (0n)
			const field1 = [([x]) => (x > 0n ? 1n : 0n)];
			assert.equal(divergenceBigIntRecursive(field1, [0n], 2n, 2n), 0n);

			// Delta = 3n, h = 2n, scale = 2n => 6 / 4 = 1.5 -> rounds to even (2n)
			const field3 = [([x]) => (x > 0n ? 3n : 0n)];
			assert.equal(divergenceBigIntRecursive(field3, [0n], 2n, 2n), 2n);

			// Negative tie: Delta = -3n, h = 2n, scale = 2n => -6 / 4 = -1.5 -> rounds to even (-2n)
			const fieldNeg3 = [([x]) => (x > 0n ? -3n : 0n)];
			assert.equal(divergenceBigIntRecursive(fieldNeg3, [0n], 2n, 2n), -2n);
		});
	});

	describe('large BigInts and negative coordinates', () => {
		test('handles arbitrarily large BigInts far beyond IEEE-754 double precision', () => {
			const big = 10n ** 60n + 12345678901234567890123456789n;
			const negBig = -(10n ** 55n + 98765432109876543210987654321n);
			// F(x, y) = (x^2, y^2) => div(F) = 2x + 2y
			const field = [([x]) => x * x, ([, y]) => y * y];
			const step = 10n ** 25n + 7n;
			const expected = (2n * big + 2n * negBig) * SCALE;

			const actual = divergenceBigIntRecursive(field, [big, negBig], step);
			assert.equal(actual, expected);
			assert.equal(actual, iterativeDivergenceReference(field, [big, negBig], step));
		});

		test('does not mutate caller point array even if field functions mutate their input', () => {
			const point = [10n, 20n, 30n];
			const snapshot = [...point];
			const mutatingField = [
				(p) => {
					const val = p[0] * p[0];
					p[0] = -999999n;
					p[1] = -999999n;
					return val;
				},
				(p) => {
					const val = 3n * p[1];
					p[2] = -999999n;
					return val;
				},
				(p) => {
					const val = -2n * p[2];
					p[0] = 0n;
					return val;
				}
			];

			// div = 2*10 + 3 - 2 = 21
			assert.equal(divergenceBigIntRecursive(mutatingField, point, 2n), 21n * SCALE);
			assert.deepEqual(point, snapshot);
		});
	});

	describe('input validation errors', () => {
		const validField = [([x]) => x];
		const validPoint = [1n];

		test('rejects invalid vectorField', () => {
			assert.throws(() => divergenceBigIntRecursive(null, validPoint), TypeError);
			assert.throws(() => divergenceBigIntRecursive('not-array', validPoint), TypeError);
			assert.throws(() => divergenceBigIntRecursive([], []), RangeError);
			assert.throws(() => divergenceBigIntRecursive([123], validPoint), TypeError);
			assert.throws(
				() => divergenceBigIntRecursive([([x]) => x, null], [1n, 2n]),
				TypeError
			);
		});

		test('rejects invalid point', () => {
			assert.throws(() => divergenceBigIntRecursive(validField, null), TypeError);
			assert.throws(() => divergenceBigIntRecursive(validField, { 0: 1n }), TypeError);
			assert.throws(() => divergenceBigIntRecursive(validField, [1n, 2n]), RangeError);
			assert.throws(() => divergenceBigIntRecursive(validField, [1]), TypeError);
			assert.throws(() => divergenceBigIntRecursive(validField, ['1']), TypeError);
		});

		test('rejects invalid step', () => {
			assert.throws(() => divergenceBigIntRecursive(validField, validPoint, 1), TypeError);
			assert.throws(() => divergenceBigIntRecursive(validField, validPoint, '1'), TypeError);
			assert.throws(() => divergenceBigIntRecursive(validField, validPoint, 0n), RangeError);
			assert.throws(() => divergenceBigIntRecursive(validField, validPoint, -5n), RangeError);
		});

		test('rejects invalid scale', () => {
			assert.throws(
				() => divergenceBigIntRecursive(validField, validPoint, 1n, 1000),
				TypeError
			);
			assert.throws(
				() => divergenceBigIntRecursive(validField, validPoint, 1n, 0n),
				RangeError
			);
			assert.throws(
				() => divergenceBigIntRecursive(validField, validPoint, 1n, -10n),
				RangeError
			);
		});

		test('rejects vector field components that do not return BigInt', () => {
			assert.throws(() => divergenceBigIntRecursive([() => 42], validPoint), TypeError);
			assert.throws(() => divergenceBigIntRecursive([() => undefined], validPoint), TypeError);
			// Fails on -step evaluation specifically
			assert.throws(
				() => divergenceBigIntRecursive([([x]) => (x > 1n ? 1n : 'bad')], [1n], 1n),
				TypeError
			);
		});
	});
});
