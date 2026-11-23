import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { subtractComplexStable } from './subtractComplexStable.js';

/**
 * Independent exact IEEE-754 dyadic-rational oracle using BigInt.
 * Decodes any finite double into exact `mantissa * 2^exp` and sums a list
 * of finite doubles with infinite precision, then rounds to nearest even
 * IEEE-754 double.
 */
const f64Buf = new ArrayBuffer(8);
const f64View = new DataView(f64Buf);

function doubleToDyadic(x) {
	if (x === 0) {
		return { mantissa: 0n, exp: 0 };
	}
	f64View.setFloat64(0, x, false);
	const bits = f64View.getBigUint64(0, false);
	const sign = (bits >> 63n) === 1n ? -1n : 1n;
	const rawExp = Number((bits >> 52n) & 0x7ffn);
	const frac = bits & ((1n << 52n) - 1n);

	if (rawExp === 0) {
		// Subnormal: value = sign * frac * 2^(-1074)
		return { mantissa: sign * frac, exp: -1074 };
	}
	// Normal: value = sign * (2^52 + frac) * 2^(rawExp - 1023 - 52)
	return { mantissa: sign * ((1n << 52n) + frac), exp: rawExp - 1075 };
}

function bitLength(n) {
	return n === 0n ? 0 : n.toString(2).length;
}

function exactSumOracle(values) {
	const terms = values.filter((v) => v !== 0).map(doubleToDyadic);
	if (terms.length === 0) {
		return 0;
	}

	let minExp = terms[0].exp;
	for (let i = 1; i < terms.length; i++) {
		if (terms[i].exp < minExp) {
			minExp = terms[i].exp;
		}
	}

	let total = 0n;
	for (const { mantissa, exp } of terms) {
		total += mantissa << BigInt(exp - minExp);
	}

	if (total === 0n) {
		return 0;
	}

	const negative = total < 0n;
	const absTotal = negative ? -total : total;
	const bl = bitLength(absTotal);

	// Exact value is absTotal * 2^minExp, MSB is at bit position (bl - 1 + minExp).
	const msbExp = bl - 1 + minExp;

	// Determine target shift to fit 53-bit significand (or fewer for subnormals)
	let targetExp = msbExp - 52;
	if (targetExp < -1074) {
		targetExp = -1074;
	}

	const shift = targetExp - minExp;
	let sig;
	if (shift <= 0) {
		sig = absTotal << BigInt(-shift);
	} else {
		const shiftBig = BigInt(shift);
		const q = absTotal >> shiftBig;
		const rem = absTotal & ((1n << shiftBig) - 1n);
		const half = 1n << (shiftBig - 1n);
		if (rem > half || (rem === half && (q & 1n) === 1n)) {
			sig = q + 1n;
		} else {
			sig = q;
		}
	}

	// Recompute exponent if rounding carried into a higher bit
	let finalExp = targetExp;
	if (sig === (1n << 53n)) {
		sig >>= 1n;
		finalExp += 1;
	}

	// Check overflow
	if (finalExp + 52 > 1023) {
		return negative ? -Infinity : Infinity;
	}

	// Encode back to IEEE-754 double
	const signBit = negative ? 1n << 63n : 0n;
	let bits;
	if (finalExp === -1074 && sig < (1n << 52n)) {
		// Subnormal (or underflow to 0)
		bits = signBit | sig;
	} else {
		const biasedExp = BigInt(finalExp + 1075);
		const frac = sig & ((1n << 52n) - 1n);
		bits = signBit | (biasedExp << 52n) | frac;
	}

	f64View.setBigUint64(0, bits, false);
	const result = f64View.getFloat64(0, false);
	return result === 0 ? 0 : result;
}

