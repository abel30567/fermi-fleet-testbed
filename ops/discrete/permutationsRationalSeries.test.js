import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { permutationsRationalSeries } from './permutationsRationalSeries.js';

function absBigInt(n) {
	return n < 0n ? -n : n;
}

function gcdBigInt(a, b) {
	let x = absBigInt(a);
	let y = absBigInt(b);
	while (y !== 0n) {
		const r = x % y;
		x = y;
		y = r;
	}
	return x;
}

function reduceRational(num, den) {
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const g = gcdBigInt(n, d);
	return { num: n / g, den: d / g };
}

function addRational(a, b) {
	return reduceRational(a.num * b.den + b.num * a.den, a.den * b.den);
}

function mulRational(a, b) {
	return reduceRational(a.num * b.num, a.den * b.den);
}

function subIntFromRational(r, j) {
	return reduceRational(r.num - BigInt(j) * r.den, r.den);
}

/**
 * Independent reference implementation: direct iterative falling product prod_{j=0}^{k-1} (x - j).
 */
function directFallingProduct(x, k) {
	let acc = { num: 1n, den: 1n };
	const base = reduceRational(x.num, x.den);
	for (let j = 0; j < k; j++) {
		acc = mulRational(acc, subIntFromRational(base, j));
	}
	return acc;
}

function factorialBigInt(n) {
	let acc = 1n;
	for (let i = 2n; i <= BigInt(n); i++) {
		acc *= i;
	}
	return acc;
}

function binomialBigInt(n, k) {
	return factorialBigInt(n) / (factorialBigInt(k) * factorialBigInt(n - k));
}

function assertNormalizedRational(r) {
	assert.equal(typeof r.num, 'bigint');
	assert.equal(typeof r.den, 'bigint');
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`);
	if (r.num === 0n) {
		assert.equal(r.den, 1n, `expected zero to have den === 1n, got ${r.den}`);
	} else {
		assert.equal(gcdBigInt(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`);
	}
}

