import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { multiplyTypedSeries } from './multiplyTypedSeries.js';

/**
 * Independent reference: exact decimal-scaled BigInt product for decimal strings
 * (e.g. ['0.1', '0.2', '0.3']) converted back to IEEE-754 double.
 */
function exactDecimalProduct(decimalStrings) {
	let num = 1n;
	let scale = 0;
	for (const s of decimalStrings) {
		const neg = s.startsWith('-');
		const body = neg ? s.slice(1) : s;
		const dot = body.indexOf('.');
		const digits = dot === -1 ? body : body.slice(0, dot) + body.slice(dot + 1);
		if (dot !== -1) {
			scale += body.length - dot - 1;
		}
		num *= (neg ? -1n : 1n) * BigInt(digits);
	}
	const neg = num < 0n;
	const absStr = (neg ? -num : num).toString().padStart(scale + 1, '0');
	const decStr =
		scale === 0
			? absStr
			: `${absStr.slice(0, absStr.length - scale)}.${absStr.slice(absStr.length - scale)}`;
	return Number(neg ? `-${decStr}` : decStr);
}

/**
 * Independent reference: sign-tracked log-exp series product for non-zero finite factors.
 */
function logExpSeriesProduct(values) {
	let sign = 1;
	let logSum = 0;
	for (const v of values) {
		if (v === 0) {
			if (Object.is(v, -0)) sign = -sign;
			return sign < 0 ? -0 : 0;
		}
		if (v < 0) sign = -sign;
		logSum += Math.log(Math.abs(v));
	}
	return sign * Math.exp(logSum);
}