describe('subtractComplexStable', () => {
	test('basic complex subtraction', () => {
		assert.deepStrictEqual(
			subtractComplexStable({ re: 5, im: 3 }, { re: 2, im: 1 }),
			{ re: 3, im: 2 }
		);
		assert.deepStrictEqual(
			subtractComplexStable({ re: -4, im: 7 }, { re: 6, im: -3 }),
			{ re: -10, im: 10 }
		);
		assert.deepStrictEqual(
			subtractComplexStable({ re: 1.5, im: -2.25 }, { re: 0.5, im: 0.75 }),
			{ re: 1, im: -3 }
		);
	});

	test('purely real, purely imaginary, and zero normalization', () => {
		const res1 = subtractComplexStable({ re: 0, im: 0 }, { re: 0, im: 0 });
		assert.deepStrictEqual(res1, { re: 0, im: 0 });
		assert.ok(Object.is(res1.re, 0));
		assert.ok(Object.is(res1.im, 0));

		const res2 = subtractComplexStable({ re: -0, im: -0 }, { re: 0, im: 0 });
		assert.ok(Object.is(res2.re, 0));
		assert.ok(Object.is(res2.im, 0));

		assert.deepStrictEqual(
			subtractComplexStable({ re: 42, im: 0 }, { re: 42, im: 0 }),
			{ re: 0, im: 0 }
		);
		assert.deepStrictEqual(
			subtractComplexStable({ re: 0, im: 9 }, { re: 0, im: 12 }),
			{ re: 0, im: -3 }
		);
	});

	test('multi-operand variadic subtraction', () => {
		assert.deepStrictEqual(
			subtractComplexStable(
				{ re: 20, im: 10 },
				{ re: 3, im: 2 },
				{ re: 5, im: 4 },
				{ re: 2, im: 1 }
			),
			{ re: 10, im: 3 }
		);
	});

	test('eliminates catastrophic cancellation across large and small scales', () => {
		// Naive: ((1e16 - (-1)) - 1e16) === 0
		assert.deepStrictEqual(
			subtractComplexStable(
				{ re: 1e16, im: -1e16 },
				{ re: -1, im: 1 },
				{ re: 1e16, im: -1e16 }
			),
			{ re: 1, im: -1 }
		);

		// Extreme 600-decade cancellation across high and low scaling buckets
		assert.deepStrictEqual(
			subtractComplexStable(
				{ re: 1e308, im: -1e308 },
				{ re: -1e-308, im: 1e-308 },
				{ re: 1e308, im: -1e308 }
			),
			{ re: 1e-308, im: -1e-308 }
		);

		// Multi-scale cancellation with mid-range residual
		assert.deepStrictEqual(
			subtractComplexStable(
				{ re: 1e200, im: 1e100 },
				{ re: -3.5, im: -0.25 },
				{ re: 1e200, im: 1e100 },
				{ re: 1.5, im: 0.25 }
			),
			{ re: 2, im: 0 }
		);
	});

	test('prevents spurious intermediate overflow via power-of-2 scaling', () => {
		// Naive: (1e308 - (-1e308)) - 1.5e308 === Infinity - 1.5e308 === Infinity
		const res = subtractComplexStable(
			{ re: 1e308, im: -1e308 },
			{ re: -1e308, im: 1e308 },
			{ re: 1.5e308, im: -1.5e308 }
		);
		assert.deepStrictEqual(res, { re: 0.5e308, im: -0.5e308 });
	});

	test('handles overflow boundary near Number.MAX_VALUE accurately', () => {
		// Exact half-ULP above Number.MAX_VALUE is 2^970.
		// Number.MAX_VALUE + 2^970 - 1 is strictly below overflow threshold -> MAX_VALUE.
		// Number.MAX_VALUE + 2^970 + 1 is strictly above overflow threshold -> Infinity.
		const halfUlpMax = 2 ** 970;
		const justBelow = subtractComplexStable(
			{ re: Number.MAX_VALUE, im: -Number.MAX_VALUE },
			{ re: -halfUlpMax, im: halfUlpMax },
			{ re: 1, im: -1 }
		);
		assert.deepStrictEqual(justBelow, {
			re: Number.MAX_VALUE,
			im: -Number.MAX_VALUE
		});

		const justAbove = subtractComplexStable(
			{ re: Number.MAX_VALUE, im: -Number.MAX_VALUE },
			{ re: -halfUlpMax, im: halfUlpMax },
			{ re: -1, im: 1 }
		);
		assert.deepStrictEqual(justAbove, { re: Infinity, im: -Infinity });

		// True 2-arg overflow
		assert.deepStrictEqual(
			subtractComplexStable(
				{ re: Number.MAX_VALUE, im: -Number.MAX_VALUE },
				{ re: -Number.MAX_VALUE, im: Number.MAX_VALUE }
			),
			{ re: Infinity, im: -Infinity }
		);
	});

	test('preserves accuracy in the subnormal range', () => {
		const min = Number.MIN_VALUE;
		assert.deepStrictEqual(
			subtractComplexStable(
				{ re: 5 * min, im: -3 * min },
				{ re: 2 * min, im: 4 * min },
				{ re: min, im: -10 * min }
			),
			{ re: 2 * min, im: 3 * min }
		);

		// Subnormal cancellation from normal numbers
		assert.deepStrictEqual(
			subtractComplexStable(
				{ re: 2 ** -1022, im: 0 },
				{ re: 2 ** -1022, im: 0 },
				{ re: -min, im: min }
			),
			{ re: min, im: -min }
		);
	});

	test('resolves exact half-ULP tie-breaking with trailing terms', () => {
		// 1 + 2^-53 + 2^-110 must round up to 1 + 2^-52 (naive gives 1)
		const up = subtractComplexStable(
			{ re: 1, im: 1 },
			{ re: -(2 ** -53), im: -(2 ** -53) },
			{ re: -(2 ** -110), im: -(2 ** -110) }
		);
		assert.deepStrictEqual(up, { re: 1 + 2 ** -52, im: 1 + 2 ** -52 });

		// (1 + 2^-52) + 2^-53 - 2^-110 must round down to 1 + 2^-52 (naive gives 1 + 2^-51)
		const down = subtractComplexStable(
			{ re: 1 + 2 ** -52, im: -(1 + 2 ** -52) },
			{ re: -(2 ** -53), im: 2 ** -53 },
			{ re: 2 ** -110, im: -(2 ** -110) }
		);
		assert.deepStrictEqual(down, {
			re: 1 + 2 ** -52,
			im: -(1 + 2 ** -52)
		});
	});

	test('does not mutate inputs and accepts objects with extra properties', () => {
		const a = Object.freeze({ re: 10, im: 20, label: 'a' });
		const b = Object.freeze({ re: 3, im: 7, label: 'b' });
		const c = Object.freeze({ re: 1, im: 2, extra: true });
		assert.deepStrictEqual(subtractComplexStable(a, b, c), { re: 6, im: 11 });
	});

	test('input validation rejects invalid arguments', () => {
		assert.throws(() => subtractComplexStable(), TypeError);
		assert.throws(() => subtractComplexStable({ re: 1, im: 2 }), TypeError);
		assert.throws(() => subtractComplexStable(null, { re: 1, im: 2 }), TypeError);
		assert.throws(
			() => subtractComplexStable({ re: 1, im: 2 }, undefined),
			TypeError
		);
		assert.throws(
			() => subtractComplexStable([1, 2], { re: 1, im: 2 }),
			TypeError
		);
		assert.throws(
			() => subtractComplexStable({ re: '1', im: 2 }, { re: 1, im: 2 }),
			TypeError
		);
		assert.throws(
			() => subtractComplexStable({ re: 1 }, { re: 1, im: 2 }),
			TypeError
		);
		assert.throws(
			() =>
				subtractComplexStable(
					{ re: 1, im: 2 },
					{ re: 3, im: 4 },
					'invalid'
				),
			TypeError
		);
		assert.throws(
			() => subtractComplexStable({ re: NaN, im: 0 }, { re: 1, im: 2 }),
			RangeError
		);
		assert.throws(
			() => subtractComplexStable({ re: 1, im: Infinity }, { re: 1, im: 2 }),
			RangeError
		);
		assert.throws(
			() =>
				subtractComplexStable(
					{ re: 1, im: 2 },
					{ re: 3, im: 4 },
					{ re: -Infinity, im: 0 }
				),
			RangeError
		);
	});

	test('independent cross-check against exact BigInt dyadic-rational oracle', () => {
		// Deterministic PRNG (Mulberry32)
		let seed = 0x5eed1234;
		function rand() {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		}

		const scales = [
			1e307, 1e200, 1e100, 1e16, 1, 1e-16, 1e-100, 1e-200, 1e-307, 1e-320
		];

		for (let trial = 0; trial < 150; trial++) {
			const n = 2 + (trial % 7);
			const args = [];
			const reVals = [];
			const imVals = [];

			// Inject cancelling pairs on half the trials to stress compensation
			const baseRe = (rand() - 0.5) * 2 * scales[trial % scales.length];
			const baseIm = (rand() - 0.5) * 2 * scales[(trial + 3) % scales.length];

			for (let i = 0; i < n; i++) {
				let re;
				let im;
				if (trial % 2 === 0 && i === 0) {
					re = baseRe;
					im = baseIm;
				} else if (trial % 2 === 0 && i === n - 1) {
					re = baseRe;
					im = baseIm;
				} else {
					const s1 = scales[Math.floor(rand() * scales.length)];
					const s2 = scales[Math.floor(rand() * scales.length)];
					re = (rand() - 0.5) * 2 * s1;
					im = (rand() - 0.5) * 2 * s2;
				}
				args.push({ re, im });
				reVals.push(i === 0 ? re : -re);
				imVals.push(i === 0 ? im : -im);
			}

			const actual = subtractComplexStable(...args);
			const expected = {
				re: exactSumOracle(reVals),
				im: exactSumOracle(imVals)
			};

			assert.deepStrictEqual(actual, expected);
		}
	});

	test('independent cross-check of algebraic identities', () => {
		const samples = [
			{ re: 0, im: 0 },
			{ re: 3.141592653589793, im: -2.718281828459045 },
			{ re: 1e300, im: -1e-300 },
			{ re: -1e-300, im: 1e300 },
			{ re: Number.MIN_VALUE, im: -Number.MIN_VALUE }
		];

		for (const a of samples) {
			// Self-subtraction: a - a === 0
			assert.deepStrictEqual(subtractComplexStable(a, a), { re: 0, im: 0 });

			for (const b of samples) {
				// Anticommutativity: a - b === -(b - a)
				const ab = subtractComplexStable(a, b);
				const ba = subtractComplexStable(b, a);
				assert.strictEqual(ab.re, ba.re === 0 ? 0 : -ba.re);
				assert.strictEqual(ab.im, ba.im === 0 ? 0 : -ba.im);

				// Exact additive inverse round-trip: a - b - (-b) === a
				const roundTrip = subtractComplexStable(a, b, {
					re: -b.re,
					im: -b.im
				});
				assert.deepStrictEqual(roundTrip, {
					re: a.re === 0 ? 0 : a.re,
					im: a.im === 0 ? 0 : a.im
				});
			}
		}
	});
});
