import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { magnitudeComplexMemo } from "./magnitudeComplexMemo.js";

/**
 * Helper to assert two numbers are within relative or absolute tolerance.
 */
function assertApprox(actual, expected, relTol = 1e-12, absTol = 1e-15) {
	const diff = Math.abs(actual - expected);
	const limit = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)));
	assert.ok(
		diff <= limit,
		`Expected ${actual} to be within ${limit} of ${expected} (diff=${diff})`,
	);
}

/**
 * Independent Hermitian inner product <u, v> = sum(u_k * conj(v_k)).
 */
function hermitianInnerProduct(u, v) {
	let re = 0;
	let im = 0;
	for (let i = 0; i < u.length; i++) {
		re += u[i].re * v[i].re + u[i].im * v[i].im;
		im += u[i].im * v[i].re - u[i].re * v[i].im;
	}
	return { re, im };
}

/**
 * Independent complex vector addition u + v.
 */
function addComplexVectors(u, v) {
	return u.map((el, i) => ({ re: el.re + v[i].re, im: el.im + v[i].im }));
}

/**
 * Independent complex vector subtraction u - v.
 */
function subComplexVectors(u, v) {
	return u.map((el, i) => ({ re: el.re - v[i].re, im: el.im - v[i].im }));
}

/**
 * Independent complex scalar multiplication c * v.
 */
