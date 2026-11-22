import test from 'node:test';
import assert from 'node:assert/strict';
import { xorIntervalSeries } from './xorIntervalSeries.js';

/**
 * Independent membership predicate at a non-boundary point x:
 * true iff x lies strictly inside at least one interval of `set`.
 */
function pointInSet(set, x) {
	for (const [lo, hi] of set) {
		if (lo < x && x < hi) {
			return true;
		}
	}
	return false;
}

/**
 * Independent brute-force reference via coordinate compression of all endpoints
 * and evaluating (inA && !inB) || (!inA && inB) on each elementary cell.
 */
function referenceXor(a, b) {
	const pts = new Set();
	for (const [lo, hi] of [...a, ...b]) {
		if (lo < hi) {
			pts.add(lo === 0 ? 0 : lo);
			pts.add(hi === 0 ? 0 : hi);
		}
	}
	const sorted = [...pts].sort((u, v) => (u < v ? -1 : u > v ? 1 : 0));
	const out = [];
	for (let i = 0; i < sorted.length - 1; i++) {
		const lo = sorted[i];
		const hi = sorted[i + 1];
		let mid;
		if (lo === -Infinity && hi === Infinity) {
			mid = 0;
		} else if (lo === -Infinity) {
			mid = hi - 1;
		} else if (hi === Infinity) {
			mid = lo + 1;
		} else {
			mid = lo + (hi - lo) / 2;
		}
		const inA = pointInSet(a, mid);
		const inB = pointInSet(b, mid);
		if (inA !== inB) {
			if (out.length > 0 && out[out.length - 1][1] === lo) {
				out[out.length - 1][1] = hi;
			} else {
				out.push([lo, hi]);
			}
		}
	}
	return out;
}

/**
 * Assert that a result is strictly normalized: sorted, positive-length,
 * disjoint, and non-touching.
 */
function assertNormalized(intervals) {
	for (let i = 0; i < intervals.length; i++) {
		const [lo, hi] = intervals[i];
		assert.ok(lo < hi, `expected lo < hi at index ${i}, got [${lo}, ${hi}]`);
		if (i > 0) {
			assert.ok(
				intervals[i - 1][1] < lo,
				`expected strictly separated intervals, got [${intervals[i - 1]}] and [${lo}, ${hi}]`
			);
		}
	}
}

test('normal cases: partial overlap, containment, interleaving, and shared endpoints', () => {
	assert.deepStrictEqual(
		xorIntervalSeries([[0, 5]], [[3, 8]]),
		[[0, 3], [5, 8]]
	);

	assert.deepStrictEqual(
		xorIntervalSeries([[0, 10]], [[2, 5]]),
		[[0, 2], [5, 10]]
	);

	assert.deepStrictEqual(
		xorIntervalSeries([[0, 2], [4, 7], [9, 12]], [[1, 5], [6, 10]]),
		[[0, 1], [2, 4], [5, 6], [7, 9], [10, 12]]
	);

	assert.deepStrictEqual(
		xorIntervalSeries([[0, 5]], [[0, 3]]),
		[[3, 5]]
	);

	assert.deepStrictEqual(
		xorIntervalSeries([[0, 5]], [[3, 5]]),
		[[0, 3]]
	);

	assert.deepStrictEqual(
		xorIntervalSeries([[-10.5, -2.5], [1.25, 4.75]], [[-5.5, 2.25]]),
		[[-10.5, -5.5], [-2.5, 1.25], [2.25, 4.75]]
	);
});

