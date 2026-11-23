import test from "node:test";
import assert from "node:assert/strict";
import { moduloRationalMemo } from "./moduloRationalMemo.js";

/**
 * Independent reference helpers for cross-checking exact rational arithmetic.
 */
function cmpRational(x, y) {
	// Assumes positive denominators
	const lhs = x.num * y.den;
	const rhs = y.num * x.den;
	return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
}

function gcdRef(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

function normalizeRef(r) {
	let { num, den } = r;
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	if (num === 0n) return { num: 0n, den: 1n };
	const g = gcdRef(num, den);
	return { num: num / g, den: den / g };
}

function floorDivBigInt(n, d) {
	let q = n / d;
	const rem = n % d;
	if (rem !== 0n && (rem < 0n) !== (d < 0n)) {
		q -= 1n;
	}
	return q;
}

function assertLowestTerms(r) {
	assert.equal(typeof r.num, "bigint");
	assert.equal(typeof r.den, "bigint");
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`);
	if (r.num === 0n) {
		assert.equal(r.den, 1n);
	} else {
		assert.equal(gcdRef(r.num, r.den), 1n);
	}
}

test("normal cases: integer rationals", () => {
	assert.deepStrictEqual(
		moduloRationalMemo({ num: 17n, den: 1n }, { num: 5n, den: 1n }),
		{ num: 2n, den: 1n },
	);
	assert.deepStrictEqual(
		moduloRationalMemo({ num: 3n, den: 1n }, { num: 7n, den: 1n }),
		{ num: 3n, den: 1n },
	);
});

test("normal cases: fractional rationals", () => {
	// (7/2) mod (3/2) = 1/2
	assert.deepStrictEqual(
		moduloRationalMemo({ num: 7n, den: 2n }, { num: 3n, den: 2n }),
		{ num: 1n, den: 2n },
	);
	// (5/3) mod (1/2) = 1/6  (since 5/3 = 3*(1/2) + 1/6)
	assert.deepStrictEqual(
		moduloRationalMemo({ num: 5n, den: 3n }, { num: 1n, den: 2n }),
		{ num: 1n, den: 6n },
	);
	// (11/4) mod (2/3) = 1/12 (since 11/4 = 4*(2/3) + 1/12)
	assert.deepStrictEqual(
		moduloRationalMemo({ num: 11n, den: 4n }, { num: 2n, den: 3n }),
		{ num: 1n, den: 12n },
	);
});

test("edge cases: zero dividend and exact multiples yield 0/1", () => {
	assert.deepStrictEqual(
		moduloRationalMemo({ num: 0n, den: 1n }, { num: 3n, den: 5n }),
		{ num: 0n, den: 1n },
	);
	assert.deepStrictEqual(
		moduloRationalMemo({ num: 0n, den: -7n }, { num: -3n, den: 5n }),
		{ num: 0n, den: 1n },
	);
	assert.deepStrictEqual(
		moduloRationalMemo({ num: 9n, den: 2n }, { num: 3n, den: 2n }),
		{ num: 0n, den: 1n },
	);
	assert.deepStrictEqual(
		moduloRationalMemo({ num: -9n, den: 2n }, { num: 3n, den: 2n }),
		{ num: 0n, den: 1n },
	);
	assert.deepStrictEqual(
		moduloRationalMemo({ num: 9n, den: 2n }, { num: -3n, den: 2n }),
		{ num: 0n, den: 1n },
	);
});

test("edge cases: negative dividend with positive divisor", () => {
	// (-7/2) mod (3/2) = 1/1  since floor(-7/3) = -3, -7/2 - (-3)*(3/2) = 2/2 = 1
	assert.deepStrictEqual(
		moduloRationalMemo({ num: -7n, den: 2n }, { num: 3n, den: 2n }),
		{ num: 1n, den: 1n },
	);
	// (-1/4) mod (1/2) = 1/4
	assert.deepStrictEqual(
		moduloRationalMemo({ num: -1n, den: 4n }, { num: 1n, den: 2n }),
		{ num: 1n, den: 4n },
	);
});

test("edge cases: negative divisor with positive and negative dividends", () => {
	// (7/2) mod (-3/2) = -1/1  since floor(-7/3) = -3, 7/2 - (-3)*(-3/2) = -1
	assert.deepStrictEqual(
		moduloRationalMemo({ num: 7n, den: 2n }, { num: -3n, den: 2n }),
		{ num: -1n, den: 1n },
	);
	// (-7/2) mod (-3/2) = -1/2 since floor(7/3) = 2, -7/2 - 2*(-3/2) = -1/2
	assert.deepStrictEqual(
		moduloRationalMemo({ num: -7n, den: 2n }, { num: -3n, den: 2n }),
		{ num: -1n, den: 2n },
	);
	// (1/4) mod (-1/2) = -1/4
	assert.deepStrictEqual(
		moduloRationalMemo({ num: 1n, den: 4n }, { num: -1n, den: 2n }),
		{ num: -1n, den: 4n },
	);
});

test("edge cases: unreduced inputs and negative denominators", () => {
	// 14/4 == 7/2, 9/6 == 3/2 => 1/2
	assert.deepStrictEqual(
		moduloRationalMemo({ num: 14n, den: 4n }, { num: 9n, den: 6n }),
		{ num: 1n, den: 2n },
	);
	// -14/-4 == 7/2, 9/-6 == -3/2 => -1/1
	assert.deepStrictEqual(
		moduloRationalMemo({ num: -14n, den: -4n }, { num: 9n, den: -6n }),
		{ num: -1n, den: 1n },
	);
	// 7/-2 == -7/2, 3/2 => 1/1
	assert.deepStrictEqual(
		moduloRationalMemo({ num: 7n, den: -2n }, { num: 3n, den: 2n }),
		{ num: 1n, den: 1n },
	);
});

test("validation: zero divisor and zero denominators throw RangeError", () => {
	assert.throws(
		() => moduloRationalMemo({ num: 1n, den: 2n }, { num: 0n, den: 1n }),
		RangeError,
	);
	assert.throws(
		() => moduloRationalMemo({ num: 0n, den: 1n }, { num: 0n, den: 5n }),
		RangeError,
	);
	assert.throws(
		() => moduloRationalMemo({ num: 1n, den: 0n }, { num: 1n, den: 2n }),
		RangeError,
	);
	assert.throws(
		() => moduloRationalMemo({ num: 1n, den: 2n }, { num: 1n, den: 0n }),
		RangeError,
	);
});

test("validation: invalid non-rational inputs throw TypeError", () => {
	const badInputs = [
		null,
		undefined,
		42,
		"1/2",
		[1n, 2n],
		{},
		{ num: 1, den: 2n },
		{ num: 1n, den: 2 },
		{ num: 1n },
		{ den: 2n },
	];

	for (const bad of badInputs) {
		assert.throws(
			() => moduloRationalMemo(bad, { num: 1n, den: 2n }),
			TypeError,
		);
		assert.throws(
			() => moduloRationalMemo({ num: 1n, den: 2n }, bad),
			TypeError,
		);
	}
});

test("memoization consistency and cache immutability", () => {
	const a = { num: 1000003n, den: 97n };
	const b = { num: 313n, den: 19n };

	const first = moduloRationalMemo(a, b);
	// Equivalent unreduced form should hit the same canonical cache entry
	const second = moduloRationalMemo(
		{ num: a.num * 12n, den: a.den * 12n },
		{ num: -b.num * 7n, den: -b.den * 7n },
	);
	assert.deepStrictEqual(first, second);
	assertLowestTerms(first);

	// Mutating a returned object must not corrupt subsequent cached lookups
	const expectedNum = first.num;
	const expectedDen = first.den;
	first.num = 999999n;
	first.den = 888888n;

	const third = moduloRationalMemo(a, b);
	assert.deepStrictEqual(third, { num: expectedNum, den: expectedDen });
});

test("large BigInt inputs beyond precomputed GCD table", () => {
	const a = { num: 10n ** 40n + 7n, den: 3n * 10n ** 20n };
	const b = { num: 10n ** 20n + 3n, den: 7n * 10n ** 15n };
	const r = moduloRationalMemo(a, b);
	assertLowestTerms(r);

	// Independent division identity verification: a == q * b + r
	const q = floorDivBigInt(a.num * b.den, a.den * b.num);
	const rhsNum = q * b.num * r.den + r.num * b.den;
	const rhsDen = b.den * r.den;
	assert.equal(a.num * rhsDen, rhsNum * a.den);
	assert.ok(cmpRational(r, { num: 0n, den: 1n }) >= 0);
	assert.ok(cmpRational(r, b) < 0);
});

test("independent cross-check: division identity a == q*b + r and range invariant across grid", () => {
	const nums = [-15n, -7n, -3n, -1n, 0n, 1n, 2n, 5n, 12n, 101n];
	const dens = [-6n, -2n, 1n, 2n, 3n, 5n, 12n, 73n];

	const zero = { num: 0n, den: 1n };

	for (const an of nums) {
		for (const ad of dens) {
			const a = { num: an, den: ad };
			const na = normalizeRef(a);

			for (const bn of nums) {
				if (bn === 0n) continue;
				for (const bd of dens) {
					const b = { num: bn, den: bd };
					const nb = normalizeRef(b);

					const r = moduloRationalMemo(a, b);
					assertLowestTerms(r);

					// Independent floor quotient q = floor(a / b)
					const q = floorDivBigInt(na.num * nb.den, na.den * nb.num);

					// Check a == q * b + r via exact cross-multiplication
					const qbPlusRNum = q * nb.num * r.den + r.num * nb.den;
					const qbPlusRDen = nb.den * r.den;
					assert.equal(
						na.num * qbPlusRDen,
						qbPlusRNum * na.den,
						`identity failed for a=${an}/${ad}, b=${bn}/${bd}`,
					);

					// Check range invariant:
					// if b > 0: 0 <= r < b
					// if b < 0: b < r <= 0
					if (nb.num > 0n) {
						assert.ok(
							cmpRational(r, zero) >= 0 && cmpRational(r, nb) < 0,
							`range invariant failed for b > 0: r=${r.num}/${r.den}, b=${nb.num}/${nb.den}`,
						);
					} else {
						assert.ok(
							cmpRational(r, nb) > 0 && cmpRational(r, zero) <= 0,
							`range invariant failed for b < 0: r=${r.num}/${r.den}, b=${nb.num}/${nb.den}`,
						);
					}
				}
			}
		}
	}
});
