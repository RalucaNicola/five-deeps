import { subclass } from "@arcgis/core/core/accessorSupport/decorators";
import Widget from "@arcgis/core/widgets/Widget";
import { tsx } from "@arcgis/core/widgets/support/widget";
import SceneView from "@arcgis/core/views/SceneView";
import Map from "@arcgis/core/Map";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import { Configuration } from "./Configuration";
import { DioramaBuilder } from "./DioramaBuilder";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";

import "@esri/calcite-components/dist/components/calcite-label";
import "@esri/calcite-components/dist/components/calcite-select";
import "@esri/calcite-components/dist/components/calcite-option";
import "@esri/calcite-components/dist/components/calcite-input";

import { setAssetPath } from "@esri/calcite-components/dist/components";
import { when } from "@arcgis/core/core/reactiveUtils";
import { addFrameTask } from "@arcgis/core/core/scheduling";
import Camera from "@arcgis/core/Camera";
import Search from "@arcgis/core/widgets/Search";
import MediaLayer from "@arcgis/core/layers/MediaLayer";
import ImageElement from "@arcgis/core/layers/support/ImageElement";
import Extent from "@arcgis/core/geometry/Extent";
import ExtentAndRotationGeoreference from "@arcgis/core/layers/support/ExtentAndRotationGeoreference";
import MapView from "@arcgis/core/views/MapView";
import ElevationLayer from "@arcgis/core/layers/ElevationLayer";
import Ground from "@arcgis/core/Ground";
import Basemap from "@arcgis/core/Basemap";
import TileLayer from "@arcgis/core/layers/TileLayer";
import VideoElement from "@arcgis/core/layers/support/VideoElement";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import LabelClass from "@arcgis/core/layers/support/LabelClass";
import LabelSymbol3D from "@arcgis/core/symbols/LabelSymbol3D";
import TextSymbol3DLayer from "@arcgis/core/symbols/TextSymbol3DLayer";
import { SimpleRenderer } from "@arcgis/core/renderers";
import { IconSymbol3DLayer, PointSymbol3D } from "@arcgis/core/symbols";
import Graphic from "@arcgis/core/Graphic";

setAssetPath("https://js.arcgis.com/calcite-components/1.0.0-beta.80/assets");

@subclass("App")
export class App extends Widget {
  private config = new Configuration();

  private readonly initialCamera = new Camera({
    position: {
      x: -0.00144551,
      y: -0.00115264,
      z: 57.27806
    },
    heading: 50.55,
    tilt: 74.87
  });

  private view = new SceneView({
    map: new Map({
      ground: {
        opacity: 0,
        surfaceColor: [100, 100, 50]
      },
      layers: [
        new GraphicsLayer({
          fullExtent: this.config.displayArea
        })
      ]
    }),

    ui: { components: [] },

    camera: this.initialCamera,

    clippingArea: this.config.displayArea,
    alphaCompositingEnabled: true,

    environment: {
      atmosphereEnabled: false,
      starsEnabled: false,
      background: { type: "color", color: [255, 255, 255, 0] },
      lighting: {
        date: "Tue Mar 15 2022 08:05:00 GMT-0700 (Pacific Daylight Time)"
      }
    },

    spatialReference: SpatialReference.WebMercator,
    qualityProfile: "high",
    viewingMode: "local"
  });

  private pointsLayer = new GeoJSONLayer({
    url: "./data/points.geojson",
    outFields: ["*"],
    renderer: new SimpleRenderer({
      symbol: new PointSymbol3D({
        symbolLayers: [new IconSymbol3DLayer({
          resource: { href: "./assets/icon.svg" },
          anchor: "relative",
          anchorPosition: {
            x: -0.4,
            y: 0
          },
          size: 40
        })]
      })
    }),
    labelingInfo: [
      new LabelClass({
        labelExpressionInfo: { expression: "$feature.name" },
        labelPlacement: "center-right",
        symbol: new LabelSymbol3D({
          symbolLayers: [new TextSymbol3DLayer({
            material: {
              color: [255, 255, 255]
            },

            background: { color: [252, 186, 3] },
            font: {
              size: 12,
              family: `"Avenir Next", "Avenir", "Helvetica Neue", sans-serif`,
              weight: "bolder"
            }
          })]
        })
      })
    ]
  });

