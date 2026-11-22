# 挡风玻璃光学畸变仿真检测台

浏览器内运行的夹层风挡光学畸变仿真与检测系统。TypeScript + WebGPU/Canvas2D，本地 IndexedDB 持久化，零运行时框架依赖。

## 核心设计原则

**屈光度数值的唯一权威是 f64 双精度 CPU 光学引擎（`src/optics/`），可在 Node 中单测；WebGPU 仅承担条纹可视化，不参与合格判定。** 这样即使浏览器 GPU 浮点精度或驱动存在差异，检测结论依然可复现、可追溯。

## 目录结构

```
src/
  optics/                 物理引擎（纯 TS、f64、无 DOM 依赖，可独立单测）
    vector.ts             向量、矩阵奇异值
    surface.ts            高度场抽象、光线-曲面牛顿/对分求交
    analytic_surface.ts   球面/柱面/抛物面/平面（已知曲率校验用）
    refraction.ts         矢量 Snell 折射
    laminate.ts           外片/PVB/内片四界面双层追光，自动识别正反向
    station.ts            装车倾角、眼点、斑马板几何、板坐标->屈光度折算
    diopter.ts            逐点屈光度正算 + 平行光功率校验口径
    diopter_support.ts    共享类型
    inversion.ts          条纹图反推屈光度（与正算同一公式）
    surface_builder.ts    控制曲线/点云二次拟合 + 制造缺陷合成
  models/                 领域模型与三车型种子数据
  db/                     IndexedDB 封装与状态仓库
  render/                 CPU 光栅热图 + WebGPU 片元着色器条纹渲染
  services/analysis.ts    分区限值判定
  ui/                     设计令牌 CSS、线框图标、六页面、hash 路由
  tests/                  光学精度、正反算一致性、应用冒烟测试
```

## 屈光度的两套口径

1. **平行光功率口径** `computeCollimatedPower`：固定平行入射束，出射角对光线高度的梯度。用于已知曲率玻璃对照 lensmaker 公式，与共轭距离无关，是精度校验的权威路径。
2. **斑马板标准口径** `computeDiopterField` / `invertDiopterFromImage`：板上命中坐标对玻璃采样坐标的雅可比，经 `jacobianToDiopter` 扣除有限眼点距离的透视基线 `1/L + 1/L_eye` 后得到净畸变。正算与反推共用同一折算函数，因此两者数值天然对得上。

## 精度验证（`pnpm test`）

- 球面平凸透镜 R=1.04m：追迹功率与厚透镜 lensmaker 手算误差 < 0.01 D
- 柱面：母线方向功率严格为零；等厚弯月镜净功率被第二面抵消；平凸呈完整单面功率
- 平板玻璃：净畸变接近零（残差仅有限距离透视项，量级 t/L²）
- 条纹反推 vs 直接计算：逐点屈光度 RMS 误差 < 0.02 D
- 应用冒烟：IndexedDB 种子落库、六页面无异常渲染（jsdom + fake-indexeddb）

## 常用命令

```bash
pnpm install
pnpm dev        # 开发服务器
pnpm test       # 全部单元/冒烟测试
pnpm build      # 类型检查 + 生产构建
```

## 制造缺陷模型

| 类型 | 矢高扰动 |
| --- | --- |
| 局部厚度不均 | 高斯鼓包/凹陷，幅度+半径可调 |
| 弯曲成型波纹 | 高斯包络内正弦波纹，频率可调 |
| 边部应力凸起 | 边缘距离衰减的局部隆起 |

幅度、位置、半径、频率均可在玻璃曲面页实时调节并参与追光计算。

## 数据与隐私

车型档案、玻璃参数、工位、批次记录全部保存在本机浏览器 IndexedDB，不上传任何服务器；设置页可一键清空。
