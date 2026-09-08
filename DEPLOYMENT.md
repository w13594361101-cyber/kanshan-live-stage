# 看山有问｜知乎云服务器部署说明

## 推荐部署方式

本项目需要运行一个 Node.js 服务，不能只把 `dist/` 上传到静态对象存储。Node 服务同时负责：

1. 提供网页和图片资源；
2. 接收工作人员的操作；
3. 保存当前轮次和页面状态；
4. 通过 SSE 向所有现场大屏实时推送变化。

## 方式一：直接运行 Node.js

环境要求：Node.js 22 或兼容版本、pnpm。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run build
CONTROL_TOKEN="请替换为现场专用随机口令" DATA_DIR="./data" PORT=3000 pnpm start
```

请为 `DATA_DIR` 指定持久化目录，保证服务重启后仍能恢复现场进度。不要把操作口令写入代码仓库。

## 方式二：Docker

```bash
docker build -t kanshan-live-stage .
docker run -d --name kanshan-live-stage \
  -p 3000:3000 \
  -e CONTROL_TOKEN="请替换为现场专用随机口令" \
  -v /服务器持久化目录/kanshan-data:/app/data \
  kanshan-live-stage
```

生产环境建议运行一个实例。当前轻量版本不支持多个容器副本之间共享状态；如果平台默认启动多个副本，请将副本数设为 1。

## Nginx 反向代理

SSE 连接需要关闭代理缓冲并延长读取超时：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 部署后验收

1. 打开 `/api/health`，确认返回 `{"ok":true}`。
2. 电脑 A 打开 `/?view=operate&token=现场操作口令`，确认顶部显示绿色“服务器实时同步已连接”。
3. 电脑 B 和电脑 C 打开 `/?view=stage`。
4. 在电脑 A 点击“开始问题接力”，确认其他电脑在数秒内同时进入问题抽取页面。
5. 刷新电脑 B，确认它仍停留在服务器记录的当前环节，而不是回到首页。
6. 重启服务并再次刷新，确认现场进度从持久化目录恢复。

## 现场地址

- 观众或普通大屏：`/?view=stage`
- 带操作能力的大屏：`/?view=stage&token=现场操作口令`
- 工作人员按钮页：`/?view=operate&token=现场操作口令`
- 内容配置页：`/?view=admin&token=现场操作口令`

只有工作人员链接应包含操作口令，请勿将其作为公开链接发送。
