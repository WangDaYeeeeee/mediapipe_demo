#!/bin/bash

# 设置颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_message() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 检查是否安装了必要的工具
check_dependencies() {
    print_step "检查依赖..."
    
    if ! command -v npm &> /dev/null; then
        print_error "npm 未安装，请先安装 Node.js"
        exit 1
    fi
    
    if ! command -v networksetup &> /dev/null; then
        print_error "networksetup 命令不可用，请确保在 macOS 上运行"
        exit 1
    fi
    
    print_message "依赖检查完成"
}

# 获取本机IP地址
get_local_ip() {
    local_ip=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)
    if [ -z "$local_ip" ]; then
        print_error "无法获取本机IP地址"
        exit 1
    fi
    echo $local_ip
}

# 显示网络连接信息
show_network_info() {
    print_step "当前网络连接信息："
    
    # 获取当前WiFi名称
    wifi_name=$(networksetup -getairportnetwork en0 | awk -F": " '{print $2}')
    if [ -n "$wifi_name" ]; then
        print_message "当前WiFi: $wifi_name"
    fi
    
    # 获取本机IP
    local_ip=$(get_local_ip)
    print_message "本机IP地址: $local_ip"
    
    # 获取端口信息
    print_message "服务器端口: 3000"
    print_message "HTTPS地址: https://$local_ip:3000"
}

# 启动开发服务器
start_server() {
    print_step "启动开发服务器..."
    
    # 检查是否已安装依赖
    if [ ! -d "node_modules" ]; then
        print_warning "未找到 node_modules，正在安装依赖..."
        npm install
    fi
    
    # 启动服务器
    print_message "启动 Vite 开发服务器..."
    print_message "服务器将在 https://$(get_local_ip):3000 上运行"
    print_message "在手机上打开浏览器访问上述地址"
    print_message "注意：首次访问时浏览器会提示证书不安全，请点击'继续访问'或'高级'->'继续访问'"
    print_message ""
    print_message "按 Ctrl+C 停止服务器"
    print_message ""
    
    npm run dev
}

# 显示连接指南
show_connection_guide() {
    print_step "手机连接指南："
    echo ""
    echo "1. 确保手机和Mac连接到同一个WiFi热点"
    echo "2. 在手机浏览器中访问: https://$(get_local_ip):3000"
    echo "3. 如果浏览器提示证书不安全，请："
    echo "   - 点击'高级'或'详细信息'"
    echo "   - 选择'继续访问'或'访问此网站'"
    echo "4. 页面加载后即可使用人脸识别功能"
    echo ""
    print_warning "注意：由于使用的是自签名证书，浏览器会显示安全警告，这是正常的"
}

# 主函数
main() {
    echo "=========================================="
    echo "    MediaPipe Face Demo - 移动端启动脚本"
    echo "=========================================="
    echo ""
    
    check_dependencies
    show_network_info
    show_connection_guide
    
    # 询问是否继续
    read -p "是否启动服务器？(y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        start_server
    else
        print_message "已取消启动"
        exit 0
    fi
}

# 捕获Ctrl+C信号
trap 'echo ""; print_message "服务器已停止"; exit 0' INT

# 运行主函数
main
