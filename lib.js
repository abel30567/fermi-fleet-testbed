export function add(a, b) {
	return a + b
}

export function cartesianToPolar(x, y) {
	if (typeof x !== 'number' || typeof y !== 'number' || Number.isNaN(x) || Number.isNaN(y)) {
		throw new TypeError('x and y must be valid numbers')
	}
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		throw new RangeError('x and y must be finite numbers')
	}
	const nx = x === 0 ? 0 : x
	const ny = y === 0 ? 0 : y
	const r = Math.hypot(nx, ny)
	let theta = Math.atan2(ny, nx)
	if (theta === 0) {
		theta = 0
	} else if (theta <= -Math.PI) {
		theta = Math.PI
	}
	return { r, theta }
}
