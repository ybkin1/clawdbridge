#!/bin/bash
# ClawdBridge 远程云服务器部署脚本
# 在阿里云 ECS 上执行：安装 Docker → 构建 APK

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  ClawdBridge 云服务器部署${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 步骤1: 安装 Docker
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}[1/4] 安装 Docker...${NC}"
    
    # 检测 Ubuntu 版本
    . /etc/os-release
    echo "  检测到: $NAME $VERSION_ID"
    
    # 使用阿里云镜像源安装
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl
    
    # 添加 Docker 阿里云 GPG key
    curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # 添加 Docker 阿里云源
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://mirrors.aliyun.com/docker-ce/linux/ubuntu ${VERSION_CODENAME} stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    systemctl start docker
    systemctl enable docker
    
    echo -e "${GREEN}  Docker 安装完成${NC}"
else
    echo -e "${GREEN}[1/4] Docker 已安装: $(docker --version)${NC}"
fi
echo ""

# 步骤2: 创建构建目录（不在harness下）
BUILD_DIR="/root/clawdbridge-build"
echo -e "${YELLOW}[2/4] 创建构建目录: ${BUILD_DIR}${NC}"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
mkdir -p "$BUILD_DIR/output"
echo -e "${GREEN}  目录已创建${NC}"
echo ""

# 步骤3: 构建 Docker 镜像
echo -e "${YELLOW}[3/4] 构建 Docker 镜像（约 5-10 分钟）...${NC}"
cd "$BUILD_DIR"

docker build -f Dockerfile.build -t clawdbridge-builder:latest . 2>&1 | tail -20

if [ $? -ne 0 ]; then
    echo -e "${RED}  Docker 镜像构建失败${NC}"
    exit 1
fi
echo -e "${GREEN}  镜像构建完成${NC}"
echo ""

# 步骤4: 运行容器构建 APK
echo -e "${YELLOW}[4/4] 构建 APK（约 10-20 分钟，取决于网络）...${NC}"
docker run --rm \
    -v "$BUILD_DIR/output:/output" \
    -e JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    clawdbridge-builder:latest

if [ $? -ne 0 ]; then
    echo -e "${RED}  APK 构建失败${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  构建成功！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
ls -lh "$BUILD_DIR/output/"
echo ""
echo -e "${YELLOW}下载命令:${NC}"
echo -e "  scp -P 48731 -i ~/.ssh/claude_code_server_key root@121.41.60.140:/root/clawdbridge-build/output/clawdbridge.apk ./"
