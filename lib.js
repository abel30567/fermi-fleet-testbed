export function add(a, b) {
	return a + b
}

export function tangentVector3D(r, t, h = 1e-6) {
	if (typeof r !== 'function') {
		throw new TypeError('r must be a function')
	}
	if (typeof t !== 'number' || !Number.isFinite(t)) {
		throw new TypeError('t must be a finite number')
	}
	if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const pPlus = r(t + h)
	const pMinus = r(t - h)

	if (
		!Array.isArray(pPlus) ||
		!Array.isArray(pMinus) ||
		pPlus.length !== 3 ||
		pMinus.length !== 3
	) {
		throw new TypeError('r(t) must return a 3-element array [x, y, z]')
	}

	const dx = (pPlus[0] - pMinus[0]) / (2 * h)
	const dy = (pPlus[1] - pMinus[1]) / (2 * h)
	const dz = (pPlus[2] - pMinus[2]) / (2 * h)

	if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) {
		throw new RangeError('r(t) must return finite numeric coordinates')
	}

	const norm = Math.hypot(dx, dy, dz)
	if (norm === 0 || !Number.isFinite(norm)) {
		throw new RangeError('Unit tangent vector is undefined when velocity norm is zero')
	}

	const tx = dx / norm
	const ty = dy / norm
	const tz = dz / norm

	return [tx === 0 ? 0 : tx, ty === 0 ? 0 : ty, tz === 0 ? 0 : tz]
}
