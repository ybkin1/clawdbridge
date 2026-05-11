# ClawdBridge Mobile 构建指南

## 中国境内用户安装方式

### 方式一：直接下载 APK（推荐）

1. 访问构建产物页面下载 APK
2. 在 Android 手机上允许"安装未知来源应用"
3. 安装 APK

### 方式二：使用 Expo Go（无需构建）

1. 手机安装 Expo Go（国内可通过以下方式）：
   - 安卓：在应用宝/豌豆荚搜索"Expo Go"
   - 或者扫描下方二维码下载

2. 启动开发服务器：
```bash
cd mobile
# 使用国内镜像
npm config set registry https://registry.npmmirror.com
npm install
npx expo start --lan
```

3. 手机 Expo Go 扫描终端显示的二维码

### 方式三：本地构建 APK

#### 环境准备

1. 安装 Node.js 18+ 和 Java 17
2. 安装 Android Studio 和 Android SDK
3. 配置环境变量：
```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

#### 构建步骤

```bash
# 1. 进入项目目录
cd mobile

# 2. 使用国内 npm 镜像
npm config set registry https://registry.npmmirror.com

# 3. 安装依赖
npm install

# 4. 预构建（生成 android 目录）
npx expo prebuild --platform android

# 5. 进入 android 目录编译 APK
cd android
./gradlew assembleRelease

# 6. APK 输出位置
# mobile/android/app/build/outputs/apk/release/app-release.apk
```

#### 签名 APK（可选，用于分发）

```bash
# 生成密钥
keytool -genkey -v -keystore clawdbridge.keystore -alias clawdbridge -keyalg RSA -keysize 2048 -validity 10000

# 配置签名（android/app/build.gradle）
# 见下方签名配置

# 重新构建
./gradlew assembleRelease
```

### 方式四：EAS Build（云端构建）

```bash
# 1. 安装 EAS CLI
npm install -g eas-cli

# 2. 登录 Expo 账号
eas login

# 3. 配置构建
eas build:configure

# 4. 构建 APK
eas build --platform android --profile preview

# 5. 下载构建产物
# EAS 会提供下载链接
```

---

## iOS 安装方式（需 Mac + Xcode）

```bash
# 1. 预构建 iOS 项目
npx expo prebuild --platform ios

# 2. 打开 Xcode
cd ios && open ClawdBridge.xcworkspace

# 3. 连接 iPhone，选择设备，点击 Run
# 或使用命令行：
xcodebuild -workspace ClawdBridge.xcworkspace -scheme ClawdBridge -configuration Release -archivePath ClawdBridge.xcarchive archive
```

---

## 国内网络优化

### npm 镜像
```bash
npm config set registry https://registry.npmmirror.com
npm config set disturl https://npmmirror.com/dist
```

### Gradle 镜像（android/build.gradle）
```gradle
allprojects {
    repositories {
        maven { url 'https://maven.aliyun.com/repository/public' }
        maven { url 'https://maven.aliyun.com/repository/google' }
        google()
        mavenCentral()
    }
}
```

---

## 常见问题

### Q: Expo Go 无法下载？
A: 使用应用宝搜索"Expo Go"，或访问 https://expo.dev/go 下载 APK

### Q: 构建时 Gradle 下载慢？
A: 在 `android/build.gradle` 中添加阿里云镜像（见上方）

### Q: 如何更新已安装的 APK？
A: 下载新版本 APK 直接安装即可覆盖

### Q: iOS 无法安装？
A: iOS 需要开发者账号或 TestFlight，建议使用 Expo Go 开发调试
