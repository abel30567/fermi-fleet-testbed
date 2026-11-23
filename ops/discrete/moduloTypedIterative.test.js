import test from 'node:test';
import assert from 'node:assert/strict';
import { moduloTypedIterative } from './moduloTypedIterative.js';

test('normal cases: positive integers and floats', () => {
	const a = new Float64Array([10, 7, 15, 0, 5.5, 9]);
	const b = new Float64Array([3, 7, 4, 5, 2, 10]);
	const out = moduloTypedIterative(a, b);

	assert.ok(out instanceof Float64Array);
	assert.notEqual(out, a);
	assert.notEqual(out, b);
	assert.deepEqual(Array.from(out), [1, 0, 3, 0, 1.5, 9]);
});

test('discrete floored modulo with negative dividends and/or divisors', () => {
	const a = new Float64Array([-1, -7, -6, 7, -7, 6, -5.5, 5.5]);
	const b = new Float64Array([5, 3, 3, -3, -3, -3, 2, -2]);
	const out = moduloTypedIterative(a, b);

	assert.deepEqual(Array.from(out), [4, 2, 0, -2, -1, 0, 0.5, -0.5]);
	// Ensure exact multiples produce +0, never -0
	assert.equal(Object.is(out[2], 0), true);
	assert.equal(Object.is(out[5], 0), true);
});

test('does not mutate input arrays', () => {
	const a = new Float64Array([-13, 42, -8]);
	const b = new Float64Array([5, -10, 4]);
	const aCopy = new Float64Array(a);
	const bCopy = new Float64Array(b);

	moduloTypedIterative(a, b);

	assert.deepEqual(Array.from(a), Array.from(aCopy));
	assert.deepEqual(Array.from(b), Array.from(bCopy));
});

test('edge cases: empty arrays, negative zero dividends, tiny negative values, NaN, and Infinity', () => {
	const empty = moduloTypedIterative(new Float64Array(0), new Float64Array(0));
	assert.ok(empty instanceof Float64Array);
	assert.equal(empty.length, 0);

	// -0 dividend should yield +0
	const negZero = moduloTypedIterative(new Float64Array([-0, -0]), new Float64Array([3, -3]));
	assert.equal(Object.is(negZero[0], 0), true);
	assert.equal(Object.is(negZero[1], 0), true);

	// Sub-ULP negative dividend where (a + m) rounds to m must wrap to 0 rather than m
	const tiny = moduloTypedIterative(new Float64Array([-1e-17, 1e-17]), new Float64Array([1, -1]));
	assert.equal(Object.is(tiny[0], 0), true);
	assert.equal(Object.is(tiny[1], 0), true);

	// NaN and Infinity handling
	const specialA = new Float64Array([Number.NaN, 5, Infinity, -Infinity, 5, -5, 5, -5]);
	const specialB = new Float64Array([3, Number.NaN, 3, 3, Infinity, Infinity, -Infinity, -Infinity]);
	const specialOut = moduloTypedIterative(specialA, specialB);

	assert.equal(Number.isNaN(specialOut[0]), true);
	assert.equal(Number.isNaN(specialOut[1]), true);
	assert.equal(Number.isNaN(specialOut[2]), true);
	assert.equal(Number.isNaN(specialOut[3]), true);
	assert.equal(specialOut[4], 5);
	assert.equal(specialOut[5], Infinity);
	assert.equal(specialOut[6], -Infinity);
	assert.equal(specialOut[7], -5);
});

test('input validation errors', () => {
	assert.throws(() => moduloTypedIterative([1, 2], new Float64Array([1, 2])), TypeError);
	assert.throws(() => moduloTypedIterative(new Float64Array([1, 2]), [1, 2]), TypeError);
	assert.throws(() => moduloTypedIterative(new Int32Array([1, 2]), new Float64Array([1, 2])), TypeError);
	assert.throws(() => moduloTypedIterative(null, new Float64Array([1])), TypeError);
	assert.throws(() => moduloTypedIterative(new Float64Array([1]), undefined), TypeError);

	assert.throws(
		() => moduloTypedIterative(new Float64Array([1, 2, 3]), new Float64Array([1, 2])),
		RangeError,
	);
	assert.throws(
		() => moduloTypedIterative(new Float64Array([10, 20]), new Float64Array([3, 0])),
		RangeError,
	);
	assert.throws(
		() => moduloTypedIterative(new Float64Array([10]), new Float64Array([-0])),
		RangeError,
	);
});

test('independent cross-check: repeated addition/subtraction and division identity over integer grid', () => {
	/**
	 * Independent reference using repeated addition/subtraction (no % or division).
	 */
	function referenceRepeatedMod(a, m) {
		let r = a;
		if (m > 0) {
			while (r >= m) r -= m;
			while (r < 0) r += m;
		} else {
			while (r <= m) r -= m;
			while (r > 0) r += m;
		}
		return r === 0 ? 0 : r;
	}

	const dividends = [];
	const divisors = [];
	const expected = [];

	for (let a = -25; a <= 25; a++) {
		for (let m = -7; m <= 7; m++) {
			if (m === 0) continue;
			dividends.push(a);
			divisors.push(m);
			expected.push(referenceRepeatedMod(a, m));
		}
	}

	const aTyped = Float64Array.from(dividends);
	const bTyped = Float64Array.from(divisors);
	const actual = moduloTypedIterative(aTyped, bTyped);

	assert.equal(actual.length, expected.length);
	for (let i = 0; i < expected.length; i++) {
		const a = dividends[i];
		const m = divisors[i];
		const r = actual[i];

		assert.equal(r, expected[i], `mismatch for ${a} mod ${m}`);
		assert.equal(Object.is(r, -0), false, `unexpected -0 for ${a} mod ${m}`);

		// Division algorithm identity: a === floor(a / m) * m + r
		const q = Math.floor(a / m);
		assert.equal(q * m + r, a, `division identity failed for ${a} mod ${m}`);

		// Canonical range invariant
		if (m > 0) {
			assert.ok(r >= 0 && r < m, `range violated for ${a} mod ${m}: ${r}`);
		} else {
			assert.ok(r > m && r <= 0, `range violated for ${a} mod ${m}: ${r}`);
		}
	}
});

test('independent cross-check: BigInt floored modulo on large safe integers', () => {
	function bigIntFlooredMod(aBig, mBig) {
		let r = aBig % mBig;
		if (r !== 0n && (r < 0n) !== (mBig < 0n)) {
			r += mBig;
		}
		return Number(r);
	}

	const pairs = [
		[Number.MAX_SAFE_INTEGER, 97],
		[-Number.MAX_SAFE_INTEGER, 97],
		[Number.MAX_SAFE_INTEGER, -97],
		[-Number.MAX_SAFE_INTEGER, -97],
		[9007199254740000, 1000003],
		[-9007199254740000, 1000003],
		[123456789012345, -987654321],
		[-123456789012345, -987654321],
	];

	const a = Float64Array.from(pairs, ([x]) => x);
	const b = Float64Array.from(pairs, ([, y]) => y);
	const actual = moduloTypedIterative(a, b);

	for (let i = 0; i < pairs.length; i++) {
		const [x, y] = pairs[i];
		const expected = bigIntFlooredMod(BigInt(x), BigInt(y));
		assert.equal(actual[i], expected, `BigInt cross-check failed for ${x} mod ${y}`);
	}
});