describe('permutationsRationalSeries', () => {
	describe('integer rational cases', () => {
		it('computes standard discrete permutations P(n, k)', () => {
			assert.deepEqual(permutationsRationalSeries({ num: 5n, den: 1n }, 0), { num: 1n, den: 1n });
			assert.deepEqual(permutationsRationalSeries({ num: 5n, den: 1n }, 1), { num: 5n, den: 1n });
			assert.deepEqual(permutationsRationalSeries({ num: 5n, den: 1n }, 3), { num: 60n, den: 1n });
			assert.deepEqual(permutationsRationalSeries({ num: 5n, den: 1n }, 5), { num: 120n, den: 1n });
			assert.deepEqual(permutationsRationalSeries({ num: 5n, den: 1n }, 6), { num: 0n, den: 1n });
		});

		it('handles zero x and boundary k = 0', () => {
			assert.deepEqual(permutationsRationalSeries({ num: 0n, den: 1n }, 0), { num: 1n, den: 1n });
			assert.deepEqual(permutationsRationalSeries({ num: 0n, den: 7n }, 0), { num: 1n, den: 1n });
			assert.deepEqual(permutationsRationalSeries({ num: 0n, den: -5n }, 1), { num: 0n, den: 1n });
			assert.deepEqual(permutationsRationalSeries({ num: 0n, den: 1n }, 10), { num: 0n, den: 1n });
		});

		it('handles negative integer x without vanishing', () => {
			assert.deepEqual(permutationsRationalSeries({ num: -1n, den: 1n }, 4), { num: 24n, den: 1n });
			assert.deepEqual(permutationsRationalSeries({ num: -3n, den: 1n }, 3), { num: -60n, den: 1n });
			assert.deepEqual(permutationsRationalSeries({ num: -4n, den: 1n }, 0), { num: 1n, den: 1n });
		});

		it('accepts BigInt values for k', () => {
			assert.deepEqual(permutationsRationalSeries({ num: 6n, den: 1n }, 3n), { num: 120n, den: 1n });
			assert.deepEqual(permutationsRationalSeries({ num: 7n, den: 3n }, 0n), { num: 1n, den: 1n });
			assert.deepEqual(permutationsRationalSeries({ num: 2n, den: 1n }, 5n), { num: 0n, den: 1n });
		});
	});

	describe('general rational cases and normalization', () => {
		it('computes generalized falling factorials for non-integer rationals', () => {
			assert.deepEqual(permutationsRationalSeries({ num: 1n, den: 2n }, 0), { num: 1n, den: 1n });
			assert.deepEqual(permutationsRationalSeries({ num: 1n, den: 2n }, 1), { num: 1n, den: 2n });
			assert.deepEqual(permutationsRationalSeries({ num: 1n, den: 2n }, 2), { num: -1n, den: 4n });
			assert.deepEqual(permutationsRationalSeries({ num: 1n, den: 2n }, 3), { num: 3n, den: 8n });
			assert.deepEqual(permutationsRationalSeries({ num: 1n, den: 2n }, 4), { num: -15n, den: 16n });
			assert.deepEqual(permutationsRationalSeries({ num: 5n, den: 2n }, 3), { num: 15n, den: 8n });
			assert.deepEqual(permutationsRationalSeries({ num: 7n, den: 3n }, 4), { num: -56n, den: 81n });
			assert.deepEqual(permutationsRationalSeries({ num: -2n, den: 3n }, 3), { num: -80n, den: 27n });
		});

		it('normalizes unreduced inputs and negative denominators without mutating input', () => {
			const x1 = { num: 10n, den: 2n };
			assert.deepEqual(permutationsRationalSeries(x1, 3), { num: 60n, den: 1n });
			assert.deepEqual(x1, { num: 10n, den: 2n });

			const x2 = { num: 6n, den: -4n };
			// -3/2 * -5/2 = 15/4
			const r2 = permutationsRationalSeries(x2, 2);
			assert.deepEqual(r2, { num: 15n, den: 4n });
			assertNormalizedRational(r2);
			assert.deepEqual(x2, { num: 6n, den: -4n });

			const x3 = { num: -9n, den: -3n };
			assert.deepEqual(permutationsRationalSeries(x3, 5), { num: 0n, den: 1n });
		});

		it('preserves exact precision for large BigInt values', () => {
			// P(30, 20) = 30! / 10!
			const expected = factorialBigInt(30) / factorialBigInt(10);
			const result = permutationsRationalSeries({ num: 30n, den: 1n }, 20);
			assert.deepEqual(result, { num: expected, den: 1n });
			assertNormalizedRational(result);

			const largeX = { num: 1000000000000000000003n, den: 7n };
			const largeResult = permutationsRationalSeries(largeX, 5);
			assert.deepEqual(largeResult, directFallingProduct(largeX, 5));
			assertNormalizedRational(largeResult);
		});
	});

	describe('independent cross-checks and algebraic identities', () => {
		it('matches factorial ratio n! / (n - k)! for all 0 <= k <= n <= 15', () => {
			for (let n = 0; n <= 15; n++) {
				for (let k = 0; k <= n; k++) {
					const actual = permutationsRationalSeries({ num: BigInt(n), den: 1n }, k);
					const expected = { num: factorialBigInt(n) / factorialBigInt(n - k), den: 1n };
					assert.deepEqual(actual, expected, `mismatch at P(${n}, ${k})`);
					assertNormalizedRational(actual);
				}
			}
		});

		it('matches direct iterative falling product across integer and rational grid', () => {
			const xs = [
				{ num: 0n, den: 1n },
				{ num: 1n, den: 1n },
				{ num: 4n, den: 1n },
				{ num: -5n, den: 1n },
				{ num: 1n, den: 2n },
				{ num: -1n, den: 2n },
				{ num: 7n, den: 3n },
				{ num: -11n, den: 4n },
				{ num: 14n, den: -6n },
				{ num: 25n, den: 5n }
			];
			for (const x of xs) {
				for (let k = 0; k <= 12; k++) {
					const actual = permutationsRationalSeries(x, k);
					const expected = directFallingProduct(x, k);
					assert.deepEqual(actual, expected, `mismatch for x=${x.num}/${x.den}, k=${k}`);
					assertNormalizedRational(actual);
				}
			}
		});

		it('satisfies recurrence (x)_{k+1} = (x)_k * (x - k)', () => {
			const xs = [
				{ num: 9n, den: 4n },
				{ num: -5n, den: 3n },
				{ num: 6n, den: 1n }
			];
			for (const x of xs) {
				for (let k = 0; k <= 10; k++) {
					const pk = permutationsRationalSeries(x, k);
					const pk1 = permutationsRationalSeries(x, k + 1);
					const rhs = mulRational(pk, subIntFromRational(x, k));
					assert.deepEqual(pk1, rhs);
				}
			}
		});

		it('satisfies reflection identity (-x)_k = (-1)^k * (x + k - 1)_k', () => {
			const x = { num: 5n, den: 6n };
			const negX = { num: -5n, den: 6n };
			for (let k = 0; k <= 10; k++) {
				const lhs = permutationsRationalSeries(negX, k);
				const shifted = addRational(x, { num: BigInt(k - 1), den: 1n });
				const sign = k % 2 === 0 ? 1n : -1n;
				const rhs = mulRational({ num: sign, den: 1n }, permutationsRationalSeries(shifted, k));
				assert.deepEqual(lhs, rhs, `reflection mismatch at k=${k}`);
			}
		});

		it('satisfies Chu-Vandermonde identity (x + y)_n = sum_{k=0}^n C(n, k) (x)_k (y)_{n-k}', () => {
			const x = { num: 5n, den: 3n };
			const y = { num: -7n, den: 4n };
			const xy = addRational(x, y);
			for (let n = 0; n <= 8; n++) {
				const lhs = permutationsRationalSeries(xy, n);
				let rhs = { num: 0n, den: 1n };
				for (let k = 0; k <= n; k++) {
					const coeff = { num: binomialBigInt(n, k), den: 1n };
					const term = mulRational(
						coeff,
						mulRational(permutationsRationalSeries(x, k), permutationsRationalSeries(y, n - k))
					);
					rhs = addRational(rhs, term);
				}
				assert.deepEqual(lhs, rhs, `Chu-Vandermonde mismatch at n=${n}`);
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError for invalid x objects or non-BigInt fields', () => {
			const invalidXs = [
				null,
				undefined,
				5,
				5n,
				'5/2',
				{},
				{ num: 5, den: 1n },
				{ num: 5n, den: 1 },
				{ num: 5, den: 1 },
				{ num: 5n },
				{ den: 1n }
			];
			for (const badX of invalidXs) {
				assert.throws(() => permutationsRationalSeries(badX, 2), TypeError);
			}
		});

		it('throws RangeError when x.den is zero', () => {
			assert.throws(() => permutationsRationalSeries({ num: 1n, den: 0n }, 2), RangeError);
			assert.throws(() => permutationsRationalSeries({ num: 0n, den: 0n }, 0), RangeError);
		});

		it('throws TypeError for invalid k types', () => {
			const x = { num: 5n, den: 1n };
			const invalidKs = ['3', null, undefined, {}, [], true, Symbol('k')];
			for (const badK of invalidKs) {
				assert.throws(() => permutationsRationalSeries(x, badK), TypeError);
			}
		});

		it('throws RangeError for negative, non-integer, or unsafe k values', () => {
			const x = { num: 5n, den: 1n };
			const invalidKs = [
				-1,
				-10n,
				1.5,
				-0.5,
				Number.NaN,
				Number.POSITIVE_INFINITY,
				Number.NEGATIVE_INFINITY,
				Number.MAX_SAFE_INTEGER + 1,
				BigInt(Number.MAX_SAFE_INTEGER) + 1n
			];
			for (const badK of invalidKs) {
				assert.throws(() => permutationsRationalSeries(x, badK), RangeError);
			}
		});
	});
});