test('edge cases: identical sets, disjoint sets, touching sets, and empty sets', () => {
	// Identical sets -> empty
	assert.deepStrictEqual(
		xorIntervalSeries([[1, 4], [7, 10]], [[1, 4], [7, 10]]),
		[]
	);

	// Equivalent after normalization -> empty
	assert.deepStrictEqual(
		xorIntervalSeries([[0, 3], [2, 5], [5, 8]], [[0, 8]]),
		[]
	);

	// Strictly disjoint sets -> sorted union
	assert.deepStrictEqual(
		xorIntervalSeries([[5, 7], [0, 1]], [[2, 4], [9, 11]]),
		[[0, 1], [2, 4], [5, 7], [9, 11]]
	);

	// Touching disjoint sets -> merged union
	assert.deepStrictEqual(
		xorIntervalSeries([[0, 2], [4, 6]], [[2, 4], [6, 8]]),
		[[0, 8]]
	);

	// Empty sets
	assert.deepStrictEqual(xorIntervalSeries([], []), []);
	assert.deepStrictEqual(
		xorIntervalSeries([[3, 5], [1, 3]], []),
		[[1, 5]]
	);
	assert.deepStrictEqual(
		xorIntervalSeries([], [[4, 8], [1, 2], [2, 5]]),
		[[1, 8]]
	);
});

test('edge cases: infinite bounds', () => {
	assert.deepStrictEqual(
		xorIntervalSeries([[-Infinity, 0]], [[0, Infinity]]),
		[[-Infinity, Infinity]]
	);

	assert.deepStrictEqual(
		xorIntervalSeries([[-Infinity, Infinity]], [[2, 5]]),
		[[-Infinity, 2], [5, Infinity]]
	);

	assert.deepStrictEqual(
		xorIntervalSeries([[-Infinity, Infinity]], [[-Infinity, Infinity]]),
		[]
	);

	assert.deepStrictEqual(
		xorIntervalSeries([[-Infinity, 5]], [[0, Infinity]]),
		[[-Infinity, 0], [5, Infinity]]
	);

	assert.deepStrictEqual(
		xorIntervalSeries([[-Infinity, 10]], [[-Infinity, 3]]),
		[[3, 10]]
	);

	assert.deepStrictEqual(
		xorIntervalSeries([[3, Infinity]], [[10, Infinity]]),
		[[3, 10]]
	);
});

test('edge cases: unsorted, overlapping, duplicate, zero-length, -0, and immutability', () => {
	const a = [[5, 8], [1, 3], [2, 5], [1, 3], [4, 4]];
	const b = [[6, 10], [3, 4], [4, 7], [9, 9]];
	const aSnapshot = structuredClone(a);
	const bSnapshot = structuredClone(b);

	const out = xorIntervalSeries(a, b);
	assert.deepStrictEqual(out, [[1, 3], [8, 10]]);
	assert.deepStrictEqual(a, aSnapshot);
	assert.deepStrictEqual(b, bSnapshot);

	// Zero-length intervals vanish cleanly
	assert.deepStrictEqual(xorIntervalSeries([[2, 2]], [[3, 3]]), []);
	assert.deepStrictEqual(xorIntervalSeries([[0, 5]], [[2, 2]]), [[0, 5]]);

	// Negative zero normalized to +0
	const zeroOut = xorIntervalSeries([[-0, 1]], [[1, 2]]);
	assert.deepStrictEqual(zeroOut, [[0, 2]]);
	assert.ok(Object.is(zeroOut[0][0], 0));
});

test('invalid inputs throw TypeError or RangeError', () => {
	assert.throws(() => xorIntervalSeries(null, []), TypeError);
	assert.throws(() => xorIntervalSeries([], undefined), TypeError);
	assert.throws(() => xorIntervalSeries('not-array', []), TypeError);
	assert.throws(() => xorIntervalSeries([], {}), TypeError);

	assert.throws(() => xorIntervalSeries([[1]], []), TypeError);
	assert.throws(() => xorIntervalSeries([[1, 2, 3]], []), TypeError);
	assert.throws(() => xorIntervalSeries([null], []), TypeError);
	assert.throws(() => xorIntervalSeries([['1', 2]], []), TypeError);
	assert.throws(() => xorIntervalSeries([], [[0, '5']]), TypeError);

	assert.throws(() => xorIntervalSeries([[NaN, 1]], []), RangeError);
	assert.throws(() => xorIntervalSeries([[0, NaN]], []), RangeError);
	assert.throws(() => xorIntervalSeries([[5, 2]], []), RangeError);
	assert.throws(() => xorIntervalSeries([[Infinity, 0]], []), RangeError);
	assert.throws(() => xorIntervalSeries([[0, -Infinity]], []), RangeError);
	assert.throws(() => xorIntervalSeries([[Infinity, Infinity]], []), RangeError);
	assert.throws(() => xorIntervalSeries([[-Infinity, -Infinity]], []), RangeError);
});

