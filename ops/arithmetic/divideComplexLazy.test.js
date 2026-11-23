import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { divideComplexLazy } from './divideComplexLazy.js';

/**
 * Helper to assert two complex numbers are close within a tolerance.
 *
 * @param {{ re: number, im: number }} actual
 * @param {{ re: number, im: number }} expected
 * @param {number} [eps=1e-12]
 */
function assertComplexClose(actual, expected, eps = 1e-12) {
	const scaleRe = Math.max(1, Math.abs(expected.re));
	const scaleIm = Math.max(1, Math.abs(expected.im));
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps * scaleRe,
		`re mismatch: got ${actual.re}, expected ${expected.re}`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps * scaleIm,
		`im mismatch: got ${actual.im}, expected ${expected.im}`
	);
}

/**
 * Independent complex multiplication for cross-checking quotients.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function multiplyComplex(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

/**
 * Independent polar-form complex division using hypot, atan2, cos, sin.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function divideComplexPolar(a, b) {
	const r = Math.hypot(a.re, a.im) / Math.hypot(b.re, b.im);
	const theta = Math.atan2(a.im, a.re) - Math.atan2(b.im, b.re);
	return {
		re: r * Math.cos(theta),
		im: r * Math.sin(theta),
	};
}

describe('divideComplexLazy', () => {
	describe('normal cases', () => {
		it('divides two sequences of complex numbers element-wise', () => {
			const nums = [
				{ re: 4, im: 2 },
				{ re: 1, im: 0 },
				{ re: -3, im: 4 },
				{ re: 5, im: -5 },
			];
			const dens = [
				{ re: 1, im: 1 },
				{ re: 0, im: 1 },
				{ re: 1, im: -2 },
				{ re: 2, im: 1 },
			];

			const results = [...divideComplexLazy(nums, dens)];
			assert.equal(results.length, 4);
			assert.deepStrictEqual(results[0], { re: 3, im: -1 });
			assert.deepStrictEqual(results[1], { re: 0, im: -1 });
			assertComplexClose(results[2], { re: -2.2, im: -0.4 });
			assertComplexClose(results[3], { re: 1, im: -3 });
		});

		it('supports broadcasting a scalar divisor across an iterable', () => {
			const nums = [
				{ re: 2, im: 4 },
				{ re: -6, im: 8 },
				{ re: 0, im: 0 },
			];
			const results = [...divideComplexLazy(nums, { re: 2, im: 0 })];
			assert.deepStrictEqual(results, [
				{ re: 1, im: 2 },
				{ re: -3, im: 4 },
				{ re: 0, im: 0 },
			]);
		});

		it('supports broadcasting a scalar dividend across an iterable', () => {
			const dens = [
				{ re: 1, im: 0 },
				{ re: 0, im: 1 },
				{ re: 1, im: 1 },
			];
			const results = [...divideComplexLazy({ re: 1, im: 0 }, dens)];
			assert.equal(results.length, 3);
			assert.deepStrictEqual(results[0], { re: 1, im: 0 });
			assert.deepStrictEqual(results[1], { re: 0, im: -1 });
			assertComplexClose(results[2], { re: 0.5, im: -0.5 });
		});

		it('supports two scalar complex numbers and yields a single quotient', () => {
			const gen = divideComplexLazy({ re: 3, im: 2 }, { re: 1, im: -1 });
			const results = [...gen];
			assert.equal(results.length, 1);
			assertComplexClose(results[0], { re: 0.5, im: 2.5 });
		});

		it('accepts arbitrary iterables such as Sets and custom iterables', () => {
			const numSet = new Set([
				{ re: 6, im: 0 },
				{ re: 0, im: 8 },
			]);
			const customDen = {
				*[Symbol.iterator]() {
					yield { re: 3, im: 0 };
					yield { re: 0, im: 2 };
				},
			};
			assert.deepStrictEqual([...divideComplexLazy(numSet, customDen)], [
				{ re: 2, im: 0 },
				{ re: 4, im: 0 },
			]);
		});
	});

	describe('edge cases', () => {
		it('handles empty iterables cleanly', () => {
			assert.deepStrictEqual([...divideComplexLazy([], [])], []);
			assert.deepStrictEqual([...divideComplexLazy([], [{ re: 1, im: 1 }])], []);
			assert.deepStrictEqual([...divideComplexLazy([{ re: 1, im: 1 }], [])], []);
			assert.deepStrictEqual([...divideComplexLazy([], { re: 1, im: 0 })], []);
			assert.deepStrictEqual([...divideComplexLazy({ re: 1, im: 0 }, [])], []);
		});

		it('stops at the shorter sequence when lengths differ', () => {
			const nums = [
				{ re: 2, im: 0 },
				{ re: 4, im: 0 },
				{ re: 6, im: 0 },
			];
			const dens = [{ re: 2, im: 0 }];
			assert.deepStrictEqual([...divideComplexLazy(nums, dens)], [{ re: 1, im: 0 }]);

			const shortNums = [{ re: 9, im: 0 }];
			const longDens = [
				{ re: 3, im: 0 },
				{ re: 1, im: 0 },
			];
			assert.deepStrictEqual([...divideComplexLazy(shortNums, longDens)], [{ re: 3, im: 0 }]);
		});

		it('normalizes -0 components to +0', () => {
			const [res] = [...divideComplexLazy({ re: 0, im: 0 }, { re: -1, im: 0 })];
			assert.ok(Object.is(res.re, 0));
			assert.ok(Object.is(res.im, 0));

			const [res2] = [...divideComplexLazy({ re: 0, im: 1 }, { re: 0, im: -1 })];
			assert.ok(Object.is(res2.re, -1));
			assert.ok(Object.is(res2.im, 0));
		});

		it('avoids intermediate overflow and underflow for extreme magnitudes (Smith algorithm)', () => {
			const huge = { re: 1e200, im: 1e200 };
			const [qHuge] = [...divideComplexLazy(huge, huge)];
			assertComplexClose(qHuge, { re: 1, im: 0 });

			const hugeImDominant = { re: 3e200, im: 4e200 };
			const [qHugeIm] = [...divideComplexLazy({ re: 6e200, im: 8e200 }, hugeImDominant)];
			assertComplexClose(qHugeIm, { re: 2, im: 0 });

			const tiny = { re: 1e-200, im: -1e-200 };
			const [qTiny] = [...divideComplexLazy(tiny, tiny)];
			assertComplexClose(qTiny, { re: 1, im: 0 });

			const tinyImDominant = { re: 1e-200, im: 2e-200 };
			const [qTinyIm] = [...divideComplexLazy({ re: -2e-200, im: 1e-200 }, tinyImDominant)];
			assertComplexClose(qTinyIm, { re: 0, im: 1 });
		});

		it('throws RangeError eagerly for a scalar zero divisor', () => {
			assert.throws(() => divideComplexLazy({ re: 1, im: 0 }, { re: 0, im: 0 }), RangeError);
			assert.throws(() => divideComplexLazy([], { re: 0, im: 0 }), RangeError);
		});

		it('throws RangeError lazily when a sequence encounters a zero divisor', () => {
			const nums = [
				{ re: 2, im: 0 },
				{ re: 4, im: 0 },
				{ re: 6, im: 0 },
			];
			const dens = [
				{ re: 1, im: 0 },
				{ re: 0, im: 0 },
				{ re: 2, im: 0 },
			];

			const gen = divideComplexLazy(nums, dens);
			assert.deepStrictEqual(gen.next(), { value: { re: 2, im: 0 }, done: false });
			assert.throws(() => gen.next(), RangeError);
		});

		it('validates invalid arguments and malformed complex elements', () => {
			assert.throws(() => divideComplexLazy(), TypeError);
			assert.throws(() => divideComplexLazy({ re: 1, im: 0 }), TypeError);
			assert.throws(() => divideComplexLazy(null, { re: 1, im: 0 }), TypeError);
			assert.throws(() => divideComplexLazy({ re: 1, im: 0 }, undefined), TypeError);
			assert.throws(() => divideComplexLazy('1+2i', { re: 1, im: 0 }), TypeError);
			assert.throws(() => divideComplexLazy({ re: 1, im: 0 }, '1+2i'), TypeError);
			assert.throws(() => divideComplexLazy(42, { re: 1, im: 0 }), TypeError);
			assert.throws(() => divideComplexLazy({ re: NaN, im: 0 }, { re: 1, im: 0 }), TypeError);
			assert.throws(() => divideComplexLazy({ re: 1, im: Infinity }, { re: 1, im: 0 }), TypeError);
			assert.throws(() => divideComplexLazy({ re: 1 }, { re: 1, im: 0 }), TypeError);
			assert.throws(() => divideComplexLazy({ re: 1, im: 0 }, { re: 1, im: '0' }), TypeError);

			// Invalid element inside sequence throws lazily when consumed
			const gen = divideComplexLazy(
				[{ re: 2, im: 0 }, { re: 1, im: Number.NaN }],
				[{ re: 1, im: 0 }, { re: 1, im: 0 }]
			);
			assert.deepStrictEqual(gen.next().value, { re: 2, im: 0 });
			assert.throws(() => gen.next(), TypeError);
		});
	});

	describe('lazy consumption verification', () => {
		it('does not pull any items before iteration begins and pulls strictly on demand from infinite generators', () => {
			let pullsA = 0;
			let pullsB = 0;
			let closedA = false;
			let closedB = false;

			function* infiniteNums() {
				try {
					let k = 1;
					while (true) {
						pullsA += 1;
						yield { re: k * 2, im: k * 4 };
						k += 1;
					}
				} finally {
					closedA = true;
				}
			}

			function* infiniteDens() {
				try {
					let k = 1;
					while (true) {
						pullsB += 1;
						yield { re: k, im: 0 };
						k += 1;
					}
				} finally {
					closedB = true;
				}
			}

			const gen = divideComplexLazy(infiniteNums(), infiniteDens());
			assert.equal(pullsA, 0);
			assert.equal(pullsB, 0);

			for (let i = 1; i <= 5; i += 1) {
				const step = gen.next();
				assert.equal(step.done, false);
				assert.deepStrictEqual(step.value, { re: 2, im: 4 });
				assert.equal(pullsA, i);
				assert.equal(pullsB, i);
			}

			assert.equal(closedA, false);
			assert.equal(closedB, false);

			gen.return();
			assert.equal(pullsA, 5);
			assert.equal(pullsB, 5);
			assert.equal(closedA, true);
			assert.equal(closedB, true);
		});

		it('does not pull from denominator iterable if numerator iterable is already empty', () => {
			let pullsB = 0;
			function* trackedDens() {
				pullsB += 1;
				yield { re: 1, im: 0 };
			}

			assert.deepStrictEqual([...divideComplexLazy([], trackedDens())], []);
			assert.equal(pullsB, 0);
		});

		it('closes the remaining longer iterator when the shorter one finishes', () => {
			let closedA = false;
			function* longNums() {
				try {
					yield { re: 4, im: 0 };
					yield { re: 8, im: 0 };
					yield { re: 12, im: 0 };
				} finally {
					closedA = true;
				}
			}

			const results = [...divideComplexLazy(longNums(), [{ re: 2, im: 0 }])];
			assert.deepStrictEqual(results, [{ re: 2, im: 0 }]);
			assert.equal(closedA, true);
		});
	});

	describe('independent cross-checks', () => {
		const testPairs = [
			[{ re: 3, im: 4 }, { re: 1, im: 2 }],
			[{ re: -5, im: 7 }, { re: 3, im: -4 }],
			[{ re: -2.5, im: -6.25 }, { re: -1.5, im: 0.75 }],
			[{ re: 11.3, im: -0.4 }, { re: -0.2, im: -8.9 }],
			[{ re: 0.001, im: 0.002 }, { re: 1000, im: -500 }],
			[{ re: 12345.6, im: -9876.5 }, { re: 0.123, im: 45.67 }],
		];

		it('satisfies multiplicative inverse identity (a / b) * b === a', () => {
			const nums = testPairs.map(([a]) => a);
			const dens = testPairs.map(([, b]) => b);
			const quotients = [...divideComplexLazy(nums, dens)];

			for (let i = 0; i < testPairs.length; i += 1) {
				const reconstructed = multiplyComplex(quotients[i], dens[i]);
				assertComplexClose(reconstructed, nums[i], 1e-11);
			}
		});

		it('matches independent polar-coordinate division (r1/r2, theta1 - theta2)', () => {
			const nums = testPairs.map(([a]) => a);
			const dens = testPairs.map(([, b]) => b);
			const quotients = [...divideComplexLazy(nums, dens)];

			for (let i = 0; i < testPairs.length; i += 1) {
				const expectedPolar = divideComplexPolar(nums[i], dens[i]);
				assertComplexClose(quotients[i], expectedPolar, 1e-11);
			}
		});
	});
});
