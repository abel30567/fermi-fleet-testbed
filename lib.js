export function add(a, b) {
	return a + b
}

export function rotate3DY(vec, angle) {
	if (!Array.isArray(vec) || vec.length !== 3) {
		throw new TypeError('vec must be an array of 3 numbers [x, y, z]')
	}
	const [x, y, z] = vec
	if (
		typeof x !== 'number' ||
		typeof y !== 'number' ||
		typeof z !== 'number' ||
		typeof angle !== 'number'
	) {
		throw new TypeError('vector components and angle must be numbers')
	}
	const cos = Math.cos(angle)
	const sin = Math.sin(angle)
	return [
		x * cos + z * sin,
		y,
		-x * sin + z * cos,
	]
}
