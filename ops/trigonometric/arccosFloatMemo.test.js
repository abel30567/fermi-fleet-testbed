import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { arccosFloatMemo } from './arccosFloatMemo.js';

function assertClose(actual, expected, tol = 1e-14, message = '') {
	assert.equal(typeof actual, 'number', `Expected number result. ${message}`);
	assert.ok(!Number.isNaN(actual), `Expected finite number, got NaN. ${message}`);
	const diff = Math.abs(actual - expected);
	assert.ok(
		diff <= tol,
		`Expected ${actual} to be within ${tol} of ${expected} (diff=${diff}). ${message}`,
	);
}

describe('arccosFloatMemo', () => {
	beforeEach(() => {
		arccosFloatMemo.clearCache();
	});

	it('evaluates exact and special domain boundary values', () => {
		assert.equal(Object.is(arccosFloatMemo(1), 0), true);
		assert.equal(arccosFloatMemo(-1), Math.PI);
		assert.equal(arccosFloatMemo(0), Math.PI / 2);
		assert.equal(arccosFloatMemo(-0), Math.PI / 2);
	});

	it('evaluates canonical trigonometric values accurately', () => {
		const cases = [
			[0.5, Math.PI / 3],
			[-0.5, (2 * Math.PI) / 3],
			[Math.SQRT1_2, Math.PI / 4],
			[-Math.SQRT1_2, (3 * Math.PI) / 4],
			[Math.sqrt(3) / 2, Math.PI / 6],
			[-Math.sqrt(3) / 2, (5 * Math.PI) / 6],
		];

		for (const [x, expected] of cases) {
			assertClose(arccosFloatMemo(x), expected, 1e-15, `x=${x}`);
		}
	});

	it('handles near-boundary, near-zero, and subnormal values accurately', () => {
		const edgeInputs = [
			1 - Number.EPSILON,
			1 - 1e-12,
			1 - 1e-6,
			0.5 + Number.EPSILON,
			0.5 - Number.EPSILON,
			-0.5 + Number.EPSILON,
			-0.5 - Number.EPSILON,
			-1 + Number.EPSILON,
			-1 + 1e-12,
			-1 + 1e-6,
			1e-15,
			-1e-15,
			Number.MIN_VALUE,
			-Number.MIN_VALUE,
		];

		for (const x of edgeInputs) {
			const actual = arccosFloatMemo(x);
			const ref = Math.acos(x);
			assertClose(actual, ref, 1e-14, `edge x=${x}`);
		}
	});

	it('returns NaN for out-of-domain values, Infinity, -Infinity, and NaN', () => {
		const outOfDomain = [
			1 + Number.EPSILON,
			-1 - Number.EPSILON,
			1.0001,
			-1.0001,
			2,
			-2,
			1e308,
			-1e308,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			Number.NaN,
		];

		for (const x of outOfDomain) {
			assert.ok(Number.isNaN(arccosFloatMemo(x)), `Expected NaN for x=${x}`);
		}

		// Out-of-domain inputs must not pollute the memoization cache.
		const stats = arccosFloatMemo.getCacheStats();
		assert.equal(stats.size, 0);
		assert.equal(stats.hits, 0);
		assert.equal(stats.misses, 0);
	});

	it('throws TypeError for non-number inputs', () => {
		const invalidInputs = [
			undefined,
			null,
			'0.5',
			'0',
			'',
			true,
			false,
			0n,
			1n,
			{},
			[],
			[0.5],
			Symbol('x'),
			() => 0.5,
			// Boxed Number object is not a primitive number
			Object(0.5),
		];

		for (const bad of invalidInputs) {
			assert.throws(
				() => arccosFloatMemo(bad),
				{ name: 'TypeError' },
				`Expected TypeError for input ${String(bad)}`,
			);
		}
	});

	it('memoizes repeated inputs, normalizes -0/+0, and enforces bounded LRU eviction', () => {
		const initial = arccosFloatMemo.getCacheStats();
		assert.equal(initial.size, 0);
		assert.equal(initial.hits, 0);
		assert.equal(initial.misses, 0);
		assert.ok(initial.tableSize >= 257, 'Precomputed lookup table should be initialized');

		const first = arccosFloatMemo(0.37);
		const second = arccosFloatMemo(0.37);
		assert.equal(first, second);

		let stats = arccosFloatMemo.getCacheStats();
		assert.equal(stats.size, 1);
		assert.equal(stats.misses, 1);
		assert.equal(stats.hits, 1);

		// +0 and -0 share the same cache key.
		assert.equal(arccosFloatMemo(0), Math.PI / 2);
		assert.equal(arccosFloatMemo(-0), Math.PI / 2);
		stats = arccosFloatMemo.getCacheStats();
		assert.equal(stats.size, 2);
		assert.equal(stats.misses, 2);
		assert.equal(stats.hits, 2);

		// Verify bounded cache eviction when exceeding maxSize.
		const maxSize = stats.maxSize;
		arccosFloatMemo.clearCache();
		for (let i = 0; i < maxSize + 50; i++) {
			const x = -1 + (2 * i) / (maxSize + 50);
			arccosFloatMemo(x);
		}
		const afterFill = arccosFloatMemo.getCacheStats();
		assert.equal(afterFill.size, maxSize);
		assert.equal(afterFill.misses, maxSize + 50);

		// Re-evaluating the oldest evicted value (-1) triggers a miss, not a hit.
		const hitsBefore = afterFill.hits;
		const missesBefore = afterFill.misses;
		assert.equal(arccosFloatMemo(-1), Math.PI);
		const afterEvictedLookup = arccosFloatMemo.getCacheStats();
		assert.equal(afterEvictedLookup.hits, hitsBefore);
		assert.equal(afterEvictedLookup.misses, missesBefore + 1);
	});

	it('matches independent mathematical cross-checks across [-1, 1]', () => {
		const samples = 2001;
		let prev = Number.POSITIVE_INFINITY;

		for (let i = 0; i < samples; i++) {
			const x = -1 + (2 * i) / (samples - 1);
			const y = arccosFloatMemo(x);

			// Range check: y in [0, pi]
			assert.ok(y >= 0 && y <= Math.PI, `Out of range for x=${x}: y=${y}`);

			// Monotonicity: arccos is strictly decreasing on [-1, 1]
			assert.ok(y < prev, `Not strictly decreasing at x=${x}: ${y} >= ${prev}`);
			prev = y;

			// Cross-check 1: cos(arccos(x)) == x
			assertClose(Math.cos(y), x, 1e-14, `cos(arccos(${x}))`);

			// Cross-check 2: arccos(x) + arcsin(x) == pi / 2
			assertClose(y + Math.asin(x), Math.PI / 2, 1e-14, `arccos(${x}) + asin(${x})`);

			// Cross-check 3: parity identity arccos(x) + arccos(-x) == pi
			assertClose(y + arccosFloatMemo(-x), Math.PI, 1e-14, `parity at x=${x}`);

			// Cross-check 4: agreement with standard Math.acos
			assertClose(y, Math.acos(x), 1e-14, `Math.acos(${x})`);
		}
	});

	it('agrees tightly with Math.acos on exact table nodes and midpoints', () => {
		for (let k = 0; k <= 256; k++) {
			const node = k / 512;
			assertClose(arccosFloatMemo(node), Math.acos(node), 1e-15, `node k=${k}`);
			assertClose(arccosFloatMemo(-node), Math.acos(-node), 1e-15, `neg node k=${k}`);

			if (k < 256) {
				const mid = (k + 0.5) / 512;
				assertClose(arccosFloatMemo(mid), Math.acos(mid), 1e-15, `mid k=${k}`);
				assertClose(arccosFloatMemo(-mid), Math.acos(-mid), 1e-15, `neg mid k=${k}`);
			}
		}
	});
});
