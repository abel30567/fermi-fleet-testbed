import test from 'node:test';
import assert from 'node:assert/strict';
import { factorialFloatSeries } from './factorialFloatSeries.js';

function assertRelClose(actual, expected, maxRelError, label) {
	assert.ok(Number.isFinite(actual), `${label}: expected finite number, got ${actual}`);
	const relErr = Math.abs(actual - expected) / Math.abs(expected);
	assert.ok(
		relErr <= maxRelError,
		`${label}: relative error ${relErr} exceeds ${maxRelError} (actual=${actual}, expected=${expected})`
	);
}

test('normal cases: exact values for 0 <= n <= 21', () => {
	assert.strictEqual(factorialFloatSeries(0), 1);
	assert.strictEqual(factorialFloatSeries(-0), 1);
	assert.strictEqual(factorialFloatSeries(1), 1);
	assert.strictEqual(factorialFloatSeries(5), 120);
	assert.strictEqual(factorialFloatSeries(10), 3628800);
	assert.strictEqual(factorialFloatSeries(20), 2432902008176640000);
	assert.strictEqual(factorialFloatSeries(21), 51090942171709440000);
});

test('normal cases: series values for 22 <= n <= 170 (50!, 100!, 170!)', () => {
	assertRelClose(factorialFloatSeries(22), 1.1240007277776077e21, 1e-14, '22!');
	assertRelClose(factorialFloatSeries(50), 3.0414093201713376e64, 1e-14, '50!');
	assertRelClose(factorialFloatSeries(100), 9.332621544394415e157, 1e-14, '100!');
	assertRelClose(factorialFloatSeries(170), 7.257415615307999e306, 1e-14, '170!');
});

test('edge cases: float64 overflow for n > 170 returns Infinity', () => {
	assert.strictEqual(factorialFloatSeries(171), Infinity);
	assert.strictEqual(factorialFloatSeries(172), Infinity);
	assert.strictEqual(factorialFloatSeries(1000), Infinity);
	assert.strictEqual(factorialFloatSeries(Number.MAX_SAFE_INTEGER), Infinity);
});

test('edge cases: invalid inputs throw TypeError or RangeError', () => {
	// Non-numbers -> TypeError
	for (const bad of ['5', null, undefined, 5n, {}, [], true, Symbol('n')]) {
		assert.throws(() => factorialFloatSeries(bad), TypeError);
	}

	// Negatives, non-integers, NaN, Infinity -> RangeError
	for (const bad of [-1, -10, -171, 0.5, 1.1, -0.5, 22.25, NaN, Infinity, -Infinity]) {
		assert.throws(() => factorialFloatSeries(bad), RangeError);
	}
});

test('cross-check: exact BigInt factorial converted to Number for all 0 <= n <= 170', () => {
	let bigFact = 1n;
	assert.strictEqual(factorialFloatSeries(0), 1);

	for (let n = 1; n <= 170; n++) {
		bigFact *= BigInt(n);
		const expected = Number(bigFact);
		const actual = factorialFloatSeries(n);

		if (n <= 21) {
			assert.strictEqual(actual, expected, `exact mismatch at n=${n}`);
		} else {
			assertRelClose(actual, expected, 1e-14, `BigInt cross-check at n=${n}`);
		}
	}
});

test('cross-check: recurrence identity n! = n * (n - 1)! for all 1 <= n <= 170', () => {
	let prev = factorialFloatSeries(0);
	for (let n = 1; n <= 170; n++) {
		const curr = factorialFloatSeries(n);
		const expected = n * prev;
		if (n <= 21) {
			assert.strictEqual(curr, expected, `exact recurrence mismatch at n=${n}`);
		} else {
			assertRelClose(curr, expected, 1e-14, `recurrence check at n=${n}`);
		}
		prev = curr;
	}
});
