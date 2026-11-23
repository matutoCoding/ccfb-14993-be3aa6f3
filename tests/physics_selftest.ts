// 物理内核精度自检：node --experimental-strip-types tests/physics_selftest.ts
import { runSelfTests } from '../src/physics/selftest.ts'

const cases = runSelfTests()
let allPass = true

console.log('='.repeat(72))
console.log('挡风玻璃光学畸变物理内核 — 精度自检（验收阈值 0.01 D）')
console.log('='.repeat(72))

for (const c of cases) {
  if (!c.pass) allPass = false
  console.log(
    `${c.pass ? 'PASS' : 'FAIL'}  ${c.name}\n`
    + `      解析值=${c.expected.toFixed(6)} D  追迹值=${c.measured.toFixed(6)} D`
    + `  误差=${c.error.toExponential(3)} D  [${c.detail}]`,
  )
}

console.log('-'.repeat(72))
console.log(allPass ? '全部通过，误差 < 0.01 D' : '存在超差用例，需排查')
process.exit(allPass ? 0 : 1)
