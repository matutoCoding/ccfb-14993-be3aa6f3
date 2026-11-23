# 挡风玻璃光学畸变仿真检测系统

TypeScript + WebGPU + IndexedDB 的浏览器端挡风玻璃光学畸变仿真与检测系统。

## 启动

```bash
pnpm install
pnpm dev
```

## 精度自检（不依赖浏览器，Node f64 物理内核）

```bash
pnpm selftest
```

验收阈值：已知曲率玻璃的追迹屈光度与解析公式误差 < 0.01 D。

## 架构

```
src/
  physics/        权威物理内核（f64，CPU）
    ray_tracer    5 界面 Snell 光线追迹（空气/外玻璃/PVB/内玻璃/空气）
    diopter       板上映射法 + 角偏导法双口径屈光度
    inverse       四步相移条纹反演（与直接计算同几何因子）
    heightfield   loft 曲线 / 点云 MLS 拟合 / 双三次采样
    selftest      解析平凸透镜对拍
  render/         成像层（Canvas2D 业务图 + WebGPU 高速预览）
  workers/        物理计算 Worker，避免阻塞 UI
  db/             IndexedDB 版本化封装
  pages/          车型档案 / 玻璃曲面 / 检测工位 / 畸变分析 / 批次记录 / 设置
```

## 坐标约定

- 玻璃局部系：xy 为玻璃平面，z 为厚度方向，眼点在 +z，光线朝 −z 传播
- 长度 mm，角度 deg，折射率无量纲，屈光度 D = m⁻¹
- 斑马板位于玻璃 −z 侧，板距沿光轴度量
