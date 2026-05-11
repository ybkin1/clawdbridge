#!/bin/bash
# ClawdBridge 云端构建脚本
# 在任何 Linux 云服务器上一键构建 APK
# 无需本地 Android 环境，使用 Docker 构建

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  ClawdBridge APK 云端构建工具${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker 未安装，正在安装...${NC}"
    curl -fsSL https://get.docker.com | sh
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker $USER
    echo -e "${GREEN}Docker 安装完成，请重新登录后重试${NC}"
    exit 0
fi

echo -e "${GREEN}✓ Docker 已安装${NC}"

# 项目目录
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$PROJECT_DIR/build-output"
mkdir -p "$BUILD_DIR"

echo -e "${BLUE}项目目录: $PROJECT_DIR${NC}"
echo -e "${BLUE}输出目录: $BUILD_DIR${NC}"
echo ""

# 构建 Docker 镜像
echo -e "${YELLOW}步骤 1/3: 构建 Docker 镜像...${NC}"
docker build -f "$PROJECT_DIR/Dockerfile.build" -t clawdbridge-builder "$PROJECT_DIR"

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Docker 镜像构建失败${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker 镜像构建成功${NC}"
echo ""

# 运行构建容器
echo -e "${YELLOW}步骤 2/3: 构建 APK（这可能需要 10-20 分钟）...${NC}"
docker run --rm \
    -v "$BUILD_DIR:/output" \
    -e JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    clawdbridge-builder

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ APK 构建失败${NC}"
    exit 1
fi

echo -e "${GREEN}✓ APK 构建成功${NC}"
echo ""

# 验证输出
echo -e "${YELLOW}步骤 3/3: 验证构建产物...${NC}"
if [ -f "$BUILD_DIR/clawdbridge.apk" ]; then
    APK_SIZE=$(du -h "$BUILD_DIR/clawdbridge.apk" | cut -f1)
    echo -e "${GREEN}✓ APK 文件已生成${NC}"
    echo -e "${BLUE}  文件名: clawdbridge.apk${NC}"
    echo -e "${BLUE}  大小: $APK_SIZE${NC}"
    echo -e "${BLUE}  路径: $BUILD_DIR/clawdbridge.apk${NC}"
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  构建完成！${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${YELLOW}安装方式:${NC}"
    echo -e "  1. 下载 APK 到手机"
    echo -e "  2. 在文件管理器中点击安装"
    echo -e "  3. 如提示'未知来源'，请在设置中允许"
    echo ""
    echo -e "${YELLOW}下载命令:${NC}"
    echo -e "  scp user@server:$BUILD_DIR/clawdbridge.apk ./"
else
    echo -e "${RED}✗ 未找到 APK 文件${NC}"
    exit 1
fi
