#!/bin/bash
# ClawdBridge 远程云服务器部署脚本 v2
set -e

echo "=== ClawdBridge 云服务器部署 ==="
echo ""

# 步骤1: 清理并安装 Docker
if ! command -v docker &> /dev/null; then
    echo "[1/4] 安装 Docker..."
    
    # 清理之前的脏文件
    rm -f /etc/apt/sources.list.d/docker.list
    rm -f /etc/apt/sources.list.d/archive_uri-*.list
    
    source /etc/os-release
    echo "  系统: $NAME $VERSION_ID ($VERSION_CODENAME)"
    
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg
    
    # GPG key
    curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # Docker 源
    ARCH=$(dpkg --print-architecture)
    echo "deb [arch=${ARCH} signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://mirrors.aliyun.com/docker-ce/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
    
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    systemctl start docker
    systemctl enable docker
    echo "  Docker 安装完成: $(docker --version)"
else
    echo "[1/4] Docker 已安装: $(docker --version)"
fi
echo ""

# 步骤2: 创建构建目录
BUILD_DIR="/root/clawdbridge-build"
echo "[2/4] 创建目录: ${BUILD_DIR}"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/output"
echo "  完成"
echo ""

# 步骤3: 解压项目
echo "[3/4] 解压项目文件..."
cd "$BUILD_DIR"
tar xzf /root/mobile-project.tar.gz
ls -la
echo "  完成"
echo ""

# 步骤4: 构建 Docker 镜像和 APK
echo "[4/4] 构建 Docker 镜像..."
docker build -f Dockerfile.build -t clawdbridge-builder:latest . 2>&1 | tail -30

echo ""
echo "构建 APK (约10-20分钟)..."
docker run --rm \
    -v "$BUILD_DIR/output:/output" \
    -e JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    clawdbridge-builder:latest

echo ""
echo "=== 构建完成 ==="
ls -lh "$BUILD_DIR/output/"
echo ""
echo "下载命令: scp -P 48731 -i ~/.ssh/claude_code_server_key root@121.41.60.140:${BUILD_DIR}/output/clawdbridge.apk ./"
