import test from 'node:test';
import assert from 'node:assert/strict';
import { powerBigIntIterative } from './powerBigIntIterative.js';

const SCALE = 10n ** 18n;

test('positive exponents with positive and negative bases', () => {
	assert.equal(powerBigIntIterative(2n, 1n), 2n);
	assert.equal(powerBigIntIterative(2n, 10n), 1024n);
	assert.equal(powerBigIntIterative(3n, 5n), 243n);
	assert.equal(powerBigIntIterative(10n, 18n), 1_000_000_000_000_000_000n);
	assert.equal(powerBigIntIterative(-2n, 3n), -8n);
	assert.equal(powerBigIntIterative(-2n, 4n), 16n);
	assert.equal(powerBigIntIterative(-7n, 5n), -16807n);
	assert.equal(
		powerBigIntIterative(12345678901234567890n, 4n),
		12345678901234567890n ** 4n,
	);
});

test('edge cases for zero, one, and minus one', () => {
	assert.equal(powerBigIntIterative(0n, 0n), 1n);
	assert.equal(powerBigIntIterative(5n, 0n), 1n);
	assert.equal(powerBigIntIterative(-5n, 0n), 1n);
	assert.equal(powerBigIntIterative(0n, 1n), 0n);
	assert.equal(powerBigIntIterative(0n, 1000n), 0n);
	assert.equal(powerBigIntIterative(1n, 10n ** 12n), 1n);
	assert.equal(powerBigIntIterative(-1n, 10n ** 12n), 1n);
	assert.equal(powerBigIntIterative(-1n, 10n ** 12n + 1n), -1n);
	assert.equal(powerBigIntIterative(1n, -(10n ** 12n)), SCALE);
	assert.equal(powerBigIntIterative(-1n, -2n), SCALE);
	assert.equal(powerBigIntIterative(-1n, -3n), -SCALE);
});

test('negative exponents return 10^18-scaled fixed-point BigInt', () => {
	assert.equal(powerBigIntIterative(2n, -1n), 500_000_000_000_000_000n);
	assert.equal(powerBigIntIterative(2n, -2n), 250_000_000_000_000_000n);
	assert.equal(powerBigIntIterative(2n, -3n), 125_000_000_000_000_000n);
	assert.equal(powerBigIntIterative(-2n, -1n), -500_000_000_000_000_000n);
	assert.equal(powerBigIntIterative(-2n, -2n), 250_000_000_000_000_000n);
	assert.equal(powerBigIntIterative(-2n, -3n), -125_000_000_000_000_000n);
	assert.equal(powerBigIntIterative(5n, -2n), 40_000_000_000_000_000n);
	assert.equal(powerBigIntIterative(10n, -18n), 1n);
	assert.equal(powerBigIntIterative(10n, -19n), 0n);
	assert.equal(powerBigIntIterative(3n, -1n), 333_333_333_333_333_333n);
	assert.equal(powerBigIntIterative(6n, -1n), 166_666_666_666_666_667n);
	assert.equal(powerBigIntIterative(-6n, -1n), -166_666_666_666_666_667n);
});

test('negative exponent rounding boundary and large negative exponent underflow', () => {
	assert.equal(powerBigIntIterative(2n * SCALE, -1n), 1n);
	assert.equal(powerBigIntIterative(-(2n * SCALE), -1n), -1n);
	assert.equal(powerBigIntIterative(2n * SCALE + 1n, -1n), 0n);
	assert.equal(powerBigIntIterative(2n, -1_000_000n), 0n);
	assert.equal(powerBigIntIterative(-3n, -999_999n), 0n);
});

test('input validation throws TypeError and RangeError', () => {
	assert.throws(() => powerBigIntIterative(2, 3n), TypeError);
	assert.throws(() => powerBigIntIterative(2n, 3), TypeError);
	assert.throws(() => powerBigIntIterative('2', 3n), TypeError);
	assert.throws(() => powerBigIntIterative(2n, null), TypeError);
	assert.throws(() => powerBigIntIterative(undefined, 2n), TypeError);
	assert.throws(() => powerBigIntIterative(2n, NaN), TypeError);
	assert.throws(() => powerBigIntIterative(0n, -1n), RangeError);
	assert.throws(() => powerBigIntIterative(0n, -100n), RangeError);
});

test('independent cross-check against native BigInt ** and exponent laws', () => {
	for (let base = -10n; base <= 10n; base++) {
		for (let exp = 0n; exp <= 20n; exp++) {
			assert.equal(powerBigIntIterative(base, exp), base ** exp);
		}
	}

	// Exponent laws: a^(m+n) = a^m * a^n, (a*b)^n = a^n * b^n, (a^m)^n = a^(m*n)
	const samples = [
		[3n, 4n, 7n],
		[-5n, 3n, 6n],
		[17n, 5n, 8n],
	];
	for (const [a, m, n] of samples) {
		assert.equal(
			powerBigIntIterative(a, m + n),
			powerBigIntIterative(a, m) * powerBigIntIterative(a, n),
		);
		assert.equal(
			powerBigIntIterative(powerBigIntIterative(a, m), n),
			powerBigIntIterative(a, m * n),
		);
	}
	assert.equal(
		powerBigIntIterative(6n * -7n, 9n),
		powerBigIntIterative(6n, 9n) * powerBigIntIterative(-7n, 9n),
	);
});

test('independent cross-check of negative exponents against Math.pow and exact reciprocals', () => {
	for (const base of [-7n, -5n, -3n, -2n, 2n, 3n, 4n, 5n, 7n, 10n]) {
		for (let exp = -1n; exp >= -6n; exp--) {
			const fixed = powerBigIntIterative(base, exp);
			const approx = Number(fixed) / 1e18;
			const expected = Math.pow(Number(base), Number(exp));
			assert.ok(
				Math.abs(approx - expected) <= 1e-12,
				`Mismatch for ${base}^${exp}: got ${approx}, expected ${expected}`,
			);
		}
	}

	// Exact reciprocal identity when base^|exp| divides 10^18
	for (const [base, exp] of [
		[2n, -1n],
		[2n, -18n],
		[5n, -10n],
		[10n, -9n],
		[-2n, -5n],
		[-5n, -4n],
	]) {
		const fixed = powerBigIntIterative(base, exp);
		assert.equal(fixed * (base ** -exp), SCALE);
	}
});
