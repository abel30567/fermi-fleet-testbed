/**
 * @typedef {Object} Dual
 * @property {number} v - Primal value.
 * @property {number} d - Forward-mode derivative (tangent) component.
 */

/**
 * Validate that a value is a finite dual number `{ v, d }`.
 *
 * @param {unknown} x - Candidate dual number.
 * @param {string} label - Context label for error messages.
 * @returns {Dual} The validated dual number.
 */
function assertDual(x, label) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError(`${label} must be a dual number object { v, d }`);
	}
	if (typeof x.v !== 'number' || typeof x.d !== 'number') {
		throw new TypeError(`${label} must have numeric "v" and "d" properties`);
	}
	if (!Number.isFinite(x.v) || !Number.isFinite(x.d)) {
		throw new RangeError(`${label} must have finite "v" and "d" values`);
	}
	return x;
}

/**
 * Coerce a finite number or dual object into a validated dual number.
 *
 * @param {number|Dual} x - Finite number or dual number `{ v, d }`.
 * @param {string} label - Context label for error messages.
 * @returns {Dual} Validated dual number.
 */
function toDual(x, label) {
	if (typeof x === 'number') {
		if (!Number.isFinite(x)) {
			throw new RangeError(`${label} must be a finite number`);
		}
		return { v: x, d: 0 };
	}
	return assertDual(x, label);
}

/**
 * Create a validated dual number `{ v, d }`.
 *
 * @param {number} v - Primal value.
 * @param {number} [d=0] - Derivative value.
 * @returns {Dual}
 */
export function dual(v, d = 0) {
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('dual(v, d) requires numeric arguments');
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('dual(v, d) requires finite arguments');
	}
	return { v, d };
}

/**
 * Elementary forward-mode arithmetic operations over dual numbers `{ v, d }`.
 */
export const dualOps = Object.freeze({
	dual,

	/** @param {number|Dual} a @param {number|Dual} b @returns {Dual} */
	add(a, b) {
		const x = toDual(a, 'a');
		const y = toDual(b, 'b');
		return dual(x.v + y.v, x.d + y.d);
	},

	/** @param {number|Dual} a @param {number|Dual} b @returns {Dual} */
	sub(a, b) {
		const x = toDual(a, 'a');
		const y = toDual(b, 'b');
		return dual(x.v - y.v, x.d - y.d);
	},

	/** @param {number|Dual} a @returns {Dual} */
	neg(a) {
		const x = toDual(a, 'a');
		return dual(-x.v, -x.d);
	},

	/** @param {number|Dual} a @param {number|Dual} b @returns {Dual} */
	mul(a, b) {
		const x = toDual(a, 'a');
		const y = toDual(b, 'b');
		return dual(x.v * y.v, x.d * y.v + x.v * y.d);
	},

	/** @param {number|Dual} a @param {number|Dual} b @returns {Dual} */
	div(a, b) {
		const x = toDual(a, 'a');
		const y = toDual(b, 'b');
		if (y.v === 0) {
			throw new RangeError('Division by zero in dual division');
		}
		return dual(x.v / y.v, (x.d * y.v - x.v * y.d) / (y.v * y.v));
	},

	/** @param {number|Dual} a @param {number|Dual} b @returns {Dual} */
	pow(a, b) {
		const x = toDual(a, 'a');
		const y = toDual(b, 'b');
		if (y.d === 0) {
			const p = y.v;
			if (p === 0) {
				return dual(1, 0);
			}
			if (p === 1) {
				return dual(x.v, x.d);
			}
			const v = Math.pow(x.v, p);
			const d = x.d === 0 ? 0 : p * Math.pow(x.v, p - 1) * x.d;
			return dual(v, d);
		}
		if (x.v <= 0) {
			throw new RangeError('Base must be positive for dual exponentiation with non-zero exponent derivative');
		}
		const v = Math.pow(x.v, y.v);
		const d = v * (y.d * Math.log(x.v) + (y.v * x.d) / x.v);
		return dual(v, d);
	},

	/** @param {number|Dual} a @returns {Dual} */
	sqrt(a) {
		const x = toDual(a, 'a');
		if (x.v < 0) {
			throw new RangeError('Cannot take sqrt of negative dual value');
		}
		if (x.v === 0) {
			if (x.d === 0) {
				return dual(0, 0);
			}
			throw new RangeError('Derivative of sqrt at 0 is undefined for non-zero tangent');
		}
		const s = Math.sqrt(x.v);
		return dual(s, x.d / (2 * s));
	},

	/** @param {number|Dual} a @returns {Dual} */
	exp(a) {
		const x = toDual(a, 'a');
		const e = Math.exp(x.v);
		return dual(e, e * x.d);
	},

	/** @param {number|Dual} a @returns {Dual} */
	log(a) {
		const x = toDual(a, 'a');
		if (x.v <= 0) {
			throw new RangeError('Cannot take log of non-positive dual value');
		}
		return dual(Math.log(x.v), x.d / x.v);
	},

	/** @param {number|Dual} a @returns {Dual} */
	sin(a) {
		const x = toDual(a, 'a');
		return dual(Math.sin(x.v), Math.cos(x.v) * x.d);
	},

	/** @param {number|Dual} a @returns {Dual} */
	cos(a) {
		const x = toDual(a, 'a');
		return dual(Math.cos(x.v), -Math.sin(x.v) * x.d);
	},

	/** @param {number|Dual} a @returns {Dual} */
	tan(a) {
		const x = toDual(a, 'a');
		const c = Math.cos(x.v);
		return dual(Math.tan(x.v), x.d / (c * c));
	},

	/** @param {number|Dual} a @returns {Dual} */
	abs(a) {
		const x = toDual(a, 'a');
		if (x.v > 0) {
			return dual(x.v, x.d);
		}
		if (x.v < 0) {
			return dual(-x.v, -x.d);
		}
		if (x.d === 0) {
			return dual(0, 0);
		}
		throw new RangeError('Derivative of abs at 0 is undefined for non-zero tangent');
	},
});