describe('multiplyTypedSeries', () => {
	describe('basic and two-array multiplication (cross-checked against direct multiplication)', () => {
		it('multiplies two Float64Arrays element-wise matching direct floating-point multiplication', () => {
			const a = new Float64Array([0, 1, -1, 2.5, -3.75, Math.PI, Math.SQRT2, 1e-12, 1e12]);
			const b = new Float64Array([5, 7, 11, -4, -8, Math.E, Math.LN2, 3.5e6, -2.25e-5]);

			const result = multiplyTypedSeries(a, b);
			assert.ok(result instanceof Float64Array);
			assert.equal(result.length, a.length);
			assert.notEqual(result, a);
			assert.notEqual(result, b);

			for (let i = 0; i < a.length; i++) {
				assert.equal(result[i], a[i] * b[i], `mismatch at index ${i}`);
			}
		});

		it('supports passing an array of Float64Arrays interchangeably with variadic arguments', () => {
			const a = new Float64Array([2, -3, 0.5, 1.25]);
			const b = new Float64Array([4, 5, -0.25, 8]);
			const c = new Float64Array([-1, -2, 16, 0.1]);

			const variadic = multiplyTypedSeries(a, b, c);
			const packed = multiplyTypedSeries([a, b, c]);

			assert.deepEqual(packed, variadic);
			assert.equal(variadic[0], -8);
			assert.equal(variadic[1], 30);
			assert.equal(variadic[2], -2);
			assert.equal(variadic[3], 1);
		});

		it('returns a fresh copy when given a single Float64Array', () => {
			const a = new Float64Array([1, -2.5, 0, -0, 42]);
			const resVariadic = multiplyTypedSeries(a);
			const resPacked = multiplyTypedSeries([a]);

			assert.notEqual(resVariadic, a);
			assert.notEqual(resPacked, a);
			assert.deepEqual(resVariadic, a);
			assert.deepEqual(resPacked, a);
			assert.ok(Object.is(resVariadic[3], -0));
		});

		it('does not mutate input arrays', () => {
			const a = new Float64Array([1.5, -2.5, 3.5]);
			const b = new Float64Array([4, 5, 6]);
			const aSnap = new Float64Array(a);
			const bSnap = new Float64Array(b);

			multiplyTypedSeries(a, b);
			assert.deepEqual(a, aSnap);
			assert.deepEqual(b, bSnap);
		});

		it('handles empty Float64Arrays', () => {
			const empty1 = new Float64Array(0);
			const empty2 = new Float64Array(0);
			const res = multiplyTypedSeries(empty1, empty2);

			assert.ok(res instanceof Float64Array);
			assert.equal(res.length, 0);
			assert.notEqual(res, empty1);
		});
	});

	describe('overflow/underflow immunity and compensated precision in series products', () => {
		it('avoids intermediate overflow when the true product is representable', () => {
			const s1 = new Float64Array([1e200, 1e308, Number.MAX_VALUE]);
			const s2 = new Float64Array([1e200, 1e308, 2]);
			const s3 = new Float64Array([1e-300, 1e-308, 0.5]);
			const s4 = new Float64Array([1, 1e-308, 1]);

			const result = multiplyTypedSeries(s1, s2, s3, s4);

			// Naive left-to-right overflows to Infinity for all 3 elements
			assert.equal(s1[0] * s2[0] * s3[0] * s4[0], Infinity);
			assert.equal(s1[1] * s2[1] * s3[1] * s4[1], Infinity);
			assert.equal(s1[2] * s2[2] * s3[2] * s4[2], Infinity);

			// Compensated frexp/TwoProduct recovers accurate finite values
			assert.ok(Math.abs(result[0] - 1e100) / 1e100 < 1e-15);
			assert.ok(Math.abs(result[1] - 1) < 1e-15);
			assert.equal(result[2], Number.MAX_VALUE);
		});

		it('avoids intermediate underflow when the true product is representable', () => {
			const s1 = new Float64Array([1e-200, 1e-300, Number.MIN_VALUE]);
			const s2 = new Float64Array([1e-200, 1e-300, Number.MIN_VALUE]);
			const s3 = new Float64Array([1e300, 1e300, 2 ** 1020]);
			const s4 = new Float64Array([1, 1e300, 2 ** 54]);

			const result = multiplyTypedSeries(s1, s2, s3, s4);

			// Naive left-to-right underflows to 0 for all 3 elements
			assert.equal(s1[0] * s2[0] * s3[0] * s4[0], 0);
			assert.equal(s1[1] * s2[1] * s3[1] * s4[1], 0);
			assert.equal(s1[2] * s2[2] * s3[2] * s4[2], 0);

			assert.ok(Math.abs(result[0] - 1e-100) / 1e-100 < 1e-15);
			assert.ok(Math.abs(result[1] - 1) < 1e-15);
			assert.equal(result[2], Number.MIN_VALUE);
		});

		it('handles true final overflow and true final underflow with correct signs', () => {
			const a = new Float64Array([1e200, -1e200, 1e-200, -1e-200]);
			const b = new Float64Array([1e200, 1e200, 1e-200, 1e-200]);

			const result = multiplyTypedSeries(a, b);
			assert.equal(result[0], Infinity);
			assert.equal(result[1], -Infinity);
			assert.ok(Object.is(result[2], 0));
			assert.ok(Object.is(result[3], -0));
		});

		it('handles subnormal inputs and subnormal rounding boundaries accurately', () => {
			const minSub = Number.MIN_VALUE; // 2^-1074
			const minNorm = 2 ** -1022;
			const a = new Float64Array([minSub, minSub, minSub, minSub, minNorm]);
			const b = new Float64Array([1, 2, 0.5, 0.75, 0.5]);

			const result = multiplyTypedSeries(a, b);
			assert.equal(result[0], minSub);
			assert.equal(result[1], 2 * minSub);
			assert.ok(Object.is(result[2], 0)); // 0.5 * 2^-1074 rounds-to-even to 0
			assert.equal(result[3], minSub); // 0.75 * 2^-1074 rounds to 2^-1074
			assert.equal(result[4], 2 ** -1023);
		});

		it('maintains high precision via TwoProduct EFT (cross-checked against exact BigInt/rational and log-exp references)', () => {
			// Exact integer & dyadic products remain bit-exact (no log-exp 1-ulp drift)
			const ints = [2, 3, 5, 7, 11, 13, 17, 19].map((v) => new Float64Array([v]));
			assert.equal(multiplyTypedSeries(ints)[0], 9699690);

			// Compensated precision on (1 + 2^-27)^2 * (1 - 2^-27)^2 = (1 - 2^-54)^2 = 1 - 2^-53 + 2^-108
			// Exact IEEE-754 double is 1 - 2^-53 (whereas naive left-to-right loses 2^-54 in the first product)
			const p = 1 + 2 ** -27;
			const q = 1 - 2 ** -27;
			const comp = multiplyTypedSeries(
				new Float64Array([p]),
				new Float64Array([p]),
				new Float64Array([q]),
				new Float64Array([q])
			);
			const expected = 1 - 2 ** -53;
			assert.equal(comp[0], expected);

			// Cross-check a multi-factor series against independent log-exp reference
			const factors = [1.3, -2.7, 0.45, 19.25, -0.008, 123.456, 0.77];
			const series = factors.map((v) => new Float64Array([v]));
			const actual = multiplyTypedSeries(series)[0];
			const refLogExp = logExpSeriesProduct(factors);
			assert.ok(Math.abs(actual - refLogExp) / Math.abs(refLogExp) < 1e-14);

			// Cross-check exact decimal product via BigInt reference
			const decStrings = ['1.25', '0.8', '3.5', '0.2', '7.0', '0.5'];
			const decSeries = decStrings.map((s) => new Float64Array([Number(s)]));
			const decActual = multiplyTypedSeries(decSeries)[0];
			const decExact = exactDecimalProduct(decStrings);
			assert.ok(Math.abs(decActual - decExact) <= 1e-15);
		});
	});

	describe('algebraic identities (zero, one, commutativity, associativity, distributivity)', () => {
		it('satisfies zero and signed-zero identities (even alongside huge factors)', () => {
			const a = new Float64Array([5, -5, 5, -5, 1e200, -1e200]);
			const b = new Float64Array([0, 0, -0, -0, 1e200, 1e200]);
			const c = new Float64Array([1, 1, 1, 1, 0, -0]);

			const result = multiplyTypedSeries(a, b, c);
			assert.ok(Object.is(result[0], 0));
			assert.ok(Object.is(result[1], -0));
			assert.ok(Object.is(result[2], -0));
			assert.ok(Object.is(result[3], 0));
			// Naive (1e200 * 1e200) * 0 produces NaN; true product is exact signed zero
			assert.ok(Object.is(result[4], 0));
			assert.ok(Object.is(result[5], 0)); // (-1e200) * (+1e200) * (-0) => +0
		});

		it('satisfies multiplicative identity (1) and negation (-1)', () => {
			const a = new Float64Array([0, -0, 1, -1, 3.141592653589793, -1e-300, Number.MAX_VALUE, Number.MIN_VALUE]);
			const ones = new Float64Array(a.length).fill(1);
			const negOnes = new Float64Array(a.length).fill(-1);

			const prodOne = multiplyTypedSeries(a, ones);
			const prodNegOne = multiplyTypedSeries(a, negOnes);

			for (let i = 0; i < a.length; i++) {
				assert.ok(Object.is(prodOne[i], a[i]), `identity failed at ${i}`);
				assert.ok(Object.is(prodNegOne[i], -a[i]), `negation failed at ${i}`);
			}
		});

		it('satisfies commutativity across all permutations of a multi-series product', () => {
			const a = new Float64Array([1.1, -2.3, 1e180, 1e-180, 0.3]);
			const b = new Float64Array([-4.7, 5.9, 1e180, 1e-180, 0.7]);
			const c = new Float64Array([8.3, -0.125, 1e-250, 1e250, 1.9]);

			const perms = [
				multiplyTypedSeries(a, b, c),
				multiplyTypedSeries(a, c, b),
				multiplyTypedSeries(b, a, c),
				multiplyTypedSeries(b, c, a),
				multiplyTypedSeries(c, a, b),
				multiplyTypedSeries(c, b, a),
			];

			for (let p = 1; p < perms.length; p++) {
				for (let i = 0; i < a.length; i++) {
					assert.equal(perms[p][i], perms[0][i], `permutation ${p} differed at index ${i}`);
				}
			}
		});

		it('satisfies associativity: (a * b) * c == a * (b * c) == multiply(a, b, c)', () => {
			const a = new Float64Array([1.5, -2.25, 7.1, -0.33, 12.5]);
			const b = new Float64Array([0.5, 4.0, -3.7, 6.1, -0.08]);
			const c = new Float64Array([8.0, -0.125, 0.9, -2.4, 100.0]);

			const leftAssoc = multiplyTypedSeries(multiplyTypedSeries(a, b), c);
			const rightAssoc = multiplyTypedSeries(a, multiplyTypedSeries(b, c));
			const joint = multiplyTypedSeries(a, b, c);

			for (let i = 0; i < a.length; i++) {
				const scale = Math.max(1, Math.abs(joint[i]));
				assert.ok(Math.abs(leftAssoc[i] - joint[i]) <= 2 * Number.EPSILON * scale);
				assert.ok(Math.abs(rightAssoc[i] - joint[i]) <= 2 * Number.EPSILON * scale);
			}
		});

		it('satisfies distributivity over addition: a * (b + c) == (a * b) + (a * c)', () => {
			const a = new Float64Array([2.5, -3.2, 0.75, 11.4, -0.05]);
			const b = new Float64Array([4.1, 1.8, -6.4, 2.2, 100.5]);
			const c = new Float64Array([3.9, 5.2, 1.6, 8.8, 24.5]);

			const bPlusC = new Float64Array(a.length);
			for (let i = 0; i < a.length; i++) {
				bPlusC[i] = b[i] + c[i];
			}

			const lhs = multiplyTypedSeries(a, bPlusC);
			const ab = multiplyTypedSeries(a, b);
			const ac = multiplyTypedSeries(a, c);

			for (let i = 0; i < a.length; i++) {
				const rhs = ab[i] + ac[i];
				const scale = Math.max(1, Math.abs(lhs[i]), Math.abs(rhs));
				assert.ok(Math.abs(lhs[i] - rhs) <= 4 * Number.EPSILON * scale);
			}
		});
	});

	describe('input validation', () => {
		it('throws RangeError when called with no inputs or an empty array', () => {
			assert.throws(() => multiplyTypedSeries(), RangeError);
			assert.throws(() => multiplyTypedSeries([]), RangeError);
		});

		it('throws TypeError for non-Float64Array inputs', () => {
			const valid = new Float64Array([1, 2]);
			assert.throws(() => multiplyTypedSeries([1, 2], [3, 4]), TypeError);
			assert.throws(() => multiplyTypedSeries([1, 2]), TypeError);
			assert.throws(() => multiplyTypedSeries(valid, new Float32Array([1, 2])), TypeError);
			assert.throws(() => multiplyTypedSeries(valid, new Int32Array([1, 2])), TypeError);
			assert.throws(() => multiplyTypedSeries(null, valid), TypeError);
			assert.throws(() => multiplyTypedSeries(valid, undefined), TypeError);
			assert.throws(() => multiplyTypedSeries(42, valid), TypeError);
			assert.throws(() => multiplyTypedSeries('abc'), TypeError);
			assert.throws(() => multiplyTypedSeries([valid, [1, 2]]), TypeError);
		});

		it('throws RangeError for mismatched Float64Array lengths', () => {
			const a = new Float64Array([1, 2, 3]);
			const b = new Float64Array([4, 5]);
			assert.throws(() => multiplyTypedSeries(a, b), RangeError);
			assert.throws(() => multiplyTypedSeries([a, a, b]), RangeError);
		});

		it('throws RangeError for NaN, Infinity, or -Infinity elements (even when multiplied by 0)', () => {
			const ok = new Float64Array([0, 1]);
			assert.throws(() => multiplyTypedSeries(ok, new Float64Array([NaN, 2])), RangeError);
			assert.throws(() => multiplyTypedSeries(ok, new Float64Array([Infinity, 2])), RangeError);
			assert.throws(() => multiplyTypedSeries(ok, new Float64Array([-Infinity, 2])), RangeError);
			assert.throws(() => multiplyTypedSeries(new Float64Array([1, NaN])), RangeError);
			assert.throws(() => multiplyTypedSeries(new Float64Array([Infinity])), RangeError);
		});
	});
});
