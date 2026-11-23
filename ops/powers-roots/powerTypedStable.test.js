import test from 'node:test';
import assert from 'node:assert/strict';
import { powerTypedStable } from './powerTypedStable.js';

/**
 * Compute the ULP distance between two finite float64 numbers.
 */
function ulpDistance(a, b) {
	if (Object.is(a, b)) return 0n;
	const buf = new ArrayBuffer(16);
	const f64 = new Float64Array(buf);
	const i64 = new BigInt64Array(buf);
	f64[0] = a;
	f64[1] = b;
	const toOrdered = (bits) => (bits < 0n ? 0x8000000000000000n - bits : bits);
	const oa = toOrdered(i64[0]);
	const ob = toOrdered(i64[1]);
	return oa >= ob ? oa - ob : ob - oa;
}

test('input validation', () => {
	assert.throws(() => powerTypedStable([2], new Float64Array([3])), TypeError);
	assert.throws(() => powerTypedStable(new Float64Array([2]), [3]), TypeError);
	assert.throws(() => powerTypedStable(new Float32Array([2]), new Float64Array([3])), TypeError);
	assert.throws(() => powerTypedStable(null, new Float64Array([3])), TypeError);
	assert.throws(() => powerTypedStable(new Float64Array([2]), undefined), TypeError);
	assert.throws(
		() => powerTypedStable(new Float64Array([1, 2]), new Float64Array([3])),
		RangeError
	);
});

test('empty Float64Array returns empty Float64Array', () => {
	const out = powerTypedStable(new Float64Array(0), new Float64Array(0));
	assert.ok(out instanceof Float64Array);
	assert.equal(out.length, 0);
});

test('normal element-wise powers and does not mutate inputs', () => {
	const bases = new Float64Array([2, 3, 4, 9, 10, 0.5, 2.5, 16]);
	const exps = new Float64Array([10, 4, 0.5, -0.5, 3, -3, 2, 0.25]);
	const basesSnap = new Float64Array(bases);
	const expsSnap = new Float64Array(exps);

	const out = powerTypedStable(bases, exps);
	assert.ok(out instanceof Float64Array);
	assert.equal(out.length, bases.length);
	assert.deepEqual(bases, basesSnap);
	assert.deepEqual(exps, expsSnap);

	const expected = [1024, 81, 2, 1 / 3, 1000, 8, 6.25, 2];
	for (let i = 0; i < expected.length; i += 1) {
		assert.ok(
			ulpDistance(out[i], expected[i]) <= 1n,
			`index ${i}: got ${out[i]}, expected ${expected[i]}`
		);
	}
});

test('negative bases with integer and non-integer exponents', () => {
	const bases = new Float64Array([-2, -2, -3, -3, -2, -0.5, -4, -1, -1, -1]);
	const exps = new Float64Array([3, 4, 3, -2, 0.5, -3, 1.5, 2, 3, 0.5]);
	const out = powerTypedStable(bases, exps);

	assert.equal(out[0], -8);
	assert.equal(out[1], 16);
	assert.equal(out[2], -27);
	assert.ok(ulpDistance(out[3], 1 / 9) <= 1n);
	assert.ok(Number.isNaN(out[4]));
	assert.equal(out[5], -8);
	assert.ok(Number.isNaN(out[6]));
	assert.equal(out[7], 1);
	assert.equal(out[8], -1);
	assert.ok(Number.isNaN(out[9]));
});