test('cross-check: indicator-function sampling and coordinate-compression reference', () => {
	// Deterministic LCG PRNG for reproducible interval families
	let seed = 0x5eed1234;
	const rand = () => {
		seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
		return seed / 0x100000000;
	};

	const randomSet = (count, allowInfinite) => {
		const set = [];
		for (let i = 0; i < count; i++) {
			let lo = Math.floor(rand() * 41) - 20;
			let hi = lo + Math.floor(rand() * 15);
			if (allowInfinite && rand() < 0.08) lo = -Infinity;
			if (allowInfinite && rand() < 0.08) hi = Infinity;
			if (lo === Infinity || hi === -Infinity) continue;
			set.push([lo, hi]);
		}
		return set;
	};

	for (let trial = 0; trial < 80; trial++) {
		const a = randomSet(trial % 10, trial % 3 === 0);
		const b = randomSet((trial * 7) % 10, trial % 4 === 0);

		const res = xorIntervalSeries(a, b);
		assertNormalized(res);

		// Cross-check against independent coordinate-compression reference
		const ref = referenceXor(a, b);
		assert.deepStrictEqual(res, ref);

		// Cross-check indicator identity at every non-boundary sample point
		const finitePts = new Set();
		for (const [lo, hi] of [...a, ...b, ...res]) {
			if (Number.isFinite(lo)) finitePts.add(lo);
			if (Number.isFinite(hi)) finitePts.add(hi);
		}
		const sorted = [...finitePts].sort((u, v) => u - v);
		const samples = [];
		if (sorted.length === 0) {
			samples.push(0);
		} else {
			samples.push(sorted[0] - 10);
			for (let i = 0; i < sorted.length - 1; i++) {
				samples.push((sorted[i] + sorted[i + 1]) / 2);
			}
			samples.push(sorted[sorted.length - 1] + 10);
		}

		for (const x of samples) {
			const expected = pointInSet(a, x) !== pointInSet(b, x);
			const actual = pointInSet(res, x);
			assert.equal(actual, expected, `indicator mismatch at x=${x} in trial ${trial}`);
		}
	}
});

test('cross-check: algebraic identities of symmetric difference', () => {
	const cases = [
		[
			[[0, 4], [2, 6], [10, 15]],
			[[3, 12], [14, 20]],
			[[-5, 1], [5, 11], [18, 25]],
		],
		[
			[[-Infinity, -2], [3, 7]],
			[[-5, 5], [7, Infinity]],
			[[-Infinity, 0], [4, 10]],
		],
		[
			[[1, 2], [2, 3], [5, 5]],
			[],
			[[0, 10]],
		],
	];

	for (const [a, b, c] of cases) {
		const normA = xorIntervalSeries(a, []);
		const ab = xorIntervalSeries(a, b);

		// Involution: (A ⊕ B) ⊕ B = normalize(A)
		assert.deepStrictEqual(xorIntervalSeries(ab, b), normA);

		// Commutativity: A ⊕ B = B ⊕ A
		assert.deepStrictEqual(ab, xorIntervalSeries(b, a));

		// Self-inverse: A ⊕ A = []
		assert.deepStrictEqual(xorIntervalSeries(a, a), []);

		// Associativity: (A ⊕ B) ⊕ C = A ⊕ (B ⊕ C)
		assert.deepStrictEqual(
			xorIntervalSeries(ab, c),
			xorIntervalSeries(a, xorIntervalSeries(b, c))
		);
	}
});
