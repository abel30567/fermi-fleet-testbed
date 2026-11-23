import test from "node:test";
import assert from "node:assert/strict";
import { productDualSeries } from "./productDualSeries.js";

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-12) {
	const diff = Math.abs(actual - expected);
	const scale = Math.max(Math.abs(actual), Math.abs(expected), 1);
	assert.ok(
		diff <= Math.max(absTol, relTol * scale),
		`expected ${actual} to be close to ${expected} (diff=${diff})`,
	);
}

function mulDual(a, b) {
	return {
		v: a.v * b.v,
		d: a.d * b.v + a.v * b.d,
	};
}

function iterativeDualProduct(xs) {
	let acc = { v: 1, d: 0 };
	for (const x of xs) {
		acc = mulDual(acc, x);
	}
	return {
		v: acc.v === 0 ? 0 : acc.v,
		d: acc.d === 0 ? 0 : acc.d,
	};
}

function makeRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

test("normal cases: exact integer and mixed-sign dual products", () => {
	// (2 + 1ε)(3 + 4ε) = 6 + (3 + 8)ε = 6 + 11ε
	assert.deepEqual(
		productDualSeries([
			{ v: 2, d: 1 },
			{ v: 3, d: 4 },
		]),
		{ v: 6, d: 11 },
	);

	// (2 + 1ε)(3 + 4ε)(5 + 6ε) = 30 + (15 + 40 + 36)ε = 30 + 91ε
	assert.deepEqual(
		productDualSeries([
			{ v: 2, d: 1 },
			{ v: 3, d: 4 },
			{ v: 5, d: 6 },
		]),
		{ v: 30, d: 91 },
	);

	// Negative values and derivatives: (-2 + 3ε)(4 - 5ε)(-1 + 2ε)
	// v = (-2)(4)(-1) = 8
	// d = 3*(4)*(-1) + (-5)*(-2)*(-1) + 2*(-2)*(4) = -12 - 10 - 16 = -38
	assert.deepEqual(
		productDualSeries([
			{ v: -2, d: 3 },
			{ v: 4, d: -5 },
			{ v: -1, d: 2 },
		]),
		{ v: 8, d: -38 },
	);
});

test("normal cases: power-rule and polynomial root identities", () => {
	// d/dx (x^n) = n * x^(n-1)
	const x = 3;
	const n = 5;
	const powers = Array.from({ length: n }, () => ({ v: x, d: 1 }));
	assert.deepEqual(productDualSeries(powers), {
		v: x ** n,
		d: n * x ** (n - 1),
	});

	// p(x) = (x - 1)(x - 2)(x - 4) = x^3 - 7x^2 + 14x - 8
	// p'(x) = 3x^2 - 14x + 14
	const evalX = 5;
	const roots = [1, 2, 4];
	const res = productDualSeries(roots.map((r) => ({ v: evalX - r, d: 1 })));
	assert.deepEqual(res, {
		v: evalX ** 3 - 7 * evalX ** 2 + 14 * evalX - 8,
		d: 3 * evalX ** 2 - 14 * evalX + 14,
	});
});

test("edge cases: empty array, singleton, zero derivatives, and -0 normalization", () => {
	assert.deepEqual(productDualSeries([]), { v: 1, d: 0 });
	assert.deepEqual(productDualSeries([{ v: 7, d: -3 }]), { v: 7, d: -3 });
	assert.deepEqual(productDualSeries([{ v: 0, d: 5 }]), { v: 0, d: 5 });

	const negZeroSingle = productDualSeries([{ v: -0, d: -0 }]);
	assert.ok(Object.is(negZeroSingle.v, 0));
	assert.ok(Object.is(negZeroSingle.d, 0));

	// All zero derivatives yield d = 0 (not -0)
	const constRes = productDualSeries([
		{ v: -2, d: 0 },
		{ v: 3, d: 0 },
		{ v: 4, d: 0 },
	]);
	assert.deepEqual(constRes, { v: -24, d: 0 });
	assert.ok(Object.is(constRes.d, 0));
});

