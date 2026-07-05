# 深海改道版（Open Dave Game）

对标 Dave the Diver 的 2D 像素风深海潜水游戏 MVP：**潜水捕猎 → 晚间餐厅 → 金钱升级 → 潜得更深** 的核心循环，外加多地域/双人/生物能力/水族馆等差异化玩法的架构预留。

## 运行

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest 单测
npm run build      # 产物在 dist/
```

## 操作

| 按键 | 动作 |
|---|---|
| WASD / 方向键 | 游动 |
| 鼠标移动 + 按住左键蓄力、松开 | 鱼叉瞄准/发射 |
| J / 空格连打 | 中大型鱼挣扎收线 |
| E（浅水区） | 上浮结束下潜（渔获入账） |
| ESC | 放弃本潜（渔获不入账） |

## 核心循环

下潜（氧气=生命+时间+探索预算）→ 鱼叉捕猎（小鱼即得，中大鱼挣扎 QTE）→ 背包重量取舍（超重减速）→ 上岸 → 晚间选 ≤3 道菜营业 → 收入 → 商店升级氧气瓶/货舱/鱼叉 → 解锁更深海域的高价鱼。氧尽被救援只能保留一件渔获。

## 架构要点

- **数据驱动**：`public/assets/data/` 四张 JSON 表（fish/equipment/recipes/regions）。新地域 = 新增 region json + 生物条目，核心代码零改动
- **事件总线**：模块间只经 `EventBus` + `GameState` 通信，互不 import
- **双人预留**：`InputSource` 抽象 + `Player` 只读 `InputFrame` + `CameraRig` 封装，未来本地同屏只需新增输入源
- **存档**：localStorage（`open-dave:save:v1`），只存进度不存潜水中状态
- 程序占位纹理以 `ph_` 前缀命名，正式像素素材按同 key 替换即可（见 CREDITS.md 素材来源规划）

## 目录

```
src/core/       EventBus / GameState / SaveManager / EquipmentStats / types(接口合同)
src/input/      InputSource 抽象 + 键鼠实现
src/data/       DataRegistry(JSON 表加载与引用校验)
src/scenes/     Boot / Preload / Dive / Surface / Restaurant / UI(HUD)
src/dive/       Player / CameraRig / Terrain / Fish / FishSpawner / Harpoon / systems(氧气·背包)
src/restaurant/ MenuSelect / ServiceLoop
```
