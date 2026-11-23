import test from 'node:test';
import assert from 'node:assert/strict';
import { log10DualMemo } from './log10DualMemo.js';

function assertClose(actual, expected, tol = 1e-12, label = '') {
	const scale = Math.max(1, Math.abs(expected));
	assert.ok(
		Math.abs(actual - expected) <= tol * scale,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol * scale} of ${expected}`
	);
}

test('normal cases: values and forward-mode derivatives', () => {
	const r1 = log10DualMemo({ v: 1, d: 1 });
	assert.equal(r1.v, 0);
	assertClose(r1.d, 1 / Math.LN10, 1e-15, 'log10(1 + ε).d');

	const rE = log10DualMemo({ v: Math.E, d: Math.E });
	assertClose(rE.v, Math.LOG10E, 1e-15, 'log10(e).v');
	assertClose(rE.d, Math.LOG10E, 1e-15, 'log10(e + e·ε).d');

	const r2 = log10DualMemo({ v: 2, d: 3 });
	assertClose(r2.v, Math.log10(2), 1e-15, 'log10(2).v');
	assertClose(r2.d, 3 / (2 * Math.LN10), 1e-15, 'log10(2 + 3ε).d');

	const rNegD = log10DualMemo({ v: 5, d: -2.5 });
	assertClose(rNegD.v, Math.log10(5), 1e-15, 'log10(5).v');
	assertClose(rNegD.d, -2.5 / (5 * Math.LN10), 1e-15, 'log10(5 - 2.5ε).d');

	const rZeroD = log10DualMemo({ v: 42.75, d: 0 });
	assertClose(rZeroD.v, Math.log10(42.75), 1e-15, 'log10(42.75).v');
	assert.equal(rZeroD.d, 0);

	const rFrac = log10DualMemo({ v: 0.25, d: 0.5 });
	assertClose(rFrac.v, Math.log10(0.25), 1e-15, 'log10(0.25).v');
	assertClose(rFrac.d, 0.5 / (0.25 * Math.LN10), 1e-15, 'log10(0.25 + 0.5ε).d');
});

test('powers of 10 return exact integer primal values via precomputed table', () => {
	const exponents = [-300, -100, -15, -6, -3, -2, -1, 0, 1, 2, 3, 6, 15, 100, 300];
	for (const k of exponents) {
		const v = Number(`1e${k}`);
		const d = 2.5;
		const res = log10DualMemo({ v, d });
		assert.equal(res.v, k, `exact integer log10 for 1e${k}`);
		assertClose(res.d, (d / v) * Math.LOG10E, 1e-14, `derivative for 1e${k}`);
	}
});

test('small integer table boundary and non-table values', () => {
	for (const n of [1, 2, 3, 10, 100, 512, 1000, 1024, 1025, 2048]) {
		const d = 1.7;
		const res = log10DualMemo({ v: n, d });
		assertClose(res.v, Math.log10(n), 1e-15, `v for n=${n}`);
		assertClose(res.d, d / (n * Math.LN10), 1e-14, `d for n=${n}`);
	}
});

test('edge cases: extreme magnitudes and signed zero derivative', () => {
	// Large v where v * Math.LN10 would overflow if computed naively
	const hugeV = log10DualMemo({ v: 1e308, d: 1 });
	assert.equal(hugeV.v, 308);
	assertClose(hugeV.d, (1 / 1e308) * Math.LOG10E, 1e-14, 'huge v, d=1');

	// Large v and large d together
	const hugeBoth = log10DualMemo({ v: 1e308, d: 1e308 });
	assert.equal(hugeBoth.v, 308);
	assertClose(hugeBoth.d, Math.LOG10E, 1e-14, 'huge v and huge d');

	// Very small positive v
	const tinyV = log10DualMemo({ v: 1e-300, d: 1e-300 });
	assert.equal(tinyV.v, -300);
	assertClose(tinyV.d, Math.LOG10E, 1e-14, 'tiny v and tiny d');

	// Subnormal minimum positive number
	const minVal = log10DualMemo({ v: Number.MIN_VALUE, d: Number.MIN_VALUE });
	assertClose(minVal.v, Math.log10(Number.MIN_VALUE), 1e-14, 'MIN_VALUE v');
	assertClose(minVal.d, Math.LOG10E, 1e-14, 'MIN_VALUE d');

	// Signed zero derivatives remain distinct in cache
	const posZeroD = log10DualMemo({ v: 7.5, d: 0 });
	const negZeroD = log10DualMemo({ v: 7.5, d: -0 });
	assert.ok(Object.is(posZeroD.d, 0));
	assert.ok(Object.is(negZeroD.d, -0));
});

test('validation: x.v <= 0 throws RangeError', () => {
	for (const badV of [0, -0, -1e-15, -1, -10, -1e300]) {
		assert.throws(
			() => log10DualMemo({ v: badV, d: 1 }),
			{ name: 'RangeError' },
			`expected RangeError for v=${badV}`
		);
	}
});

test('validation: rejects malformed objects, non-numeric, and non-finite inputs', () => {
	const typeErrorInputs = [
		null,
		undefined,
		10,
		'10',
		true,
		[10, 1],
		{},
		{ v: 10 },
		{ d: 1 },
		{ v: '10', d: 1 },
		{ v: 10, d: '1' },
		{ v: null, d: 1 },
		{ v: 10, d: undefined },
	];
	for (const input of typeErrorInputs) {
		assert.throws(() => log10DualMemo(input), { name: 'TypeError' });
	}

	const rangeErrorInputs = [
		{ v: Number.NaN, d: 1 },
		{ v: 10, d: Number.NaN },
		{ v: Number.POSITIVE_INFINITY, d: 1 },
		{ v: Number.NEGATIVE_INFINITY, d: 1 },
		{ v: 10, d: Number.POSITIVE_INFINITY },
		{ v: 10, d: Number.NEGATIVE_INFINITY },
	];
	for (const input of rangeErrorInputs) {
		assert.throws(() => log10DualMemo(input), { name: 'RangeError' });
	}
});

test('memoization returns fresh objects and handles bounded eviction cleanly', () => {
	const first = log10DualMemo({ v: 12.345, d: 6.789 });
	const second = log10DualMemo({ v: 12.345, d: 6.789 });

	assert.deepEqual(first, second);
	assert.notEqual(first, second, 'memoized calls must return distinct objects');

	// Mutating a returned object must not corrupt the internal cache
	first.v = -999;
	first.d = -999;
	const third = log10DualMemo({ v: 12.345, d: 6.789 });
	assert.deepEqual(third, second);
	assert.notEqual(third, second);

	// Exceed bounded cache size (> 1024 distinct entries) to exercise eviction
	const totalEntries = 1500;
	for (let i = 1; i <= totalEntries; i += 1) {
		const v = 1024 + i * 0.37;
		const d = i * 0.13;
		const res = log10DualMemo({ v, d });
		assertClose(res.v, Math.log10(v), 1e-15);
		assertClose(res.d, (d / v) * Math.LOG10E, 1e-14);
	}

	// Re-query evicted early entry and verify recomputation matches
	const evicted = log10DualMemo({ v: 12.345, d: 6.789 });
	assert.deepEqual(evicted, second);
});

test('cross-check: central finite difference derivative matches dual derivative', () => {
	const points = [0.05, 0.3, 1, 2.718281828, 10, 37.5, 1000.25];
	const scales = [1, -3.5, 0.25];

	for (const x of points) {
		const h = x * 1e-6;
		const numericDeriv = (Math.log10(x + h) - Math.log10(x - h)) / (2 * h);
		for (const d of scales) {
			const dual = log10DualMemo({ v: x, d });
			assertClose(dual.d, numericDeriv * d, 1e-8, `finite-diff at x=${x}, d=${d}`);
		}
	}
});

test('cross-check: dual logarithm product identity log10(a * b) = log10(a) + log10(b)', () => {
	const pairs = [
		[{ v: 2, d: 1 }, { v: 5, d: 3 }],
		[{ v: 0.75, d: -0.4 }, { v: 16.2, d: 2.1 }],
		[{ v: 1e4, d: 12.5 }, { v: 1e-2, d: -0.03 }],
		[{ v: Math.PI, d: Math.E }, { v: Math.SQRT2, d: -1.5 }],
	];

	for (const [a, b] of pairs) {
		// Dual multiplication: (av + ad·ε)(bv + bd·ε) = (av*bv) + (av*bd + ad*bv)·ε
		const prod = { v: a.v * b.v, d: a.v * b.d + a.d * b.v };
		const lhs = log10DualMemo(prod);
		const la = log10DualMemo(a);
		const lb = log10DualMemo(b);
		const rhs = { v: la.v + lb.v, d: la.d + lb.d };

		assertClose(lhs.v, rhs.v, 1e-13, `product v for (${a.v}, ${b.v})`);
		assertClose(lhs.d, rhs.d, 1e-13, `product d for (${a.v}, ${b.v})`);
	}
});

test('cross-check: dual reciprocal identity log10(1 / a) = -log10(a)', () => {
	const cases = [
		{ v: 3, d: 2 },
		{ v: 0.125, d: -0.5 },
		{ v: 123.456, d: 7.89 },
	];

	for (const a of cases) {
		const inv = { v: 1 / a.v, d: -a.d / (a.v * a.v) };
		const lhs = log10DualMemo(inv);
		const rhs = log10DualMemo(a);

		assertClose(lhs.v, -rhs.v, 1e-14, `reciprocal v for ${a.v}`);
		assertClose(lhs.d, -rhs.d, 1e-14, `reciprocal d for ${a.v}`);
	}
});
