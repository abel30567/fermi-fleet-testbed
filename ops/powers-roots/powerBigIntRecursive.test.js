import test from 'node:test';
import assert from 'node:assert/strict';
import { powerBigIntRecursive } from './powerBigIntRecursive.js';

const SCALE = 10n ** 18n;

test('normal positive exponents with positive bases', () => {
	assert.equal(powerBigIntRecursive(2n, 3n), 8n);
	assert.equal(powerBigIntRecursive(2n, 10n), 1024n);
	assert.equal(powerBigIntRecursive(3n, 5n), 243n);
	assert.equal(powerBigIntRecursive(5n, 4n), 625n);
	assert.equal(powerBigIntRecursive(10n, 18n), 1_000_000_000_000_000_000n);
	assert.equal(powerBigIntRecursive(7n, 13n), 96_889_010_407n);
});

test('large exact BigInt powers beyond IEEE-754 limits', () => {
	assert.equal(
		powerBigIntRecursive(2n, 100n),
		1267650600228229401496703205376n
	);
	assert.equal(
		powerBigIntRecursive(10n, 40n),
		10000000000000000000000000000000000000000n
	);
	assert.equal(
		powerBigIntRecursive(12345678901234567890n, 3n),
		1881676372353657772490265749424677022198701224860897069000n
	);
});

test('negative bases with positive odd and even exponents', () => {
	assert.equal(powerBigIntRecursive(-2n, 1n), -2n);
	assert.equal(powerBigIntRecursive(-2n, 2n), 4n);
	assert.equal(powerBigIntRecursive(-2n, 3n), -8n);
	assert.equal(powerBigIntRecursive(-3n, 4n), 81n);
	assert.equal(powerBigIntRecursive(-3n, 5n), -243n);
	assert.equal(powerBigIntRecursive(-10n, 7n), -10_000_000n);
});

test('edge cases for zero, one, and negative one', () => {
	assert.equal(powerBigIntRecursive(0n, 0n), 1n);
	assert.equal(powerBigIntRecursive(0n, 1n), 0n);
	assert.equal(powerBigIntRecursive(0n, 999_999_999n), 0n);
	assert.equal(powerBigIntRecursive(1n, 0n), 1n);
	assert.equal(powerBigIntRecursive(1n, 10n ** 30n), 1n);
	assert.equal(powerBigIntRecursive(-1n, 0n), 1n);
	assert.equal(powerBigIntRecursive(-1n, 1n), -1n);
	assert.equal(powerBigIntRecursive(-1n, 2n), 1n);
	assert.equal(powerBigIntRecursive(-1n, 10n ** 30n), 1n);
	assert.equal(powerBigIntRecursive(-1n, 10n ** 30n + 1n), -1n);
	assert.equal(powerBigIntRecursive(42n, 0n), 1n);
	assert.equal(powerBigIntRecursive(-42n, 0n), 1n);
	assert.equal(powerBigIntRecursive(42n, 1n), 42n);
	assert.equal(powerBigIntRecursive(-42n, 1n), -42n);
});

test('negative exponents return 10^18-scaled fixed-point BigInt', () => {
	assert.equal(powerBigIntRecursive(2n, -1n), 500_000_000_000_000_000n);
	assert.equal(powerBigIntRecursive(2n, -2n), 250_000_000_000_000_000n);
	assert.equal(powerBigIntRecursive(2n, -3n), 125_000_000_000_000_000n);
	assert.equal(powerBigIntRecursive(5n, -2n), 40_000_000_000_000_000n);
	assert.equal(powerBigIntRecursive(10n, -3n), 1_000_000_000_000_000n);
	assert.equal(powerBigIntRecursive(10n, -18n), 1n);
	assert.equal(powerBigIntRecursive(3n, -1n), 333_333_333_333_333_333n);
	assert.equal(powerBigIntRecursive(3n, -2n), 111_111_111_111_111_111n);
	assert.equal(powerBigIntRecursive(6n, -1n), 166_666_666_666_666_666n);
});

test('negative exponents with negative and unit bases', () => {
	assert.equal(powerBigIntRecursive(1n, -1n), SCALE);
	assert.equal(powerBigIntRecursive(1n, -(10n ** 30n)), SCALE);
	assert.equal(powerBigIntRecursive(-1n, -1n), -SCALE);
	assert.equal(powerBigIntRecursive(-1n, -2n), SCALE);
	assert.equal(powerBigIntRecursive(-1n, -(10n ** 30n)), SCALE);
	assert.equal(powerBigIntRecursive(-1n, -(10n ** 30n + 1n)), -SCALE);
	assert.equal(powerBigIntRecursive(-2n, -1n), -500_000_000_000_000_000n);
	assert.equal(powerBigIntRecursive(-2n, -2n), 250_000_000_000_000_000n);
	assert.equal(powerBigIntRecursive(-2n, -3n), -125_000_000_000_000_000n);
	assert.equal(powerBigIntRecursive(-3n, -1n), -333_333_333_333_333_333n);
});

