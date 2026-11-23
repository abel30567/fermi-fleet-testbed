import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { powerFloatIterative } from './powerFloatIterative.js';

/**
 * Asserts that `actual` is within `maxRelErr` relative error of `expected`
 * (or exact for zero/special values).
 * @param {number} actual
 * @param {number} expected
 * @param {number} [maxRelErr=1e-13]
 */
function assertClose(actual, expected, maxRelErr = 1e-13) {
	if (Number.isNaN(expected)) {
		assert.ok(Number.isNaN(actual), `Expected NaN, got ${actual}`);
		return;
	}
	if (!Number.isFinite(expected) || expected === 0) {
		assert.ok(Object.is(actual, expected), `Expected ${expected}, got ${actual}`);
		return;
	}
	const relErr = Math.abs(actual - expected) / Math.abs(expected);
	assert.ok(
		relErr <= maxRelErr,
		`Expected ${actual} to be within ${maxRelErr} rel err of ${expected} (got relErr=${relErr})`
	);
}

describe('powerFloatIterative', () => {
	describe('input validation', () => {
		it('throws TypeError when base is not a number', () => {
			for (const bad of ['2', null, undefined, true, 2n, {}, [], Symbol('x')]) {
				assert.throws(() => powerFloatIterative(bad, 2), TypeError);
			}
		});

		it('throws TypeError when exponent is not a number', () => {
			for (const bad of ['2', null, undefined, false, 2n, {}, [], Symbol('y')]) {
				assert.throws(() => powerFloatIterative(2, bad), TypeError);
			}
		});
	});

	describe('integer exponents (normal cases)', () => {
		it('computes exact positive integer powers', () => {
			assert.equal(powerFloatIterative(2, 10), 1024);
			assert.equal(powerFloatIterative(3, 5), 243);
			assert.equal(powerFloatIterative(10, 6), 1000000);
			assert.equal(powerFloatIterative(1.5, 4), 5.0625);
			assert.equal(powerFloatIterative(-2, 3), -8);
			assert.equal(powerFloatIterative(-2, 4), 16);
			assert.equal(powerFloatIterative(-3, 5), -243);
		});

		it('computes negative integer powers', () => {
			assert.equal(powerFloatIterative(2, -1), 0.5);
			assert.equal(powerFloatIterative(2, -10), 1 / 1024);
			assert.equal(powerFloatIterative(-2, -3), -0.125);
			assert.equal(powerFloatIterative(-2, -4), 0.0625);
			assertClose(powerFloatIterative(3, -4), 1 / 81, 1e-15);
			assertClose(powerFloatIterative(10, -6), 1e-6, 1e-15);
		});

		it('handles exponent 0 and 1 and base ±1', () => {
			assert.equal(powerFloatIterative(5, 0), 1);
			assert.equal(powerFloatIterative(5, -0), 1);
			assert.equal(powerFloatIterative(-5, 0), 1);
			assert.equal(powerFloatIterative(0, 0), 1);
			assert.equal(powerFloatIterative(-0, -0), 1);
			assert.equal(powerFloatIterative(NaN, 0), 1);
			assert.equal(powerFloatIterative(Infinity, -0), 1);
			assert.equal(powerFloatIterative(-Infinity, 0), 1);
			assert.equal(powerFloatIterative(7.25, 1), 7.25);
			assert.equal(powerFloatIterative(1, 123456.789), 1);
			assert.equal(powerFloatIterative(1, -1e100), 1);
			assert.equal(powerFloatIterative(-1, 1000001), -1);
			assert.equal(powerFloatIterative(-1, 1000000), 1);
			assert.equal(powerFloatIterative(-1, 2 ** 53), 1);
			assert.equal(powerFloatIterative(-1, 2 ** 53 - 1), -1);
		});
	});

	describe('fractional exponents and roots', () => {
		it('computes square roots and higher roots accurately', () => {
			assertClose(powerFloatIterative(4, 0.5), 2, 1e-15);
			assertClose(powerFloatIterative(9, 0.5), 3, 1e-15);
			assertClose(powerFloatIterative(2, 0.5), Math.SQRT2, 1e-15);
			assertClose(powerFloatIterative(8, 1 / 3), 2, 1e-14);
			assertClose(powerFloatIterative(27, 1 / 3), 3, 1e-14);
			assertClose(powerFloatIterative(16, 0.25), 2, 1e-15);
			assertClose(powerFloatIterative(1000, 1 / 3), 10, 1e-14);
		});

		it('computes general positive and negative fractional powers', () => {
			assertClose(powerFloatIterative(2.5, 3.7), Math.pow(2.5, 3.7), 1e-14);
			assertClose(powerFloatIterative(0.3, -2.4), Math.pow(0.3, -2.4), 1e-14);
			assertClose(powerFloatIterative(123.456, 0.123), Math.pow(123.456, 0.123), 1e-14);
			assertClose(powerFloatIterative(1e-200, 0.5), 1e-100, 1e-14);
			assertClose(powerFloatIterative(1e200, 0.5), 1e100, 1e-14);
			assertClose(powerFloatIterative(10, -2.5), Math.pow(10, -2.5), 1e-14);
		});

		it('returns NaN for negative base with non-integer exponent', () => {
			assert.ok(Number.isNaN(powerFloatIterative(-1, 0.5)));
			assert.ok(Number.isNaN(powerFloatIterative(-4, 0.5)));
			assert.ok(Number.isNaN(powerFloatIterative(-8, 1 / 3)));
			assert.ok(Number.isNaN(powerFloatIterative(-2.5, -1.5)));
		});
	});

	describe('IEEE-754 special values and extreme ranges', () => {
		it('handles NaN operands', () => {
			assert.ok(Number.isNaN(powerFloatIterative(NaN, 1)));
			assert.ok(Number.isNaN(powerFloatIterative(NaN, -2)));
			assert.ok(Number.isNaN(powerFloatIterative(2, NaN)));
			assert.ok(Number.isNaN(powerFloatIterative(1, NaN)));
			assert.ok(Number.isNaN(powerFloatIterative(0, NaN)));
			assert.ok(Number.isNaN(powerFloatIterative(NaN, NaN)));
		});

		it('handles signed zeros according to IEEE-754 / ECMA-262', () => {
			assert.ok(Object.is(powerFloatIterative(0, 3), 0));
			assert.ok(Object.is(powerFloatIterative(0, 2), 0));
			assert.ok(Object.is(powerFloatIterative(0, 0.5), 0));
			assert.ok(Object.is(powerFloatIterative(0, -3), Infinity));
			assert.ok(Object.is(powerFloatIterative(0, -2), Infinity));
			assert.ok(Object.is(powerFloatIterative(0, -0.5), Infinity));

			assert.ok(Object.is(powerFloatIterative(-0, 3), -0));
			assert.ok(Object.is(powerFloatIterative(-0, 2), 0));
			assert.ok(Object.is(powerFloatIterative(-0, 0.5), 0));
			assert.ok(Object.is(powerFloatIterative(-0, -3), -Infinity));
			assert.ok(Object.is(powerFloatIterative(-0, -2), Infinity));
			assert.ok(Object.is(powerFloatIterative(-0, -0.5), Infinity));
		});

		it('handles infinite bases and exponents', () => {
			assert.equal(powerFloatIterative(Infinity, 2), Infinity);
			assert.equal(powerFloatIterative(Infinity, 0.5), Infinity);
			assert.ok(Object.is(powerFloatIterative(Infinity, -2), 0));
			assert.ok(Object.is(powerFloatIterative(Infinity, -0.5), 0));

			assert.equal(powerFloatIterative(-Infinity, 3), -Infinity);
			assert.equal(powerFloatIterative(-Infinity, 2), Infinity);
			assert.equal(powerFloatIterative(-Infinity, 0.5), Infinity);
			assert.ok(Object.is(powerFloatIterative(-Infinity, -3), -0));
			assert.ok(Object.is(powerFloatIterative(-Infinity, -2), 0));
			assert.ok(Object.is(powerFloatIterative(-Infinity, -0.5), 0));

			assert.equal(powerFloatIterative(2, Infinity), Infinity);
			assert.ok(Object.is(powerFloatIterative(0.5, Infinity), 0));
			assert.ok(Number.isNaN(powerFloatIterative(1, Infinity)));
			assert.ok(Number.isNaN(powerFloatIterative(-1, Infinity)));
			assert.equal(powerFloatIterative(-2, Infinity), Infinity);
			assert.ok(Object.is(powerFloatIterative(-0.5, Infinity), 0));

			assert.ok(Object.is(powerFloatIterative(2, -Infinity), 0));
			assert.equal(powerFloatIterative(0.5, -Infinity), Infinity);
			assert.ok(Number.isNaN(powerFloatIterative(1, -Infinity)));
			assert.ok(Number.isNaN(powerFloatIterative(-1, -Infinity)));
			assert.ok(Object.is(powerFloatIterative(-2, -Infinity), 0));
			assert.equal(powerFloatIterative(-0.5, -Infinity), Infinity);
		});

		it('handles overflow, underflow, and subnormals without precision collapse', () => {
			assert.equal(powerFloatIterative(2, 1023), 8.98846567431158e307);
			assert.equal(powerFloatIterative(2, 1024), Infinity);
			assert.equal(powerFloatIterative(-2, 1025), -Infinity);
			assert.equal(powerFloatIterative(2, -1074), Number.MIN_VALUE);
			assert.equal(powerFloatIterative(2, -1075), 0);
			assert.ok(Object.is(powerFloatIterative(-0.5, 1075), -0));
			assert.ok(Object.is(powerFloatIterative(-0.5, 1076), 0));
			assertClose(powerFloatIterative(10, -320), 1e-320, 1e-2);
			assertClose(powerFloatIterative(0.1, -308), 1e308, 1e-13);
			assertClose(powerFloatIterative(Number.MIN_VALUE, 0.5), Math.pow(Number.MIN_VALUE, 0.5), 1e-13);
			assertClose(powerFloatIterative(Number.MAX_VALUE, 0.5), Math.pow(Number.MAX_VALUE, 0.5), 1e-13);
			assert.equal(powerFloatIterative(2, 1e20), Infinity);
			assert.equal(powerFloatIterative(0.5, 1e20), 0);
			assert.equal(powerFloatIterative(10, 400.5), Infinity);
			assert.equal(powerFloatIterative(10, -400.5), 0);
		});
	});

	describe('independent cross-checks', () => {
		it('matches Math.pow across a grid of bases and exponents', () => {
			const bases = [0.001, 0.1, 0.5, 0.999999, 1.000001, 2, Math.E, Math.PI, 10, 1e5, 1e-5];
			const exponents = [-12, -3.5, -1, -0.5, -0.1, 0.1, 0.5, 1, 2.5, 7, 15.25];

			for (const b of bases) {
				for (const e of exponents) {
					const actual = powerFloatIterative(b, e);
					const expected = Math.pow(b, e);
					assertClose(actual, expected, 1e-13);
				}
			}
		});

		it('satisfies algebraic power and root identities', () => {
			// (x^(1/n))^n ≈ x
			for (const x of [0.07, 2, 7.5, 100, 12345.6789]) {
				for (const n of [2, 3, 5, 7]) {
					const root = powerFloatIterative(x, 1 / n);
					const recovered = powerFloatIterative(root, n);
					assertClose(recovered, x, 1e-13);
				}
			}

			// a^(b + c) ≈ a^b * a^c and a^(-b) ≈ 1 / a^b
			const triples = [
				[2.3, 1.4, 2.6],
				[0.7, -1.5, 3.2],
				[5.5, 0.25, 0.75]
			];
			for (const [a, b, c] of triples) {
				const lhs = powerFloatIterative(a, b + c);
				const rhs = powerFloatIterative(a, b) * powerFloatIterative(a, c);
				assertClose(lhs, rhs, 1e-13);

				const inv = powerFloatIterative(a, -b);
				assertClose(inv, 1 / powerFloatIterative(a, b), 1e-13);
			}
		});
	});
});
