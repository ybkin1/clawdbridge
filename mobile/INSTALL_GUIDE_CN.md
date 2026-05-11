# ClawdBridge 国内安装指南

## 方式一：直接下载 APK（最简单）

### 步骤
1. 下载 APK 文件：`clawdbridge.apk`
2. 在 Android 手机上打开下载的 APK
3. 如果提示"未知来源"，前往设置 → 安全 → 允许未知来源安装
4. 完成安装

### APK 下载地址
- GitHub Actions 构建产物：`.github/workflows/build-apk.yml` 自动构建
- 云服务器构建：`mobile/build-output/clawdbridge.apk`

---

## 方式二：使用 Expo Go（无需安装 APK）

### 步骤
1. 手机安装 Expo Go：
   - 安卓：在应用宝/豌豆荚/酷安搜索"Expo Go"
   - 或访问 https://expo.dev/go 下载 APK

2. 电脑端启动开发服务器：
```bash
cd mobile
npm install
npx expo start --lan
```

3. 手机 Expo Go 扫描终端显示的二维码

---

## 方式三：GitHub Actions 云端构建（推荐）

### 自动触发
- 推送代码到 `main` 或 `master` 分支
- 修改 `mobile/**` 目录下的文件

### 手动触发
1. 进入 GitHub 仓库 → Actions → Build ClawdBridge APK
2. 点击 "Run workflow" → 选择构建类型 → Run

### 下载 APK
1. 等待工作流完成（约 15-25 分钟）
2. 进入工作流详情 → Artifacts
3. 下载 `clawdbridge-apk-v{编号}`

---

## 方式四：云服务器 Docker 构建（无需本地环境）

### 前置要求
- Linux 云服务器（Ubuntu/CentOS 等）
- Docker 已安装

### 一键构建
```bash
cd mobile
chmod +x build-cloud.sh
./build-cloud.sh
```

### 或使用 Docker Compose
```bash
cd mobile
docker-compose -f docker-compose.build.yml up --build
```

### 构建完成后
- APK 文件位于：`mobile/build-output/clawdbridge.apk`
- 下载到本地：`scp user@server:/path/to/mobile/build-output/clawdbridge.apk ./`

---

## 方式五：本地构建（需要 Android 开发环境）

### 环境要求
- Node.js 18+
- Java 17
- Android Studio + Android SDK

### 步骤
```bash
# 1. 进入项目
cd mobile

# 2. 安装依赖（使用国内镜像）
npm config set registry https://registry.npmmirror.com
npm install

# 3. 预构建 Android 项目
npx expo prebuild --platform android

# 4. 进入 Android 目录编译
cd android
./gradlew assembleRelease

# 5. APK 输出位置
# android/app/build/outputs/apk/release/app-release.apk
```

---

## 网络优化（国内）

### npm 镜像
```bash
npm config set registry https://registry.npmmirror.com
npm config set disturl https://npmmirror.com/dist
```

### Gradle 镜像
已自动配置在：
- `Dockerfile.build`：构建时自动替换为腾讯云镜像
- `build-cloud.sh`：自动执行 sed 替换
- GitHub Actions：`Configure Gradle mirror` 步骤

---

## 常见问题

### Q: 安装时提示"解析包错误"？
A: 下载不完整，重新下载 APK

### Q: 应用闪退？
A: 检查 Android 版本是否 >= 8.0

### Q: 无法连接 Cloud Agent？
A: 确保手机和电脑在同一局域网，或配置公网地址

### Q: 如何更新？
A: 下载新版本 APK 直接安装即可覆盖

### Q: Docker 构建卡在 "Download gradle-x.x.x-bin.zip"？
A: 已配置国内镜像，如仍卡住可手动下载后放入 `~/.gradle/wrapper/dists/`

---

## 系统要求

| 平台 | 最低版本 |
|------|---------|
| Android | 8.0 (API 26) |
| iOS | 13.0 |
| Node.js | 18+ |
| Docker | 20.10+ |
