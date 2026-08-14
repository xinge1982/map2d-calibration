
		// 2D floor-plan and device calibration viewer
		(function initializeFloorPlanViewer() {
			const requiredFields = ["id", "vc_dev_id", "sblx", "sbmc", "fx", "zh", "sswz", "x", "y", "lng", "lat", "alt"];
			const calibrationStorageKey = "map2d-calibration.device-transform.v1";
			const svgNamespace = "http://www.w3.org/2000/svg";
			const stage = document.getElementById("planStage");
			const planInput = document.getElementById("floorPlanInput");
			const csvInput = document.getElementById("deviceCsvInput");
			const image = document.getElementById("floorPlan");
			const canvas = document.getElementById("planCanvas");
			const overlay = document.getElementById("deviceOverlay");
			const empty = document.getElementById("emptyPlan");
			const info = document.getElementById("planInfo");
			const count = document.getElementById("deviceCount");
			const message = document.getElementById("deviceMessage");
			const filterField = document.getElementById("deviceFilterField");
			const filterValue = document.getElementById("deviceFilterValue");
			const calibrationInputs = {
				offsetX: document.getElementById("deviceOffsetX"),
				offsetY: document.getElementById("deviceOffsetY"),
				scaleX: document.getElementById("deviceScaleX"),
				scaleY: document.getElementById("deviceScaleY"),
				invertY: document.getElementById("deviceInvertY")
			};
			let objectUrl = null, viewScale = 1, viewOffsetX = 0, viewOffsetY = 0;
			let devices = [], csvHeaders = [], csvFileName = "devices.csv";
			let dragging = false, startX = 0, startY = 0;

			// Applications may replace this function to integrate their own device detail UI.
			window.onDevicePointClick = window.onDevicePointClick || function (point) {
				console.log("Device point clicked:", point);
			};

			function numberValue(input, fallback) {
				const value = Number(input.value);
				return Number.isFinite(value) ? value : fallback;
			}

			function calibration() {
				return {
					offsetX: numberValue(calibrationInputs.offsetX, 0),
					offsetY: numberValue(calibrationInputs.offsetY, 0),
					scaleX: numberValue(calibrationInputs.scaleX, 1),
					scaleY: numberValue(calibrationInputs.scaleY, 1),
					invertY: calibrationInputs.invertY.checked
				};
			}

			function applyCalibration(values) {
				calibrationInputs.offsetX.value = Number.isFinite(Number(values.offsetX)) ? Number(values.offsetX) : 0;
				calibrationInputs.offsetY.value = Number.isFinite(Number(values.offsetY)) ? Number(values.offsetY) : 0;
				calibrationInputs.scaleX.value = Number.isFinite(Number(values.scaleX)) ? Number(values.scaleX) : 1;
				calibrationInputs.scaleY.value = Number.isFinite(Number(values.scaleY)) ? Number(values.scaleY) : 1;
				calibrationInputs.invertY.checked = Boolean(values.invertY);
			}

			function saveCalibration(showMessage) {
				try {
					localStorage.setItem(calibrationStorageKey, JSON.stringify(calibration()));
					if (showMessage) message.textContent = "标定参数已保存，下次打开或导入文件时会自动恢复。";
				} catch (error) {
					message.textContent = "浏览器未允许保存标定参数。";
					console.warn("Unable to save device calibration:", error);
				}
			}

			function restoreSavedCalibration() {
				try {
					const saved = localStorage.getItem(calibrationStorageKey);
					if (!saved) return false;
					applyCalibration(JSON.parse(saved));
					message.textContent = "已恢复上次保存的标定参数。";
					return true;
				} catch (error) {
					localStorage.removeItem(calibrationStorageKey);
					console.warn("Unable to restore device calibration:", error);
					return false;
				}
			}

			function renderView() {
				canvas.style.transform = `translate(-50%, -50%) translate(${viewOffsetX}px, ${viewOffsetY}px) scale(${viewScale})`;
				info.textContent = `${Math.round(viewScale * 100)}% · ${image.naturalWidth} × ${image.naturalHeight}px`;
			}

			function resetView() {
				if (!image.naturalWidth) return;
				viewScale = Math.min(stage.clientWidth * .88 / image.naturalWidth, stage.clientHeight * .84 / image.naturalHeight, 1);
				viewOffsetX = 0; viewOffsetY = 0; renderView();
			}

			function visibleDevices() {
				const field = filterField.value;
				const term = filterValue.value.trim().toLocaleLowerCase();
				if (!term) return devices;
				return devices.filter(point => String(point[field] ?? "").toLocaleLowerCase().includes(term));
			}

			function createSvgElement(name, attributes) {
				const element = document.createElementNS(svgNamespace, name);
				Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
				return element;
			}

			function renderDevices() {
				overlay.replaceChildren();
				const points = visibleDevices();
				const transform = calibration();
				const fragment = document.createDocumentFragment();

				points.forEach(point => {
					const x = point.x * transform.scaleX + transform.offsetX;
					const rawY = point.y * transform.scaleY + transform.offsetY;
					const y = transform.invertY && image.naturalHeight ? image.naturalHeight - rawY : rawY;
					const label = String(point.id);
					const deviceName = String(point.sbmc || "");
					const labelWidth = Math.max(34, label.length * 7 + 14, deviceName.length * 7 + 14);
					const labelHeight = deviceName ? 34 : 20;
					const labelTop = -labelHeight - 10;
					const group = createSvgElement("g", { class: "device-point", transform: `translate(${x} ${y})`, tabindex: "0", role: "button", "aria-label": `设备 ${label}${deviceName ? `，${deviceName}` : ""}` });
					group.appendChild(createSvgElement("circle", { class: "device-dot", cx: 0, cy: 0, r: 5 }));
					group.appendChild(createSvgElement("rect", { class: "device-tag-bg", x: -labelWidth / 2, y: labelTop, width: labelWidth, height: labelHeight, rx: 5 }));
					const idText = createSvgElement("text", { class: "device-tag-text device-tag-id", x: 0, y: deviceName ? -34 : -20 });
					idText.textContent = label;
					group.appendChild(idText);
					if (deviceName) {
						const nameText = createSvgElement("text", { class: "device-tag-text device-tag-name", x: 0, y: -19 });
						nameText.textContent = deviceName;
						group.appendChild(nameText);
					}
					const activate = function (event) {
						event.stopPropagation();
						overlay.querySelectorAll(".selected").forEach(item => item.classList.remove("selected"));
						group.classList.add("selected");
						const detail = { ...point };
						window.onDevicePointClick(detail);
						window.dispatchEvent(new CustomEvent("devicepointclick", { detail }));
					};
					group.addEventListener("click", activate);
					group.addEventListener("keydown", event => {
						if (event.key === "Enter" || event.key === " ") activate(event);
					});
					fragment.appendChild(group);
				});

				overlay.appendChild(fragment);
				count.textContent = `${points.length} / ${devices.length} 个点位`;
			}

			function parseCsv(text) {
				const rows = [];
				let row = [], value = "", quoted = false;
				for (let index = 0; index < text.length; index++) {
					const character = text[index];
					if (quoted && character === '"' && text[index + 1] === '"') { value += '"'; index++; }
					else if (character === '"') quoted = !quoted;
					else if (character === "," && !quoted) { row.push(value); value = ""; }
					else if ((character === "\n" || character === "\r") && !quoted) {
						if (character === "\r" && text[index + 1] === "\n") index++;
						row.push(value); value = "";
						if (row.some(cell => cell.trim() !== "")) rows.push(row);
						row = [];
					} else value += character;
				}
				row.push(value);
				if (row.some(cell => cell.trim() !== "")) rows.push(row);
				return rows;
			}

			async function loadDevices(file) {
				if (!file || !file.name.toLowerCase().endsWith(".csv")) {
					message.textContent = "请选择 CSV 格式的设备点位文件。"; return;
				}
				const rows = parseCsv((await file.text()).replace(/^\uFEFF/, ""));
				if (!rows.length) { message.textContent = "CSV 文件为空。"; return; }
				const headers = rows[0].map(header => header.trim());
				const missing = requiredFields.filter(field => !headers.includes(field));
				if (missing.length) { message.textContent = `缺少字段：${missing.join(", ")}`; return; }
				let invalid = 0;
				devices = rows.slice(1).map(columns => {
					const point = {};
					headers.forEach((header, index) => point[header] = (columns[index] ?? "").trim());
					point.x = Number(point.x); point.y = Number(point.y);
					if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) { invalid++; return null; }
					const hasGeoPosition = point.lng !== "" && point.lat !== "" && point.alt !== "";
					const lng = Number(point.lng), lat = Number(point.lat), alt = Number(point.alt);
					if (hasGeoPosition && Number.isFinite(lng) && Number.isFinite(lat) && Number.isFinite(alt) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90) {
						point.lng = lng; point.lat = lat; point.alt = alt;
					} else {
						point.lng = null; point.lat = null; point.alt = null;
					}
					return point;
				}).filter(Boolean);
				csvHeaders = headers;
				csvFileName = file.name;
				document.getElementById("downloadDevicesButton").disabled = false;
				const positionedCount = devices.filter(point => point.lng !== null && point.lat !== null && point.alt !== null).length;
				message.textContent = `已导入 ${devices.length} 个点位，其中 ${positionedCount} 个具有三维坐标${invalid ? `，跳过 ${invalid} 行无效平面坐标` : ""}。`;
				renderDevices();
				window.dispatchEvent(new CustomEvent("devicepointsloaded", { detail: { points: devices.map((point, sourceIndex) => ({ ...point, sourceIndex })) } }));
			}

			function csvCell(value) {
				const text = value === null || value === undefined ? "" : String(value);
				return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
			}

			function downloadUpdatedDevices() {
				if (!devices.length || !csvHeaders.length) return;
				const lines = [csvHeaders.map(csvCell).join(",")];
				devices.forEach(point => lines.push(csvHeaders.map(header => csvCell(point[header])).join(",")));
				const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
				const url = URL.createObjectURL(blob);
				const link = document.createElement("a");
				link.href = url;
				link.download = `${csvFileName.replace(/\.csv$/i, "")}_updated.csv`;
				document.body.appendChild(link);
				link.click();
				link.remove();
				URL.revokeObjectURL(url);
				message.textContent = `已下载 ${devices.length} 个更新后的设备点位。`;
			}

			function loadPlan(file) {
				if (!file || !file.type.startsWith("image/")) {
					message.textContent = "请选择 PNG、JPG、WebP 或 SVG 格式的二维平面图。"; return;
				}
				if (objectUrl) URL.revokeObjectURL(objectUrl);
				objectUrl = URL.createObjectURL(file);
				image.onload = function () {
					empty.hidden = true; canvas.style.display = "block"; info.hidden = false;
					canvas.style.width = `${image.naturalWidth}px`; canvas.style.height = `${image.naturalHeight}px`;
					overlay.setAttribute("viewBox", `0 0 ${image.naturalWidth} ${image.naturalHeight}`);
					document.getElementById("resetPlanButton").disabled = false;
					resetView(); renderDevices();
				};
				image.src = objectUrl; image.alt = file.name;
			}

			document.getElementById("uploadPlanButton").addEventListener("click", () => planInput.click());
			document.getElementById("uploadDevicesButton").addEventListener("click", () => csvInput.click());
			document.getElementById("downloadDevicesButton").addEventListener("click", downloadUpdatedDevices);
			planInput.addEventListener("change", event => loadPlan(event.target.files[0]));
			csvInput.addEventListener("change", event => loadDevices(event.target.files[0]));
			document.getElementById("resetPlanButton").addEventListener("click", resetView);
			document.getElementById("clearDevicesButton").addEventListener("click", function () {
				devices = []; csvHeaders = []; csvInput.value = ""; message.textContent = "已清空设备点位。"; renderDevices();
				document.getElementById("downloadDevicesButton").disabled = true;
				window.dispatchEvent(new CustomEvent("devicepointsloaded", { detail: { points: [] } }));
			});
			window.addEventListener("devicepositionupdated", event => {
				const update = event.detail || {};
				let point = Number.isInteger(update.sourceIndex) ? devices[update.sourceIndex] : undefined;
				if (!point || String(point.id) !== String(update.id)) point = devices.find(item => String(item.id) === String(update.id));
				if (!point) return;
				point.lng = update.lng; point.lat = update.lat; point.alt = update.alt;
				message.textContent = `设备 ${point.id} 的三维坐标已更新：${update.lng.toFixed(8)}, ${update.lat.toFixed(8)}, ${update.alt.toFixed(3)} m`;
			});
			document.getElementById("saveCalibrationButton").addEventListener("click", function () {
				saveCalibration(true);
			});
			document.getElementById("clearSavedCalibrationButton").addEventListener("click", function () {
				try {
					localStorage.removeItem(calibrationStorageKey);
					message.textContent = "已清除保存的标定参数，当前显示不变。";
				} catch (error) {
					message.textContent = "浏览器未允许清除保存的标定参数。";
				}
			});
			document.getElementById("resetCalibrationButton").addEventListener("click", function () {
				calibrationInputs.offsetX.value = 0; calibrationInputs.offsetY.value = 0;
				calibrationInputs.scaleX.value = 1; calibrationInputs.scaleY.value = 1;
				calibrationInputs.invertY.checked = false; renderDevices();
			});
			Object.values(calibrationInputs).forEach(input => input.addEventListener("input", function () {
				renderDevices();
				saveCalibration(false);
			}));
			filterField.addEventListener("change", renderDevices);
			filterValue.addEventListener("input", renderDevices);
			stage.addEventListener("dblclick", event => { if (!event.target.closest(".device-controls")) resetView(); });
			stage.addEventListener("wheel", function (event) {
				if (!image.naturalWidth || event.target.closest(".device-controls")) return;
				event.preventDefault();
				const previousScale = viewScale;
				viewScale = Math.min(8, Math.max(.05, viewScale * (event.deltaY < 0 ? 1.12 : .89)));
				const bounds = stage.getBoundingClientRect();
				const x = event.clientX - bounds.left - bounds.width / 2;
				const y = event.clientY - bounds.top - bounds.height / 2;
				viewOffsetX = x - (x - viewOffsetX) * (viewScale / previousScale);
				viewOffsetY = y - (y - viewOffsetY) * (viewScale / previousScale); renderView();
			}, { passive: false });
			stage.addEventListener("pointerdown", function (event) {
				if (!image.naturalWidth || event.target.closest(".device-controls, .device-point")) return;
				dragging = true; startX = event.clientX - viewOffsetX; startY = event.clientY - viewOffsetY;
				stage.setPointerCapture(event.pointerId); stage.classList.add("dragging");
			});
			stage.addEventListener("pointermove", function (event) {
				if (!dragging) return;
				viewOffsetX = event.clientX - startX; viewOffsetY = event.clientY - startY; renderView();
			});
			stage.addEventListener("pointerup", function () { dragging = false; stage.classList.remove("dragging"); });
			["dragenter", "dragover"].forEach(type => stage.addEventListener(type, event => { event.preventDefault(); stage.classList.add("drop-active"); }));
			["dragleave", "drop"].forEach(type => stage.addEventListener(type, event => { event.preventDefault(); stage.classList.remove("drop-active"); }));
			stage.addEventListener("drop", event => {
				const file = event.dataTransfer.files[0];
				if (file && file.name.toLowerCase().endsWith(".csv")) loadDevices(file); else loadPlan(file);
			});
			window.addEventListener("resize", () => image.naturalWidth && resetView());
			restoreSavedCalibration();
		})();

		//
		// global variables
		//
		let tilesets = {};
		let tilesetStatusElements = {};
		let tilesetStatusUpdateTime = 0;
		let tilesetLoadingCount = {};
		let tilesetGroups = {};
		let wireframeEnabled = false;
		let currentModel = null;
		let selectedModelFile = null;
		let tilesetHideState = {};
		let hiddenFeaturesCache = {};
		let tunnelClipPlane = null;
		let tunnelClipTileset = null;
		let deviceEntitiesById = new Map();
		let deviceEntityMetadata = new Map();
		let selectedDeviceEntities = [];
		let activeDeviceEntity = null;
		//
		// disable Cesium ion
		//
		Cesium.Ion.defaultAccessToken = undefined;

		//
		// imagery
		//
		const myProvider =
			new Cesium.UrlTemplateImageryProvider({
				url:
					'https://webst01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=6&x={x}&y={y}&z={z}',
				maximumLevel: 16
			});

		// Cesium viewer
		//
		const viewer =
			new Cesium.Viewer(
				'OSGBLab_Container',
				{
					baseLayer:
						new Cesium.ImageryLayer(
							myProvider
						),
					baseLayerPicker: false,
					animation: false,
					vrButton: true,
					timeline: false,
					sceneModePicker: false,
					scene3DOnly: true,
					infoBox: true,
					inspector: true,
					terrainProvider:
						new Cesium.EllipsoidTerrainProvider()
				});

		document.getElementById("sceneStatus").textContent = "场景已初始化";
		document.getElementById("sceneStatus").style.color = "#75e8cf";

		function pickPositionStable(screenPosition) {
			const scene = viewer.scene;
			try {
				const canvas = viewer.canvas;
				if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return undefined;

				const picked = scene.pick(screenPosition);
				if (picked && scene.pickPositionSupported) {
					const modelPosition = scene.pickPosition(screenPosition);
					if (Cesium.defined(modelPosition)) return modelPosition;
				}

				const ray = viewer.camera.getPickRay(screenPosition);
				if (ray) return scene.globe.pick(ray, scene);
			} catch (error) {
				console.warn("Unable to pick mouse position:", error);
			}
			return undefined;
		}

		function updateMouseCoordinates(cartesian) {
			const longitudeElement = document.getElementById("mouseLongitude");
			const latitudeElement = document.getElementById("mouseLatitude");
			const altitudeElement = document.getElementById("mouseAltitude");
			if (!Cesium.defined(cartesian)) {
				longitudeElement.textContent = "—";
				latitudeElement.textContent = "—";
				altitudeElement.textContent = "—";
				return;
			}
			const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
			longitudeElement.textContent = `${Cesium.Math.toDegrees(cartographic.longitude).toFixed(8)}°`;
			latitudeElement.textContent = `${Cesium.Math.toDegrees(cartographic.latitude).toFixed(8)}°`;
			altitudeElement.textContent = `${cartographic.height.toFixed(3)} m`;
		}

		const mousePositionHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
		mousePositionHandler.setInputAction(function (movement) {
			updateMouseCoordinates(pickPositionStable(movement.endPosition));
		}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

		function clearDeviceEntities() {
			deviceEntitiesById.forEach(entities => entities.forEach(entity => viewer.entities.remove(entity)));
			deviceEntitiesById.clear();
			deviceEntityMetadata.clear();
			selectedDeviceEntities = [];
			activeDeviceEntity = null;
			if (typeof deviceGizmo !== "undefined") hideDeviceGizmo();
		}

		function addDeviceEntities(points) {
			clearDeviceEntities();
			points.forEach((point, index) => {
				if (!Number.isFinite(point.lng) || !Number.isFinite(point.lat) || !Number.isFinite(point.alt)) return;
				const id = String(point.id);
				const entity = viewer.entities.add({
					id: `device-point-${index}-${id}`,
					position: Cesium.Cartesian3.fromDegrees(point.lng, point.lat, point.alt),
					ellipsoid: {
						radii: new Cesium.Cartesian3(0.3, 0.3, 0.3),
						material: Cesium.Color.ORANGE,
						outline: true,
						outlineColor: Cesium.Color.WHITE
					},
					label: {
						text: id,
						font: "bold 14px sans-serif",
						fillColor: Cesium.Color.WHITE,
						outlineColor: Cesium.Color.BLACK,
						outlineWidth: 3,
						style: Cesium.LabelStyle.FILL_AND_OUTLINE,
						pixelOffset: new Cesium.Cartesian2(0, -18),
						verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
						disableDepthTestDistance: Number.POSITIVE_INFINITY
					},
					properties: { devicePoint: point }
				});
				deviceEntityMetadata.set(entity.id, { point, sourceIndex: point.sourceIndex });
				const entities = deviceEntitiesById.get(id) || [];
				entities.push(entity);
				deviceEntitiesById.set(id, entities);
			});
			viewer.scene.requestRender();
		}

		function focusDeviceEntity(point) {
			selectedDeviceEntities.forEach(entity => {
				entity.ellipsoid.material = Cesium.Color.ORANGE;
				entity.ellipsoid.radii = new Cesium.Cartesian3(0.3, 0.3, 0.3);
			});
			selectedDeviceEntities = deviceEntitiesById.get(String(point.id)) || [];
			selectedDeviceEntities.forEach(entity => {
				entity.ellipsoid.material = Cesium.Color.LIME;
				entity.ellipsoid.radii = new Cesium.Cartesian3(0.5, 0.5, 0.5);
			});
			if (selectedDeviceEntities.length) {
				bindDeviceGizmo(selectedDeviceEntities[0]);
				viewer.flyTo(selectedDeviceEntities[0], {
					duration: 1.2,
					offset: new Cesium.HeadingPitchRange(viewer.camera.heading, Cesium.Math.toRadians(-28), 35)
				});
			}
			viewer.scene.requestRender();
		}

		window.addEventListener("devicepointsloaded", event => addDeviceEntities(event.detail.points || []));
		window.addEventListener("devicepointclick", event => focusDeviceEntity(event.detail));

		const { Gizmo, GizmoMode } = CesiumTransformControls;
		const deviceGizmo = new Gizmo({
			onGizmoPointerMove() {
				viewer.scene.requestRender();
			},
			onGizmoPointerUp() {
				if (!activeDeviceEntity) return;
				const position = activeDeviceEntity.position.getValue(viewer.clock.currentTime);
				if (!Cesium.defined(position)) return;
				const cartographic = Cesium.Cartographic.fromCartesian(position);
				const metadata = deviceEntityMetadata.get(activeDeviceEntity.id);
				if (!metadata) return;
				const lng = Cesium.Math.toDegrees(cartographic.longitude);
				const lat = Cesium.Math.toDegrees(cartographic.latitude);
				const alt = cartographic.height;
				metadata.point.lng = lng; metadata.point.lat = lat; metadata.point.alt = alt;
				window.dispatchEvent(new CustomEvent("devicepositionupdated", {
					detail: { id: metadata.point.id, sourceIndex: metadata.sourceIndex, lng, lat, alt }
				}));
				viewer.scene.requestRender();
			}
		});

		function hideDeviceGizmo() {
			deviceGizmo.setEnabled(false);
			[deviceGizmo._transPrimitives, deviceGizmo._rotatePrimitives, deviceGizmo._scalePrimitives]
				.filter(Boolean)
				.forEach(primitive => primitive._show = false);
		}

		function bindDeviceGizmo(entity) {
			if (!entity || !deviceEntityMetadata.has(entity.id)) return;
			activeDeviceEntity = entity;
			deviceGizmo.setEnabled(true);
			deviceGizmo.mountToEntity(entity, viewer);
			deviceGizmo.setMode(GizmoMode.translate);
			viewer.scene.requestRender();
		}

		const deviceSelectionHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
		deviceSelectionHandler.setInputAction(function (movement) {
			const picked = viewer.scene.pick(movement.position);
			if (picked && deviceGizmo.isGizmoPrimitive(picked.primitive)) return;
			const entity = picked && picked.id instanceof Cesium.Entity ? picked.id : null;
			if (entity && deviceEntityMetadata.has(entity.id)) {
				selectedDeviceEntities.forEach(item => {
					item.ellipsoid.material = Cesium.Color.ORANGE;
					item.ellipsoid.radii = new Cesium.Cartesian3(0.3, 0.3, 0.3);
				});
				selectedDeviceEntities = [entity];
				entity.ellipsoid.material = Cesium.Color.LIME;
				entity.ellipsoid.radii = new Cesium.Cartesian3(0.5, 0.5, 0.5);
				bindDeviceGizmo(entity);
			} else {
				activeDeviceEntity = null;
				hideDeviceGizmo();
			}
			viewer.scene.requestRender();
		}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

		deviceGizmo.attach(viewer);
		deviceGizmo.setMode(GizmoMode.translate);
		hideDeviceGizmo();

		window.addEventListener("beforeunload", () => {
			deviceSelectionHandler.destroy();
			deviceGizmo.detach();
		});

		viewer.scene.globe.depthTestAgainstTerrain = false;

		viewer.scene.requestRenderMode = true;

		Cesium.RequestScheduler.maximumRequests = 5;
		Cesium.RequestScheduler.maximumRequestsPerServer = 20;

		//
		// camera control
		//
		const controller =
			viewer.scene.screenSpaceCameraController;

		controller.rotateEventTypes =
			[
				Cesium.CameraEventType.LEFT_DRAG,
				Cesium.CameraEventType.MIDDLE_DRAG
			];

		controller.lookEventTypes =
			[
				Cesium.CameraEventType.RIGHT_DRAG
			];

		controller.minimumZoomDistance = 1;
		controller.enableCollisionDetection = true;
		controller.zoomFactor = 2.0;

		//
		// tileset configuration list
		//
		// change these URLs to your own tileset.json
		//
		const tilesetConfigs =
			[
				{
					id: "building",
					name: "收费站",
					title: "G1503",
					url: "https://47.104.194.94:28199/share/shanghai_g1503/features/tileset.json",
					defaultLoad: true,
					options: {
						"modelForwardAxis": "Y",
						"modelUpAxis": "Z"
					}
				},
				{
					id: "roadsurface",
					name: "道路面",
					title: "G1503",
					url: "https://47.104.194.94:28199/share/shanghai_g1503/roadsurface/tileset.json",
					defaultLoad: true,
					options: {
						"modelForwardAxis": "Y",
						"modelUpAxis": "Z"
					}
				},
				{
					id: "tunnel",
					name: "隧道",
					title: "G1503",
					url: "https://47.104.194.94:28199/share/shanghai_g1503/tunnel/tileset.json",
					defaultLoad: true,
					focus: true,
					hideFeatureIds:
						[
							'd1359f9934ee5a75ed441ffce412a0a1_1',
							'bb1443cc31d7396bf73e7858cea114e1_1',
							"2e92962c0b6996add9517e4242ea9bdc_1",
							'bf25356fd2a6e038f1a3a59c26687e80_1',
						],
					clip: {
						min: -10,
						max: 50,
						current: 15
					}
				},
				{
					id: "feature",
					name: "设备设施",
					title: "G1503",
					defaultLoad: true,
					url: "https://47.104.194.94:28199/share/networks/network_shanghai_g1503_2026/tilesets/features/tileset.json"
				},
				{
					id: "bridge",
					name: "桥梁",
					title: "G1503",
					defaultLoad: false,
					url: "https://47.104.194.94:28199/share/shanghai_g1503/bridge/tileset.json"
				},
				{
					id: "tunnel_rml",
					name: "人民路隧道",
					title: "人民路",
					url: "https://47.104.194.94:28199/share/shanghai_g1503/tunnel_rml/tileset.json",
					defaultLoad: false,
					focus: false
				}
			];

		const viewPoints =
			[
				{
					id: "tunnel",
					name: "隧道入口",
					title: "G1503",

					"lon": 121.78256103,
					"lat": 31.11249934,
					"height": 28.518,
					"heading": 339.544,
					"pitch": -16.827,
					"roll": 0
				},
				{
					id: "tunnel_inner",
					name: "隧道内",
					title: "G1503",
					"lon": 121.78126816,
					"lat": 31.11615136,
					"height": 9.917,
					"heading": 339.281,
					"pitch": -8.262,
					"roll": 0
				},
				{
					id: "station1",
					name: "收费站1",
					title: "G1503",

					"lon": 121.77220089,
					"lat": 31.13992788,
					"height": 50.358,
					"heading": 342.952,
					"pitch": -12.146,
					"roll": 360
				},

				{
					id: "station2",
					name: "收费站2",
					title: "G1503",

					"lon": 121.77126058,
					"lat": 31.1423335,
					"height": 61.588,
					"heading": 159.702,
					"pitch": -19.853,
					"roll": 0
				},
				{
					id: "well1",
					name: "隧道工作井1",
					title: "G1503",

					"lon": 121.77485292,
					"lat": 31.13257311,
					"height": 102.961,
					"heading": 72.079,
					"pitch": -80.725,
					"roll": 0,
					"clipValue": 15.5,
					"enableHideFeaturesTileset": "tunnel",
				},
								{
					id: "well2",
					name: "隧道工作井2",
					title: "G1503",

					"lon": 121.77764509,
					"lat": 31.12603142,
					"height": 112.674,
					"heading": 72.422,
					"pitch": -85.347,
					"roll": 0.001,
					"clipValue": 13.1,
					"enableHideFeaturesTileset": "tunnel",
				},
				{
					id: "well3",
					name: "隧道工作井3",
					title: "G1503",

					"lon": 121.77978549,
					"lat": 31.11828564,
					"height": 158.313,
					"heading": 72.543,
					"pitch": -69.578,
					"roll": 360,
					"clipValue": 15,
					"enableHideFeaturesTileset": "tunnel",
				},
				{
					id: "light",
					name: "隧道照明灯",
					title: "G1503",

				    "lon": 121.7818833,
				    "lat": 31.11452081,
				    "height": 10.303,
				    "heading": 337.292,
				    "pitch": -2.973,
				    "roll": 0
				},
				{
					id: "cms",
					name: "隧道情报板",
					title: "G1503",

				    "lon": 121.78164347,
				    "lat": 31.11514877,
				    "height": 11.467,
				    "heading": 337.664,
				    "pitch": -2.61,
				    "roll": 0
				},
				{
					id: "tel",
					name: "隧道电话箱",
					title: "G1503",

				    "lon": 121.78159221,
				    "lat": 31.11534069,
				    "height": 8.437,
				    "heading": 38.757,
				    "pitch": -5.88,
				    "roll": 360
				},
								{
					id: "bridge_g1503",
					name: "桥梁",
					title: "G1503",

					"lon": 121.7742161,
					"lat": 31.13882257,
					"height": 89.566,
					"heading": 315.723,
					"pitch": -16.337,
					"roll": 0
				},
				{
					id: "tunnel_rml",
					name: "隧道入口",
					title: "人民路",

					"lon": 121.5093906,
					"lat": 31.23168644,
					"height": 12.441,
					"heading": 248.264,
					"pitch": -7.941,
					"roll": 0
				},
			];

		//
		// create checkbox item
		//
		function addTilesetCheckbox(config) {
			const container =
				document.getElementById(
					"tilesetList"
				);

			//
			// create group by title
			//
			let group =
				tilesetGroups[config.title];

			if(!group){

				group =
					document.createElement("div");

				group.className =
					"tileset-group";

				//
				// title row
				//
				const title =
					document.createElement("div");

				title.className =
					"tileset-title";

				title.innerText =
					"▼ " + config.title;

				//
				// child container
				//
				const children =
					document.createElement("div");

				children.className =
					"tileset-children";

				//
				// expand / collapse
				//
				title.onclick =
					function(){
						if(children.style.display === "none"){
							children.style.display = "block";
							title.innerText =
								"▼ " + config.title;
						}
						else{
							children.style.display = "none";
							title.innerText =
								"▶ " + config.title;
						}

					};

				group.appendChild(title);
				group.appendChild(children);

				container.appendChild(group);

				tilesetGroups[config.title] =
				{
					root: group,
					children: children
				};
			}

			const children =
				tilesetGroups[config.title].children;

			//
			// checkbox item
			//
			const item =
				document.createElement("div");

			item.className =
				"tileset-item";

			const checkbox =
				document.createElement("input");

			checkbox.type =
				"checkbox";

			checkbox.checked =
				!!config.defaultLoad;

			checkbox.onchange =
				async function(){

					if(checkbox.checked){

						if(!tilesets[config.id]){

							await loadTileset(config);

						}
						else{

							tilesets[config.id].show =
								true;

						}
					}
					else{

						if(tilesets[config.id]){

							tilesets[config.id].show =
								false;

						}
					}

					viewer.scene.requestRender();
				};

			const label =
				document.createElement("span");


			label.innerText =
				" " + config.name;



			//
			// status text
			//
			const status =
				document.createElement("span");

			status.style.marginLeft = "8px";

			status.style.fontSize = "12px";

			status.style.color = "#666";

			status.innerHTML =
				'<span class="loading-box"></span>';

			status.className =
				"status-box status-loading";


			tilesetStatusElements[config.id] =
				status;



			item.appendChild(
				checkbox
			);

			item.appendChild(
				label
			);

			item.appendChild(
				status
			);

			children.appendChild(
				item
			);
		}

		function updateTilesetStatus(id, state)
		{
			const element =
				tilesetStatusElements[id];

			if(!element)
				return;

			element.className =
				"status-box";

			if(state === "loading")
			{
				element.classList.add(
					"status-loading"
				);
			}
			else if(state === "waiting")
			{
				element.classList.add(
					"status-waiting"
				);
			}
			else if(state === "displaying")
			{
				element.classList.add(
					"status-displaying"
				);
			}
			else if(state === "ready")
			{
				element.classList.add(
					"status-ready"
				);
			}
			else if(state === "error")
			{
				element.classList.add(
					"status-error"
				);
			}
			else
			{
				element.classList.add(
					"status-loading"
				);
			}

		}

		//
		// load one tileset
		//
		async function loadTileset(config) {
			updateTilesetStatus(
				config.id,
				"loading"
			);

			const options =
			{
				debugShowBoundingVolume: false,
				debugShowContentBoundingVolume: false,
				debugShowViewerRequestVolume: false,
				debugColorizeTiles: false,
				debugShowGeometricError: false,
				debugShowRenderingStatistics: false,
				debugShowUrl: false
			};

			if (config.options) {
				for (var name in config.options) {
					options[name] = config.options[name]
				}
			}

			console.log(
				"loading tileset:",
				config.url
			);

			const tileset =
				await Cesium.Cesium3DTileset.fromUrl(
					config.url,
					options
				);

			tilesetLoadingCount[config.id] = 0;

			updateTilesetStatus(
				config.id,
				"waiting"
			);

			// Increase tile memory / prevent unloading
			tileset.cacheBytes = 1024 * 1024 * 1024;
			tileset.maximumCacheOverflowBytes = 512 * 1024 * 1024;
	
			//
			// visible by default
			//
			tileset.show = true;

			//
			// wireframe state
			//
			tileset.debugWireframe =
				wireframeEnabled;

			//
			// render quality
			//
			tileset.maximumScreenSpaceError =
				64;

			//
			// dynamic SSE
			//
			tileset.dynamicScreenSpaceError = true;

			tileset.dynamicScreenSpaceErrorDensity =
				0.00278;

			tileset.dynamicScreenSpaceErrorFactor =
				4.0;

			tileset.dynamicScreenSpaceErrorHeightFalloff =
				0.25;

			//
			// memory control
			//
			tileset.maximumMemoryUsage =
				512;

			//
			// LOD skipping
			//
			tileset.skipLevelOfDetail = true;

			tileset.baseScreenSpaceError =
				1024;

			tileset.skipScreenSpaceErrorFactor =
				16;

			tileset.skipLevels =
				1;

			//
			// add into Cesium scene
			//
			viewer.scene.primitives.add(
				tileset
			);

			tileset.tileLoad.addEventListener(
				function(tile)
				{
					tilesetLoadingCount[config.id]--;

					if(tilesetLoadingCount[config.id] <= 0)
					{
						updateTilesetStatus(
							config.id,
							"ready"
						);
					}
				}
			);

			tileset.tileVisible.addEventListener(
				function(tile)
				{
					updateTilesetStatus(
						config.id,
						"displaying"
					);
				}
			);

			//
			// save reference
			//
			tilesets[
				config.id
			] =
				tileset;

			// Initialize a horizontal clipping plane for the tunnel tileset.
			if (config.clip) {
				setupTunnelClipping(tileset, config.clip);
			}

			const tilesetId = config.id;

			if (config.hideFeatureIds) {
				//TODO: tileVisible.addEventListener
			}

			console.log(
				"tileset loaded:",
				config.name
			);

			if (!!config.focus) {
				focusTileset(config.id)
			}

			if (
				config.hideFeatureIds &&
				config.hideFeatureIds.length > 0
			) {
				hideTilesetFeatures(
					tileset,
					config.hideFeatureIds
				);
			}

			return tileset;
		}

		//
		// tunnel horizontal clipping plane (local Z axis)
		//
		function setupTunnelClipping(tileset, config) {
			tunnelClipTileset = tileset;

			// In a 3D Tileset, clipping planes are evaluated in the tileset's
			// clipping coordinate system. Z therefore means local model Z here.
			tunnelClipPlane = new Cesium.ClippingPlane(
				new Cesium.Cartesian3(0.0, 0.0, -1.0),
				0.0
			);

			if (tileset.clippingPlanes) {
				tileset.clippingPlanes.removeAll();
			}

			tileset.clippingPlanes = new Cesium.ClippingPlaneCollection({
				planes: [tunnelClipPlane],
				enabled: true,
				edgeColor: Cesium.Color.YELLOW,
				edgeWidth: 1.0
			});

			// Use the tileset radius to choose a practical slider range automatically.
			const slider = document.getElementById("tunnelClipSlider");
			const valueInput = document.getElementById("tunnelClipValue");

			slider.min = config.min;
			slider.max = config.max;
			valueInput.min = config.min;
			valueInput.max = config.max;
			slider.value = config.current;
			valueInput.value = config.current;

			viewer.scene.requestRender();
		}

		function setTunnelClipZ(value) {
			if (!tunnelClipPlane) {
				return;
			}

			const z = Number(value);
			if (!Number.isFinite(z)) {
				return;
			}

			tunnelClipPlane.distance = z;

			const slider = document.getElementById("tunnelClipSlider");
			const valueInput = document.getElementById("tunnelClipValue");
			slider.value = z;
			valueInput.value = z.toFixed(1);

			viewer.scene.requestRender();
		}

		document.getElementById("tunnelClipSlider").addEventListener("input", function (e) {
			setTunnelClipZ(e.target.value);
		});

		document.getElementById("tunnelClipValue").addEventListener("input", function (e) {
			setTunnelClipZ(e.target.value);
		});

		document.getElementById("tunnelClipEnabled").addEventListener("change", function (e) {
			if (tunnelClipTileset && tunnelClipTileset.clippingPlanes) {
				tunnelClipTileset.clippingPlanes.enabled = e.target.checked;
				viewer.scene.requestRender();
			}
		});

		async function loadDefaultTilesets() {
			// create checkbox list first
		    for(const config of tilesetConfigs){
		        addTilesetCheckbox(config);
		    }

		    let firstTileset = null;

		    for (const config of tilesetConfigs) {

		        if (!config.defaultLoad) {
		            continue;
		        }

		        try {

		            const tileset =
		                await loadTileset(config);

		            if (!firstTileset) {

		                firstTileset = tileset;
		            }

		        }
		        catch(e) {
		            console.error(
		                "tileset load failed:",
		                config.url,
		                e
		            );
		        }
		    }

		    if(firstTileset){
		        viewer.zoomTo(firstTileset);

		    }
		}

		//
		// load all tilesets
		//
		async function loadAllTilesets() {
			let firstTileset = null;

			for (
				const config of tilesetConfigs
			) {
				try {
					const tileset =
						await loadTileset(
							config
						);

					if (!firstTileset) {
						firstTileset =
							tileset;
					}

				}
				catch (e) {
					console.error(
						"tileset load failed:",
						config.url,
						e
					);
				}
			}

			//
			// zoom to first loaded tileset
			//
			if (firstTileset) {
				viewer.zoomTo(
					firstTileset
				);
			}
		}

		//
		// start loading
		//
		loadDefaultTilesets();

		createViewPointList();

		//
		// load GLB model in front of camera
		//
		async function addModelInFrontOfCamera(url) {
			//
			// remove previous model
			//
			if (currentModel) {
				viewer.scene.primitives.remove(
					currentModel
				);
				currentModel = null;
			}

			const camera =
				viewer.camera;

			//
			// current camera position
			//
			const position =
				camera.positionWC;

			const direction =
				camera.directionWC;

			//
			// put model 5 meters ahead
			//
			const modelPosition =
				Cesium.Cartesian3.add(
					position,
					Cesium.Cartesian3.multiplyByScalar(
						direction,
						5,
						new Cesium.Cartesian3()
					),
					new Cesium.Cartesian3()
				);

			const hpr =
				new Cesium.HeadingPitchRoll(
					camera.heading,
					0,
					0
				);

			const modelMatrix =
				Cesium.Transforms.headingPitchRollToFixedFrame(
					modelPosition,
					hpr
				);

			currentModel =
				await Cesium.Model.fromGltfAsync({
					url: url,
					modelMatrix: modelMatrix,
					scale: 1.0,
					minimumPixelSize: 80
				});

			viewer.scene.primitives.add(
				currentModel
			);

			viewer.scene.requestRender();
		}

		//
		// focus tileset by key
		//
		// example:
		// focusTileset("tunnel");
		//
		async function focusTileset(key) {
			const tileset =
				tilesets[key];

			if (!tileset) {
				console.warn(
					"tileset not found:",
					key
				);
				return false;
			}

			try {
				//
				// make sure tileset visible
				//
				tileset.show = true;

				//
				// wait until tileset ready
				//
				await tileset.readyPromise;

				//
				// fly camera to tileset
				//
				const sphere = tileset.boundingSphere
				const radius = sphere.radius
				await viewer.camera.flyToBoundingSphere(sphere, {
					duration: 0.5,
					offset: new Cesium.HeadingPitchRange(
						viewer.camera.heading,
						Cesium.Math.toRadians(-30),
						Math.max(radius, 50) // important: don't use radius * 0.5
					)
				})

				viewer.scene.requestRender();

				console.log(
					"focus tileset:",
					key
				);

				return true;
			}
			catch (e) {
				console.error(
					"focus tileset failed:",
					key,
					e
				);
				return false;
			}
		}

		//
		// fly to viewpoint
		//
		function flyToViewPoint(id) {
			restoreAllHiddenFeatures();

			const point =
				viewPoints.find(
					p => p.id === id
				);

			if (!point) {
				console.warn(
					"view point not found:",
					id
				);
				return;
			}

			viewer.camera.flyTo({
				destination:
					Cesium.Cartesian3.fromDegrees(

						point.lon,

						point.lat,

						point.height

					),

				orientation:
				{
					heading:
						Cesium.Math.toRadians(
							point.heading
						),
					pitch:
						Cesium.Math.toRadians(
							point.pitch
						),
					roll:
						Cesium.Math.toRadians(
							point.roll
						)
				},

				duration: 2.0
			});

			if (point.enableHideFeaturesTileset && point.enableHideFeaturesTileset.length > 0) {
				//TODO: setTilesetFeatureHide
			}
			if (point.clipValue) {
				setTunnelClipZ(point.clipValue)
			}
		}

		//
		// create viewpoint list
		//
		function createViewPointList() {
			const container =
				document.getElementById(
					"viewPointList"
				);

			const groups = {};

			viewPoints.forEach(point => {

				const title =
					point.title || "其他";

				//
				// create group
				//
				if(!groups[title]){

					const group =
						document.createElement("div");

					group.className =
						"viewpoint-group";

					const titleDiv =
						document.createElement("div");

					titleDiv.className =
						"viewpoint-title";

					titleDiv.innerText =
						"▼ " + title;

					const children =
						document.createElement("div");

					children.className =
						"viewpoint-children";

					titleDiv.onclick =
						function(){
							if(children.style.display === "none"){

								children.style.display =
									"block";

								titleDiv.innerText =
									"▼ " + title;
							}
							else{

								children.style.display =
									"none";

								titleDiv.innerText =
									"▶ " + title;
							}
						};

					group.appendChild(titleDiv);

					group.appendChild(children);

					container.appendChild(group);

					groups[title] =
					{
						root: group,
						children: children
					};
				}

				//
				// create viewpoint button
				//
				const item =
					document.createElement("div");

				item.className =
					"viewpoint-item";

				const button =
					document.createElement("button");

				button.innerText =
					point.name;

				button.style.width =
					"100%";

				button.onclick =
					function(){
						flyToViewPoint(
							point.id
						);
					};

				item.appendChild(button);

				groups[title].children.appendChild(item);
			});
		}

		//
		// debug current camera position
		//
		// usage:
		// debugCameraPosition()
		//
		function debugCameraPosition() {
			const camera =
				viewer.camera;

			//
			// camera cartesian position
			//
			const cartographic =
				Cesium.Cartographic.fromCartesian(
					camera.positionWC
				);

			const lon =
				Cesium.Math.toDegrees(
					cartographic.longitude
				);

			const lat =
				Cesium.Math.toDegrees(
					cartographic.latitude
				);

			const height =
				cartographic.height;

			//
			// HPR
			//
			const heading =
				Cesium.Math.toDegrees(
					camera.heading
				);

			const pitch =
				Cesium.Math.toDegrees(
					camera.pitch
				);

			const roll =
				Cesium.Math.toDegrees(
					camera.roll
				);

			const result =
			{
				lon:
					Number(lon.toFixed(8)),

				lat:
					Number(lat.toFixed(8)),

				height:
					Number(height.toFixed(3)),


				heading:
					Number(heading.toFixed(3)),

				pitch:
					Number(pitch.toFixed(3)),

				roll:
					Number(roll.toFixed(3))
			};

			console.log(
				"Camera ViewPoint:",
				result
			);

			//
			// output JS object format
			// directly copy to viewPoints
			//
			console.log(`
				{
					id:"new_point",
					name:"new point",

					lon:${result.lon},
					lat:${result.lat},
					height:${result.height},

					heading:${result.heading},
					pitch:${result.pitch},
					roll:${result.roll}
				}
			`);

			return result;
		}

		//
		// hide features by feature id
		//
		// featureId should be the value
		// stored in 3D Tiles batch table
		//
		function hideTilesetFeatures(
			tileset,
			hideFeatureIds
		) {
			if (!tileset || !hideFeatureIds) {
				return;
			}

			const hideSet =
				new Set(
					hideFeatureIds
				);

			tileset.tileVisible.addEventListener(
				function (tile) {
					const content =
						tile.content;

					if (!content) {
						return;
					}

					const featuresLength =
						content.featuresLength;

					for (
						let i = 0;
						i < featuresLength;
						i++
					) {
						const feature =
							content.getFeature(
								i
							);

						//
						// Cesium 3D Tiles feature id
						//
						let id =
							feature.getProperty(
								"id"
							);
						if (
							hideSet.has(id)
						) {
							feature.show =
								false;
						}
					}
				}
			);
		}

		//
		// enable / disable feature hiding
		//
		// example:
		// setTilesetFeatureHide("building", true)
		// setTilesetFeatureHide("building", false)
		//
		function setTilesetFeatureHide(
			tilesetId,
			enable
		) {
			tilesetHideState[tilesetId] = enable;
			if (!enable) {
				restoreTilesetFeatures(
					tilesetId
				);
			} else {
			}
		}

		function restoreTilesetFeatures(
			tilesetId
		) {
			const cache =
				hiddenFeaturesCache[
				tilesetId
				];

			if (!cache) {
				return;
			}

			cache.forEach(
				feature => {
					feature.show = true;
				}
			);

			cache.clear();

			console.log(
				"features restored:",
				tilesetId
			);
		}

		//
		// restore all hidden features in all tilesets
		//

		function restoreAllHiddenFeatures() {
			Object.keys(
				hiddenFeaturesCache
			)
				.forEach(
					function (tilesetId) {
						const features =
							hiddenFeaturesCache[
							tilesetId
							];

						if (!features) {
							return;
						}

						features.forEach(
							function (feature) {

								feature.show = true;

							}
						);

						//
						// clear cache
						//
						hiddenFeaturesCache[
							tilesetId
						] = [];

						console.log(
							"restored:",
							tilesetId,
							features.length
						);
					}
				);

			viewer.scene.requestRender();
		}

		//
		// select file
		//
		document
			.getElementById("gltfFile")
			.onchange = function (e) {
				selectedModelFile =
					e.target.files[0];
			};

		//
		// cancel dialog
		//
		document
			.getElementById("cancelModel")
			.onclick = function () {
				document
					.getElementById("modelDialog")
					.style.display = "none";

			};

		//
		// load selected GLB
		//
		document
			.getElementById("loadModel")
			.onclick = async function () {

				if (!selectedModelFile) {
					alert(
						"Please select glb file"
					);
					return;
				}

				const url =
					URL.createObjectURL(
						selectedModelFile
					);

				await addModelInFrontOfCamera(
					url
				);
				document
					.getElementById("modelDialog")
					.style.display = "none";

			};