test('IEEE 754 / ECMAScript special values: NaN, ±0, ±Infinity, ±1', () => {
	const cases = [
		[NaN, 0, 1],
		[NaN, -0, 1],
		[0, 0, 1],
		[-0, 0, 1],
		[Infinity, 0, 1],
		[-Infinity, 0, 1],
		[NaN, 2, NaN],
		[2, NaN, NaN],
		[1, NaN, NaN],
		[1, Infinity, NaN],
		[1, -Infinity, NaN],
		[-1, Infinity, NaN],
		[-1, -Infinity, NaN],
		[1, 1e300, 1],
		[2, Infinity, Infinity],
		[2, -Infinity, 0],
		[0.5, Infinity, 0],
		[0.5, -Infinity, Infinity],
		[-2, Infinity, Infinity],
		[-0.5, Infinity, 0],
		[Infinity, 2, Infinity],
		[Infinity, -2, 0],
		[-Infinity, 3, -Infinity],
		[-Infinity, 2, Infinity],
		[-Infinity, -3, -0],
		[-Infinity, -2, 0],
		[0, 2, 0],
		[0, -2, Infinity],
		[-0, 3, -0],
		[-0, 2, 0],
		[-0, -3, -Infinity],
		[-0, -2, Infinity],
	];

	const bases = new Float64Array(cases.map((c) => c[0]));
	const exps = new Float64Array(cases.map((c) => c[1]));
	const out = powerTypedStable(bases, exps);

	for (let i = 0; i < cases.length; i += 1) {
		const [x, y, exp] = cases[i];
		if (Number.isNaN(exp)) {
			assert.ok(Number.isNaN(out[i]), `case ${i} (${x} ** ${y}): expected NaN, got ${out[i]}`);
		} else {
			assert.ok(
				Object.is(out[i], exp),
				`case ${i} (${x} ** ${y}): expected ${Object.is(exp, -0) ? '-0' : exp}, got ${Object.is(out[i], -0) ? '-0' : out[i]}`
			);
		}
	}
});

test('high-precision stability near base = 1 with large exponents (compound limit to e)', () => {
	// (1 + 2^-k)^(2^k) = exp(1 - 2^-(k+1) + 2^-(2k)/3 - ...)
	// Naive Math.exp(y * Math.log(x)) loses precision as 2^-k shrinks; double-double preserves full accuracy.
	const ks = [20, 28, 36, 44, 50];
	const bases = new Float64Array(ks.map((k) => 1 + 2 ** -k));
	const exps = new Float64Array(ks.map((k) => 2 ** k));
	const out = powerTypedStable(bases, exps);

	for (let i = 0; i < ks.length; i += 1) {
		const k = ks[i];
		const h = 2 ** -k;
		// Analytic asymptotic expansion: e * (1 - h/2 + 11*h^2/24 - 7*h^3/16)
		const expected = Math.E * (1 - 0.5 * h + (11 / 24) * h * h - (7 / 16) * h * h * h);
		assert.ok(
			ulpDistance(out[i], expected) <= 2n,
			`k=${k}: got ${out[i]}, expected ${expected}, ulp=${ulpDistance(out[i], expected)}`
		);
	}
});

test('extreme scaling, overflow, underflow, and subnormal inputs/outputs', () => {
	const cases = [
		// Exact subnormal outputs
		[2, -1074, Number.MIN_VALUE],
		[0.5, 1074, Number.MIN_VALUE],
		[2, -1075, 0],
		[-2, -1075, -0],
		// Non-power-of-two subnormal output (10^-323 ~= 9.88e-324)
		[10, -323, 1e-323],
		[10, -324, 0],
		// Subnormal input scaled up to normal
		[Number.MIN_VALUE, 0.5, 2 ** -537],
		[Number.MIN_VALUE, -0.5, 2 ** 537],
		[2 ** -537, 2, Number.MIN_VALUE],
		// Near MAX_VALUE without premature overflow
		[2, 1023, 2 ** 1023],
		[10, 308, 1e308],
		[10, 309, Infinity],
		[-10, 309, -Infinity],
		// Huge exponent with base slightly != 1
		[1 + Number.EPSILON, 1e25, Infinity],
		[1 - Number.EPSILON / 2, 1e25, 0],
		// Tiny exponent near 0
		[1e300, 1e-300, 1],
		[Number.MIN_VALUE, 1e-300, 1],
	];

	const bases = new Float64Array(cases.map((c) => c[0]));
	const exps = new Float64Array(cases.map((c) => c[1]));
	const out = powerTypedStable(bases, exps);

	for (let i = 0; i < cases.length; i += 1) {
		const [x, y, expected] = cases[i];
		if (!Number.isFinite(expected) || expected === 0) {
			assert.ok(
				Object.is(out[i], expected),
				`case ${i} (${x} ** ${y}): expected ${Object.is(expected, -0) ? '-0' : expected}, got ${Object.is(out[i], -0) ? '-0' : out[i]}`
			);
		} else {
			assert.ok(
				ulpDistance(out[i], expected) <= 1n,
				`case ${i} (${x} ** ${y}): got ${out[i]}, expected ${expected}, ulp=${ulpDistance(out[i], expected)}`
			);
		}
	}
});

