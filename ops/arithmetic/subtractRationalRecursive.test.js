import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { subtractRationalRecursive } from './subtractRationalRecursive.js';

/**
 * Independent iterative GCD and direct cross-multiplication oracle
 * for cross-checking `subtractRationalRecursive`.
 */
function iterativeGcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

function directCrossMultiplySubtract(a, b) {
	let num = a.num * b.den - b.num * a.den;
	let den = a.den * b.den;
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	const g = iterativeGcd(num, den);
	return { num: num / g, den: den / g };
}

function directCrossMultiplyAdd(a, b) {
	let num = a.num * b.den + b.num * a.den;
	let den = a.den * b.den;
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	const g = iterativeGcd(num, den);
	return { num: num / g, den: den / g };
}

function normalizeOracle(r) {
	return directCrossMultiplyAdd(r, { num: 0n, den: 1n });
}

describe('subtractRationalRecursive', () => {
	describe('normal two-argument subtraction', () => {
		it('subtracts simple positive fractions and reduces to lowest terms', () => {
			assert.deepEqual(
				subtractRationalRecursive({ num: 3n, den: 4n }, { num: 1n, den: 4n }),
				{ num: 1n, den: 2n },
			);
			assert.deepEqual(
				subtractRationalRecursive({ num: 5n, den: 6n }, { num: 1n, den: 3n }),
				{ num: 1n, den: 2n },
			);
			assert.deepEqual(
				subtractRationalRecursive({ num: 1n, den: 2n }, { num: 1n, den: 3n }),
				{ num: 1n, den: 6n },
			);
		});

		it('handles negative results and signed numerators', () => {
			assert.deepEqual(
				subtractRationalRecursive({ num: 1n, den: 3n }, { num: 1n, den: 2n }),
				{ num: -1n, den: 6n },
			);
			assert.deepEqual(
				subtractRationalRecursive({ num: -2n, den: 5n }, { num: -7n, den: 10n }),
				{ num: 3n, den: 10n },
			);
			assert.deepEqual(
				subtractRationalRecursive({ num: -3n, den: 4n }, { num: 5n, den: 6n }),
				{ num: -19n, den: 12n },
			);
		});

		it('handles unreduced inputs and preserves immutability of inputs', () => {
			const a = { num: 10n, den: 15n };
			const b = { num: 4n, den: 12n };
			const result = subtractRationalRecursive(a, b);
			assert.deepEqual(result, { num: 1n, den: 3n });
			assert.deepEqual(a, { num: 10n, den: 15n });
			assert.deepEqual(b, { num: 4n, den: 12n });
		});

		it('handles zero minuend and zero subtrahend', () => {
			assert.deepEqual(
				subtractRationalRecursive({ num: 0n, den: 7n }, { num: 3n, den: 5n }),
				{ num: -3n, den: 5n },
			);
			assert.deepEqual(
				subtractRationalRecursive({ num: 6n, den: 9n }, { num: 0n, den: 11n }),
				{ num: 2n, den: 3n },
			);
			assert.deepEqual(
				subtractRationalRecursive({ num: 0n, den: 5n }, { num: 0n, den: -9n }),
				{ num: 0n, den: 1n },
			);
		});
	});

	describe('edge cases', () => {
		it('normalizes negative denominators so output always has den > 0n', () => {
			assert.deepEqual(
				subtractRationalRecursive({ num: 1n, den: -2n }, { num: 1n, den: -3n }),
				{ num: -1n, den: 6n },
			);
			assert.deepEqual(
				subtractRationalRecursive({ num: -3n, den: -6n }, { num: -2n, den: 8n }),
				{ num: 3n, den: 4n },
			);
			assert.deepEqual(
				subtractRationalRecursive({ num: 5n, den: -10n }, { num: -1n, den: 2n }),
				{ num: 0n, den: 1n },
			);
		});

		it('returns { num: 0n, den: 1n } when subtracting equal rationals in different forms', () => {
			assert.deepEqual(
				subtractRationalRecursive({ num: 2n, den: 3n }, { num: 2n, den: 3n }),
				{ num: 0n, den: 1n },
			);
			assert.deepEqual(
				subtractRationalRecursive({ num: 14n, den: 21n }, { num: -6n, den: -9n }),
				{ num: 0n, den: 1n },
			);
			assert.deepEqual(
				subtractRationalRecursive({ num: -8n, den: 12n }, { num: 4n, den: -6n }),
				{ num: 0n, den: 1n },
			);
		});

		it('handles huge BigInts without precision loss', () => {
			const big1 = 10n ** 120n + 7n;
			const big2 = 10n ** 120n + 3n;
			const common = 3n * 10n ** 60n;
			const a = { num: big1 * common, den: (10n ** 80n + 1n) * common };
			const b = { num: big2, den: 10n ** 80n + 1n };
			const result = subtractRationalRecursive(a, b);
			assert.deepEqual(result, { num: 4n, den: 10n ** 80n + 1n });
		});

		it('handles null-prototype rational objects', () => {
			const a = Object.assign(Object.create(null), { num: 7n, den: 8n });
			const b = Object.assign(Object.create(null), { num: 3n, den: 8n });
			assert.deepEqual(subtractRationalRecursive(a, b), { num: 1n, den: 2n });
		});

		it('throws RangeError on zero denominator in minuend or subtrahends', () => {
			assert.throws(
				() => subtractRationalRecursive({ num: 1n, den: 0n }, { num: 1n, den: 2n }),
				RangeError,
			);
			assert.throws(
				() => subtractRationalRecursive({ num: 1n, den: 2n }, { num: 0n, den: 0n }),
				RangeError,
			);
			assert.throws(
				() =>
					subtractRationalRecursive(
						{ num: 1n, den: 2n },
						{ num: 1n, den: 3n },
						{ num: 5n, den: 0n },
					),
				RangeError,
			);
			assert.throws(
				() =>
					subtractRationalRecursive({ num: 1n, den: 2n }, [
						{ num: 1n, den: 3n },
						{ num: 2n, den: 0n },
					]),
				RangeError,
			);
			assert.throws(
				() => subtractRationalRecursive({ num: 1n, den: 0n }, []),
				RangeError,
			);
		});

		it('throws TypeError on invalid argument counts or invalid types', () => {
			assert.throws(() => subtractRationalRecursive(), TypeError);
			assert.throws(() => subtractRationalRecursive({ num: 1n, den: 2n }), TypeError);

			const badValues = [
				null,
				undefined,
				42,
				'1/2',
				true,
				1n,
				{},
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: '1', den: '2' },
				{ num: NaN, den: 2n },
				{ num: 1n },
				{ den: 2n },
				[1n, 2n],
			];

			for (const bad of badValues) {
				assert.throws(
					() => subtractRationalRecursive(bad, { num: 1n, den: 2n }),
					TypeError,
				);
				if (!Array.isArray(bad)) {
					assert.throws(
						() => subtractRationalRecursive({ num: 1n, den: 2n }, bad),
						TypeError,
					);
				}
				assert.throws(
					() => subtractRationalRecursive({ num: 1n, den: 2n }, [bad]),
					TypeError,
				);
			}

			// Array mixed with extra variadic argument is rejected
			assert.throws(
				() =>
					subtractRationalRecursive(
						{ num: 1n, den: 2n },
						[{ num: 1n, den: 4n }],
						{ num: 1n, den: 4n },
					),
				TypeError,
			);

			// Sparse array hole is rejected
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [{ num: 1n, den: 4n }, , { num: 1n, den: 4n }];
			assert.throws(
				() => subtractRationalRecursive({ num: 1n, den: 1n }, sparse),
				TypeError,
			);
		});
	});

	describe('divide-and-conquer variadic and list subtrahends', () => {
		it('subtracts variadic tail a - (b1 + b2 + ... + bk)', () => {
			assert.deepEqual(
				subtractRationalRecursive(
					{ num: 1n, den: 1n },
					{ num: 1n, den: 2n },
					{ num: 1n, den: 3n },
					{ num: 1n, den: 6n },
				),
				{ num: 0n, den: 1n },
			);

			assert.deepEqual(
				subtractRationalRecursive(
					{ num: 10n, den: 1n },
					{ num: 1n, den: 2n },
					{ num: -3n, den: 4n },
					{ num: 5n, den: -6n },
					{ num: 7n, den: 12n },
				),
				{ num: 21n, den: 2n },
			);
		});

		it('subtracts an array tail a - (b1 + b2 + ... + bk) including empty and singleton lists', () => {
			// Empty list returns normalized a
			assert.deepEqual(
				subtractRationalRecursive({ num: -6n, den: -9n }, []),
				{ num: 2n, den: 3n },
			);
			assert.deepEqual(
				subtractRationalRecursive({ num: 0n, den: -5n }, []),
				{ num: 0n, den: 1n },
			);

			// Singleton list
			assert.deepEqual(
				subtractRationalRecursive({ num: 5n, den: 6n }, [{ num: 1n, den: 6n }]),
				{ num: 2n, den: 3n },
			);

			// Telescoping series: sum_{k=1..50} 1/(k*(k+1)) = 50/51
			const telescoping = [];
			for (let k = 1n; k <= 50n; k += 1n) {
				telescoping.push({ num: 1n, den: k * (k + 1n) });
			}
			assert.deepEqual(
				subtractRationalRecursive({ num: 1n, den: 1n }, telescoping),
				{ num: 1n, den: 51n },
			);
		});

		it('matches sequential binary subtraction for both variadic and list forms', () => {
			const minuend = { num: 17n, den: 12n };
			const tail = [
				{ num: 1n, den: 3n },
				{ num: -2n, den: 5n },
				{ num: 7n, den: -15n },
				{ num: 4n, den: 9n },
				{ num: 11n, den: 20n },
				{ num: -5n, den: -18n },
				{ num: 13n, den: 24n },
			];

			let sequential = normalizeOracle(minuend);
			for (const item of tail) {
				sequential = directCrossMultiplySubtract(sequential, item);
			}

			assert.deepEqual(subtractRationalRecursive(minuend, tail), sequential);
			assert.deepEqual(subtractRationalRecursive(minuend, ...tail), sequential);
		});
	});

	describe('cross-checks and algebraic invariants', () => {
		it('matches independent direct cross-multiplication and satisfies additive inverse (a - b) + b === a', () => {
			const samples = [
				{ num: 0n, den: 1n },
				{ num: 0n, den: -7n },
				{ num: 1n, den: 2n },
				{ num: -3n, den: 4n },
				{ num: 5n, den: -6n },
				{ num: -14n, den: -21n },
				{ num: 1000000000000000000000003n, den: 999999999999999999999999n },
				{ num: -(2n ** 97n) + 1n, den: 3n ** 55n },
			];

			for (const a of samples) {
				const normA = normalizeOracle(a);
				for (const b of samples) {
					const diff = subtractRationalRecursive(a, b);
					const expected = directCrossMultiplySubtract(a, b);

					// Exact match against independent direct cross-multiplication
					assert.deepEqual(diff, expected);

					// Lowest-terms & canonical sign invariants
					assert.ok(diff.den > 0n);
					if (diff.num === 0n) {
						assert.equal(diff.den, 1n);
					} else {
						assert.equal(iterativeGcd(diff.num, diff.den), 1n);
					}

					// Additive inverse check: (a - b) + b === a
					assert.deepEqual(directCrossMultiplyAdd(diff, b), normA);

					// Anti-symmetry check: (a - b) === -(b - a)
					const rev = subtractRationalRecursive(b, a);
					assert.deepEqual(diff, {
						num: rev.num === 0n ? 0n : -rev.num,
						den: rev.den,
					});
				}
			}
		});
	});
});