  private selectView = new SceneView({
    map: new Map({
      ground: new Ground({
        layers: [new ElevationLayer({
          url: "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/TopoBathy3D/ImageServer"
        })],
        surfaceColor: [144, 198, 222]
      }),
      basemap: new Basemap({
        baseLayers: [
          new TileLayer({
            url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
            opacity: 0.8
          }),
        ]
      }),
      layers: [
        new MediaLayer({
          // source: [new VideoElement({
          //   video: "./assets/clouds-animated.mp4",
          //   georeference: new ExtentAndRotationGeoreference({
          //     extent: new Extent({
          //       spatialReference: {
          //         wkid: 4326
          //       },
          //       xmin: -180,
          //       xmax: 180,
          //       ymin: -80,
          //       ymax: 80
          //     }),
          //     rotation: 0
          //   })
          // })],
          // blendMode: "multiply"
          // opacity: 0.3
          source: [new ImageElement({
            image: "./assets/clouds-nasa.png",
            georeference: new ExtentAndRotationGeoreference({
              extent: new Extent({
                spatialReference: {
                  wkid: 4326
                },
                xmin: -180,
                xmax: 180,
                ymin: -80,
                ymax: 80
              }),
              rotation: 0
            })
          })],
        })
      ]
    }),
    ui: { components: [] },
    qualityProfile: "high"
  });

  private dioramaBuilder = new DioramaBuilder({ view: this.view, config: this.config });

  private highlightGraphic = new Graphic({
    symbol: new PointSymbol3D({
      symbolLayers: [new IconSymbol3DLayer({
        resource: { primitive: "circle" },
        size: 10,
        material: {
          color: [0, 0, 0, 0]
        },
        outline: {
          color: [252, 186, 3],
          size: 2
        }
      }), new IconSymbol3DLayer({
        resource: { primitive: "circle" },
        size: 20,
        material: {
          color: [0, 0, 0, 0]
        },
        outline: {
          color: [252, 186, 3, 0.7],
          size: 2
        }
      }), new IconSymbol3DLayer({
        resource: { primitive: "circle" },
        size: 30,
        material: {
          color: [0, 0, 0, 0]
        },
        outline: {
          color: [252, 186, 3, 0.4],
          size: 2
        }
      })]
    })
  })

  protected initialize(): void {
    // when(
    //   () => !(this.dioramaBuilder.updating || this.view.updating),
    //   () => this.startDioramaAnimation(),
    //   { once: true }
    // );

    when(
      () => !this.selectView.updating,
      () => {
        this.startGlobeAnimation();

        this.selectView.on('pointer-move', (event) => {
          this.selectView.hitTest(event, { include: this.pointsLayer }).then(hitTestResult => {
            const results = hitTestResult.results;
            if (results && results.length > 0) {
              if (results[0].graphic) {
                this.highlightGraphic.geometry = results[0].graphic.geometry;
                this.selectView.graphics.add(this.highlightGraphic);
                this.elements.selectViewer.style.cursor = "pointer";
              }
            } else {
              this.selectView.graphics.removeAll();
              this.elements.selectViewer.style.cursor = "default";
            }
          });
        });
        this.selectView.on('click', (event) => {
          this.selectView.hitTest(event, { include: this.pointsLayer }).then(hitTestResult => {
            const results = hitTestResult.results;
            if (results && results.length > 0) {
              console.log(results[0].graphic.attributes);
            } else {
              console.log("nothing ever happens");
            }
          });
        })
      },
      { once: true }
    );

  }

  private animationFrameTask: __esri.FrameTaskHandle | null = null;