test('independent cross-check: exact BigInt integer powers and algebraic identities', () => {
	// 1. Cross-check against exact BigInt exponentiation for integer bases & exponents
	// whose exact result fits within IEEE 754 exact integer range (<= 2^53).
	const pairs = [
		[3n, 33n],
		[5n, 22n],
		[7n, 18n],
		[11n, 15n],
		[13n, 14n],
		[17n, 12n],
		[19n, 12n],
		[-3n, 31n],
		[-5n, 21n],
		[-7n, 18n],
	];
	const bArr = new Float64Array(pairs.map(([b]) => Number(b)));
	const eArr = new Float64Array(pairs.map(([, e]) => Number(e)));
	const res = powerTypedStable(bArr, eArr);
	for (let i = 0; i < pairs.length; i += 1) {
		const exact = Number(pairs[i][0] ** pairs[i][1]);
		assert.equal(res[i], exact, `BigInt exact check failed for ${pairs[i][0]}**${pairs[i][1]}`);
	}

	// 2. Algebraic identities across diverse positive values:
	//    (x^a)^b === x^(a*b), x^a * x^b === x^(a+b), (x^n)^(1/n) === x
	const xs = new Float64Array([0.123456789, 0.99999, 1.00001, Math.PI, 7.5, 42.125, 1e12, 1e-12]);
	const as = new Float64Array([0.3, -1.7, 2.5, 0.75, -0.4, 3.25, 0.125, -0.25]);
	const bs = new Float64Array([1.4, 0.8, -0.6, 1.25, 2.5, -0.5, 4.0, 2.0]);

	const xToA = powerTypedStable(xs, as);
	const xToB = powerTypedStable(xs, bs);
	const xToAThenB = powerTypedStable(xToA, bs);
	const aTimesB = new Float64Array(xs.length);
	const aPlusB = new Float64Array(xs.length);
	for (let i = 0; i < xs.length; i += 1) {
		aTimesB[i] = as[i] * bs[i];
		aPlusB[i] = as[i] + bs[i];
	}
	const xToAB = powerTypedStable(xs, aTimesB);
	const xToAPlusB = powerTypedStable(xs, aPlusB);

	for (let i = 0; i < xs.length; i += 1) {
		const relMul = Math.abs(xToAThenB[i] - xToAB[i]) / Math.abs(xToAB[i]);
		assert.ok(relMul < 1e-14, `power-of-power identity failed at ${i}: rel=${relMul}`);
		const prod = xToA[i] * xToB[i];
		const relAdd = Math.abs(prod - xToAPlusB[i]) / Math.abs(xToAPlusB[i]);
		assert.ok(relAdd < 1e-14, `product identity failed at ${i}: rel=${relAdd}`);
	}

	// 3. Cross-check against Math.pow across a broad grid of finite values (<= 1 ULP).
	const gridX = new Float64Array(200);
	const gridY = new Float64Array(200);
	let seed = 0x12345678;
	const nextRand = () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed / 0x100000000;
	};
	for (let i = 0; i < 200; i += 1) {
		// Mix small, near-1, moderate, and large bases and exponents
		const mode = i % 4;
		if (mode === 0) {
			gridX[i] = 1 + (nextRand() - 0.5) * 1e-6;
			gridY[i] = (nextRand() - 0.5) * 1e6;
		} else if (mode === 1) {
			gridX[i] = Math.exp((nextRand() - 0.5) * 40);
			gridY[i] = (nextRand() - 0.5) * 30;
		} else if (mode === 2) {
			gridX[i] = nextRand() * 100 + 1e-9;
			gridY[i] = (nextRand() - 0.5) * 20;
		} else {
			gridX[i] = -(nextRand() * 50 + 0.1);
			gridY[i] = Math.trunc((nextRand() - 0.5) * 40);
		}
	}

	const stableOut = powerTypedStable(gridX, gridY);
	for (let i = 0; i < 200; i += 1) {
		const ref = Math.pow(gridX[i], gridY[i]);
		if (Number.isFinite(ref)) {
			const ulp = ulpDistance(stableOut[i], ref);
			assert.ok(
				ulp <= 1n,
				`grid ${i} (${gridX[i]} ** ${gridY[i]}): got ${stableOut[i]}, Math.pow=${ref}, ulp=${ulp}`
			);
		} else {
			assert.ok(Object.is(stableOut[i], ref));
		}
	}
});
