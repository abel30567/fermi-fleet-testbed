import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cosFloatIterative } from './cosFloatIterative.js';

const EPSILON = 1e-14;

function assertClose(actual, expected, tol = EPSILON, message) {
	assert.equal(typeof actual, 'number', 'result must be a number');
	assert.ok(
		Math.abs(actual - expected) <= tol,
		message ?? `expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`,
	);
}

describe('cosFloatIterative', () => {
	describe('normal angles', () => {
		it('computes exact/well-known special angles', () => {
			assert.equal(cosFloatIterative(0), 1);
			assertClose(cosFloatIterative(Math.PI / 6), Math.sqrt(3) / 2);
			assertClose(cosFloatIterative(Math.PI / 4), Math.SQRT1_2);
			assertClose(cosFloatIterative(Math.PI / 3), 0.5);
			assertClose(cosFloatIterative(Math.PI / 2), 0);
			assertClose(cosFloatIterative((2 * Math.PI) / 3), -0.5);
			assertClose(cosFloatIterative((3 * Math.PI) / 4), -Math.SQRT1_2);
			assertClose(cosFloatIterative(Math.PI), -1);
			assertClose(cosFloatIterative((3 * Math.PI) / 2), 0);
			assertClose(cosFloatIterative(2 * Math.PI), 1);
		});

		it('handles negative angles across all quadrants', () => {
			assertClose(cosFloatIterative(-Math.PI / 6), Math.sqrt(3) / 2);
			assertClose(cosFloatIterative(-Math.PI / 4), Math.SQRT1_2);
			assertClose(cosFloatIterative(-Math.PI / 3), 0.5);
			assertClose(cosFloatIterative(-Math.PI / 2), 0);
			assertClose(cosFloatIterative(-Math.PI), -1);
			assertClose(cosFloatIterative((-3 * Math.PI) / 2), 0);
			assertClose(cosFloatIterative(-2 * Math.PI), 1);
			assertClose(cosFloatIterative(-3.7), Math.cos(-3.7));
		});

		it('handles large positive and negative angles', () => {
			const largeAngles = [
				10 * Math.PI,
				11 * Math.PI,
				100,
				-100,
				1000,
				-1000,
				1e5,
				-1e5,
				1e6,
				-1e6,
			];
			for (const angle of largeAngles) {
				assertClose(cosFloatIterative(angle), Math.cos(angle), 1e-12);
			}
		});

		it('handles very small and subnormal angles', () => {
			assertClose(cosFloatIterative(1e-7), Math.cos(1e-7), 1e-15);
			assertClose(cosFloatIterative(-1e-7), Math.cos(-1e-7), 1e-15);
			assert.equal(cosFloatIterative(1e-16), 1);
			assert.equal(cosFloatIterative(Number.MIN_VALUE), 1);
			assert.equal(cosFloatIterative(-Number.MIN_VALUE), 1);
		});
	});

	describe('edge cases and input validation', () => {
		it('returns exact +1 for both +0 and -0', () => {
			assert.ok(Object.is(cosFloatIterative(0), 1));
			assert.ok(Object.is(cosFloatIterative(-0), 1));
		});

		it('returns NaN for NaN, Infinity, and -Infinity', () => {
			assert.ok(Number.isNaN(cosFloatIterative(Number.NaN)));
			assert.ok(Number.isNaN(cosFloatIterative(Number.POSITIVE_INFINITY)));
			assert.ok(Number.isNaN(cosFloatIterative(Number.NEGATIVE_INFINITY)));
		});

		it('throws TypeError for non-number inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				'0',
				'3.14',
				'',
				true,
				false,
				0n,
				1n,
				{},
				[],
				[0],
				Symbol('angle'),
				() => 0,
			];
			for (const invalid of invalidInputs) {
				assert.throws(
					() => cosFloatIterative(invalid),
					{ name: 'TypeError' },
				);
			}
		});

		it('keeps finite results bounded in [-1, 1] and never returns -0', () => {
			for (let i = -50; i <= 50; i += 1) {
				const val = cosFloatIterative(i * 0.25);
				assert.ok(val >= -1 && val <= 1, `out of bounds for ${i * 0.25}: ${val}`);
				assert.ok(!Object.is(val, -0), `unexpected -0 for ${i * 0.25}`);
			}
			for (const huge of [1e12, -1e12, Number.MAX_VALUE, -Number.MAX_VALUE]) {
				const val = cosFloatIterative(huge);
				assert.ok(Number.isFinite(val) && val >= -1 && val <= 1, `out of bounds for ${huge}: ${val}`);
				assert.ok(!Object.is(val, -0), `unexpected -0 for ${huge}`);
			}
		});
	});

	describe('cross-check against Math.cos and trigonometric identities', () => {
		it('matches Math.cos across a dense range of angles', () => {
			for (let i = -200; i <= 200; i += 1) {
				const x = i * 0.13;
				assertClose(cosFloatIterative(x), Math.cos(x), 1e-14);
			}
		});

		it('satisfies the even-function identity cos(-x) === cos(x)', () => {
			const samples = [0, 0.1, 0.7, Math.PI / 3, Math.PI / 2, 2.5, 10, 1234.5678];
			for (const x of samples) {
				assert.equal(cosFloatIterative(-x), cosFloatIterative(x));
			}
		});

		it('satisfies periodicity and half-period identities', () => {
			const samples = [-5.2, -1.1, 0, 0.4, 1.9, 4.7];
			for (const x of samples) {
				assertClose(cosFloatIterative(x + 2 * Math.PI), cosFloatIterative(x), 1e-13);
				assertClose(cosFloatIterative(x + Math.PI), -cosFloatIterative(x), 1e-13);
			}
		});

		it('satisfies the Pythagorean identity cos(x)^2 + cos(pi/2 - x)^2 = 1', () => {
			const samples = [-4.2, -1.5, -0.3, 0, 0.25, 0.75, 1.2, 2.8, 5.5];
			for (const x of samples) {
				const c = cosFloatIterative(x);
				const s = cosFloatIterative(Math.PI / 2 - x);
				assertClose(c * c + s * s, 1, 1e-14);
			}
		});

		it('satisfies the double-angle identity cos(2x) = 2*cos(x)^2 - 1', () => {
			const samples = [-3.1, -0.9, 0, 0.5, 1.23, 2.7];
			for (const x of samples) {
				const lhs = cosFloatIterative(2 * x);
				const c = cosFloatIterative(x);
				const rhs = 2 * c * c - 1;
				assertClose(lhs, rhs, 1e-14);
			}
		});
	});
});
