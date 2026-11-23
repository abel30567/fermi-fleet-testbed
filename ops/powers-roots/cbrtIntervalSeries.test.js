import test from 'node:test';
import assert from 'node:assert/strict';
import { cbrtIntervalSeries } from './cbrtIntervalSeries.js';

const f64 = new Float64Array(1);
const u64 = new BigUint64Array(f64.buffer);

/**
 * Independent IEEE 754 nextUp helper for test assertions.
 */
function nextUp(x) {
	if (x === 0) return Number.MIN_VALUE;
	f64[0] = x;
	if (x > 0) {
		u64[0] += 1n;
	} else {
		u64[0] -= 1n;
	}
	return f64[0] === 0 ? 0 : f64[0];
}

/**
 * Independent exact decoding of any finite IEEE 754 binary64 into signed rational
 * representation `m * 2^e` (`m` BigInt, `e` integer) for exact cube verification.
 */
function decodeExact(x) {
	if (x === 0) return { m: 0n, e: 0 };
	const neg = x < 0;
	f64[0] = Math.abs(x);
	const bits = u64[0];
	const expField = Number((bits >> 52n) & 0x7ffn);
	const frac = bits & ((1n << 52n) - 1n);
	let m;
	let e;
	if (expField === 0) {
		m = frac;
		e = -1074;
	} else {
		m = (1n << 52n) | frac;
		e = expField - 1075;
	}
	return { m: neg ? -m : m, e };
}

/**
 * Exact comparison of `r^3` vs `x` for any finite signed binary64 values.
 * Returns -1 if r^3 < x, 0 if r^3 === x, 1 if r^3 > x.
 */
function compareSignedCube(r, x) {
	if (r === 0 && x === 0) return 0;
	if (r === 0) return x > 0 ? -1 : 1;
	if (x === 0) return r > 0 ? 1 : -1;
	if (r < 0 && x > 0) return -1;
	if (r > 0 && x < 0) return 1;

	const dr = decodeExact(r);
	const dx = decodeExact(x);
	const r3 = dr.m * dr.m * dr.m;
	const shift = 3 * dr.e - dx.e;

	let lhs;
	let rhs;
	if (shift >= 0) {
		lhs = r3 << BigInt(shift);
		rhs = dx.m;
	} else {
		lhs = r3;
		rhs = dx.m << BigInt(-shift);
	}

	if (lhs < rhs) return -1;
	if (lhs > rhs) return 1;
	return 0;
}

/**
 * Independent integer Newton-Raphson floor(cbrt(N)) on arbitrary-precision BigInt.
 */
function bigIntCbrtFloor(n) {
	if (n === 0n) return 0n;
	// Initial overestimate from bit length: 2^(ceil(bitLen / 3))
	const bitLen = n.toString(2).length;
	let x = 1n << BigInt(Math.ceil(bitLen / 3));
	while (true) {
		const next = (2n * x + n / (x * x)) / 3n;
		if (next >= x) return x;
		x = next;
	}
}

/**
 * Assert that `[outLo, outHi]` is a valid mathematically guaranteed enclosure of
 * `cbrt([lo, hi])`, i.e., `outLo^3 <= lo` and `hi <= outHi^3`.
 */
function assertEnclosure(lo, hi, result) {
	assert.equal(Array.isArray(result), true);
	assert.equal(result.length, 2);
	const [outLo, outHi] = result;
	assert.equal(Number.isFinite(outLo), true);
	assert.equal(Number.isFinite(outHi), true);
	assert.ok(outLo <= outHi, `Expected outLo (${outLo}) <= outHi (${outHi})`);
	assert.ok(
		compareSignedCube(outLo, lo) <= 0,
		`Lower bound violated: (${outLo})^3 > ${lo}`,
	);
	assert.ok(
		compareSignedCube(outHi, hi) >= 0,
		`Upper bound violated: (${outHi})^3 < ${hi}`,
	);
}

test('exact cubes return exact point and interval results without over-widening', () => {
	assert.deepEqual(cbrtIntervalSeries([0, 0]), [0, 0]);
	assert.deepEqual(cbrtIntervalSeries([-0, 0]), [0, 0]);
	assert.deepEqual(cbrtIntervalSeries([-0, -0]), [0, 0]);
	assert.equal(Object.is(cbrtIntervalSeries([-0, -0])[0], 0), true);
	assert.equal(Object.is(cbrtIntervalSeries([-0, -0])[1], 0), true);

	assert.deepEqual(cbrtIntervalSeries([1, 1]), [1, 1]);
	assert.deepEqual(cbrtIntervalSeries([-1, -1]), [-1, -1]);
	assert.deepEqual(cbrtIntervalSeries([8, 8]), [2, 2]);
	assert.deepEqual(cbrtIntervalSeries([-8, -8]), [-2, -2]);
	assert.deepEqual(cbrtIntervalSeries([27, 27]), [3, 3]);
	assert.deepEqual(cbrtIntervalSeries([-64, -64]), [-4, -4]);
	assert.deepEqual(cbrtIntervalSeries([1000, 1000]), [10, 10]);
	assert.deepEqual(cbrtIntervalSeries([0.125, 0.125]), [0.5, 0.5]);
	assert.deepEqual(cbrtIntervalSeries([-0.015625, 0.125]), [-0.25, 0.5]);
	assert.deepEqual(cbrtIntervalSeries([-27, 64]), [-3, 4]);
	assert.deepEqual(cbrtIntervalSeries([0, 1000]), [0, 10]);
	assert.deepEqual(cbrtIntervalSeries([-125, 0]), [-5, 0]);
	assert.deepEqual(cbrtIntervalSeries([2 ** 300, 2 ** 300]), [2 ** 100, 2 ** 100]);
	assert.deepEqual(cbrtIntervalSeries([2 ** -300, 2 ** -300]), [2 ** -100, 2 ** -100]);
});