test("edge cases: single zero primal and multiple zero primals", () => {
	// Single zero at start, middle, end
	assert.deepEqual(
		productDualSeries([
			{ v: 0, d: 5 },
			{ v: 3, d: 2 },
			{ v: -4, d: 1 },
		]),
		{ v: 0, d: -60 },
	);
	assert.deepEqual(
		productDualSeries([
			{ v: 3, d: 2 },
			{ v: 0, d: -5 },
			{ v: 4, d: 1 },
		]),
		{ v: 0, d: -60 },
	);
	assert.deepEqual(
		productDualSeries([
			{ v: 3, d: 2 },
			{ v: 4, d: 1 },
			{ v: 0, d: 0 },
		]),
		{ v: 0, d: 0 },
	);

	// Two or more zeros annihilate both value and derivative
	assert.deepEqual(
		productDualSeries([
			{ v: 0, d: 5 },
			{ v: 0, d: 7 },
			{ v: 4, d: 1 },
		]),
		{ v: 0, d: 0 },
	);
	assert.deepEqual(
		productDualSeries([
			{ v: 0, d: 1 },
			{ v: 0, d: 2 },
			{ v: 0, d: 3 },
		]),
		{ v: 0, d: 0 },
	);
});

test("edge cases: intermediate overflow and underflow resilience", () => {
	// Intermediate prefix product 1e200 * 1e200 overflows, yet true V = 1e100 and D = 1e200
	const res1 = productDualSeries([
		{ v: 1e200, d: 0 },
		{ v: 1e200, d: 0 },
		{ v: 1e-300, d: 1e-200 },
	]);
	assertClose(res1.v, 1e100, 1e-11);
	assertClose(res1.d, 1e200, 1e-11);

	// Primal product underflows to 0, while derivative 2e-300 remains representable
	const res2 = productDualSeries([
		{ v: 1e-300, d: 1 },
		{ v: 1e-300, d: 1 },
	]);
	assert.equal(res2.v, 0);
	assertClose(res2.d, 2e-300, 1e-12, 0);

	// Primal product overflows to Infinity, while derivative terms cancel cleanly to 0
	const res3 = productDualSeries([
		{ v: 1e300, d: 1 },
		{ v: 1e300, d: -1 },
	]);
	assert.equal(res3.v, Infinity);
	assert.equal(res3.d, 0);

	// Single zero with intermediate overflow in remaining product
	const res4 = productDualSeries([
		{ v: 0, d: 1e200 },
		{ v: -1e200, d: 1 },
		{ v: 1e-200, d: 1 },
	]);
	assert.equal(res4.v, 0);
	assertClose(res4.d, -1e200, 1e-11);

	// Prefix/suffix each finite, but P[1] * S[1] overflows while d[1] * P[1] * S[1] is finite
	const res5 = productDualSeries([
		{ v: 1e200, d: 1 },
		{ v: 1e-100, d: 1e-200 },
		{ v: 1e200, d: 1 },
	]);
	assertClose(res5.v, 1e300, 1e-11);
	assertClose(res5.d, 1e200, 1e-11);
});

test("edge cases: does not mutate input array or element objects", () => {
	const input = [
		{ v: 2, d: 3 },
		{ v: -5, d: 7 },
		{ v: 11, d: -13 },
	];
	const snapshot = structuredClone(input);
	productDualSeries(input);
	assert.deepEqual(input, snapshot);
});

