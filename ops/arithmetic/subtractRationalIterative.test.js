import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { subtractRationalIterative } from './subtractRationalIterative.js';

/**
 * Independent recursive Euclidean GCD used solely for test cross-checking.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function referenceGcd(a, b) {
	const x = a < 0n ? -a : a;
	const y = b < 0n ? -b : b;
	return y === 0n ? x : referenceGcd(y, x % y);
}

/**
 * Independent reference subtraction using direct cross-multiplication and
 * recursive GCD reduction.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function referenceSubtract(a, b) {
	let num = a.num * b.den - b.num * a.den;
	let den = a.den * b.den;
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	const g = referenceGcd(num, den);
	return { num: num / g, den: den / g };
}

describe('subtractRationalIterative', () => {
	describe('normal cases', () => {
		it('subtracts rationals with identical denominators', () => {
			assert.deepEqual(
				subtractRationalIterative({ num: 5n, den: 7n }, { num: 2n, den: 7n }),
				{ num: 3n, den: 7n },
			);
			assert.deepEqual(
				subtractRationalIterative({ num: 5n, den: 6n }, { num: 1n, den: 6n }),
				{ num: 2n, den: 3n },
			);
		});

		it('subtracts rationals with coprime denominators', () => {
			assert.deepEqual(
				subtractRationalIterative({ num: 1n, den: 2n }, { num: 1n, den: 3n }),
				{ num: 1n, den: 6n },
			);
			assert.deepEqual(
				subtractRationalIterative({ num: 1n, den: 3n }, { num: 1n, den: 2n }),
				{ num: -1n, den: 6n },
			);
		});

		it('subtracts rationals whose denominators share a common factor', () => {
			assert.deepEqual(
				subtractRationalIterative({ num: 5n, den: 12n }, { num: 1n, den: 8n }),
				{ num: 7n, den: 24n },
			);
			assert.deepEqual(
				subtractRationalIterative({ num: 7n, den: 15n }, { num: 2n, den: 10n }),
				{ num: 4n, den: 15n },
			);
		});

		it('handles negative numerators in all sign combinations', () => {
			assert.deepEqual(
				subtractRationalIterative({ num: -1n, den: 2n }, { num: 1n, den: 3n }),
				{ num: -5n, den: 6n },
			);
			assert.deepEqual(
				subtractRationalIterative({ num: 1n, den: 2n }, { num: -1n, den: 3n }),
				{ num: 5n, den: 6n },
			);
			assert.deepEqual(
				subtractRationalIterative({ num: -1n, den: 2n }, { num: -1n, den: 3n }),
				{ num: -1n, den: 6n },
			);
		});

		it('subtracts integer-valued rationals', () => {
			assert.deepEqual(
				subtractRationalIterative({ num: 10n, den: 1n }, { num: 3n, den: 1n }),
				{ num: 7n, den: 1n },
			);
			assert.deepEqual(
				subtractRationalIterative({ num: 9n, den: 3n }, { num: 10n, den: 2n }),
				{ num: -2n, den: 1n },
			);
		});
	});

	describe('edge cases', () => {
		it('normalizes zero differences to { num: 0n, den: 1n }', () => {
			assert.deepEqual(
				subtractRationalIterative({ num: 3n, den: 5n }, { num: 3n, den: 5n }),
				{ num: 0n, den: 1n },
			);
			assert.deepEqual(
				subtractRationalIterative({ num: 2n, den: 4n }, { num: 3n, den: 6n }),
				{ num: 0n, den: 1n },
			);
			assert.deepEqual(
				subtractRationalIterative({ num: 0n, den: 9n }, { num: 0n, den: -7n }),
				{ num: 0n, den: 1n },
			);
		});

		it('handles zero as minuend or subtrahend', () => {
			assert.deepEqual(
				subtractRationalIterative({ num: 0n, den: 5n }, { num: 6n, den: 8n }),
				{ num: -3n, den: 4n },
			);
			assert.deepEqual(
				subtractRationalIterative({ num: 6n, den: 8n }, { num: 0n, den: 13n }),
				{ num: 3n, den: 4n },
			);
		});

		it('handles negative denominators and unreduced inputs', () => {
			assert.deepEqual(
				subtractRationalIterative({ num: 1n, den: -2n }, { num: 1n, den: -3n }),
				{ num: -1n, den: 6n },
			);
			assert.deepEqual(
				subtractRationalIterative({ num: -6n, den: -9n }, { num: 4n, den: 12n }),
				{ num: 1n, den: 3n },
			);
			assert.deepEqual(
				subtractRationalIterative({ num: 1n, den: -2n }, { num: -2n, den: 4n }),
				{ num: 0n, den: 1n },
			);
		});

		it('handles very large BigInts and worst-case Fibonacci denominators', () => {
			// Generate F_200 and F_201 (large coprime Fibonacci numbers)
			let fPrev = 1n;
			let fCurr = 1n;
			for (let i = 2; i <= 200; i += 1) {
				const next = fPrev + fCurr;
				fPrev = fCurr;
				fCurr = next;
			}
			// By Cassini's identity, F_n^2 - F_{n-1}*F_{n+1} = (-1)^{n+1},
			// so F_200 / F_201 - F_199 / F_200 = (F_200^2 - F_199*F_201) / (F_201 * F_200)
			const f199 = fCurr - fPrev;
			const f200 = fPrev;
			const f201 = fCurr;
			const expectedNum = f200 * f200 - f199 * f201;
			assert.equal(expectedNum === 1n || expectedNum === -1n, true);

			const result = subtractRationalIterative(
				{ num: f200, den: f201 },
				{ num: f199, den: f200 },
			);
			assert.deepEqual(result, { num: expectedNum, den: f201 * f200 });

			const huge = 10n ** 60n;
			assert.deepEqual(
				subtractRationalIterative({ num: 3n * huge, den: 6n * huge }, { num: huge, den: 3n * huge }),
				{ num: 1n, den: 6n },
			);
		});

		it('does not mutate input objects', () => {
			const a = Object.freeze({ num: 2n, den: -4n });
			const b = Object.freeze({ num: -3n, den: 9n });
			const res = subtractRationalIterative(a, b);
			assert.deepEqual(res, { num: -1n, den: 6n });
			assert.deepEqual(a, { num: 2n, den: -4n });
			assert.deepEqual(b, { num: -3n, den: 9n });
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError for missing, null, primitive, or array arguments', () => {
			const valid = { num: 1n, den: 2n };
			const badValues = [undefined, null, 42, 42n, '1/2', true, [], [1n, 2n]];
			for (const bad of badValues) {
				assert.throws(() => subtractRationalIterative(bad, valid), TypeError);
				assert.throws(() => subtractRationalIterative(valid, bad), TypeError);
			}
		});

		it('throws TypeError when num or den is not a BigInt', () => {
			const valid = { num: 1n, den: 2n };
			const badRationals = [
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: '1', den: 2n },
				{ num: 1n, den: '2' },
				{ num: null, den: 2n },
				{ num: 1n, den: undefined },
				{ num: NaN, den: 2n },
				{},
			];
			for (const bad of badRationals) {
				assert.throws(() => subtractRationalIterative(bad, valid), TypeError);
				assert.throws(() => subtractRationalIterative(valid, bad), TypeError);
			}
		});

		it('throws RangeError when either denominator is 0n', () => {
			const valid = { num: 1n, den: 2n };
			assert.throws(() => subtractRationalIterative({ num: 1n, den: 0n }, valid), RangeError);
			assert.throws(() => subtractRationalIterative({ num: 0n, den: 0n }, valid), RangeError);
			assert.throws(() => subtractRationalIterative(valid, { num: 1n, den: 0n }), RangeError);
			assert.throws(() => subtractRationalIterative(valid, { num: 0n, den: 0n }), RangeError);
		});
	});

	describe('independent cross-checks', () => {
		it('matches independent reference implementation, algebraic laws, and floating-point values across a deterministic suite', () => {
			// Deterministic linear congruential generator for reproducible test pairs
			let seed = 0x12345678n;
			const nextBigInt = (min, max) => {
				seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
				const span = max - min + 1n;
				return min + (seed % span);
			};

			for (let i = 0; i < 200; i += 1) {
				const aNum = nextBigInt(-500n, 500n);
				let aDen = nextBigInt(-500n, 500n);
				if (aDen === 0n) aDen = 1n;

				const bNum = nextBigInt(-500n, 500n);
				let bDen = nextBigInt(-500n, 500n);
				if (bDen === 0n) bDen = -1n;

				const a = { num: aNum, den: aDen };
				const b = { num: bNum, den: bDen };

				const actual = subtractRationalIterative(a, b);
				const expected = referenceSubtract(a, b);

				// 1. Exact match with independent recursive reference
				assert.deepEqual(actual, expected);

				// 2. Canonical lowest-terms invariants
				assert.equal(actual.den > 0n, true);
				assert.equal(referenceGcd(actual.num, actual.den), 1n);
				if (actual.num === 0n) {
					assert.equal(actual.den, 1n);
				}

				// 3. Exact cross-product verification: actual == a - b
				assert.equal(
					actual.num * a.den * b.den,
					(a.num * b.den - b.num * a.den) * actual.den,
				);

				// 4. Anticommutativity: (b - a) == -(a - b)
				const reversed = subtractRationalIterative(b, a);
				assert.deepEqual(reversed, { num: -actual.num, den: actual.den });

				// 5. Floating-point cross-check
				const actualFloat = Number(actual.num) / Number(actual.den);
				const expectedFloat = Number(a.num) / Number(a.den) - Number(b.num) / Number(b.den);
				assert.ok(
					Math.abs(actualFloat - expectedFloat) < 1e-11,
					`Float mismatch for (${a.num}/${a.den}) - (${b.num}/${b.den}): ${actualFloat} vs ${expectedFloat}`,
				);
			}
		});
	});
});
