import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { combinationsDecimalRecursive } from './combinationsDecimalRecursive.js';

/**
 * Independent iterative BigInt reference for C(n, k) used for cross-checking.
 *
 * @param {bigint} n
 * @param {bigint} k
 * @returns {bigint}
 */
function referenceCombinations(n, k) {
	if (k > n) return 0n;
	if (k === 0n || k === n) return 1n;
	const r = k < n - k ? k : n - k;
	let result = 1n;
	for (let i = 1n; i <= r; i++) {
		result = (result * (n - r + i)) / i;
	}
	return result;
}

describe('combinationsDecimalRecursive', () => {
	describe('normal cases', () => {
		it('computes standard small and medium binomial coefficients', () => {
			assert.equal(combinationsDecimalRecursive('5', '2'), '10');
			assert.equal(combinationsDecimalRecursive('52', '5'), '2598960');
			assert.equal(combinationsDecimalRecursive('10', '3'), '120');
			assert.equal(combinationsDecimalRecursive('20', '10'), '184756');
			assert.equal(combinationsDecimalRecursive('30', '15'), '155117520');
		});

		it('computes large arbitrary-precision values beyond IEEE-754', () => {
			assert.equal(
				combinationsDecimalRecursive('100', '50'),
				'100891344545564193334812497256',
			);
			assert.equal(
				combinationsDecimalRecursive('200', '100'),
				referenceCombinations(200n, 100n).toString(),
			);

			// Very large n (10^30) with small k = 2: C(n, 2) = n * (n - 1) / 2
			const hugeN = 10n ** 30n;
			const expectedHuge = (hugeN * (hugeN - 1n)) / 2n;
			assert.equal(
				combinationsDecimalRecursive(hugeN.toString(), '2'),
				expectedHuge.toString(),
			);
		});

		it('accepts decimal integer strings with zero fractional parts and leading zeros/plus', () => {
			assert.equal(combinationsDecimalRecursive('10.0', '3.00'), '120');
			assert.equal(combinationsDecimalRecursive('5.000', '2.0'), '10');
			assert.equal(combinationsDecimalRecursive('+5', '+2'), '10');
			assert.equal(combinationsDecimalRecursive('0052', '0005'), '2598960');
			assert.equal(combinationsDecimalRecursive('  10.0  ', ' 2.00 '), '45');
		});

		it('formats results according to configurable precision', () => {
			assert.equal(combinationsDecimalRecursive('5', '2', 0), '10');
			assert.equal(combinationsDecimalRecursive('5', '2', 1), '10.0');
			assert.equal(combinationsDecimalRecursive('5', '2', 4), '10.0000');
			assert.equal(combinationsDecimalRecursive('52', '5', 2), '2598960.00');
			assert.equal(
				combinationsDecimalRecursive('100', '50', 3),
				'100891344545564193334812497256.000',
			);
			assert.equal(combinationsDecimalRecursive('0', '0', 2), '1.00');
			assert.equal(combinationsDecimalRecursive('3', '5', 3), '0.000');
		});
	});

	describe('edge cases', () => {
		it('handles C(0, 0), C(n, 0), C(n, n), C(n, 1), and C(n, n - 1)', () => {
			assert.equal(combinationsDecimalRecursive('0', '0'), '1');
			assert.equal(combinationsDecimalRecursive('0.0', '0.00'), '1');
			assert.equal(combinationsDecimalRecursive('1', '0'), '1');
			assert.equal(combinationsDecimalRecursive('1', '1'), '1');
			assert.equal(combinationsDecimalRecursive('100000000000000000000', '0'), '1');
			assert.equal(
				combinationsDecimalRecursive('100000000000000000000', '100000000000000000000'),
				'1',
			);
			assert.equal(
				combinationsDecimalRecursive('100000000000000000000', '1'),
				'100000000000000000000',
			);
			assert.equal(
				combinationsDecimalRecursive('100000000000000000000', '99999999999999999999'),
				'100000000000000000000',
			);
		});

		it('returns "0" whenever k > n', () => {
			assert.equal(combinationsDecimalRecursive('0', '1'), '0');
			assert.equal(combinationsDecimalRecursive('5', '6'), '0');
			assert.equal(combinationsDecimalRecursive('10', '99999999999999999999'), '0');
		});
	});

	describe('input validation', () => {
		it('rejects non-string n or k with TypeError', () => {
			for (const bad of [5, 5n, null, undefined, {}, [], true]) {
				assert.throws(() => combinationsDecimalRecursive(bad, '2'), TypeError);
				assert.throws(() => combinationsDecimalRecursive('5', bad), TypeError);
			}
		});

		it('rejects negative values with RangeError', () => {
			for (const neg of ['-1', '-5', '-10.0', '-0', '-0.0']) {
				assert.throws(() => combinationsDecimalRecursive(neg, '2'), RangeError);
				assert.throws(() => combinationsDecimalRecursive('5', neg), RangeError);
			}
		});

		it('rejects fractional values with RangeError', () => {
			for (const frac of ['5.5', '0.1', '10.0001', '2.999']) {
				assert.throws(() => combinationsDecimalRecursive(frac, '2'), RangeError);
				assert.throws(() => combinationsDecimalRecursive('5', frac), RangeError);
			}
		});

		it('rejects malformed strings with RangeError', () => {
			for (const bad of [
				'',
				'   ',
				'abc',
				'NaN',
				'Infinity',
				'1e5',
				'10.',
				'.0',
				'.',
				'+',
				'-',
				'1 2',
				'1_000',
				'1.2.3',
				'++5',
			]) {
				assert.throws(() => combinationsDecimalRecursive(bad, '2'), RangeError);
				assert.throws(() => combinationsDecimalRecursive('5', bad), RangeError);
			}
		});

		it('rejects invalid precision arguments', () => {
			for (const badType of ['2', null, 2n, {}, true]) {
				assert.throws(() => combinationsDecimalRecursive('5', '2', badType), TypeError);
			}
			for (const badRange of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => combinationsDecimalRecursive('5', '2', badRange), RangeError);
			}
		});
	});

	describe('mathematical cross-checks', () => {
		it("satisfies Pascal's identity: C(n, k) = C(n - 1, k - 1) + C(n - 1, k)", () => {
			for (let n = 1; n <= 25; n++) {
				for (let k = 1; k <= n; k++) {
					const lhs = BigInt(combinationsDecimalRecursive(String(n), String(k)));
					const rhs =
						BigInt(combinationsDecimalRecursive(String(n - 1), String(k - 1))) +
						BigInt(combinationsDecimalRecursive(String(n - 1), String(k)));
					assert.equal(lhs, rhs, `Pascal identity failed for n=${n}, k=${k}`);
				}
			}

			// Large value beyond IEEE-754
			const lhsLarge = BigInt(combinationsDecimalRecursive('80', '37'));
			const rhsLarge =
				BigInt(combinationsDecimalRecursive('79', '36')) +
				BigInt(combinationsDecimalRecursive('79', '37'));
			assert.equal(lhsLarge, rhsLarge);
		});

		it('satisfies symmetry: C(n, k) = C(n, n - k)', () => {
			for (let n = 0; n <= 25; n++) {
				for (let k = 0; k <= n; k++) {
					assert.equal(
						combinationsDecimalRecursive(String(n), String(k)),
						combinationsDecimalRecursive(String(n), String(n - k)),
						`Symmetry failed for n=${n}, k=${k}`,
					);
				}
			}

			assert.equal(
				combinationsDecimalRecursive('120', '43'),
				combinationsDecimalRecursive('120', '77'),
			);
		});

		it('satisfies row sum identity: sum_{k=0..n} C(n, k) = 2^n', () => {
			for (const n of [0, 1, 2, 5, 10, 20, 60]) {
				let sum = 0n;
				for (let k = 0; k <= n; k++) {
					sum += BigInt(combinationsDecimalRecursive(String(n), String(k)));
				}
				assert.equal(sum, 1n << BigInt(n), `Row sum failed for n=${n}`);
			}
		});

		it('matches independent iterative BigInt reference across grid', () => {
			for (let n = 0; n <= 30; n++) {
				for (let k = 0; k <= n + 1; k++) {
					assert.equal(
						combinationsDecimalRecursive(String(n), String(k)),
						referenceCombinations(BigInt(n), BigInt(k)).toString(),
						`Reference mismatch for n=${n}, k=${k}`,
					);
				}
			}
		});
	});
});
