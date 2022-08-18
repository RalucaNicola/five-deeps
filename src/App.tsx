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
import MediaLayer from "@arcgis/core/layers/MediaLayer";
import ImageElement from "@arcgis/core/layers/support/ImageElement";
import Extent from "@arcgis/core/geometry/Extent";
import ExtentAndRotationGeoreference from "@arcgis/core/layers/support/ExtentAndRotationGeoreference";
import ElevationLayer from "@arcgis/core/layers/ElevationLayer";
import Ground from "@arcgis/core/Ground";
import Basemap from "@arcgis/core/Basemap";
import TileLayer from "@arcgis/core/layers/TileLayer";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import LabelClass from "@arcgis/core/layers/support/LabelClass";
import LabelSymbol3D from "@arcgis/core/symbols/LabelSymbol3D";
import TextSymbol3DLayer from "@arcgis/core/symbols/TextSymbol3DLayer";
import { SimpleRenderer } from "@arcgis/core/renderers";
import { IconSymbol3DLayer, PointSymbol3D } from "@arcgis/core/symbols";
import Graphic from "@arcgis/core/Graphic";

import { extents } from './extents';

setAssetPath("https://js.arcgis.com/calcite-components/1.0.0-beta.80/assets");

@subclass("App")
export class App extends Widget {
  private config = new Configuration();

  private readonly initialCamera = new Camera({
    position: {
      x: -0.00126813,
      y: -0.00107487,
      z: 114.00350
    },
    heading: 49.60,
    tilt: 69.68
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

  private labelsLayer = new MediaLayer({
    source: [new ImageElement({
      image: "./assets/pacific-ocean.png",
      georeference: new ExtentAndRotationGeoreference({
        extent: new Extent({
          spatialReference: {
            wkid: 4326
          },
          xmin: -179,
          ymin: 17,
          xmax: -150,
          ymax: 23,
        }),
        rotation: -5
      })
    })],
    opacity: 0.8
  })

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
        this.labelsLayer,
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
  });

  private highlightedPointName: string | null = null;

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
              const graphic = results[0].graphic;
              if (graphic) {
                if (this.highlightedPointName !== graphic.attributes.name) {
                  this.highlightGraphic.geometry = graphic.geometry;
                  this.selectView.graphics.add(this.highlightGraphic);
                  this.elements.selectViewer.style.cursor = "pointer";
                  this.highlightedPointName = graphic.attributes.name;
                  this.elements.overlayInfo.innerHTML = `<div class="left-info"><div class="title"><p>${graphic.attributes.name}</p></div><div><p>Discovered: ${graphic.attributes.year}</p><p>Depth: ${graphic.attributes.depth}</p><p>${graphic.attributes.ocean}</p></div></div><div class="separator"></div><div class="right-info"><p>${graphic.attributes.description}</p></div>`;
                  this.elements.overlayInfo.classList.add('fade-in');
                  setTimeout(() => { document.getElementsByClassName('title')[0].classList.add('big') }, 200);
                }
              }
            } else {
              this.selectView.graphics.removeAll();
              this.elements.selectViewer.style.cursor = "default";
              this.highlightedPointName = null;
              this.elements.overlayInfo.innerHTML = ``;
              this.elements.overlayInfo.classList.remove('fade-in');
            }
          });
        });
        this.selectView.on('click', (event) => {
          this.selectView.hitTest(event, { include: this.pointsLayer }).then(hitTestResult => {
            const results = hitTestResult.results;
            if (results && results.length > 0) {
              const extent = new Extent(extents[results[0].graphic.attributes.name]);
              this.showDiorama(extent);
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

  private stopGlobeAnimation() {
    this.animationFrameTask?.remove();
    this.animationFrameTask = null;
  }

  private elements = {
    selectViewer: null! as HTMLDivElement,
    dioramaViewer: null! as HTMLDivElement,
    intro: null! as HTMLDivElement,
    overlayInfo: null! as HTMLDivElement
  };

  render() {
    return (
      <div id="main">
        <div id="viewer">
          <div id="diorama-viewer" afterCreate={(node: HTMLDivElement) => (this.elements.dioramaViewer = node)}>
            <div id="viewDiv" afterCreate={(node: HTMLDivElement) => this.onAfterCreate(node)}></div>
            <button class="close" onclick={() => this.showGlobe()}>
              <img src="./assets/close.svg"></img>
            </button>
          </div>
          <div id="select-viewer" afterCreate={(node: HTMLDivElement) => (this.elements.selectViewer = node)}>
            <div id="selectAreaDiv" afterCreate={(node: HTMLDivElement) => this.onAfterCreateSelectArea(node)}></div>
          </div>

        </div>
        <div class="overlay-info" afterCreate={(node: HTMLDivElement) => (this.elements.overlayInfo = node)}>
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

  private showGlobe(): void {
    this.elements.dioramaViewer.classList.remove("fade-in");
    this.elements.selectViewer.classList.add("fade-in");
  }

  private showDiorama(extent: Extent): void {
    this.view.camera = this.initialCamera;
    this.config.sourceArea = extent;
    this.stopGlobeAnimation();
    this.elements.dioramaViewer.classList.add("fade-in");
    this.elements.selectViewer.classList.remove("fade-in");
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
