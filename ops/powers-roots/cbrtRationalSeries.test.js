import test from 'node:test';
import assert from 'node:assert/strict';
import { cbrtRationalSeries } from './cbrtRationalSeries.js';

function gcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const r = x % y;
		x = y;
		y = r;
	}
	return x;
}

function assertLowestTerms(r) {
	assert.equal(typeof r.num, 'bigint');
	assert.equal(typeof r.den, 'bigint');
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`);
	if (r.num === 0n) {
		assert.equal(r.den, 1n);
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `expected gcd(|${r.num}|, ${r.den}) === 1n`);
	}
}

/**
 * Exact BigInt check that |y^3 - x| / |x| < 10^(-digits).
 */
function assertRelativeCubeError(x, y, digits) {
	const xNum = x.den < 0n ? -x.num : x.num;
	const xDen = x.den < 0n ? -x.den : x.den;
	const yCubeNum = y.num * y.num * y.num;
	const yCubeDen = y.den * y.den * y.den;

	// |y^3 - x| / |x| = |yCubeNum * xDen - xNum * yCubeDen| / (|xNum| * yCubeDen)
	const diffNum = yCubeNum * xDen - xNum * yCubeDen;
	const absDiff = diffNum < 0n ? -diffNum : diffNum;
	const absXNum = xNum < 0n ? -xNum : xNum;
	const scale = 10n ** BigInt(digits);

	assert.ok(
		absDiff * scale < absXNum * yCubeDen,
		`relative error of y^3 vs x exceeded 1e-${digits} for x=${x.num}/${x.den}`
	);
}

function rationalToNumber(r) {
	// Convert safely via scaled integer division to avoid BigInt->Number Infinity for huge rationals
	const scale = 10n ** 18n;
	const scaled = (r.num * scale) / r.den;
	return Number(scaled) / 1e18;
}

test('exact perfect rational cubes (positive, negative, zero, unreduced)', () => {
	const cases = [
		[{ num: 0n, den: 1n }, { num: 0n, den: 1n }],
		[{ num: 0n, den: 99n }, { num: 0n, den: 1n }],
		[{ num: 0n, den: -7n }, { num: 0n, den: 1n }],
		[{ num: 1n, den: 1n }, { num: 1n, den: 1n }],
		[{ num: -1n, den: 1n }, { num: -1n, den: 1n }],
		[{ num: 8n, den: 1n }, { num: 2n, den: 1n }],
		[{ num: -8n, den: 1n }, { num: -2n, den: 1n }],
		[{ num: 27n, den: 8n }, { num: 3n, den: 2n }],
		[{ num: -27n, den: 8n }, { num: -3n, den: 2n }],
		[{ num: 27n, den: -8n }, { num: -3n, den: 2n }],
		[{ num: -27n, den: -8n }, { num: 3n, den: 2n }],
		[{ num: 64n, den: 125n }, { num: 4n, den: 5n }],
		// Unreduced inputs whose reduced form is a perfect cube
		[{ num: 16n, den: 2n }, { num: 2n, den: 1n }],
		[{ num: 54n, den: 16n }, { num: 3n, den: 2n }],
		[{ num: -135n, den: 40n }, { num: -3n, den: 2n }],
	];

	for (const [input, expected] of cases) {
		const res = cbrtRationalSeries(input);
		assertLowestTerms(res);
		assert.deepEqual(res, expected);
	}
});

test('huge BigInt perfect cubes exceeding IEEE 754 float64 range', () => {
	const a = 10n ** 50n + 1234567890123456789n;
	const b = 3n ** 80n + 7n;
	const g = gcd(a, b);
	const aRed = a / g;
	const bRed = b / g;

	const input = { num: aRed ** 3n, den: bRed ** 3n };
	const res = cbrtRationalSeries(input);
	assertLowestTerms(res);
	assert.deepEqual(res, { num: aRed, den: bRed });

	const negRes = cbrtRationalSeries({ num: -input.num, den: input.den });
	assertLowestTerms(negRes);
	assert.deepEqual(negRes, { num: -aRed, den: bRed });
});

test('irrational cube roots: exact rational cubing cross-check and Math.cbrt cross-check', () => {
	const inputs = [
		{ num: 2n, den: 1n },
		{ num: 3n, den: 1n },
		{ num: 10n, den: 1n },
		{ num: 1n, den: 2n },
		{ num: 5n, den: 7n },
		{ num: -2n, den: 1n },
		{ num: -17n, den: 5n },
		{ num: 100n, den: 3n },
		{ num: 1n, den: 1000000007n },
		{ num: 999999n, den: 1000000n },
		{ num: 7n, den: -13n },
	];

	for (const x of inputs) {
		const y = cbrtRationalSeries(x);
		assertLowestTerms(y);

		// Independent cross-check 1: exact BigInt rational cubing y^3 ≈ x to > 17 digits
		assertRelativeCubeError(x, y, 17);

		// Independent cross-check 2: compare against Math.cbrt
		const approx = rationalToNumber(y);
		const ref = Math.cbrt(Number(x.num) / Number(x.den));
		const relErr = Math.abs(approx - ref) / Math.abs(ref);
		assert.ok(relErr < 1e-14, `Math.cbrt mismatch for ${x.num}/${x.den}: got ${approx}, ref ${ref}`);
	}
});

test('extreme scale non-cube rationals (very large and very small magnitudes)', () => {
	const extremeInputs = [
		{ num: 2n * 10n ** 120n, den: 1n },
		{ num: 1n, den: 7n * 10n ** 90n },
		{ num: -5n * 10n ** 85n, den: 3n },
		{ num: 10n ** 150n + 1n, den: 10n ** 150n },
	];

	for (const x of extremeInputs) {
		const y = cbrtRationalSeries(x);
		assertLowestTerms(y);
		assertRelativeCubeError(x, y, 17);
	}
});

test('algebraic identities: odd symmetry, multiplicativity, and reciprocity', () => {
	const a = { num: 5n, den: 3n };
	const b = { num: 11n, den: 7n };

	// Exact odd symmetry: cbrt(-x) === -cbrt(x)
	const pos = cbrtRationalSeries(a);
	const neg = cbrtRationalSeries({ num: -a.num, den: a.den });
	assert.deepEqual(neg, { num: -pos.num, den: pos.den });

	// Multiplicativity: cbrt(a * b) ≈ cbrt(a) * cbrt(b)
	const cbA = cbrtRationalSeries(a);
	const cbB = cbrtRationalSeries(b);
	const cbAB = cbrtRationalSeries({ num: a.num * b.num, den: a.den * b.den });
	const prodNum = cbA.num * cbB.num;
	const prodDen = cbA.den * cbB.den;
	const diffNum = cbAB.num * prodDen - prodNum * cbAB.den;
	const absDiff = diffNum < 0n ? -diffNum : diffNum;
	assert.ok(absDiff * 10n ** 16n < cbAB.num * prodDen, 'multiplicative identity failed');

	// Reciprocity: cbrt(1 / a) * cbrt(a) ≈ 1
	const cbInvA = cbrtRationalSeries({ num: a.den, den: a.num });
	const unitNum = cbA.num * cbInvA.num;
	const unitDen = cbA.den * cbInvA.den;
	const unitErr = unitNum > unitDen ? unitNum - unitDen : unitDen - unitNum;
	assert.ok(unitErr * 10n ** 16n < unitDen, 'reciprocal identity failed');
});

test('series convergence with increasing terms and options object support', () => {
	const x = { num: 2n, den: 1n };

	const y1 = cbrtRationalSeries(x, 1);
	const y4 = cbrtRationalSeries(x, 4);
	const y10 = cbrtRationalSeries(x, { terms: 10 });
	const y20 = cbrtRationalSeries(x, { terms: 20 });
	const yDefault = cbrtRationalSeries(x, {});

	assert.deepEqual(yDefault, cbrtRationalSeries(x));
	assert.deepEqual(y10, cbrtRationalSeries(x, 10));

	for (const y of [y1, y4, y10, y20]) {
		assertLowestTerms(y);
	}

	assertRelativeCubeError(x, y4, 4);
	assertRelativeCubeError(x, y10, 10);
	assertRelativeCubeError(x, y20, 21);
});

test('input validation rejects malformed rationals, zero denominator, and invalid terms', () => {
	// Invalid x type
	for (const bad of [null, undefined, 8, 8n, '8/1', true, [8n, 1n], {}]) {
		assert.throws(() => cbrtRationalSeries(bad), TypeError);
	}

	// Non-BigInt num or den
	for (const bad of [
		{ num: 8, den: 1 },
		{ num: 8n, den: 1 },
		{ num: 8, den: 1n },
		{ num: '8', den: 1n },
		{ num: 8n, den: null },
	]) {
		assert.throws(() => cbrtRationalSeries(bad), TypeError);
	}

	// Zero denominator
	assert.throws(() => cbrtRationalSeries({ num: 1n, den: 0n }), RangeError);
	assert.throws(() => cbrtRationalSeries({ num: 0n, den: 0n }), RangeError);

	// Invalid terms (RangeError)
	for (const badTerms of [0, -1, -100, 1.5, NaN, Infinity, -Infinity]) {
		assert.throws(() => cbrtRationalSeries({ num: 2n, den: 1n }, badTerms), RangeError);
		assert.throws(() => cbrtRationalSeries({ num: 2n, den: 1n }, { terms: badTerms }), RangeError);
	}

	// Invalid terms / options type (TypeError)
	for (const badOpt of ['10', 10n, null, true, [10], { terms: '10' }, { terms: 10n }]) {
		assert.throws(() => cbrtRationalSeries({ num: 2n, den: 1n }, badOpt), TypeError);
	}
});
