import test from 'node:test';
import assert from 'node:assert/strict';
import { sqrtBigIntSeries } from './sqrtBigIntSeries.js';

const SCALE = 10n ** 18n;
const SCALE_SQ = SCALE * SCALE;

/**
 * Independent reference implementation computing exact `round(sqrt(n) * 10^18)`
 * via pure integer binary search on `4 * n * 10^36`.
 */
function binarySearchSqrtScaled(n) {
	if (n === 0n) return 0n;
	const target = n * SCALE_SQ;
	let lo = 0n;
	let hi = 1n << BigInt(Math.ceil(target.toString(2).length / 2));
	while (lo < hi) {
		const mid = (lo + hi + 1n) >> 1n;
		if (mid * mid <= target) {
			lo = mid;
		} else {
			hi = mid - 1n;
		}
	}
	// lo = floor(sqrt(target)); check whether lo + 1 is closer
	const upper = (lo << 1n) + 1n;
	return upper * upper < (target << 2n) ? lo + 1n : lo;
}

/**
 * Asserts the exact nearest-integer certificate for non-square `n`:
 * `(2y - 1)^2 < 4 * n * 10^36 < (2y + 1)^2` (or exact equality for squares).
 */
function assertExactNearestSqrt(n, result) {
	const target = n * SCALE_SQ;
	if (result * result === target) {
		return;
	}
	const target4 = target << 2n;
	const lower = (result << 1n) - 1n;
	const upper = (result << 1n) + 1n;
	assert.ok(
		lower * lower < target4 && target4 < upper * upper,
		`Expected exact nearest sqrt for n=${n}, got ${result}`
	);
}

test('sqrtBigIntSeries: zero and perfect squares', () => {
	assert.equal(sqrtBigIntSeries(0n), 0n);
	assert.equal(sqrtBigIntSeries(1n), SCALE);

	const roots = [
		2n,
		3n,
		4n,
		5n,
		10n,
		12n,
		255n,
		1024n,
		65536n,
		10n ** 9n,
		(1n << 24n) - 1n,
		1n << 24n,
		(1n << 24n) + 1n,
		10n ** 50n + 123456789n,
	];

	for (const k of roots) {
		const res = sqrtBigIntSeries(k * k);
		assert.equal(res, k * SCALE);
		assert.equal(res * res, k * k * SCALE_SQ);
	}
});

test('sqrtBigIntSeries: known high-precision digits of sqrt(2), sqrt(3), sqrt(5), sqrt(7), sqrt(10)', () => {
	// sqrt(2)  = 1.4142135623730950488016887...
	assert.equal(sqrtBigIntSeries(2n), 1414213562373095049n);
	// sqrt(3)  = 1.7320508075688772935274463...
	assert.equal(sqrtBigIntSeries(3n), 1732050807568877294n);
	// sqrt(5)  = 2.2360679774997896964091736...
	assert.equal(sqrtBigIntSeries(5n), 2236067977499789696n);
	// sqrt(7)  = 2.6457513110645905905016157...
	assert.equal(sqrtBigIntSeries(7n), 2645751311064590591n);
	// sqrt(10) = 3.1622776601683793319988935...
	assert.equal(sqrtBigIntSeries(10n), 3162277660168379332n);
});

test('sqrtBigIntSeries: edge cases around scaling thresholds, near-squares, and adversarial half-ULP cases', () => {
	const edgeInputs = [
		// Near small squares
		2n,
		3n,
		8n,
		10n,
		15n,
		17n,
		99n,
		101n,
		// Around the 48-bit internal power-of-4 scaling boundary
		(1n << 46n) - 1n,
		1n << 46n,
		(1n << 46n) + 1n,
		(1n << 47n) - 1n,
		1n << 47n,
		(1n << 47n) + 1n,
		(1n << 48n) - 1n,
		1n << 48n,
		(1n << 48n) + 1n,
		(1n << 49n) - 1n,
		// Large near-squares
		10n ** 60n - 1n,
		10n ** 60n + 1n,
		10n ** 100n + 7n,
		// Adversarial near-half-integer cases:
		// sqrt(10^200 + 10^82) * 10^18 = 10^118 + 0.5 - 1.25e-119 (< 10^118 + 0.5)
		10n ** 200n + 10n ** 82n,
		// sqrt(10^200 + 10^82 + 1) * 10^18 > 10^118 + 0.5
		10n ** 200n + 10n ** 82n + 1n,
		// Very large BigInt (~512 bits)
		(1n << 512n) + 9876543210123456789n,
	];

	for (const n of edgeInputs) {
		const res = sqrtBigIntSeries(n);
		assertExactNearestSqrt(n, res);
	}

	assert.equal(sqrtBigIntSeries(10n ** 200n + 10n ** 82n), 10n ** 118n);
	assert.equal(sqrtBigIntSeries(10n ** 200n + 10n ** 82n + 1n), 10n ** 118n + 1n);
});

