#!/bin/bash
# CLIProxyAPI 一键升级脚本
# 使用方法: 复制到 VPS 终端执行 bash upgrade.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}[1/4] 查找 CLIProxyAPI 目录...${NC}"
# 尝试在常见位置找到项目目录
PROJECT_DIR=$(find / -name "docker-compose.yml" -path "*CLIProxyAPI*" -o -name "docker-compose.yml" -path "*cli-proxy*" 2>/dev/null | head -1 | xargs dirname)

if [ -z "$PROJECT_DIR" ]; then
    echo -e "${RED}未找到 CLIProxyAPI 的 docker-compose.yml，请手动进入项目目录后重试${NC}"
    exit 1
fi

echo -e "${GREEN}找到项目目录: $PROJECT_DIR${NC}"
cd "$PROJECT_DIR"

echo -e "\n${YELLOW}[2/4] 记录当前版本...${NC}"
CURRENT_IMAGE=$(docker compose images -q 2>/dev/null | head -3)
echo "当前镜像: $CURRENT_IMAGE"

echo -e "\n${YELLOW}[3/4] 拉取最新代码和镜像...${NC}"
git pull origin main
docker compose pull

echo -e "\n${YELLOW}[4/4] 重启服务...${NC}"
docker compose down
docker compose up -d

sleep 3

echo -e "\n${GREEN}升级完成！检查状态...${NC}"
docker compose ps
echo ""
docker compose logs --tail=15

echo -e "\n${GREEN}====== 升级完成 ======${NC}"
echo "验证: curl -s http://localhost:8080/version"
