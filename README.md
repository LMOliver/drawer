# Drawer

一个靠谱、高效的[洛谷冬日绘板](https://www.luogu.com.cn/paintboard)脚本（的后端）。

[COPYING](./COPYING)

## 功能

- 用户系统：本脚本依赖洛谷用户系统。不同的用户有不同的 token 池和任务列表。

- 上传 token：登录之后，用户既可以自己收集、上传 token，也可以让他人使用一个特定的链接直接向他贡献 token。

- 上传图像：可以直接上传普通图片，有简陋的自动转换功能。（也可以先用 [ouuan/LuoguPaintBoard](https://github.com/ouuan/LuoguPaintBoard#%E5%A4%84%E7%90%86%E5%9B%BE%E5%83%8F) 中的方法处理，再上传导出的 bmp。）

- 设置任务：用户可以修改图像的坐标、优先级和权重（正比于绘制速度）。有简单的预览功能。

- 绘制：理论上约能支持 300 个 token。

## 使用

LMOliver 自己搭建的 Drawer：[http://121.41.169.79/drawer](http://121.41.169.79/drawer)。

Drawer 依赖 MongoDB，还需要一个客户端。

[LMOliver/new-project](https://github.com/LMOliver/new-project) 的 `drawer-client` 目录里有一个客户端，但它和 LMOliver 的博客严重耦合。

配置在 `config.js`（开发：`dev/config.js`）里，启动命令为 `npm start`（开发：`npm run dev`）。在命令前加 `DEBUG=drawer:*` 会显示调试信息。