function scaleComplexVector(c, v) {
	return v.map((el) => ({
		re: c.re * el.re - c.im * el.im,
		im: c.re * el.im + c.im * el.re,
	}));
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property tests.
 */
function makeRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

describe("magnitudeComplexMemo", () => {
	describe("normal cases", () => {
		it("computes the magnitude of a single complex number (3-4-5 triangle)", () => {
			assert.equal(magnitudeComplexMemo([{ re: 3, im: 4 }]), 5);
			assert.equal(magnitudeComplexMemo([{ re: -3, im: 4 }]), 5);
			assert.equal(magnitudeComplexMemo([{ re: 3, im: -4 }]), 5);
			assert.equal(magnitudeComplexMemo([{ re: -3, im: -4 }]), 5);
		});

		it("handles purely real and purely imaginary vectors", () => {
			assert.equal(
				magnitudeComplexMemo([
					{ re: 3, im: 0 },
					{ re: -4, im: 0 },
				]),
				5,
			);
			assert.equal(
				magnitudeComplexMemo([
					{ re: 0, im: 5 },
					{ re: 0, im: -12 },
				]),
				13,
			);
		});

		it("computes the magnitude of multi-element small-integer complex vectors", () => {
			const v = [
				{ re: 1, im: 2 },
				{ re: 3, im: 4 },
				{ re: -2, im: 1 },
			];
			assertApprox(magnitudeComplexMemo(v), Math.sqrt(35));
		});

		it("computes the magnitude of non-integer and out-of-table complex vectors", () => {
			const v = [
				{ re: 1.5, im: -2.25 },
				{ re: 100.5, im: 200.75 },
				{ re: -75.125, im: 0.5 },
			];
			const expected = Math.sqrt(
				1.5 ** 2 + 2.25 ** 2 + 100.5 ** 2 + 200.75 ** 2 + 75.125 ** 2 + 0.5 ** 2,
			);
			assertApprox(magnitudeComplexMemo(v), expected);
		});
	});

	describe("edge cases and numerical stability", () => {
		it("returns +0 for an empty vector", () => {
			const res = magnitudeComplexMemo([]);
			assert.ok(Object.is(res, 0));
		});

		it("returns +0 for a zero vector including negative zeros", () => {
			const res = magnitudeComplexMemo([
				{ re: 0, im: 0 },
				{ re: -0, im: 0 },
				{ re: 0, im: -0 },
				{ re: -0, im: -0 },
			]);
			assert.ok(Object.is(res, 0));
		});

		it("avoids overflow for very large components", () => {
			const v = [
				{ re: 3e200, im: 4e200 },
				{ re: 0, im: 0 },
			];
			assertApprox(magnitudeComplexMemo(v), 5e200, 1e-14);

			const nearMax = [
				{ re: 3e307, im: 4e307 },
			];
			assertApprox(magnitudeComplexMemo(nearMax), 5e307, 1e-14);

			const pairLarge = [
				{ re: 1e308, im: 0 },
				{ re: 0, im: 1e308 },
			];
			assertApprox(magnitudeComplexMemo(pairLarge), Math.SQRT2 * 1e308, 1e-14);
		});

		it("avoids underflow for very small and subnormal components", () => {
			const v = [{ re: 3e-200, im: 4e-200 }];
			assertApprox(magnitudeComplexMemo(v), 5e-200, 1e-14, 0);

			const nearMinNormal = [{ re: 3e-308, im: 4e-308 }];
			assertApprox(magnitudeComplexMemo(nearMinNormal), 5e-308, 1e-12, 0);

			const subnormal = [
				{ re: 1e-320, im: 0 },
				{ re: 0, im: 1e-320 },
			];
			const mag = magnitudeComplexMemo(subnormal);
			assert.ok(mag > 0 && Number.isFinite(mag));
			assertApprox(mag, Math.SQRT2 * 1e-320, 1e-2, 0);
		});

		it("handles mixed extreme magnitudes in the same vector", () => {
			const v = [
				{ re: 1e200, im: 0 },
				{ re: 1e-200, im: -1e-200 },
			];
			assert.equal(magnitudeComplexMemo(v), 1e200);
		});

		it("handles long vectors exceeding the whole-vector memo length threshold", () => {
			const len = 1500;
			const v = Array.from({ length: len }, () => ({ re: 3, im: 4 }));
			assertApprox(magnitudeComplexMemo(v), 5 * Math.sqrt(len), 1e-13);

			const vFloat = Array.from({ length: len }, () => ({ re: 0.3, im: 0.4 }));
			assertApprox(magnitudeComplexMemo(vFloat), 0.5 * Math.sqrt(len), 1e-13);
		});
	});

	describe("memoization and table-driven cache behavior", () => {
		it("returns identical results on repeated calls and structurally equal vectors", () => {
			const v1 = [
				{ re: 1.25, im: -3.5 },
				{ re: 4.75, im: 2.125 },
			];
			const v2 = [
				{ re: 1.25, im: -3.5 },
				{ re: 4.75, im: 2.125 },
			];
			const r1 = magnitudeComplexMemo(v1);
			const r2 = magnitudeComplexMemo(v1);
			const r3 = magnitudeComplexMemo(v2);
			assert.ok(Object.is(r1, r2));
			assert.ok(Object.is(r1, r3));
		});

		it("hits symmetric cache/table entries for conjugated, negated, and swapped components", () => {
			const base = magnitudeComplexMemo([
				{ re: 7.25, im: 11.5 },
				{ re: 5, im: 12 },
			]);
			const transformed = magnitudeComplexMemo([
				{ re: -11.5, im: -7.25 },
				{ re: -12, im: 5 },
			]);
			assert.ok(Object.is(base, transformed));
		});

		it("does not return stale cached values when an input vector is mutated", () => {
			const v = [
				{ re: 3, im: 4 },
				{ re: 0, im: 0 },
			];
			assert.equal(magnitudeComplexMemo(v), 5);
			v[1].re = 12;
			assert.equal(magnitudeComplexMemo(v), 13);
		});

		it("handles bounded cache eviction gracefully across many unique vectors and elements", () => {
			const results = [];
			for (let i = 1; i <= 600; i++) {
				const v = [
					{ re: i + 0.125, im: i + 0.375 },
					{ re: i * 0.5 + 0.25, im: -(i * 0.25 + 0.75) },
				];
				results.push({ v, mag: magnitudeComplexMemo(v) });
			}

			// Re-query evicted early entries and recent cached entries.
			for (const idx of [0, 1, 50, 299, 598, 599]) {
				const { v, mag } = results[idx];
				assert.equal(magnitudeComplexMemo(v), mag);
			}

			// Stress element-level cache beyond 2048 unique elements.
			const manyElements = Array.from({ length: 2200 }, (_, i) => ({
				re: (i + 1) * 0.13,
				im: (i + 1) * 0.29,
			}));
			const expected = Math.sqrt(
				manyElements.reduce((acc, el) => acc + el.re * el.re + el.im * el.im, 0),
			);
			assertApprox(magnitudeComplexMemo(manyElements), expected, 1e-12);
		});
	});

	describe("input validation", () => {
		it("throws TypeError when input is not an array", () => {
			for (const bad of [null, undefined, 42, "123", {}, { re: 1, im: 2 }, new Float64Array(2)]) {
				assert.throws(() => magnitudeComplexMemo(bad), TypeError);
			}
		});

		it("throws TypeError when any element is not a non-null object", () => {
			for (const badEl of [null, undefined, 5, "3+4i", true, Symbol("z")]) {
				assert.throws(() => magnitudeComplexMemo([{ re: 1, im: 2 }, badEl]), TypeError);
			}
			// Sparse array hole
			const sparse = new Array(2);
			sparse[0] = { re: 1, im: 0 };
			assert.throws(() => magnitudeComplexMemo(sparse), TypeError);
		});

		it("throws TypeError when re or im is missing or non-numeric", () => {
			for (const badEl of [
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: "1", im: 2 },
				{ re: 1, im: null },
				{ re: 1n, im: 2 },
			]) {
				assert.throws(() => magnitudeComplexMemo([badEl]), TypeError);
			}
		});

		it("throws RangeError when re or im is non-finite", () => {
			for (const badEl of [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 1 },
				{ re: 1, im: Number.NEGATIVE_INFINITY },
			]) {
				assert.throws(() => magnitudeComplexMemo([{ re: 3, im: 4 }, badEl]), RangeError);
			}
		});
	});

	describe("independent mathematical cross-checks", () => {
		it("matches sqrt(Re(<v, v>)) from the Hermitian inner product", () => {
			const rng = makeRng(20261123);
			for (let trial = 0; trial < 20; trial++) {
				const n = 1 + Math.floor(rng() * 15);
				const v = Array.from({ length: n }, () => ({
					re: (rng() - 0.5) * 200,
					im: (rng() - 0.5) * 200,
				}));
				const inner = hermitianInnerProduct(v, v);
				assertApprox(inner.im, 0, 1e-12, 1e-10);
				assertApprox(magnitudeComplexMemo(v), Math.sqrt(inner.re), 1e-12);
			}
		});

		it("satisfies Parseval's theorem under the Discrete Fourier Transform", () => {
			const x = [
				{ re: 1.2, im: -0.5 },
				{ re: -2.3, im: 4.1 },
				{ re: 0.7, im: 1.9 },
				{ re: 3.5, im: -2.8 },
				{ re: -1.1, im: 0.4 },
				{ re: 2.0, im: 3.3 },
				{ re: -0.9, im: -1.7 },
				{ re: 4.4, im: 0.6 },
			];
			const N = x.length;
			const X = Array.from({ length: N }, (_, k) => {
				let re = 0;
				let im = 0;
				for (let n = 0; n < N; n++) {
					const angle = (-2 * Math.PI * k * n) / N;
					const c = Math.cos(angle);
					const s = Math.sin(angle);
					re += x[n].re * c - x[n].im * s;
					im += x[n].re * s + x[n].im * c;
				}
				return { re, im };
			});

			// Parseval: ||DFT(x)||_2 = sqrt(N) * ||x||_2
			assertApprox(magnitudeComplexMemo(X), Math.sqrt(N) * magnitudeComplexMemo(x), 1e-12);
		});

		it("satisfies triangle inequality, reverse triangle inequality, and parallelogram law", () => {
			const rng = makeRng(424242);
			for (let trial = 0; trial < 25; trial++) {
				const n = 2 + Math.floor(rng() * 12);
				const u = Array.from({ length: n }, () => ({
					re: (rng() - 0.5) * 100,
					im: (rng() - 0.5) * 100,
				}));
				const v = Array.from({ length: n }, () => ({
					re: (rng() - 0.5) * 100,
					im: (rng() - 0.5) * 100,
				}));

				const normU = magnitudeComplexMemo(u);
				const normV = magnitudeComplexMemo(v);
				const normSum = magnitudeComplexMemo(addComplexVectors(u, v));
				const normDiff = magnitudeComplexMemo(subComplexVectors(u, v));

				// Triangle inequality: ||u + v|| <= ||u|| + ||v||
				assert.ok(normSum <= normU + normV + 1e-11);
				// Reverse triangle inequality: | ||u|| - ||v|| | <= ||u - v||
				assert.ok(Math.abs(normU - normV) <= normDiff + 1e-11);
				// Parallelogram law: ||u + v||^2 + ||u - v||^2 = 2 * (||u||^2 + ||v||^2)
				assertApprox(
					normSum * normSum + normDiff * normDiff,
					2 * (normU * normU + normV * normV),
					1e-11,
				);
			}
		});

		it("satisfies absolute homogeneity ||c * v|| = |c| * ||v|| for complex scalars", () => {
			const v = [
				{ re: 2.5, im: -1.5 },
				{ re: -3.25, im: 4.75 },
				{ re: 0.5, im: 6.0 },
			];
			const normV = magnitudeComplexMemo(v);
			const scalars = [
				{ re: 0, im: 0 },
				{ re: -1, im: 0 },
				{ re: 0, im: 1 },
				{ re: 3, im: -4 },
				{ re: Math.cos(1.23), im: Math.sin(1.23) },
				{ re: -7.5, im: 2.25 },
			];

			for (const c of scalars) {
				const absC = Math.hypot(c.re, c.im);
				const scaled = scaleComplexVector(c, v);
				assertApprox(magnitudeComplexMemo(scaled), absC * normV, 1e-12);
			}
		});
	});
});