  private startGlobeAnimation(): void {
    this.elements.selectViewer.classList.add("fade-in");

    let t = 0;
    const rotationDurationSeconds = 30;

    const update = () => {
      const camera = this.selectView.camera.clone();
      camera.position.longitude = -(360 * (t / 1000 / rotationDurationSeconds)) % 360;
      this.selectView.goTo(camera, { animate: false });
    };

    this.animationFrameTask = addFrameTask({
      update: ev => {
        t += ev?.deltaTime ?? 0;
        update();
      },
    });

    when(
      () => this.selectView.interacting,
      () => {
        this.animationFrameTask?.remove();
        this.animationFrameTask = null;
      },
      { once: true }
    );
  }


  private stopDioramaAnimation(): void {
    this.animationFrameTask?.remove();
    this.animationFrameTask = null;

    this.elements.dioramaViewer.classList.remove("fade-in");
  }

  private startDioramaAnimation(): void {
    this.elements.dioramaViewer.classList.add("fade-in");

    let t = 0;
    const rotationDurationSeconds = 70;

    const center = this.config.displayArea.center.clone();
    const { zmin, zmax } = this.dioramaBuilder;
    center.z = zmin + (zmax - zmin) / 2;

    const update = () => {
      const heading = 50 - ((360 * (t / 1000 / rotationDurationSeconds)) % 360);
      this.view.goTo({ target: center, heading, tilt: 73, scale: 800 }, { animate: false });
    };

    this.animationFrameTask = addFrameTask({
      update: (ev) => {
        t += ev?.deltaTime ?? 0;
        update();
      }
    });

    update();

    when(
      () => this.view.interacting,
      () => {
        this.animationFrameTask?.remove();
        this.animationFrameTask = null;
      },
      { once: true }
    );
  }

  private elements = {
    selectViewer: null! as HTMLDivElement,
    dioramaViewer: null! as HTMLDivElement,
    intro: null! as HTMLDivElement
  };

  render() {
    return (
      <div id="main">
        <div id="viewer">
          <div id="diorama-viewer" afterCreate={(node: HTMLDivElement) => (this.elements.dioramaViewer = node)}>
            <div id="viewDiv" afterCreate={(node: HTMLDivElement) => this.onAfterCreate(node)}></div>
            <button id="change-area" onclick={() => this.changeArea()}>
              Change Area
            </button>
          </div>
          <div id="select-viewer" afterCreate={(node: HTMLDivElement) => (this.elements.selectViewer = node)}>
            <div id="selectAreaDiv" afterCreate={(node: HTMLDivElement) => this.onAfterCreateSelectArea(node)}></div>
          </div>

        </div>
        <div class="intro" afterCreate={(node: HTMLDivElement) => (this.elements.intro = node)} onclick={() => this.hideIntro()}>
          <h1>THE FIVE DEEPS</h1>
          <p>The deepest point in each of Earth's oceans</p>
        </div>
      </div>
    );
  }

  private hideIntro(): void {
    this.elements.intro.classList.add('fade-out');
    this.selectView.map.add(this.pointsLayer);
  }

  private changeArea(): void {
    // this.stopAnimation();

    // when(
    //   () => !this.selectView.updating,
    //   () => {
    //     this.elements.selectViewer.classList.add("fade-in");
    //   },
    //   { once: true }
    // );
  }

  private selectArea(): void {
    this.view.camera = this.initialCamera;
    this.config.sourceArea = this.selectView.extent.clone();

    // setTimeout(() => {
    //   when(
    //     () => !(this.dioramaBuilder.updating || this.view.updating),
    //     () => {
    //       this.elements.selectViewer.classList.remove("fade-in");
    //       this.startAnimation();
    //     },
    //     { once: true }
    //   );
    // }, 0);
  }

  private onAfterCreate(element: HTMLDivElement): void {
    this.view.container = element;
    (window as any).view = this.view;
  }

  private onAfterCreateSelectArea(element: HTMLDivElement): void {
    this.selectView.container = element;
    (window as any).selectView = this.selectView;

  }
}
