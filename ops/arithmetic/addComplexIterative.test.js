import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { addComplexIterative } from './addComplexIterative.js';

describe('addComplexIterative', () => {
	describe('normal cases', () => {
		test('adds two complex numbers', () => {
			assert.deepEqual(
				addComplexIterative({ re: 3, im: 2 }, { re: 1, im: 7 }),
				{ re: 4, im: 9 }
			);
			assert.deepEqual(
				addComplexIterative({ re: -5, im: 4 }, { re: 2, im: -9 }),
				{ re: -3, im: -5 }
			);
		});

		test('adds variadic complex arguments iteratively', () => {
			assert.deepEqual(
				addComplexIterative(
					{ re: 1, im: 2 },
					{ re: 3, im: -1 },
					{ re: -2, im: 5 },
					{ re: 4, im: 0 }
				),
				{ re: 6, im: 6 }
			);
		});

		test('adds an array of complex numbers', () => {
			const values = [
				{ re: 1.5, im: -0.5 },
				{ re: 2.25, im: 1.75 },
				{ re: -0.75, im: 0.25 },
			];
			assert.deepEqual(addComplexIterative(values), { re: 3, im: 1.5 });
		});

		test('handles pure real and pure imaginary operands', () => {
			assert.deepEqual(
				addComplexIterative({ re: 7, im: 0 }, { re: 0, im: -3 }),
				{ re: 7, im: -3 }
			);
		});
	});

	describe('edge cases', () => {
		test('empty array returns additive identity { re: 0, im: 0 }', () => {
			assert.deepEqual(addComplexIterative([]), { re: 0, im: 0 });
		});

		test('single complex number returns an equal fresh object without mutating input', () => {
			const input = { re: 4, im: -6 };
			const result = addComplexIterative(input);
			assert.deepEqual(result, { re: 4, im: -6 });
			assert.notEqual(result, input);
			assert.deepEqual(input, { re: 4, im: -6 });
		});

		test('additive identity and additive inverse', () => {
			const z = { re: -12.5, im: 8.25 };
			const zero = { re: 0, im: 0 };
			const negZ = { re: -z.re, im: -z.im };

			assert.deepEqual(addComplexIterative(z, zero), z);
			assert.deepEqual(addComplexIterative(zero, z), z);
			assert.deepEqual(addComplexIterative(z, negZ), { re: 0, im: 0 });
		});

		test('normalizes negative zero to positive zero', () => {
			const result = addComplexIterative({ re: -0, im: -0 }, { re: -0, im: -0 });
			assert.ok(Object.is(result.re, 0));
			assert.ok(Object.is(result.im, 0));
		});

		test('does not mutate input array or its elements', () => {
			const a = { re: 1, im: 2 };
			const b = { re: 3, im: 4 };
			const list = [a, b];
			const result = addComplexIterative(list);
			assert.deepEqual(result, { re: 4, im: 6 });
			assert.deepEqual(list, [{ re: 1, im: 2 }, { re: 3, im: 4 }]);
			assert.deepEqual(a, { re: 1, im: 2 });
			assert.deepEqual(b, { re: 3, im: 4 });
		});

		test('handles large array of complex numbers iteratively', () => {
			const n = 1000;
			const terms = Array.from({ length: n }, (_, i) => ({ re: i + 1, im: -(i + 1) }));
			const expected = (n * (n + 1)) / 2;
			assert.deepEqual(addComplexIterative(terms), { re: expected, im: -expected });
		});
	});

	describe('input validation', () => {
		test('throws TypeError when called with no arguments', () => {
			assert.throws(() => addComplexIterative(), TypeError);
		});

		test('throws TypeError for non-object or null operands', () => {
			assert.throws(() => addComplexIterative(null), TypeError);
			assert.throws(() => addComplexIterative(undefined), TypeError);
			assert.throws(() => addComplexIterative(5, { re: 1, im: 2 }), TypeError);
			assert.throws(() => addComplexIterative({ re: 1, im: 2 }, '3+4i'), TypeError);
			assert.throws(() => addComplexIterative([{ re: 1, im: 2 }, null]), TypeError);
		});

		test('throws TypeError for nested arrays or mixed array + object arguments', () => {
			assert.throws(() => addComplexIterative([[{ re: 1, im: 2 }]]), TypeError);
			assert.throws(() => addComplexIterative([{ re: 1, im: 2 }], { re: 3, im: 4 }), TypeError);
		});

		test('throws TypeError for missing or non-numeric re/im properties', () => {
			assert.throws(() => addComplexIterative({ re: 1 }), TypeError);
			assert.throws(() => addComplexIterative({ im: 2 }), TypeError);
			assert.throws(() => addComplexIterative({ re: '1', im: 2 }), TypeError);
			assert.throws(() => addComplexIterative({ re: 1, im: true }), TypeError);
			assert.throws(() => addComplexIterative({ re: 1n, im: 2 }), TypeError);
		});

		test('throws TypeError for sparse arrays', () => {
			const sparse = new Array(2);
			sparse[0] = { re: 1, im: 2 };
			assert.throws(() => addComplexIterative(sparse), TypeError);
		});

		test('throws RangeError for NaN or non-finite components', () => {
			assert.throws(() => addComplexIterative({ re: Number.NaN, im: 0 }), RangeError);
			assert.throws(() => addComplexIterative({ re: 0, im: Number.NaN }), RangeError);
			assert.throws(() => addComplexIterative({ re: Infinity, im: 1 }), RangeError);
			assert.throws(() => addComplexIterative({ re: 1, im: -Infinity }), RangeError);
		});

		test('throws RangeError when sum overflows finite floating-point range', () => {
			assert.throws(
				() => addComplexIterative({ re: Number.MAX_VALUE, im: 0 }, { re: Number.MAX_VALUE, im: 0 }),
				RangeError
			);
			assert.throws(
				() => addComplexIterative({ re: 0, im: -Number.MAX_VALUE }, { re: 0, im: -Number.MAX_VALUE }),
				RangeError
			);
		});
	});

	describe('mathematical cross-checks', () => {
		test('commutativity and associativity over integer complex numbers', () => {
			const a = { re: 7, im: -3 };
			const b = { re: -11, im: 5 };
			const c = { re: 4, im: 9 };

			// Commutativity: a + b = b + a
			assert.deepEqual(addComplexIterative(a, b), addComplexIterative(b, a));

			// Associativity: (a + b) + c = a + (b + c) = addComplexIterative(a, b, c)
			const left = addComplexIterative(addComplexIterative(a, b), c);
			const right = addComplexIterative(a, addComplexIterative(b, c));
			const direct = addComplexIterative(a, b, c);
			assert.deepEqual(left, right);
			assert.deepEqual(left, direct);
		});

		test('roots of unity sum to zero (independent trigonometric/polar cross-check)', () => {
			for (const n of [3, 5, 6, 8, 12]) {
				const roots = Array.from({ length: n }, (_, k) => {
					const angle = (2 * Math.PI * k) / n;
					return { re: Math.cos(angle), im: Math.sin(angle) };
				});
				const sum = addComplexIterative(roots);
				assert.ok(Math.abs(sum.re) < 1e-12, `Expected real part ~0 for n=${n}, got ${sum.re}`);
				assert.ok(Math.abs(sum.im) < 1e-12, `Expected imag part ~0 for n=${n}, got ${sum.im}`);
			}
		});

		test('conjugate linearity: conj(z1 + z2) === conj(z1) + conj(z2) and z + conj(z) = 2*Re(z)', () => {
			const conj = (z) => ({ re: z.re, im: -z.im });
			const z1 = { re: 3.5, im: -2.25 };
			const z2 = { re: -1.75, im: 6.5 };

			assert.deepEqual(
				conj(addComplexIterative(z1, z2)),
				addComplexIterative(conj(z1), conj(z2))
			);
			assert.deepEqual(
				addComplexIterative(z1, conj(z1)),
				{ re: 2 * z1.re, im: 0 }
			);
		});

		test('polar-to-rectangular vector sum matches law of cosines magnitude', () => {
			const r1 = 5;
			const theta1 = Math.PI / 6; // 30 deg
			const r2 = 8;
			const theta2 = (2 * Math.PI) / 3; // 120 deg

			const z1 = { re: r1 * Math.cos(theta1), im: r1 * Math.sin(theta1) };
			const z2 = { re: r2 * Math.cos(theta2), im: r2 * Math.sin(theta2) };

			const sum = addComplexIterative(z1, z2);
			const sumMagSq = sum.re * sum.re + sum.im * sum.im;
			// Independent formula: |z1 + z2|^2 = r1^2 + r2^2 + 2*r1*r2*cos(theta1 - theta2)
			const expectedMagSq = r1 * r1 + r2 * r2 + 2 * r1 * r2 * Math.cos(theta1 - theta2);

			assert.ok(
				Math.abs(sumMagSq - expectedMagSq) < 1e-12,
				`Expected |z1+z2|^2 ≈ ${expectedMagSq}, got ${sumMagSq}`
			);
		});
	});
});