test("invalid inputs: rejects non-arrays, malformed elements, and non-finite numbers", () => {
	for (const bad of [null, undefined, 42, "abc", {}, new Set()]) {
		assert.throws(() => productDualSeries(bad), TypeError);
	}

	for (const badElem of [
		null,
		undefined,
		123,
		"x",
		{},
		{ v: 1 },
		{ d: 1 },
		{ v: "1", d: 2 },
		{ v: 1, d: null },
		{ v: true, d: 0 },
	]) {
		assert.throws(() => productDualSeries([badElem]), TypeError);
	}

	// Sparse array
	const sparse = new Array(2);
	sparse[0] = { v: 1, d: 1 };
	assert.throws(() => productDualSeries(sparse), TypeError);

	// Non-finite numbers
	for (const badNum of [NaN, Infinity, -Infinity]) {
		assert.throws(() => productDualSeries([{ v: badNum, d: 1 }]), RangeError);
		assert.throws(() => productDualSeries([{ v: 1, d: badNum }]), RangeError);
	}
});

test("cross-check: matches iterative binary dual multiplication across random inputs", () => {
	const rng = makeRng(20261123);
	for (let trial = 0; trial < 50; trial++) {
		const len = Math.floor(rng() * 15) + 1;
		const xs = [];
		for (let i = 0; i < len; i++) {
			// Mix normal values and occasional zeros
			const r = rng();
			const v = r < 0.08 ? 0 : (rng() * 4 - 2);
			const d = rng() * 4 - 2;
			xs.push({ v, d });
		}
		const actual = productDualSeries(xs);
		const expected = iterativeDualProduct(xs);
		assertClose(actual.v, expected.v, 1e-11, 1e-12);
		assertClose(actual.d, expected.d, 1e-11, 1e-12);
	}
});

test("cross-check: agrees with central finite-difference derivative of composite product", () => {
	const coeffs = [
		{ a: 1.3, b: 0.7 },
		{ a: -0.9, b: 1.4 },
		{ a: 2.1, b: -0.5 },
		{ a: 0.6, b: 1.1 },
		{ a: -1.7, b: 0.3 },
	];

	const evalF = (t) => coeffs.map(({ a, b }) => Math.sin(a * t + b));
	const evalDual = (t) =>
		coeffs.map(({ a, b }) => ({
			v: Math.sin(a * t + b),
			d: a * Math.cos(a * t + b),
		}));

	const h = 1e-6;
	for (const t of [-1.2, 0.0, 0.45, 2.3]) {
		const res = productDualSeries(evalDual(t));
		const fPlus = evalF(t + h).reduce((p, x) => p * x, 1);
		const fMinus = evalF(t - h).reduce((p, x) => p * x, 1);
		const fd = (fPlus - fMinus) / (2 * h);
		const f0 = evalF(t).reduce((p, x) => p * x, 1);

		assertClose(res.v, f0, 1e-12, 1e-12);
		assertClose(res.d, fd, 1e-7, 1e-8);
	}
});

test("cross-check: algebraic identities (commutativity, splitting, logarithmic derivative)", () => {
	const xs = [
		{ v: 1.5, d: -0.4 },
		{ v: -2.25, d: 0.8 },
		{ v: 3.1, d: 1.2 },
		{ v: 0.75, d: -0.5 },
		{ v: -1.2, d: 0.9 },
	];

	const full = productDualSeries(xs);

	// Commutativity: reversed order produces the same dual number
	const reversed = productDualSeries([...xs].reverse());
	assertClose(reversed.v, full.v, 1e-12);
	assertClose(reversed.d, full.d, 1e-12);

	// Splitting / homomorphism: prod(A ++ B) = prod(A) * prod(B)
	const left = productDualSeries(xs.slice(0, 2));
	const right = productDualSeries(xs.slice(2));
	const combined = mulDual(left, right);
	assertClose(combined.v, full.v, 1e-12);
	assertClose(combined.d, full.d, 1e-12);

	// Logarithmic derivative identity: D / V = ∑ (d_i / v_i)
	const logDerivSum = xs.reduce((s, { v, d }) => s + d / v, 0);
	assertClose(full.d / full.v, logDerivSum, 1e-12);
});
