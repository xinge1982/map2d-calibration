
		// 2D floor-plan viewer
		(function initializeFloorPlanViewer() {
			const stage = document.getElementById("planStage");
			const input = document.getElementById("floorPlanInput");
			const uploadButton = document.getElementById("uploadPlanButton");
			const resetButton = document.getElementById("resetPlanButton");
			const image = document.getElementById("floorPlan");
			const empty = document.getElementById("emptyPlan");
			const info = document.getElementById("planInfo");
			let objectUrl = null, scale = 1, offsetX = 0, offsetY = 0;
			let dragging = false, startX = 0, startY = 0;

			function render() {
				image.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
				info.textContent = `${Math.round(scale * 100)}% · ${image.naturalWidth} × ${image.naturalHeight}px`;
			}
			function resetView() {
				if (!image.naturalWidth) return;
				scale = Math.min(stage.clientWidth * .88 / image.naturalWidth, stage.clientHeight * .84 / image.naturalHeight, 1);
				offsetX = 0; offsetY = 0; render();
			}
			function loadPlan(file) {
				if (!file || !file.type.startsWith("image/")) {
					alert("请选择 PNG、JPG、WebP 或 SVG 格式的二维平面图。"); return;
				}
				if (objectUrl) URL.revokeObjectURL(objectUrl);
				objectUrl = URL.createObjectURL(file);
				image.onload = function () {
					empty.hidden = true; image.style.display = "block"; info.hidden = false;
					resetButton.disabled = false; resetView();
				};
				image.src = objectUrl; image.alt = file.name;
			}

			uploadButton.addEventListener("click", () => input.click());
			input.addEventListener("change", event => loadPlan(event.target.files[0]));
			resetButton.addEventListener("click", resetView);
			stage.addEventListener("dblclick", resetView);
			stage.addEventListener("wheel", function (event) {
				if (!image.naturalWidth) return;
				event.preventDefault();
				const previousScale = scale;
				scale = Math.min(8, Math.max(.05, scale * (event.deltaY < 0 ? 1.12 : .89)));
				const bounds = stage.getBoundingClientRect();
				const x = event.clientX - bounds.left - bounds.width / 2;
				const y = event.clientY - bounds.top - bounds.height / 2;
				offsetX = x - (x - offsetX) * (scale / previousScale);
				offsetY = y - (y - offsetY) * (scale / previousScale); render();
			}, { passive: false });
			stage.addEventListener("pointerdown", function (event) {
				if (!image.naturalWidth) return;
				dragging = true; startX = event.clientX - offsetX; startY = event.clientY - offsetY;
				stage.setPointerCapture(event.pointerId); stage.classList.add("dragging");
			});
			stage.addEventListener("pointermove", function (event) {
				if (!dragging) return;
				offsetX = event.clientX - startX; offsetY = event.clientY - startY; render();
			});
			stage.addEventListener("pointerup", function () { dragging = false; stage.classList.remove("dragging"); });
			["dragenter", "dragover"].forEach(type => stage.addEventListener(type, function (event) {
				event.preventDefault(); stage.classList.add("drop-active");
			}));
			["dragleave", "drop"].forEach(type => stage.addEventListener(type, function (event) {
				event.preventDefault(); stage.classList.remove("drop-active");
			}));
			stage.addEventListener("drop", event => loadPlan(event.dataTransfer.files[0]));
			window.addEventListener("resize", () => image.naturalWidth && resetView());
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

					"lon": 121.78019701,
					"lat": 31.11791166,
					"height": 29.612,
					"heading": 18.322,
					"pitch": -21.232,
					"roll": 360,
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