test('irrational point intervals achieve optimal 1-ULP outward rounding enclosure', () => {
	const values = [
		2, -2, 3, -3, 5, 7, 10, -10, 0.1, -0.1, 0.5, -0.5,
		Math.PI, -Math.E, 1e-50, -1e-50, 1e100, -1e100,
		1 + Number.EPSILON, 1 - Number.EPSILON / 2,
		8 - 8 * Number.EPSILON, 8 + 8 * Number.EPSILON,
	];

	for (const x of values) {
		const res = cbrtIntervalSeries([x, x]);
		assertEnclosure(x, x, res);
		const [outLo, outHi] = res;
		assert.equal(
			outHi,
			nextUp(outLo),
			`Expected 1-ULP tight enclosure for irrational cbrt(${x}), got [${outLo}, ${outHi}]`,
		);
		assert.ok(
			compareSignedCube(outLo, x) < 0 && compareSignedCube(outHi, x) > 0,
			`Expected strict bracketing for irrational cbrt(${x})`,
		);
	}
});

test('extreme values, subnormals, and boundary transitions preserve enclosure', () => {
	// Number.MIN_VALUE === 2^-1074 === (2^-358)^3 (exact cube!)
	assert.deepEqual(
		cbrtIntervalSeries([Number.MIN_VALUE, Number.MIN_VALUE]),
		[2 ** -358, 2 ** -358],
	);
	assert.deepEqual(
		cbrtIntervalSeries([-Number.MIN_VALUE, -Number.MIN_VALUE]),
		[-(2 ** -358), -(2 ** -358)],
	);

	const cases = [
		[Number.MIN_VALUE, Number.MIN_VALUE * 7],
		[-Number.MIN_VALUE * 13, Number.MIN_VALUE * 5],
		[2 ** -1022, 2 ** -1021],
		[Number.MAX_VALUE / 8, Number.MAX_VALUE],
		[Number.MAX_VALUE, Number.MAX_VALUE],
		[-Number.MAX_VALUE, -Number.MAX_VALUE],
		[-Number.MAX_VALUE, Number.MAX_VALUE],
		[-1e-300, 1e300],
		[-1e300, 1e-300],
	];

	for (const [lo, hi] of cases) {
		const res = cbrtIntervalSeries([lo, hi]);
		assertEnclosure(lo, hi, res);
	}
});

test('odd symmetry and inclusion isotonicity hold exactly', () => {
	const intervals = [
		[0.2, 5.7],
		[1e-20, 1e20],
		[-3.5, 9.2],
		[Number.MIN_VALUE * 3, 2 ** -1000],
		[1e250, Number.MAX_VALUE],
	];

	for (const [lo, hi] of intervals) {
		const [rLo, rHi] = cbrtIntervalSeries([lo, hi]);
		const [negLo, negHi] = cbrtIntervalSeries([-hi, -lo]);
		assert.equal(negLo, -rHi, `Odd symmetry lower bound mismatch for [${lo}, ${hi}]`);
		assert.equal(negHi, -rLo, `Odd symmetry upper bound mismatch for [${lo}, ${hi}]`);
	}

	// Inclusion isotonicity: [a, b] subset of [c, d] => cbrt([a, b]) subset of cbrt([c, d])
	const nested = [
		{ inner: [-1, 2], outer: [-10, 10] },
		{ inner: [1.5, 1.500001], outer: [1, 2] },
		{ inner: [-100, -50], outer: [-1000, 0] },
		{ inner: [Number.MIN_VALUE * 2, Number.MIN_VALUE * 4], outer: [0, 2 ** -1022] },
	];

	for (const { inner, outer } of nested) {
		const [iLo, iHi] = cbrtIntervalSeries(inner);
		const [oLo, oHi] = cbrtIntervalSeries(outer);
		assert.ok(oLo <= iLo && iHi <= oHi, 'Inclusion isotonicity violated');
	}
});

