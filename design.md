# Drawer

## `index.js`（`dev/index.js`）

用 `config.js`（`dev/config.js`）中的配置启动 `Drawer`，提供 `client/` 中的网页客户端。

## `Drawer`

读取配置并依序调用各子模块。

### `API`

按给定格式提供绘板接口。`WebSocket` 部分在 `api-ws.js` 里。

### `Database`

数据库。

### `Board`

利用 `API` 同步绘板状态。

### `UserManager`

管理用户。

### `Monitor`

监视程序运行状态。

### `Server`

向外界暴露接口与网页客户端。