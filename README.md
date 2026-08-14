# map2d-calibration

一个左右分屏的二维 / 三维场景标定页面：

- 左侧上传并查看二维平面图，支持拖拽上传、滚轮缩放、拖动平移和双击复位。
- 上传包含 `id,vc_dev_id,sblx,sbmc,fx,zh,sswz,x,y,lng,lat,alt` 字段的 CSV 设备点位，其中 `lng`、`lat`、`alt` 分别表示经度、纬度和高程。
- 每个设备标签分两行显示 `id` 和设备名称 `sbmc`。
- 同时具有有效 `lng`、`lat`、`alt` 的设备会在三维场景中显示带相同 `id` 的球体；点击二维标签会高亮并飞向对应三维设备。
- 三维视图底部实时显示鼠标触及的模型或地球表面位置，包括经度、纬度和高程。
- 点击三维设备球会绑定平移 Gizmo；移动结束后按设备 `id` 回写新的 `lng`、`lat`、`alt`，并可下载包含全部更新点位的 CSV。
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

Gizmo 使用 `cesium-transform-controls@1.2.8` 的 UMD 构建，代码和 MIT 许可证位于 `vendor/`。

## 点位点击回调

```javascript
window.onDevicePointClick = function (point) {
  console.log(point.id, point);
};
```
