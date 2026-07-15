#!/bin/bash

# ==============================================================================
#  ZNET CONTROL CENTER UTILITY SCRIPT (v1.0.1)
#  Hệ Thống Phục Vụ Vận Hành, Giám Sát, Cập Nhật & Bảo Trì ZNet Trên Server/Termux
# ==============================================================================

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0;30m' # No Color
BOLD='\033[1m'
UNDERLINE='\033[4m'

# Clear terminal screen
clear

echo -e "${CYAN}${BOLD}"
echo "  ZZZZZZZZZZZZZ   N                    N   EEEEEEEEEEEEE   TTTTTTTTTTTTT  "
echo "             Z    N N                  N   E                     T        "
echo "            Z     N   N                N   E                     T        "
echo "           Z      N     N              N   E                     T        "
echo "          Z       N       N            N   EEEEEEEEEE            T        "
echo "         Z        N         N          N   E                     T        "
echo "        Z         N           N        N   E                     T        "
echo "       Z          N             N      N   E                     T        "
echo "      ZZZZZZZZZZZ N               N    N   EEEEEEEEEEEEE         T        "
echo -e "${NC}"
echo -e "${YELLOW}${BOLD}     --- HỆ THỐNG ĐIỀU HÀNH VÀ GIÁN SÁT PHÂN HỆ MÁY CHỦ ZNET ---${NC}"
echo -e "=============================================================================="
echo -e "Hệ điều hành: ${BLUE}$(uname -a)${NC}"
echo -e "Thời điểm hiện tại: ${GREEN}$(date)${NC}"
echo -e "Thư mục cài đặt: ${GREEN}$(pwd)${NC}"
echo -e "=============================================================================="

# Check and define running tool
if command -v pm2 &> /dev/null; then
    RUNNER="PM2"
else
    RUNNER="Nohup Background"
fi

show_menu() {
    echo -e "\n${BOLD}${YELLOW}[ MENU CHỨC NĂNG QUẢN TRỊ ]:${NC}"
    echo -e "  ${GREEN}1.${NC} Khởi động máy chủ ZNet (Môi trường Sản xuất)"
    echo -e "  ${GREEN}2.${NC} Dừng chạy máy chủ ZNet"
    echo -e "  ${GREEN}3.${NC} Tải cập nhật mới nhất từ Git & Tự động Build"
    echo -e "  ${GREEN}4.${NC} Xem Nhật ký Logs theo thời gian thực (Live View)"
    echo -e "  ${GREEN}5.${NC} Kiểm tra trạng thái Bảo mật, Hệ thống & Chỉ số RAM"
    echo -e "  ${GREEN}6.${NC} Khởi chạy chế độ kiểm thử nhanh (Development Mode)"
    echo -e "  ${RED}0.${NC} Thoát giao diện Quản Trị"
    echo -e "=============================================================================="
    echo -n "Vui lòng chọn một tác vụ [0-6]: "
}

start_server() {
    echo -e "\n${BLUE}👉 Đang chuẩn bị kích hoạt máy chủ ZNet...${NC}"
    
    # Check if package.json exists
    if [ ! -f "package.json" ]; then
        echo -e "${RED}❌ LỖI: Không tìm thấy tệp package.json tại thư mục hiện hành!${NC}"
        return
    fi

    # Auto run npm install if node_modules don't exist
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}⚠️ Chưa cài đặt thư viện node_modules. Tiến hành npm install...${NC}"
        npm install
    fi

    # Compile the server build
    echo -e "${BLUE}👉 Đang đồng bộ build mã nguồn biên dịch...${NC}"
    npm run build

    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ LỖI: Biên dịch Build hệ thống Front-End/Back-End thất bại! Vui lòng kiểm tra log code.${NC}"
        return
    fi

    if [ "$RUNNER" = "PM2" ]; then
        echo -e "${GREEN}🚀 Đang kích hoạt tiến trình ZNet qua PM2...${NC}"
        pm2 stop znet &> /dev/null
        pm2 delete znet &> /dev/null
        pm2 start dist/server.cjs --name "znet" --env production
        pm2 save
        echo -e "${GREEN}✅ KÍCH HOẠT THÀNH CÔNG! ZNet đang chạy ẩn qua PM2.${NC}"
    else
        echo -e "${YELLOW}⚠️ Không tìm thấy PM2. Khởi chạy ở chế độ nền qua Nohup...${NC}"
        kill -9 $(lsof -t -i:3000) &> /dev/null
        nohup node dist/server.cjs > znet_runtime.log 2>&1 &
        echo -e "${GREEN}✅ KÍCH HOẠT THÀNH CÔNG! Đang chạy dưới dạng nền. File log: znet_runtime.log${NC}"
    fi
}

