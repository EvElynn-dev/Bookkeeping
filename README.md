# 一起记账

面向两个人自用的跨平台记账应用：Android/iOS 客户端使用 Expo + React Native，数据由自己部署的 FastAPI 服务保存到 SQLite。当前首版围绕“人民币支出、共同分摊、双方结算”设计，界面参考了用户提供的四张移动端截图。

## 设计方向

- 浅灰色背景和白色圆角卡片，降低长时间记账的视觉负担。
- 蓝色作为唯一主操作色，支出金额使用蓝色突出。
- 首页优先展示月度汇总、双方金额和按日期排列的支出明细。
- 新增支出采用底部抽屉：分类网格、账本/分摊筛选、金额键盘和备注入口集中在一页完成。
- 侧边抽屉保留参考图中的功能入口，但未实现的功能以可扩展占位入口呈现。

## 本地运行 API

需要 Python 3.9+：

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

健康检查：

```bash
curl http://localhost:8000/health
```

如果使用自己的服务器，可以直接用 Docker：

```bash
cp server/.env.example server/.env
# 修改 server/.env 中的 TOKEN_SECRET
docker compose up -d --build
```

持续部署配置见 [DEPLOYMENT.md](/Users/ming/Documents/ChatGPT/记账/DEPLOYMENT.md)。仓库已经包含 GitHub Actions：推送 `main` 会先检查 API、TypeScript 和 Expo 配置，检查通过后通过 SSH 在服务器执行 `docker compose up -d --build`。服务器上的 `server/.env` 不提交到 Git。

SQLite 文件保存在 Docker volume `ledger-data` 中。个人使用不需要单独部署 PostgreSQL；如果将来数据量或用户数增加，再把数据库换成 PostgreSQL。

## 启动移动端

需要 Node.js 和 Expo：

```bash
cd mobile
cp .env.example .env
# 把 EXPO_PUBLIC_API_URL 改成服务器在手机可访问的地址
npm install
npx expo start
```

真机调试时，`localhost` 指的是手机本身。局域网运行要填电脑的局域网 IP，例如 `http://192.168.1.20:8000`；公网部署则填 HTTPS 域名。

## 当前 API

```text
GET  /health
POST /auth/register
POST /auth/login
GET  /me
GET  /books
POST /books
POST /books/join
GET  /books/{book_id}
GET  /books/{book_id}/expenses
POST /books/{book_id}/expenses
PUT  /books/{book_id}/expenses/{expense_id}
DELETE /books/{book_id}/expenses/{expense_id}
GET  /books/{book_id}/settlements
POST /books/{book_id}/settlements
GET  /books/{book_id}/balance
```

账本邀请采用 6 位邀请码，适合个人使用，不发送邮件邀请。邮箱只用于账号注册和登录。支出金额使用人民币分值整数保存，例如 12.50 元为 `1250`。

## 当前状态

首版界面使用本地演示数据启动，方便直接查看参考 UI。登录成功后，客户端会尝试读取第一个远程账本和远程支出；如果服务器暂时不可用，仍保留本地演示数据，界面不会白屏。新增、编辑、删除支出，备注、账本创建、邀请码加入和双方结算都已经接入自建 API，登录 token 会保存到系统安全存储中。点击支出明细可以打开编辑和删除操作，结算成功后首页会重新读取双方余额。

当前 CI/CD 已覆盖 API 编译、移动端 TypeScript、Expo 配置检查和 `main` 分支 Android Release APK 构建。部署 workflow 监听 `CI` 成功结果，仅在 `main` 分支检查通过后 SSH 到服务器更新代码、上传 Android APK 并重建容器；也可以在 GitHub Actions 页面手动触发部署。Android App 会在启动时检查 `/app/update`，发现新版本后打开 APK 下载并交给系统确认安装。

iOS 原生工程已经通过 Xcode/CocoaPods 编译。iOS 不允许从自有服务器直接替换 App 二进制，真实设备更新需要 App Store/TestFlight；自有服务器托管的 Ad Hoc/企业包还需要 Apple 签名、设备注册和相应分发资格。
