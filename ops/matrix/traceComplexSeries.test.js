import test from 'node:test';
import assert from 'node:assert/strict';
import { traceComplexSeries } from './traceComplexSeries.js';

const c = (re, im = 0) => ({ re, im });
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a, b) => ({
	re: a.re * b.re - a.im * b.im,
	im: a.re * b.im + a.im * b.re,
});
const cDiv = (a, b) => {
	const denom = b.re * b.re + b.im * b.im;
	return {
		re: (a.re * b.re + a.im * b.im) / denom,
		im: (a.im * b.re - a.re * b.im) / denom,
	};
};
const cConj = (a) => ({ re: a.re, im: -a.im });

function matMul(A, B) {
	const n = A.length;
	const out = Array.from({ length: n }, () => Array.from({ length: n }, () => c(0, 0)));
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let sum = c(0, 0);
			for (let k = 0; k < n; k++) {
				sum = cAdd(sum, cMul(A[i][k], B[k][j]));
			}
			out[i][j] = sum;
		}
	}
	return out;
}

function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`Expected re ~ ${expected.re}, got ${actual.re}`,
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`Expected im ~ ${expected.im}, got ${actual.im}`,
	);
}

test('normal 2x2 and 3x3 complex matrices', () => {
	const m2 = [
		[c(1, 2), c(9, -3)],
		[c(4, 5), c(-3, 7)],
	];
	assert.deepEqual(traceComplexSeries(m2), { re: -2, im: 9 });

	const m3 = [
		[c(2.5, -1.5), c(1, 1), c(0, 4)],
		[c(-2, 3), c(0.5, 2.25), c(5, -5)],
		[c(7, 0), c(-1, 2), c(-1, 0.25)],
	];
	assertComplexClose(traceComplexSeries(m3), { re: 2, im: 1 });
});

test('edge cases: empty 0x0, 1x1, zero, purely real/imaginary, negative zero', () => {
	assert.deepEqual(traceComplexSeries([]), { re: 0, im: 0 });
	assert.deepEqual(traceComplexSeries([[c(3, -4)]]), { re: 3, im: -4 });
	assert.deepEqual(
		traceComplexSeries([
			[c(0, 0), c(5, 5)],
			[c(-5, -5), c(-0, -0)],
		]),
		{ re: 0, im: 0 },
	);
	const negZeroTrace = traceComplexSeries([[c(-0, -0)]]);
	assert.ok(Object.is(negZeroTrace.re, 0));
	assert.ok(Object.is(negZeroTrace.im, 0));

	const pureImag = [
		[c(0, 3), c(1, 0)],
		[c(2, 0), c(0, -8)],
	];
	assert.deepEqual(traceComplexSeries(pureImag), { re: 0, im: -5 });
});

test('compensated summation mitigates floating-point cancellation on diagonal', () => {
	const m = [
		[c(1e16, 1e16), c(0, 0), c(0, 0)],
		[c(0, 0), c(1, -2), c(0, 0)],
		[c(0, 0), c(0, 0), c(-1e16, -1e16)],
	];
	assert.deepEqual(traceComplexSeries(m), { re: 1, im: -2 });
});

test('independent cross-check: geometric series closed-form identity', () => {
	// Diagonal entries A[k][k] = z^k => tr(A) = (1 - z^n) / (1 - z)
	const n = 8;
	const z = c(0.6, 0.5);
	const matrix = Array.from({ length: n }, () =>
		Array.from({ length: n }, () => c(0.25, -0.75)),
	);
	let zPow = c(1, 0);
	for (let k = 0; k < n; k++) {
		matrix[k][k] = zPow;
		zPow = cMul(zPow, z);
	}
	const closedForm = cDiv(cSub(c(1, 0), zPow), cSub(c(1, 0), z));
	assertComplexClose(traceComplexSeries(matrix), closedForm, 1e-12);
});

test('independent cross-check: cyclic invariance tr(AB) = tr(BA), linearity, and adjoint identity', () => {
	const A = [
		[c(1, 2), c(-3, 1), c(0, 4)],
		[c(2, -1), c(5, 0), c(1, -2)],
		[c(-1, 3), c(2, 2), c(3, -1)],
	];
	const B = [
		[c(0, -1), c(2, 3), c(-2, 1)],
		[c(4, 1), c(-1, 2), c(3, 0)],
		[c(1, -4), c(0, 1), c(2, 5)],
	];

	// Cyclic property: tr(AB) === tr(BA)
	assertComplexClose(traceComplexSeries(matMul(A, B)), traceComplexSeries(matMul(B, A)));

	// Linearity: tr(alpha*A + beta*B) === alpha*tr(A) + beta*tr(B)
	const alpha = c(2, -3);
	const beta = c(-1, 4);
	const linearComb = A.map((row, i) =>
		row.map((val, j) => cAdd(cMul(alpha, val), cMul(beta, B[i][j]))),
	);
	const expectedLinear = cAdd(
		cMul(alpha, traceComplexSeries(A)),
		cMul(beta, traceComplexSeries(B)),
	);
	assertComplexClose(traceComplexSeries(linearComb), expectedLinear);

	// Conjugate transpose identity: tr(A*) === conj(tr(A))
	const adjoint = A.map((_, i) => A.map((__, j) => cConj(A[j][i])));
	assertComplexClose(traceComplexSeries(adjoint), cConj(traceComplexSeries(A)));
});

test('independent cross-check: real 2n x 2n block embedding', () => {
	// Embedding each complex number a+bi as [[a, -b], [b, a]] has real trace = 2 * Re(tr(A))
	const A = [
		[c(3.5, -2), c(1, 4)],
		[c(-2, 0.5), c(-1.25, 7)],
	];
	const block = [];
	for (let i = 0; i < A.length; i++) {
		const r1 = [];
		const r2 = [];
		for (let j = 0; j < A.length; j++) {
			r1.push(A[i][j].re, -A[i][j].im);
			r2.push(A[i][j].im, A[i][j].re);
		}
		block.push(r1, r2);
	}
	let realBlockTrace = 0;
	for (let k = 0; k < block.length; k++) {
		realBlockTrace += block[k][k];
	}
	const tr = traceComplexSeries(A);
	assert.ok(Math.abs(realBlockTrace - 2 * tr.re) <= 1e-12);
});

test('input validation rejects malformed matrices and entries', () => {
	assert.throws(() => traceComplexSeries(null), TypeError);
	assert.throws(() => traceComplexSeries('not a matrix'), TypeError);
	assert.throws(() => traceComplexSeries([123]), TypeError);
	assert.throws(() => traceComplexSeries([[c(1, 0), c(2, 0)]]), RangeError);
	assert.throws(
		() =>
			traceComplexSeries([
				[c(1, 0), c(2, 0)],
				[c(3, 0)],
			]),
		RangeError,
	);
	assert.throws(() => traceComplexSeries([[null]]), TypeError);
	assert.throws(() => traceComplexSeries([[{ re: 1 }]]), TypeError);
	assert.throws(() => traceComplexSeries([[{ re: '1', im: 0 }]]), TypeError);
	assert.throws(() => traceComplexSeries([[c(Number.NaN, 0)]]), RangeError);
	assert.throws(() => traceComplexSeries([[c(0, Number.POSITIVE_INFINITY)]]), RangeError);
	// Invalid off-diagonal entry is also validated
	assert.throws(
		() =>
			traceComplexSeries([
				[c(1, 0), c(Number.NEGATIVE_INFINITY, 0)],
				[c(0, 0), c(1, 0)],
			]),
		RangeError,
	);
});