test('sqrtBigIntSeries: cross-check against independent binary search and square residual', () => {
	const samples = [
		0n,
		1n,
		2n,
		3n,
		5n,
		6n,
		11n,
		13n,
		29n,
		137n,
		997n,
		65537n,
		123456789n,
		999999999999999999n,
		10n ** 30n + 42n,
		10n ** 75n + 314159265358979323n,
		(1n << 256n) - 1n,
	];

	for (const n of samples) {
		const actual = sqrtBigIntSeries(n);
		const expected = binarySearchSqrtScaled(n);
		assert.equal(actual, expected, `Mismatch against binary search for n=${n}`);

		// Verify (result)^2 ≈ n * 10^36 within |result^2 - n*10^36| <= result
		const diff = actual * actual - n * SCALE_SQ;
		const absDiff = diff < 0n ? -diff : diff;
		assert.ok(absDiff <= actual, `Square residual too large for n=${n}: ${absDiff}`);
	}
});

test('sqrtBigIntSeries: algebraic identities sqrt(a*b) ≈ sqrt(a)*sqrt(b) and monotonicity', () => {
	const pairs = [
		[2n, 3n],
		[3n, 5n],
		[5n, 7n],
		[11n, 13n],
		[101n, 997n],
		[1234567n, 7654321n],
		[10n ** 25n + 3n, 10n ** 25n + 7n],
	];

	for (const [a, b] of pairs) {
		const lhs = sqrtBigIntSeries(a * b);
		const prod = sqrtBigIntSeries(a) * sqrtBigIntSeries(b);
		const rhs = (prod + SCALE / 2n) / SCALE;
		const err = lhs >= rhs ? lhs - rhs : rhs - lhs;
		// Error from multiplying two rounded fixed-point numbers <= ceil((sqrt(a)+sqrt(b))/2) + 1
		const bound = (sqrtBigIntSeries(a) + sqrtBigIntSeries(b)) / SCALE + 2n;
		assert.ok(err <= bound, `Multiplicative identity mismatch for (${a}, ${b}): err=${err}`);
	}

	// Scaling identity: sqrt(k^2 * n) ≈ k * sqrt(n)
	for (const k of [2n, 7n, 1000n, 10n ** 9n]) {
		const lhs = sqrtBigIntSeries(k * k * 2n);
		const rhs = k * sqrtBigIntSeries(2n);
		const err = lhs >= rhs ? lhs - rhs : rhs - lhs;
		assert.ok(err <= k, `Scaling identity error too large for k=${k}: ${err}`);
	}

	// Strict monotonicity on 0..50
	let prev = sqrtBigIntSeries(0n);
	for (let i = 1n; i <= 50n; i += 1n) {
		const curr = sqrtBigIntSeries(i);
		assert.ok(curr > prev, `Expected strictly increasing sqrt at ${i}`);
		prev = curr;
	}
});

test('sqrtBigIntSeries: input validation throws TypeError and RangeError', () => {
	const nonBigInts = [0, 1, 4, -1, 2.5, NaN, Infinity, -Infinity, '4', null, undefined, {}, [], true, Symbol('x')];
	for (const bad of nonBigInts) {
		assert.throws(() => sqrtBigIntSeries(bad), TypeError);
	}

	const negatives = [-1n, -2n, -100n, -(10n ** 30n), -(1n << 256n)];
	for (const neg of negatives) {
		assert.throws(() => sqrtBigIntSeries(neg), RangeError);
	}
});
