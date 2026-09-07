export function add(a, b) {
	return a + b
}

export function cartesianToSpherical(x, y, z) {
	const rho = Math.sqrt(x * x + y * y + z * z)
	const theta = Math.atan2(y, x)
	const phi = Math.atan2(Math.sqrt(x * x + y * y), z)
	return [rho, theta, phi]
}