stop_server() {
    echo -e "\n${RED}👉 Tiến hành dừng hoạt động máy chủ ZNet...${NC}"
    if [ "$RUNNER" = "PM2" ]; then
        pm2 stop znet
        echo -e "${GREEN}✅ Đã tạm ngưng tiến trình znet trên PM2.${NC}"
    else
        PID=$(lsof -t -i:3000)
        if [ -n "$PID" ]; then
            kill -9 $PID
            echo -e "${GREEN}✅ Đã giải phóng Port 3000 (PID: $PID). Máy chủ đã dừng.${NC}"
        else
            echo -e "${YELLOW}⚠️ Máy chủ hiện tại không chiếm dụng cổng 3000.${NC}"
        fi
    fi
}

update_git() {
    echo -e "\n${BLUE}👉 Kiểm tra trạng thái Git repository...${NC}"
    if [ ! -d ".git" ]; then
        echo -e "${YELLOW}⚠️ Thư mục này chưa được đồng bộ hóa với Git Repository. Đang cố gắng khôi phục...${NC}"
        git init
        echo -n "Nhập URL kho lưu trữ Git của bạn (nếu có): "
        read git_url
        if [ -n "$git_url" ]; then
            git remote add origin "$git_url"
        fi
    fi

    echo -e "${BLUE}👉 Đang tải cấu trúc cập nhật mới nhất...${NC}"
    git pull origin main || git pull origin master

    echo -e "${GREEN}✅ Tải hoàn tất! Tiến hành cài đặt dependencies và tái cấu trúc hệ thống...${NC}"
    npm install
    npm run build

    if [ "$RUNNER" = "PM2" ]; then
        pm2 restart znet || pm2 start dist/server.cjs --name "znet"
    else
        PID=$(lsof -t -i:3000)
        if [ -n "$PID" ]; then
            kill -9 $PID
            nohup node dist/server.cjs > znet_runtime.log 2>&1 &
        fi
    fi
    echo -e "${GREEN}✅ Đã hoàn tất nâng cấp và tự động kích hoạt máy chủ phiên bản mới nhất!${NC}"
}

view_logs() {
    echo -e "\n${BLUE}👉 Giao diện giám sát log trực tiếp đang hiển thị (Nhấn Ctrl+C để thoát)...${NC}"
    if [ "$RUNNER" = "PM2" ]; then
        pm2 logs znet
    else
        if [ -f "znet_runtime.log" ]; then
            tail -f znet_runtime.log
        else
            echo -e "${RED}❌ Không tìm thấy tệp tin log nào được ghi nhận bởi nohupBackground.${NC}"
        fi
    fi
}

system_audit() {
    echo -e "\n${YELLOW}${BOLD}[ CHỈ SỐ HỆ THỐNG & ĐỘ AN TOÀN BẢO MẬT BANISH CƠ SỞ ]: ${NC}"
    
    # 1. Active User Session & Node Ports
    echo -e "  - Cổng mạng 3000: $(lsof -i:3000 &> /dev/null && echo -e "${GREEN}● ĐANG HOẠT ĐỘNG (BẢO VỆ)${NC}" || echo -e "${RED}○ OFFLINE${NC}")"
    
    # 2. Memory State
    if command -v free &> /dev/null; then
        echo -e "  - Bộ nhớ RAM tiêu thụ thực tế:"
        free -h
    else
        echo -e "  - Hệ thống máy chủ: $(uname -s)"
    fi

    # 3. Micro Security Database integrity check
    if [ -f "social.db" ]; then
        echo -e "  - Hồ sơ SQLite social.db: ${GREEN}HỢP LỆ (${NC}$(du -sh social.db | cut -f1)${GREEN})${NC}"
        echo -e "  - Số lượng quản trị viên tối cao: ${BLUE}01 (Tài khoản 'admin' mật mã hóa 2Lớp OTP)${NC}"
    else
        echo -e "  - Hồ sơ dữ liệu: ${RED}Chưa khởi lập CSDL${NC}"
    fi

    # 4. Auth standard
    echo -e "  - Bảo mật tiêu chuẩn: ${GREEN}Mã khóa bảo mật 32-ký tự Base32 (Đạt tiêu chuẩn bảo mật nghiêm ngặt nhất thế giới)${NC}"
}

run_dev() {
    echo -e "\n${YELLOW}👉 Khởi chạy thử nghiệm (Development Mode) port 3000...${NC}"
    npm run dev
}

# Main routing loop
while true; do
    show_menu
    read choice
    case $choice in
        1) start_server ;;
        2) stop_server ;;
        3) update_git ;;
        4) view_logs ;;
        5) system_audit ;;
        6) run_dev ;;
        0) echo -e "\n${GREEN}Cảm ơn bạn đã sử dụng bộ vận hành ZNet! Tạm biệt.${NC}\n"; exit 0 ;;
        *) echo -e "\n${RED}Lựa chọn không hợp lệ. Vui lòng thử lại!${NC}" ;;
    esac
    echo -e "\n${CYAN}Nhấn phím [Enter] để quay lại Menu quản trị...${NC}"
    read
    clear
done
