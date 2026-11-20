export function add(a, b) {
	return a + b
}

export function bisectionRoot(f, a, b, tol = 1e-10, maxIter = 200) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) {
		throw new RangeError('a and b must be finite numbers')
	}
	if (typeof tol !== 'number' || !(tol > 0) || !Number.isFinite(tol)) {
		throw new RangeError('tol must be a positive finite number')
	}
	if (typeof maxIter !== 'number' || !Number.isInteger(maxIter) || maxIter < 1) {
		throw new RangeError('maxIter must be a positive integer')
	}

	let lo = a
	let hi = b
	let fa = f(lo)
	let fb = f(hi)

	if (!Number.isFinite(fa) || !Number.isFinite(fb)) {
		throw new RangeError('f(a) and f(b) must be finite numbers')
	}
	if (fa === 0) return lo
	if (fb === 0) return hi
	if ((fa > 0 && fb > 0) || (fa < 0 && fb < 0)) {
		throw new RangeError('f(a) and f(b) must have opposite signs (f(a) * f(b) <= 0)')
	}

	for (let i = 0; i < maxIter; i++) {
		const mid = lo + (hi - lo) / 2
		const fm = f(mid)
		if (!Number.isFinite(fm)) {
			throw new RangeError('f must return finite numbers on [a, b]')
		}
		if (fm === 0 || Math.abs(hi - lo) / 2 <= tol || mid === lo || mid === hi) {
			return mid
		}
		if ((fa < 0 && fm < 0) || (fa > 0 && fm > 0)) {
			lo = mid
			fa = fm
		} else {
			hi = mid
			fb = fm
		}
	}

	return lo + (hi - lo) / 2
}
