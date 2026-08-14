# map2d-calibration

一个左右分屏的二维 / 三维场景标定页面：

- 左侧上传并查看二维平面图，支持拖拽上传、滚轮缩放、拖动平移和双击复位。
- 上传包含 `id,vc_dev_id,sblx,sbmc,fx,zh,sswz,x,y` 字段的 CSV 设备点位。
- 使用 X/Y 偏移、X/Y 缩放和 Y 轴翻转将设备点位标定到平面图坐标。
- 标定参数会自动保存到浏览器本地，也可以使用“保存标定”和“清除保存”按钮管理；下次打开页面或导入文件时会自动恢复。
- 按任意设备字段进行“包含”过滤，并通过 `window.onDevicePointClick(point)` 接收标签点击事件。
- 右侧基于 Cesium 初始化三维场景，并保留原始页面的 3D Tiles 图层、兴趣点、隧道 Z 裁切与 GLTF/GLB 模型加载逻辑。
- HTML、CSS 和 JavaScript 分别存放于 `index.html`、`styles.css` 和 `app.js`。

## 本地运行

```bash
python3 -m http.server 8080
```

然后访问 `http://localhost:8080`。

> 三维 Tileset 地址来自参考页面。部署环境需要能够访问这些 HTTPS 服务，并允许跨域请求。

## 点位点击回调

```javascript
window.onDevicePointClick = function (point) {
  console.log(point.id, point);
};
```