test('negative exponent precision boundary and underflow to 0n', () => {
	// 2^59 = 576,460,752,303,423,488 < 10^18 => trunc(10^18 / 2^59) === 1n
	assert.equal(powerBigIntRecursive(2n, -59n), 1n);
	assert.equal(powerBigIntRecursive(-2n, -59n), -1n);
	// 2^60 = 1,152,921,504,606,846,976 > 10^18 => trunc(10^18 / 2^60) === 0n
	assert.equal(powerBigIntRecursive(2n, -60n), 0n);
	assert.equal(powerBigIntRecursive(-2n, -60n), 0n);
	assert.equal(powerBigIntRecursive(10n, -19n), 0n);
	// Very large negative exponent must return 0n without allocating huge BigInts
	assert.equal(powerBigIntRecursive(2n, -1_000_000_000n), 0n);
	assert.equal(powerBigIntRecursive(7n, -(10n ** 20n)), 0n);
});

test('invalid inputs throw TypeError or RangeError', () => {
	const nonBigInts = [2, 0, -1, 1.5, NaN, Infinity, '2', true, false, null, undefined, {}, []];

	for (const bad of nonBigInts) {
		assert.throws(() => powerBigIntRecursive(bad, 2n), TypeError);
		assert.throws(() => powerBigIntRecursive(2n, bad), TypeError);
	}

	assert.throws(() => powerBigIntRecursive(), TypeError);
	assert.throws(() => powerBigIntRecursive(2n), TypeError);

	assert.throws(() => powerBigIntRecursive(0n, -1n), RangeError);
	assert.throws(() => powerBigIntRecursive(0n, -100n), RangeError);
	assert.throws(() => powerBigIntRecursive(0n, -(10n ** 20n)), RangeError);
});

test('independent cross-check against native BigInt ** operator and iterative reference', () => {
	function iterativePow(base, exp) {
		let acc = 1n;
		for (let i = 0n; i < exp; i++) {
			acc *= base;
		}
		return acc;
	}

	for (let b = -8n; b <= 8n; b++) {
		for (let e = 0n; e <= 25n; e++) {
			const actual = powerBigIntRecursive(b, e);
			const expectedNative = b ** e;
			const expectedIterative = iterativePow(b, e);
			assert.equal(actual, expectedNative, `native mismatch for (${b}, ${e})`);
			assert.equal(actual, expectedIterative, `iterative mismatch for (${b}, ${e})`);
		}
	}

	for (let b = -10n; b <= 10n; b++) {
		if (b === 0n) continue;
		for (let e = -1n; e >= -20n; e--) {
			const actual = powerBigIntRecursive(b, e);
			const expected = SCALE / (b ** (-e));
			assert.equal(actual, expected, `negative exp mismatch for (${b}, ${e})`);
		}
	}
});

test('algebraic exponentiation identities cross-check', () => {
	const cases = [
		[2n, 17n, 29n],
		[3n, 11n, 19n],
		[-5n, 7n, 12n],
		[13n, 8n, 15n],
		[1000003n, 5n, 6n]
	];

	for (const [a, m, n] of cases) {
		// a^(m + n) === a^m * a^n
		assert.equal(
			powerBigIntRecursive(a, m + n),
			powerBigIntRecursive(a, m) * powerBigIntRecursive(a, n)
		);
		// (a^m)^n === a^(m * n)
		assert.equal(
			powerBigIntRecursive(powerBigIntRecursive(a, m), n),
			powerBigIntRecursive(a, m * n)
		);
	}

	// (a * b)^n === a^n * b^n
	assert.equal(
		powerBigIntRecursive(7n * -11n, 23n),
		powerBigIntRecursive(7n, 23n) * powerBigIntRecursive(-11n, 23n)
	);

	// Fixed-point truncation remainder bound for positive base and negative exponent:
	// 0 <= SCALE - (a^n * trunc(SCALE / a^n)) < a^n
	for (const [a, n] of [[3n, 5n], [7n, 4n], [11n, 3n], [2n, 59n]]) {
		const pos = powerBigIntRecursive(a, n);
		const neg = powerBigIntRecursive(a, -n);
		const rem = SCALE - pos * neg;
		assert.ok(rem >= 0n && rem < pos, `remainder out of bounds for (${a}, -${n}): ${rem}`);
	}
});
