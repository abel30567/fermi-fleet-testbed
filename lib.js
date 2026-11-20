export function add(a, b) {
	return a + b
}

export function cartesianToSpherical(x, y, z) {
	const rho = Math.hypot(x, y, z)
	if (rho === 0) {
		return { rho: 0, theta: 0, phi: 0 }
	}
	const theta = Math.atan2(y, x)
	const phi = Math.acos(Math.max(-1, Math.min(1, z / rho)))
	return { rho, theta, phi }
}
