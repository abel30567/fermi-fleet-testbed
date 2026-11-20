export function add(a, b) {
	return a + b
}

export function rodriguesRotate(vec, axis, angle) {
	if (!Array.isArray(vec) || vec.length !== 3 || !vec.every(Number.isFinite)) {
		throw new TypeError("vec must be a 3D array of finite numbers")
	}
	if (!Array.isArray(axis) || axis.length !== 3 || !axis.every(Number.isFinite)) {
		throw new TypeError("axis must be a 3D array of finite numbers")
	}
	if (typeof angle !== "number" || !Number.isFinite(angle)) {
		throw new TypeError("angle must be a finite number")
	}

	const [vx, vy, vz] = vec
	const [ax, ay, az] = axis
	const axisNorm = Math.hypot(ax, ay, az)
	if (axisNorm === 0) {
		throw new RangeError("axis must be a non-zero 3D vector")
	}

	const kx = ax / axisNorm
	const ky = ay / axisNorm
	const kz = az / axisNorm

	const cos = Math.cos(angle)
	const sin = Math.sin(angle)
	const oneMinusCos = 1 - cos

	const dot = kx * vx + ky * vy + kz * vz
	const cx = ky * vz - kz * vy
	const cy = kz * vx - kx * vz
	const cz = kx * vy - ky * vx

	return [
		vx * cos + cx * sin + kx * dot * oneMinusCos,
		vy * cos + cy * sin + ky * dot * oneMinusCos,
		vz * cos + cz * sin + kz * dot * oneMinusCos,
	]
}