test('input validation rejects invalid types, shapes, NaN, infinities, and inverted intervals', () => {
	const typeErrorInputs = [
		null,
		undefined,
		42,
		'1,2',
		{ lo: 1, hi: 2 },
		[],
		[1],
		[1, 2, 3],
		['1', 2],
		[1, '2'],
		[null, 2],
		[1, undefined],
		[1n, 2n],
		new Array(2),
	];

	for (const bad of typeErrorInputs) {
		assert.throws(() => cbrtIntervalSeries(bad), TypeError);
	}

	const rangeErrorInputs = [
		[NaN, 1],
		[1, NaN],
		[NaN, NaN],
		[-Infinity, 1],
		[1, Infinity],
		[-Infinity, Infinity],
		[Infinity, Infinity],
		[2, 1],
		[0, -1],
		[-1, -2],
		[Number.MIN_VALUE, 0],
	];

	for (const bad of rangeErrorInputs) {
		assert.throws(() => cbrtIntervalSeries(bad), RangeError);
	}
});

test('independent cross-check: dense point sampling across diverse intervals', () => {
	const testIntervals = [
		[-100, 100],
		[-10, -0.001],
		[0.001, 10],
		[-1e-5, 1e-5],
		[0.999999, 1.000001],
		[7.999999, 8.000001],
		[-1e12, 1e12],
		[1, 8],
	];

	const samplesPerInterval = 200;

	for (const [lo, hi] of testIntervals) {
		const [outLo, outHi] = cbrtIntervalSeries([lo, hi]);
		assertEnclosure(lo, hi, [outLo, outHi]);

		for (let i = 0; i <= samplesPerInterval; i++) {
			const t = i / samplesPerInterval;
			const x = lo + (hi - lo) * t;
			// Clamp x to [lo, hi] in case endpoint arithmetic rounds slightly outside
			const clamped = Math.min(hi, Math.max(lo, x));

			// Exact algebraic enclosure check: outLo^3 <= clamped <= outHi^3
			assert.ok(
				compareSignedCube(outLo, clamped) <= 0,
				`Sample ${clamped} fell below outLo^3 (${outLo}) for [${lo}, ${hi}]`,
			);
			assert.ok(
				compareSignedCube(outHi, clamped) >= 0,
				`Sample ${clamped} exceeded outHi^3 (${outHi}) for [${lo}, ${hi}]`,
			);

			// Also verify Math.cbrt lies within [outLo, outHi] (or within 1 ULP of endpoint)
			const ref = Math.cbrt(clamped);
			assert.ok(
				ref >= outLo || compareSignedCube(ref, lo) < 0,
				`Math.cbrt(${clamped})=${ref} unexpectedly below outLo=${outLo}`,
			);
			assert.ok(
				ref <= outHi || compareSignedCube(ref, hi) > 0,
				`Math.cbrt(${clamped})=${ref} unexpectedly above outHi=${outHi}`,
			);
		}
	}
});

test('independent cross-check: arbitrary-precision BigInt Newton-Raphson cube root', () => {
	// Test points covering all remainders mod 3, anchor midpoints, subnormals, and large magnitudes
	const testValues = [
		Number.MIN_VALUE * 2,
		Number.MIN_VALUE * 17,
		2 ** -1022 * 1.3333333333333333,
		2 ** -100 * 1.9999999999999998,
		0.12345678901234568,
		1.0078125 ** 3 * (1 + 1e-15), // near anchor midpoint
		(128.5 / 128) ** 3,           // exact worst-case anchor midpoint
		(255.5 / 128) ** 3,           // near upper end of [1, 8)
		2,
		3,
		7.999999999999999,
		123456.789,
		1e150,
		Number.MAX_VALUE,
	];

	for (const x of testValues) {
		const [outLo, outHi] = cbrtIntervalSeries([x, x]);

		// Compute floor(cbrt(x) * 2^K) independently using BigInt integer Newton-Raphson
		// Pick scaling so x * 2^(3K) is a large integer with > 200 bits of precision.
		const { m, e } = decodeExact(x);
		// Need 3*K + e >= 0 and bitLength(m) + 3*K + e >= 600 => K = ceil((600 - e) / 3)
		const K = Math.ceil((600 - e) / 3);
		const scaledInt = m << BigInt(3 * K + e);
		const rootFloor = bigIntCbrtFloor(scaledInt);
		const isExact = rootFloor * rootFloor * rootFloor === scaledInt;
		const rootCeil = isExact ? rootFloor : rootFloor + 1n;

		// Compare outLo <= rootFloor / 2^K and rootCeil / 2^K <= outHi exactly
		const dLo = decodeExact(outLo);
		const dHi = decodeExact(outHi);

		// outLo * 2^K = dLo.m * 2^(dLo.e + K)
		const loShift = dLo.e + K;
		const loScaled = loShift >= 0 ? dLo.m << BigInt(loShift) : dLo.m;
		const floorCmp = loShift >= 0 ? rootFloor : rootFloor << BigInt(-loShift);
		assert.ok(
			loScaled <= floorCmp,
			`BigInt Newton cross-check failed lower bound for x=${x}`,
		);

		const hiShift = dHi.e + K;
		const hiScaled = hiShift >= 0 ? dHi.m << BigInt(hiShift) : dHi.m;
		const ceilCmp = hiShift >= 0 ? rootCeil : rootCeil << BigInt(-hiShift);
		assert.ok(
			hiScaled >= ceilCmp,
			`BigInt Newton cross-check failed upper bound for x=${x}`,
		);
	}
});
