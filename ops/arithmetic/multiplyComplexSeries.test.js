import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { multiplyComplexSeries } from './multiplyComplexSeries.js';

function standardMultiply(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

function modulus(z) {
	return Math.hypot(z.re, z.im);
}

function normalizeAngle(theta) {
	let wrapped = (theta + Math.PI) % (2 * Math.PI);
	if (wrapped < 0) {
		wrapped += 2 * Math.PI;
	}
	return wrapped - Math.PI;
}

function assertComplexClose(actual, expected, tol = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`real mismatch: got ${actual.re}, expected ${expected.re} (tol=${tol})`,
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`imag mismatch: got ${actual.im}, expected ${expected.im} (tol=${tol})`,
	);
}

describe('multiplyComplexSeries', () => {
	describe('basic and quadrant cases', () => {
		it('multiplies integer complex numbers exactly', () => {
			assert.deepStrictEqual(
				multiplyComplexSeries({ re: 3, im: 4 }, { re: 1, im: 2 }),
				{ re: -5, im: 10 },
			);
			assert.deepStrictEqual(
				multiplyComplexSeries({ re: -2, im: 5 }, { re: 4, im: -3 }),
				{ re: 7, im: 26 },
			);
			assert.deepStrictEqual(
				multiplyComplexSeries({ re: -6, im: -7 }, { re: -3, im: -2 }),
				{ re: 4, im: 33 },
			);
		});

		it('satisfies imaginary unit and real-axis identities', () => {
			const one = { re: 1, im: 0 };
			const i = { re: 0, im: 1 };
			const negI = { re: 0, im: -1 };

			assert.deepStrictEqual(multiplyComplexSeries(i, i), { re: -1, im: 0 });
			assert.deepStrictEqual(multiplyComplexSeries(negI, i), one);
			assert.deepStrictEqual(multiplyComplexSeries(one, i), i);
			assert.deepStrictEqual(
				multiplyComplexSeries({ re: 5, im: 0 }, { re: -3, im: 0 }),
				{ re: -15, im: 0 },
			);
		});

		it('produces real squared modulus when multiplying by conjugate', () => {
			const z = { re: 7, im: -24 };
			const conj = { re: 7, im: 24 };
			assert.deepStrictEqual(multiplyComplexSeries(z, conj), { re: 625, im: 0 });
		});

		it('does not mutate input objects', () => {
			const a = Object.freeze({ re: 2.5, im: -1.25 });
			const b = Object.freeze({ re: -4, im: 3.5 });
			const res = multiplyComplexSeries(a, b);
			assert.deepStrictEqual(res, standardMultiply(a, b));
		});
	});

	describe('edge cases and scaling stability', () => {
		it('handles zeros and normalizes -0 to +0', () => {
			const zero = { re: 0, im: 0 };
			const negZero = { re: -0, im: -0 };
			const z = { re: -3, im: 4 };

			for (const res of [
				multiplyComplexSeries(zero, z),
				multiplyComplexSeries(z, zero),
				multiplyComplexSeries(negZero, z),
				multiplyComplexSeries({ re: -1, im: 0 }, { re: 0, im: 0 }),
				multiplyComplexSeries({ re: 0, im: -1 }, { re: 0, im: 1 }),
			]) {
				assert.ok(!Object.is(res.re, -0), 'real part should not be -0');
				assert.ok(!Object.is(res.im, -0), 'imag part should not be -0');
			}

			assert.deepStrictEqual(multiplyComplexSeries(zero, z), { re: 0, im: 0 });
			assert.deepStrictEqual(multiplyComplexSeries(z, zero), { re: 0, im: 0 });
			assert.deepStrictEqual(multiplyComplexSeries(negZero, negZero), { re: 0, im: 0 });
		});

		it('avoids spurious overflow when multiplying huge and tiny operands', () => {
			const huge = { re: 1e308, im: 1e308 };
			const tiny = { re: 1e-308, im: 0 };
			const res = multiplyComplexSeries(huge, tiny);
			assertComplexClose(res, { re: 1, im: 1 }, 1e-15);

			const huge2 = { re: 3e250, im: -4e250 };
			const tiny2 = { re: 1e-250, im: 2e-250 };
			assertComplexClose(multiplyComplexSeries(huge2, tiny2), { re: 11, im: 2 }, 1e-13);
		});

		it('handles subnormal operands accurately via power-of-two scaling', () => {
			const sub = { re: 5e-324, im: 0 };
			const big = { re: 2 ** 1000, im: 0 };
			const res = multiplyComplexSeries(sub, big);
			assert.equal(res.re, 2 ** -74);
			assert.equal(res.im, 0);
		});

		it('handles true overflow without spurious NaN in zero component', () => {
			const res = multiplyComplexSeries({ re: 1e200, im: 0 }, { re: 1e200, im: 0 });
			assert.equal(res.re, Infinity);
			assert.equal(res.im, 0);
		});

		it('handles true underflow cleanly', () => {
			const res = multiplyComplexSeries({ re: 1e-300, im: 0 }, { re: 1e-300, im: 0 });
			assert.deepStrictEqual(res, { re: 0, im: 0 });
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-object or malformed operands', () => {
			const valid = { re: 1, im: 2 };
			const badValues = [
				null,
				undefined,
				42,
				'1+2i',
				true,
				[1, 2],
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 2 },
				{ re: 1, im: '2' },
				{ re: 1n, im: 2n },
				{ re: null, im: 0 },
			];

			for (const bad of badValues) {
				assert.throws(() => multiplyComplexSeries(bad, valid), TypeError);
				assert.throws(() => multiplyComplexSeries(valid, bad), TypeError);
			}
		});

		it('throws RangeError for NaN or Infinite components', () => {
			const valid = { re: 1, im: 2 };
			const nonFinite = [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 1 },
				{ re: 1, im: -Infinity },
				{ re: -Infinity, im: Infinity },
			];

			for (const bad of nonFinite) {
				assert.throws(() => multiplyComplexSeries(bad, valid), RangeError);
				assert.throws(() => multiplyComplexSeries(valid, bad), RangeError);
			}
		});
	});

	describe('cross-checks and algebraic identities', () => {
		it('matches the standard 4-multiplication formula across deterministic samples', () => {
			// Deterministic LCG for reproducible floating-point samples across all quadrants
			let seed = 0x12345678;
			const nextFloat = () => {
				seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
				return (seed / 0x100000000) * 200 - 100;
			};

			for (let idx = 0; idx < 200; idx++) {
				const a = { re: nextFloat(), im: nextFloat() };
				const b = { re: nextFloat(), im: nextFloat() };
				const got = multiplyComplexSeries(a, b);
				const ref = standardMultiply(a, b);
				const scale = modulus(a) * modulus(b);
				const tol = 1e-13 * Math.max(1, scale);
				assertComplexClose(got, ref, tol);
			}
		});

		it('satisfies Euler polar form, modulus |z1*z2| = |z1||z2|, and argument sum identities', () => {
			const pairs = [
				[{ re: 3, im: 4 }, { re: 5, im: 12 }],
				[{ re: -2.5, im: 7.25 }, { re: 4.1, im: -1.9 }],
				[{ re: -8, im: -15 }, { re: -7, im: 24 }],
				[{ re: Math.cos(Math.PI / 3), im: Math.sin(Math.PI / 3) }, { re: Math.cos((2 * Math.PI) / 3), im: Math.sin((2 * Math.PI) / 3) }],
				[{ re: 0.75, im: -1.5 }, { re: -3.2, im: -0.4 }],
			];

			for (const [z1, z2] of pairs) {
				const prod = multiplyComplexSeries(z1, z2);
				const r1 = modulus(z1);
				const r2 = modulus(z2);
				const rProd = modulus(prod);
				const theta1 = Math.atan2(z1.im, z1.re);
				const theta2 = Math.atan2(z2.im, z2.re);
				const thetaSum = theta1 + theta2;

				// Modulus identity: |z1 * z2| = |z1| * |z2|
				assert.ok(
					Math.abs(rProd - r1 * r2) <= 1e-12 * Math.max(1, r1 * r2),
					`modulus mismatch: |z1*z2|=${rProd}, |z1||z2|=${r1 * r2}`,
				);

				// Argument identity: arg(z1 * z2) == arg(z1) + arg(z2) (mod 2*pi)
				const argDiff = Math.abs(normalizeAngle(Math.atan2(prod.im, prod.re) - thetaSum));
				assert.ok(argDiff <= 1e-12, `argument mismatch: diff=${argDiff}`);

				// Euler polar cross-check: r1*r2 * (cos(theta1+theta2) + i*sin(theta1+theta2))
				const euler = {
					re: r1 * r2 * Math.cos(thetaSum),
					im: r1 * r2 * Math.sin(thetaSum),
				};
				assertComplexClose(prod, euler, 1e-12 * Math.max(1, r1 * r2));
			}
		});

		it('satisfies commutativity, associativity, distributivity, and multiplicative inverse', () => {
			const a = { re: 3.5, im: -2.25 };
			const b = { re: -1.75, im: 4.5 };
			const c = { re: 2.125, im: 0.875 };

			// Commutativity: a * b = b * a
			assertComplexClose(multiplyComplexSeries(a, b), multiplyComplexSeries(b, a), 1e-14);

			// Associativity: (a * b) * c = a * (b * c)
			const leftAssoc = multiplyComplexSeries(multiplyComplexSeries(a, b), c);
			const rightAssoc = multiplyComplexSeries(a, multiplyComplexSeries(b, c));
			assertComplexClose(leftAssoc, rightAssoc, 1e-13);

			// Distributivity: a * (b + c) = a * b + a * c
			const bPlusC = { re: b.re + c.re, im: b.im + c.im };
			const lhs = multiplyComplexSeries(a, bPlusC);
			const ab = multiplyComplexSeries(a, b);
			const ac = multiplyComplexSeries(a, c);
			const rhs = { re: ab.re + ac.re, im: ab.im + ac.im };
			assertComplexClose(lhs, rhs, 1e-13);

			// Multiplicative inverse: z * (conj(z) / |z|^2) = 1 + 0i
			const normSq = a.re * a.re + a.im * a.im;
			const invA = { re: a.re / normSq, im: -a.im / normSq };
			assertComplexClose(multiplyComplexSeries(a, invA), { re: 1, im: 0 }, 1e-14);
		});
	});
});