/**
 * Compute the gradient of a scalar-valued function `fn` at `point` using
 * forward-mode automatic differentiation over dual numbers `{ v, d }` via a
 * straightforward iterative pass over each coordinate.
 *
 * For an n-dimensional point, `gradientDualIterative` iterates `i = 0 .. n - 1`:
 * on iteration `i`, it builds a dual vector where coordinate `i` is seeded with
 * `{ v: x[i], d: 1 }` and all other coordinates `j !== i` are `{ v: x[j], d: 0 }`,
 * evaluates `fn(dualPoint, dualOps)`, and records the resulting derivative `.d`
 * as the i-th partial derivative.
 *
 * @param {(dualPoint: Dual[], ops: typeof dualOps) => Dual} fn
 *   Scalar function taking an array of dual numbers `{ v, d }` (and optionally
 *   `dualOps` as a second argument) and returning a dual number `{ v, d }`.
 * @param {Array<number|Dual>} point
 *   Evaluation point as an array of finite numbers or dual numbers `{ v, d }`.
 *   When dual numbers are provided, their `.v` primal values define the point.
 * @returns {number[]} Gradient vector `[df/dx_0, ..., df/dx_{n-1}]`.
 * @throws {TypeError} If `fn` is not a function, `point` is not an array of
 *   numbers/duals, or `fn` does not return a dual number `{ v, d }`.
 * @throws {RangeError} If any coordinate or evaluated dual component is non-finite.
 */
export function gradientDualIterative(fn, point) {
	if (typeof fn !== 'function') {
		throw new TypeError('Expected first argument "fn" to be a function');
	}
	if (!Array.isArray(point)) {
		throw new TypeError('Expected second argument "point" to be an array');
	}

	const n = point.length;
	const primals = new Array(n);

	for (let i = 0; i < n; i += 1) {
		const coord = point[i];
		if (typeof coord === 'number') {
			if (!Number.isFinite(coord)) {
				throw new RangeError(`point[${i}] must be a finite number`);
			}
			primals[i] = coord;
		} else {
			const validated = assertDual(coord, `point[${i}]`);
			primals[i] = validated.v;
		}
	}

	const gradient = new Array(n);

	for (let i = 0; i < n; i += 1) {
		const seeded = new Array(n);
		for (let j = 0; j < n; j += 1) {
			seeded[j] = { v: primals[j], d: j === i ? 1 : 0 };
		}

		const result = assertDual(fn(seeded, dualOps), `fn(point) return value at coordinate ${i}`);
		gradient[i] = result.d === 0 ? 0 : result.d;
	}

	return gradient;
}
