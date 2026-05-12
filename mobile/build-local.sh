#!/bin/bash
# 本地构建 APK 脚本

set -e

echo "=== 开始构建 ClawdBridge APK ==="

# 设置 Java 17
export JAVA_HOME=~/.local/share/mise/installs/java/17.0.2
export PATH=$JAVA_HOME/bin:$PATH

echo "Java 版本:"
java -version

# 进入项目目录
cd "$(dirname "$0")"

# 检查 node_modules
if [ ! -d "node_modules" ]; then
    echo "正在安装依赖..."
    npm install --legacy-peer-deps
fi

# 进入 android 目录
cd android

# 确保 gradlew 可执行
chmod +x gradlew

echo "正在构建 APK..."
./gradlew assembleRelease --no-daemon --stacktrace

# 检查结果
if [ -f "app/build/outputs/apk/release/app-release.apk" ]; then
    echo ""
    echo "✅ APK 构建成功！"
    ls -lh app/build/outputs/apk/release/
else
    echo ""
    echo "❌ APK 构建失败，请检查上面的错误信息"
    exit 1
fi
