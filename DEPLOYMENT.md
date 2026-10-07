# CI/CD 部署

服务器仍然由自己掌控，GitHub Actions 只负责在代码变更后自动连接服务器并发布。数据库文件和服务端密钥都留在服务器上，不会被 CI 覆盖。

## 服务器第一次准备

在服务器上安装 Docker、Git，然后把仓库克隆到固定目录。例如：

```bash
sudo mkdir -p /opt/together-ledger
sudo chown "$USER" /opt/together-ledger
git clone <你的仓库地址> /opt/together-ledger
cd /opt/together-ledger
cp server/.env.example server/.env
```

编辑 `/opt/together-ledger/server/.env`，至少替换：

```env
TOKEN_SECRET=一段随机且足够长的字符串
DATA_DIR=/app/data
DB_PATH=/app/data/ledger.sqlite3
```

第一次启动：

```bash
docker compose up -d --build
curl http://127.0.0.1:8000/health
```

返回 `{"status":"ok"}` 后，服务端已经在运行。SQLite 数据在 Docker volume `ledger-data` 中，代码发布不会删除它。

## 配置 GitHub Actions

给仓库添加以下 Actions Secrets：

| Secret | 内容 |
|---|---|
| `DEPLOY_HOST` | 服务器 IP 或域名 |
| `DEPLOY_PORT` | SSH 端口，例如 `22` |
| `DEPLOY_USER` | 登录服务器的用户 |
| `DEPLOY_SSH_KEY` | 该用户的 SSH 私钥，多行原文粘贴 |
| `DEPLOY_PATH` | 仓库目录，例如 `/opt/together-ledger` |

把 GitHub Actions 使用的公钥加入服务器：

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
cat deploy-key.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

推送到 `main` 后会执行：

```text
GitHub Actions CI
  ├─ 检查 FastAPI Python 代码
  ├─ 安装移动端依赖
  ├─ TypeScript 类型检查
  └─ 校验 Expo 配置

通过后部署任务
  ├─ SSH 登录服务器
  ├─ git fetch + git reset --hard origin/main
  ├─ docker compose up -d --build
  └─ 请求 /health 验证服务
```

服务器上的 `server/.env` 是未跟踪文件，`git reset --hard` 不会删除它。首次配置完成后，日常只需要推送代码。

## 手机连接地址

移动端的 `EXPO_PUBLIC_API_URL` 需要填写手机可访问的地址：

- 局域网：`http://192.168.x.x:8000`
- 有域名时：建议放在 HTTPS 反向代理后，例如 `https://ledger.example.com`
- 手机不能使用服务器上的 `localhost`

密码登录接口应通过 HTTPS 使用。个人自用时可以只在自己的内网或 VPN 中开放 API 端口；如果暴露到公网，先配置反向代理和 TLS。
