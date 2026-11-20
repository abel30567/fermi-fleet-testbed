export function add(a, b) {
	return a + b
}

export function cartesianToCylindrical(x, y, z) {
	return {
		r: Math.hypot(x, y),
		theta: Math.atan2(y, x),
		z,
	}
}
